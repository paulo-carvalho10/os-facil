import { db } from '../db/database'
import type { OperacaoSync } from '../db/types'
import { calcularProximaTentativa, deveTentarAgora } from '../domain/sync'

type EstadoSync = 'offline' | 'sincronizando' | 'sincronizado' | 'erro' | 'local'
type Ouvinte = (estado: EstadoSync) => void

const ouvintes = new Set<Ouvinte>()
let executando = false

function emitir(estado: EstadoSync): void {
  ouvintes.forEach((ouvinte) => ouvinte(estado))
}

export function observarSync(ouvinte: Ouvinte): () => void {
  ouvintes.add(ouvinte)
  return () => ouvintes.delete(ouvinte)
}

async function enviarOperacao(baseUrl: string, operacao: OperacaoSync): Promise<void> {
  if (operacao.entidade === 'foto' && operacao.acao === 'upload') {
    const foto = await db.fotos.get(operacao.entidadeId)
    if (!foto) return
    const dados = new FormData()
    dados.set('metadata', JSON.stringify(operacao.payload))
    dados.set('arquivo', foto.arquivo, foto.nomeArquivo)
    const resposta = await fetch(`${baseUrl.replace(/\/$/, '')}/sync/foto`, {
      method: 'POST',
      headers: { 'x-idempotency-key': operacao.id },
      body: dados,
    })
    if (!resposta.ok) throw new Error(`Servidor respondeu ${resposta.status}.`)
    return
  }
  const resposta = await fetch(`${baseUrl.replace(/\/$/, '')}/sync`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-idempotency-key': operacao.id,
    },
    body: JSON.stringify(operacao),
  })
  if (!resposta.ok) throw new Error(`Servidor respondeu ${resposta.status}.`)
}

export async function sincronizarAgora(): Promise<void> {
  if (executando) return
  const baseUrl = import.meta.env.VITE_SYNC_API_URL?.trim()
  if (!baseUrl) {
    emitir('local')
    return
  }
  if (!navigator.onLine) {
    emitir('offline')
    return
  }

  executando = true
  emitir('sincronizando')
  try {
    const operacoes = await db.filaSync.orderBy('criadaEm').toArray()
    for (const operacao of operacoes.filter((item) => deveTentarAgora(item.proximaTentativaEm))) {
      await db.filaSync.update(operacao.id, { estado: 'processando' })
      try {
        await enviarOperacao(baseUrl, operacao)
        await db.filaSync.delete(operacao.id)
        if (operacao.entidade === 'foto') await db.fotos.update(operacao.entidadeId, { enviada: true })
        if (operacao.entidade === 'os') {
          await db.ordens.update(operacao.entidadeId, { sincronizadaEm: new Date().toISOString() })
        }
      } catch (erro) {
        const tentativas = operacao.tentativas + 1
        await db.filaSync.update(operacao.id, {
          estado: 'erro',
          tentativas,
          erro: erro instanceof Error ? erro.message : 'Falha de sincronização.',
          proximaTentativaEm: calcularProximaTentativa(tentativas),
        })
      }
    }
    emitir((await db.filaSync.count()) === 0 ? 'sincronizado' : 'erro')
  } finally {
    executando = false
  }
}

export function iniciarSincronizacao(): () => void {
  const executar = () => void sincronizarAgora()
  window.addEventListener('online', executar)
  const intervalo = window.setInterval(executar, 30_000)
  executar()
  return () => {
    window.removeEventListener('online', executar)
    window.clearInterval(intervalo)
  }
}
