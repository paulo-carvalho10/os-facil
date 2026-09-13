import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { servidor } from './servidor-falso'

vi.mock('../src/auth/supabase', async () => {
  const { servidor } = await import('./servidor-falso')
  return { supabase: servidor.cliente, modoNuvem: true, demonstracaoPublica: false }
})

import { criarOrdem, db, reenviarOperacao } from '../src/db/database'
import type { NovaOSInput } from '../src/db/types'
import { observarSync, sincronizarAgora } from '../src/sync/supabase-engine'

const T0 = Date.parse('2026-09-13T12:00:00Z')
const base: NovaOSInput = {
  clienteNome: 'Cliente Teste', clienteTelefone: '(34) 99999-0000',
  aparelho: 'Celular', marca: 'Samsung', modelo: 'A15', defeitoRelatado: 'Não carrega',
}

let estados: string[] = []
let pararDeObservar: () => void = () => {}

beforeEach(async () => {
  vi.stubGlobal('navigator', { onLine: true })
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(T0)
  servidor.reiniciar()
  await db.delete()
  await db.open()
  estados = []
  pararDeObservar = observarSync((estado) => estados.push(estado))
})

afterEach(() => {
  pararDeObservar()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

/**
 * Simula uma OS que entrou na fila antes de existir validação no aparelho: os
 * dados já estão gravados e o servidor vai recusar o telefone.
 */
async function criarOrdemLegadaComTelefoneCurto() {
  const ordem = await criarOrdem(base)
  const operacaoCliente = await db.filaSync.where('entidadeId').equals(ordem.clienteId).first()
  await db.filaSync.update(operacaoCliente!.id, { payload: { ...(operacaoCliente!.payload as object), telefone: '12345' } })
  return ordem
}

describe('fila de sincronização', () => {
  it('uma operação recusada não impede as outras OS de chegarem ao servidor', async () => {
    const legada = await criarOrdemLegadaComTelefoneCurto()
    vi.setSystemTime(T0 + 60_000)
    const boa = await criarOrdem({ ...base, clienteNome: 'Cliente Dois' })

    await sincronizarAgora()

    // A OS válida chegou no primeiro ciclo, com cliente e evento.
    expect(servidor.tabelas.ordens_servico.has(boa.id)).toBe(true)
    expect(servidor.tabelas.ordens_servico.has(legada.id)).toBe(false)

    // A recusa ficou registrada com o motivo; OS e evento dela esperam, sem gastar tentativas.
    const fila = await db.filaSync.toArray()
    const recusada = fila.find((operacao) => operacao.estado === 'recusada')
    expect(recusada?.entidade).toBe('cliente')
    expect(recusada?.erro).toContain('cliente_telefone_limite')
    expect(fila.filter((operacao) => operacao.estado === 'pendente')).toHaveLength(2)
    expect(fila.every((operacao) => operacao.estado === 'recusada' || operacao.tentativas === 0)).toBe(true)

    // O ciclo terminou normalmente: não há o que tentar de novo por conta própria.
    expect(estados.at(-1)).toBe('sincronizado')
  })

  it('a recusa não é reenviada sozinha a cada ciclo', async () => {
    await criarOrdemLegadaComTelefoneCurto()
    await sincronizarAgora()

    const rpc = vi.spyOn(servidor.cliente, 'rpc')
    for (let ciclo = 1; ciclo <= 5; ciclo++) {
      vi.setSystemTime(T0 + ciclo * 31 * 60_000)
      await sincronizarAgora()
    }

    const recusada = (await db.filaSync.toArray()).find((operacao) => operacao.estado === 'recusada')
    expect(recusada?.tentativas).toBe(1)
    expect(rpc.mock.calls.filter(([nome]) => nome === 'sincronizar_operacao')).toHaveLength(0)
    rpc.mockRestore()
  })

  it('depois que a regra muda no servidor, tentar de novo envia a OS inteira', async () => {
    const legada = await criarOrdemLegadaComTelefoneCurto()
    await sincronizarAgora()

    servidor.telefoneMinimo = 5
    const recusada = (await db.filaSync.toArray()).find((operacao) => operacao.estado === 'recusada')
    await reenviarOperacao(recusada!.id)
    await sincronizarAgora()

    expect(servidor.tabelas.ordens_servico.has(legada.id)).toBe(true)
    expect(await db.filaSync.count()).toBe(0)
  })

  it('falha de rede para o ciclo sem marcar nada como recusado e retoma depois', async () => {
    const ordem = await criarOrdem(base)
    servidor.falhasDeRede = 1

    await sincronizarAgora()

    const fila = await db.filaSync.toArray()
    expect(fila).toHaveLength(3)
    expect(fila.some((operacao) => operacao.estado === 'recusada')).toBe(false)
    const falhou = fila.find((operacao) => operacao.estado === 'erro')
    expect(falhou?.tentativas).toBe(1)
    expect(Date.parse(falhou!.proximaTentativaEm)).toBe(T0 + 5_000)
    expect(estados.at(-1)).toBe('erro')

    vi.setSystemTime(T0 + 6_000)
    await sincronizarAgora()

    expect(await db.filaSync.count()).toBe(0)
    expect(servidor.tabelas.ordens_servico.has(ordem.id)).toBe(true)
    expect(estados.at(-1)).toBe('sincronizado')
  })
})
