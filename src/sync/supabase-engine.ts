import { db, type OSFacilDatabase } from '../db/database'
import type { Cliente, EventoOS, OperacaoSync, OrdemServico } from '../db/types'
import { calcularProximaTentativa, deveTentarAgora } from '../domain/sync'
import { supabase } from '../auth/supabase'

type EstadoSync = 'offline' | 'sincronizando' | 'sincronizado' | 'erro' | 'local'
const ouvintes = new Set<(estado: EstadoSync) => void>()
let executando: Promise<void> | null = null
function emitir(estado: EstadoSync) { ouvintes.forEach((ouvinte) => ouvinte(estado)) }
export function observarSync(ouvinte: (estado: EstadoSync) => void) {
  ouvintes.add(ouvinte)
  return () => { ouvintes.delete(ouvinte) }
}

// Mutable retry bookkeeping must not change the idempotency hash.
export function envelope(operacao: OperacaoSync) {
  return { id: operacao.id, entidade: operacao.entidade, entidadeId: operacao.entidadeId, acao: operacao.acao, payload: operacao.payload }
}
async function enviar(banco: OSFacilDatabase, operacao: OperacaoSync) {
  const dados = envelope(operacao)
  if (operacao.entidade === 'foto') {
    const foto = await banco.fotos.get(operacao.entidadeId)
    if (!foto) throw new Error('Foto local não encontrada; a operação foi preservada.')
    const caminhoStorage = `${foto.osId}/${foto.id}.jpg`
    const bucket = supabase!.storage.from('os-fotos')
    const { error } = await bucket.upload(caminhoStorage, foto.arquivo, { contentType: 'image/jpeg', upsert: false })
    if (error) {
      const { data, error: leitura } = await bucket.download(caminhoStorage)
      if (leitura || !data) throw error
    }
    dados.payload = { ...(operacao.payload as object), caminhoStorage }
  }
  const { error } = await supabase!.rpc('sincronizar_operacao', { operacao: dados })
  if (error) throw error
}
function camel(row: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()), value ?? undefined]))
}
async function baixar(banco: OSFacilDatabase) {
  for (const [remota, local, entidade] of [
    ['clientes', 'clientes', 'cliente'], ['ordens_servico', 'ordens', 'os'], ['os_eventos', 'eventos', 'evento'],
  ] as const) {
    for (let inicio = 0; ; inicio += 500) {
      const { data, error } = await supabase!.from(remota).select('*').order('id').range(inicio, inicio + 499)
      if (error) throw error
      await banco.transaction('rw', [banco[local], banco.filaSync], async () => {
        for (const registro of data) {
          const convertido = camel(registro) as unknown as Cliente & OrdemServico & EventoOS
          const pendente = await banco.filaSync.where('entidadeId').equals(convertido.id).filter((o) => o.entidade === entidade).count()
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
      await banco.fotos.put({ id: foto.id, osId: foto.os_id, momento: foto.momento, nomeArquivo: foto.nome_arquivo, criadoEm: foto.criado_em, atualizadoEm: foto.atualizado_em, enviada: true, arquivo })
    }
    if (data.length < 500) break
  }
}
async function executar() {
  if (!supabase) { emitir('local'); return }
  if (!navigator.onLine) { emitir('offline'); return }
  const banco = db
  const { data, error } = await supabase.rpc('acesso_oficina')
  if (error || data !== true) { emitir('erro'); return }
  emitir('sincronizando')
  try {
    const prioridade = { cliente: 0, os: 1, evento: 2, foto: 3 }
    const operacoes = (await banco.filaSync.toArray()).sort((a, b) => prioridade[a.entidade] - prioridade[b.entidade] || a.criadaEm.localeCompare(b.criadaEm))
    for (const operacao of operacoes) {
      if (!deveTentarAgora(operacao.proximaTentativaEm)) break
      try {
        await enviar(banco, operacao)
        await banco.filaSync.delete(operacao.id)
        if (operacao.entidade === 'foto') await banco.fotos.update(operacao.entidadeId, { enviada: true })
      } catch (falha) {
        const tentativas = operacao.tentativas + 1
        await banco.filaSync.update(operacao.id, {
          estado: 'erro', tentativas, proximaTentativaEm: calcularProximaTentativa(tentativas),
          erro: falha && typeof falha === 'object' && 'message' in falha ? String(falha.message) : 'Falha de sincronização.',
        })
        break
      }
    }
    await baixar(banco)
    emitir((await banco.filaSync.count()) ? 'erro' : 'sincronizado')
  } catch { emitir('erro') }
}
export async function sincronizarAgora() {
  if (executando) return executando
  executando = executar().finally(() => { executando = null })
  return executando
}
export function iniciarSincronizacao() {
  const rodar = () => { void sincronizarAgora() }
  window.addEventListener('online', rodar)
  const intervalo = window.setInterval(rodar, 30_000)
  rodar()
  return () => { window.removeEventListener('online', rodar); window.clearInterval(intervalo) }
}
