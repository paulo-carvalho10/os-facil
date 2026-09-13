import type { OperacaoSync } from '../db/types'
import { deveTentarAgora } from './sync'

/**
 * Regras de processamento da fila de sincronização, sem nenhuma chamada de rede.
 *
 * Duas perguntas decidem o que fazer com cada operação:
 *
 * 1. Ela depende de algo que ainda não chegou ao servidor? Uma OS precisa do
 *    cliente; eventos e fotos precisam da OS. Se a dependência
 *    está recusada ou esperando nova tentativa, a operação fica retida.
 *
 * 2. Quando falha, a culpa é da conexão ou dos dados? Falha de conexão para o
 *    ciclo inteiro, porque as próximas também falhariam. Dados recusados pelo
 *    banco nunca vão passar numa nova tentativa: a operação é marcada como
 *    recusada, sai do caminho e o restante da fila continua.
 */

const PRIORIDADE: Record<OperacaoSync['entidade'], number> = {
  cliente: 0,
  os: 1,
  evento: 2,
  foto: 3,
}

export function ordenarFila(operacoes: OperacaoSync[]): OperacaoSync[] {
  return [...operacoes].sort(
    (a, b) => PRIORIDADE[a.entidade] - PRIORIDADE[b.entidade] || a.criadaEm.localeCompare(b.criadaEm),
  )
}

/** Entidades que precisam existir no servidor antes desta operação. */
export function dependencias(operacao: OperacaoSync): string[] {
  const payload = operacao.payload as { clienteId?: string; osId?: string }
  if (operacao.entidade === 'os' && payload.clienteId) return [payload.clienteId]
  if (operacao.entidade !== 'cliente' && operacao.entidade !== 'os' && payload.osId) return [payload.osId]
  return []
}

export type Decisao = 'enviar' | 'aguardar' | 'retida' | 'recusada'

/**
 * Acompanha, ao longo de um ciclo, quais entidades estão bloqueadas.
 * As operações precisam ser consultadas na ordem de ordenarFila.
 */
export function criarPlanoDaFila(agora = Date.now()) {
  const bloqueadas = new Set<string>()

  return {
    decidir(operacao: OperacaoSync): Decisao {
      const decisao: Decisao =
        operacao.estado === 'recusada' ? 'recusada'
        : [operacao.entidadeId, ...dependencias(operacao)].some((id) => bloqueadas.has(id)) ? 'retida'
        : !deveTentarAgora(operacao.proximaTentativaEm, agora) ? 'aguardar'
        : 'enviar'

      if (decisao !== 'enviar') bloqueadas.add(operacao.entidadeId)
      return decisao
    },
    /** Registra que uma operação enviada neste ciclo foi recusada. */
    recusar(operacao: OperacaoSync): void {
      bloqueadas.add(operacao.entidadeId)
    },
  }
}

/** Erro que nenhuma nova tentativa resolve, gerado pelo próprio aplicativo. */
export class OperacaoInvalida extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OperacaoInvalida'
  }
}

/**
 * Diferencia recusa definitiva de falha passageira.
 *
 * Do PostgreSQL, as classes 22 (dado inválido) e 23 (restrição violada) são
 * definitivas: a RPC levanta 22023 para operação malformada, e os checks de
 * tamanho geram 23514. O limite de envios por minuto usa P0001 e é passageiro.
 * Uma falha de rede chega do supabase-js com código vazio, também passageira.
 *
 * Do Storage, 400, 413 e 415 são arquivo recusado. 401 e 403 ficam de fora de
 * propósito: significam sessão expirada ou acesso revogado, e aí nenhuma
 * operação passaria, então o certo é parar o ciclo.
 */
export function erroDefinitivo(erro: unknown): boolean {
  if (erro instanceof OperacaoInvalida) return true
  if (!erro || typeof erro !== 'object') return false
  const { code, status } = erro as { code?: unknown; status?: unknown }
  if (typeof code === 'string' && /^2[23][0-9A-Z]{3}$/.test(code)) return true
  return typeof status === 'number' && [400, 413, 415].includes(status)
}

export function mensagemDoErro(erro: unknown): string {
  if (erro && typeof erro === 'object' && 'message' in erro && typeof erro.message === 'string') {
    return erro.message
  }
  return 'Falha de sincronização.'
}
