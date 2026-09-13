import { db, type OSFacilDatabase } from '../db/database'
import type { Cliente, EventoOS, OperacaoSync, OrdemServico } from '../db/types'
import {
  criarPlanoDaFila,
  erroDefinitivo,
  mensagemDoErro,
  OperacaoInvalida,
  ordenarFila,
} from '../domain/fila'
import { calcularProximaTentativa } from '../domain/sync'
import { supabase } from '../auth/supabase'

type EstadoSync = 'offline' | 'sincronizando' | 'sincronizado' | 'erro' | 'local'

const ouvintes = new Set<(estado: EstadoSync) => void>()
let executando: Promise<void> | null = null

function emitir(estado: EstadoSync) {
  ouvintes.forEach((ouvinte) => ouvinte(estado))
}

export function observarSync(ouvinte: (estado: EstadoSync) => void) {
  ouvintes.add(ouvinte)
  return () => {
    ouvintes.delete(ouvinte)
  }
}

/**
 * O que vai para o servidor. Contadores de tentativa ficam de fora porque o
 * servidor guarda um hash deste conteúdo para reconhecer repetições: se eles
 * entrassem, cada nova tentativa pareceria uma operação diferente.
 */
export function envelope(operacao: OperacaoSync) {
  return {
    id: operacao.id,
    entidade: operacao.entidade,
    entidadeId: operacao.entidadeId,
    acao: operacao.acao,
    payload: operacao.payload,
  }
}

async function enviar(banco: OSFacilDatabase, operacao: OperacaoSync) {
  const dados = envelope(operacao)

  if (operacao.entidade === 'foto') {
    const foto = await banco.fotos.get(operacao.entidadeId)
    if (!foto) throw new OperacaoInvalida('A foto não existe mais neste aparelho.')

    const caminhoStorage = `${foto.osId}/${foto.id}.jpg`
    const bucket = supabase!.storage.from('os-fotos')
    const { error } = await bucket.upload(caminhoStorage, foto.arquivo, { contentType: 'image/jpeg', upsert: false })
    if (error) {
      // Uma tentativa anterior pode ter enviado o arquivo e caído antes de
      // confirmar. Se ele já está lá, seguimos para a confirmação.
      const { data, error: leitura } = await bucket.download(caminhoStorage)
      if (leitura || !data) throw error
    }
    dados.payload = { ...(operacao.payload as object), caminhoStorage }
  }

  const { error } = await supabase!.rpc('sincronizar_operacao', { operacao: dados })
  if (error) throw error
}

/**
 * Envia a fila. Retorna false quando o ciclo foi interrompido por falha de
 * conexão, caso em que as operações restantes esperam o próximo ciclo.
 */
async function enviarFila(banco: OSFacilDatabase): Promise<boolean> {
  const plano = criarPlanoDaFila()

  for (const operacao of ordenarFila(await banco.filaSync.toArray())) {
    if (plano.decidir(operacao) !== 'enviar') continue

    try {
      await enviar(banco, operacao)
      await banco.filaSync.delete(operacao.id)
      if (operacao.entidade === 'foto') await banco.fotos.update(operacao.entidadeId, { enviada: true })
    } catch (falha) {
      const tentativas = operacao.tentativas + 1

      if (erroDefinitivo(falha)) {
        plano.recusar(operacao)
        await banco.filaSync.update(operacao.id, { estado: 'recusada', tentativas, erro: mensagemDoErro(falha) })
        continue
      }

      await banco.filaSync.update(operacao.id, {
        estado: 'erro',
        tentativas,
        erro: mensagemDoErro(falha),
        // O atraso usa as falhas anteriores: a primeira espera é o primeiro degrau (5 s).
        proximaTentativaEm: calcularProximaTentativa(operacao.tentativas),
      })
      return false
    }
  }

  return true
}

function camel(row: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()), value ?? undefined]),
  )
}

/**
 * Baixa as tabelas do servidor. Um registro com alteração local ainda na fila
 * não é sobrescrito: a versão do aparelho vale até ser enviada.
 */
async function baixar(banco: OSFacilDatabase) {
  const tabelas = [
    ['clientes', 'clientes', 'cliente'],
    ['ordens_servico', 'ordens', 'os'],
    ['os_eventos', 'eventos', 'evento'],
  ] as const

  for (const [remota, local, entidade] of tabelas) {
    for (let inicio = 0; ; inicio += 500) {
      const { data, error } = await supabase!.from(remota).select('*').order('id').range(inicio, inicio + 499)
      if (error) throw error

      await banco.transaction('rw', [banco[local], banco.filaSync], async () => {
        for (const registro of data) {
          const convertido = camel(registro) as unknown as Cliente & OrdemServico & EventoOS
          const pendente = await banco.filaSync
            .where('entidadeId').equals(convertido.id)
            .filter((operacao) => operacao.entidade === entidade)
            .count()
          if (!pendente) await banco[local].put(convertido)
        }
      })

      if (data.length < 500) break
    }
  }

  for (let inicio = 0; ; inicio += 500) {
    const { data, error } = await supabase!.from('os_fotos').select('*').order('id').range(inicio, inicio + 499)
    if (error) throw error

    for (const foto of data) {
      if (await banco.fotos.get(foto.id)) continue
      const { data: arquivo, error: falha } = await supabase!.storage.from('os-fotos').download(foto.caminho_storage)
      if (falha || !arquivo) throw falha ?? new Error('Não foi possível baixar a foto.')
      await banco.fotos.put({
        id: foto.id,
        osId: foto.os_id,
        momento: foto.momento,
        nomeArquivo: foto.nome_arquivo,
        criadoEm: foto.criado_em,
        atualizadoEm: foto.atualizado_em,
        enviada: true,
        arquivo,
      })
    }

    if (data.length < 500) break
  }
}

async function executar() {
  if (!supabase) {
    emitir('local')
    return
  }
  if (!navigator.onLine) {
    emitir('offline')
    return
  }

  const banco = db
  const { data, error } = await supabase.rpc('acesso_oficina')
  if (error || data !== true) {
    emitir('erro')
    return
  }

  emitir('sincronizando')
  try {
    const completa = await enviarFila(banco)
    await baixar(banco)
    emitir(completa ? 'sincronizado' : 'erro')
  } catch {
    emitir('erro')
  }
}

export async function sincronizarAgora() {
  if (executando) return executando
  executando = executar().finally(() => {
    executando = null
  })
  return executando
}

export function iniciarSincronizacao() {
  const rodar = () => {
    void sincronizarAgora()
  }
  window.addEventListener('online', rodar)
  const intervalo = window.setInterval(rodar, 30_000)
  rodar()
  return () => {
    window.removeEventListener('online', rodar)
    window.clearInterval(intervalo)
  }
}
