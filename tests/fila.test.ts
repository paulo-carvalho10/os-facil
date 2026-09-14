import { describe, expect, it } from 'vitest'
import type { OperacaoSync } from '../src/db/types'
import { criarPlanoDaFila, dependencias, erroDefinitivo, OperacaoInvalida, ordenarFila } from '../src/domain/fila'

const AGORA = Date.parse('2026-09-13T12:00:00Z')

function op(parcial: Partial<OperacaoSync> & Pick<OperacaoSync, 'id' | 'entidade' | 'entidadeId'>): OperacaoSync {
  return {
    acao: parcial.entidade === 'foto' ? 'upload' : 'upsert',
    payload: {},
    criadaEm: '2026-09-13T11:00:00Z',
    tentativas: 0,
    proximaTentativaEm: '2026-09-13T11:00:00Z',
    estado: 'pendente',
    ...parcial,
  }
}

describe('ordem da fila', () => {
  it('envia cliente antes de OS, OS antes de evento e foto, e mantém a ordem de criação', () => {
    const fila = ordenarFila([
      op({ id: 'f', entidade: 'foto', entidadeId: 'f1', criadaEm: '2026-09-13T10:00:00Z' }),
      op({ id: 'e', entidade: 'evento', entidadeId: 'e1' }),
      op({ id: 'o2', entidade: 'os', entidadeId: 'os1', criadaEm: '2026-09-13T11:30:00Z' }),
      op({ id: 'o1', entidade: 'os', entidadeId: 'os1', criadaEm: '2026-09-13T11:10:00Z' }),
      op({ id: 'c', entidade: 'cliente', entidadeId: 'c1' }),
    ])
    expect(fila.map((item) => item.id)).toEqual(['c', 'o1', 'o2', 'e', 'f'])
  })

  it('sabe de quem cada operação depende', () => {
    expect(dependencias(op({ id: '1', entidade: 'cliente', entidadeId: 'c1' }))).toEqual([])
    expect(dependencias(op({ id: '2', entidade: 'os', entidadeId: 'os1', payload: { clienteId: 'c1' } }))).toEqual(['c1'])
    expect(dependencias(op({ id: '3', entidade: 'evento', entidadeId: 'e1', payload: { osId: 'os1' } }))).toEqual(['os1'])
    expect(dependencias(op({ id: '4', entidade: 'foto', entidadeId: 'f1', payload: { osId: 'os1' } }))).toEqual(['os1'])
  })
})

describe('plano da fila', () => {
  // A recusada é a mais antiga: fica na frente da fila, o cenário que antes travava tudo.
  const clienteRuim = op({ id: 'c1-op', entidade: 'cliente', entidadeId: 'c1', estado: 'recusada', criadaEm: '2026-09-13T10:00:00Z' })
  const osDoRuim = op({ id: 'os1-op', entidade: 'os', entidadeId: 'os1', payload: { clienteId: 'c1' } })
  const eventoDoRuim = op({ id: 'e1-op', entidade: 'evento', entidadeId: 'e1', payload: { osId: 'os1' } })
  const clienteBom = op({ id: 'c2-op', entidade: 'cliente', entidadeId: 'c2' })
  const osDoBom = op({ id: 'os2-op', entidade: 'os', entidadeId: 'os2', payload: { clienteId: 'c2' } })

  it('uma recusa retém só o que depende dela; o resto segue', () => {
    const plano = criarPlanoDaFila(AGORA)
    const decisoes = ordenarFila([eventoDoRuim, osDoBom, osDoRuim, clienteBom, clienteRuim]).map(
      (item) => [item.id, plano.decidir(item)],
    )
    expect(decisoes).toEqual([
      ['c1-op', 'recusada'],
      ['c2-op', 'enviar'],
      ['os2-op', 'enviar'],
      ['os1-op', 'retida'],
      ['e1-op', 'retida'],
    ])
  })

  it('uma recusa acontecida durante o ciclo também retém as dependentes', () => {
    const plano = criarPlanoDaFila(AGORA)
    const cliente = { ...clienteRuim, estado: 'pendente' as const }
    expect(plano.decidir(cliente)).toBe('enviar')
    plano.recusar(cliente)
    expect(plano.decidir(osDoRuim)).toBe('retida')
    expect(plano.decidir(eventoDoRuim)).toBe('retida')
  })

  it('quem espera nova tentativa segura as dependentes, não a fila inteira', () => {
    const plano = criarPlanoDaFila(AGORA)
    const esperando = { ...clienteRuim, estado: 'erro' as const, proximaTentativaEm: '2026-09-13T12:05:00Z' }
    expect(plano.decidir(esperando)).toBe('aguardar')
    expect(plano.decidir(clienteBom)).toBe('enviar')
    expect(plano.decidir(osDoRuim)).toBe('retida')
    expect(plano.decidir(osDoBom)).toBe('enviar')
  })
})

describe('recusa definitiva ou falha passageira', () => {
  it('trata dado inválido e restrição violada como definitivos', () => {
    expect(erroDefinitivo({ code: '23514', message: 'check constraint' })).toBe(true)
    expect(erroDefinitivo({ code: '23503', message: 'foreign key' })).toBe(true)
    expect(erroDefinitivo({ code: '22023', message: 'Operação inválida' })).toBe(true)
    expect(erroDefinitivo(new OperacaoInvalida('foto ausente'))).toBe(true)
    expect(erroDefinitivo({ status: 413, message: 'Payload too large' })).toBe(true)
  })

  it('trata rede, limite temporário e acesso negado como passageiros', () => {
    expect(erroDefinitivo({ code: '', message: 'TypeError: Failed to fetch' })).toBe(false)
    expect(erroDefinitivo({ code: 'P0001', message: 'Limite temporário de sincronização' })).toBe(false)
    expect(erroDefinitivo({ code: '42501', message: 'Operador não autorizado' })).toBe(false)
    expect(erroDefinitivo({ status: 403, message: 'new row violates row-level security policy' })).toBe(false)
    expect(erroDefinitivo(new Error('qualquer coisa'))).toBe(false)
    expect(erroDefinitivo(undefined)).toBe(false)
  })
})
