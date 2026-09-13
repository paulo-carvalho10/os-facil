import { useLiveQuery } from 'dexie-react-hooks'
import { AlertTriangle, ArrowLeft, CheckCircle2, RotateCcw, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { descartarOperacao, db, reenviarOperacao } from '../db/database'
import type { OperacaoSync } from '../db/types'
import { criarPlanoDaFila, ordenarFila } from '../domain/fila'
import { sincronizarAgora } from '../sync/supabase-engine'

const ROTULO: Record<OperacaoSync['entidade'], string> = {
  cliente: 'Cadastro de cliente',
  os: 'Dados da OS',
  evento: 'Mudança de status',
  foto: 'Foto',
}

const dataHora = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

/** Lista o que o servidor recusou, com o motivo, e deixa a oficina decidir. */
export function Sincronizacao() {
  const fila = useLiveQuery(() => db.filaSync.toArray(), [], [])
  const ordens = useLiveQuery(() => db.ordens.toArray(), [], [])
  const numeroDaOS = new Map(ordens.map((ordem) => [ordem.id, ordem.numero]))

  const plano = criarPlanoDaFila()
  const decisoes = ordenarFila(fila).map((operacao) => ({ operacao, decisao: plano.decidir(operacao) }))
  const recusadas = decisoes.filter((item) => item.decisao === 'recusada').map((item) => item.operacao)
  const retidas = decisoes.filter((item) => item.decisao === 'retida').length

  function referencia(operacao: OperacaoSync): string {
    const payload = operacao.payload as { nome?: string; osId?: string }
    if (operacao.entidade === 'cliente') return payload.nome ?? 'Cliente'
    const osId = operacao.entidade === 'os' ? operacao.entidadeId : payload.osId
    const numero = osId ? numeroDaOS.get(osId) : undefined
    return numero ? `OS #${numero}` : 'OS'
  }

  async function reenviar(operacao: OperacaoSync) {
    await reenviarOperacao(operacao.id)
    void sincronizarAgora()
  }

  async function descartar(operacao: OperacaoSync) {
    const confirmado = window.confirm(
      'Descartar esta alteração? Ela continua neste aparelho, mas não será enviada ao servidor.',
    )
    if (confirmado) await descartarOperacao(operacao.id)
  }

  return (
    <div className="page narrow-page">
      <Link to="/" className="back-link"><ArrowLeft size={17} /> Voltar para as ordens</Link>
      <header className="page-header compact">
        <div>
          <p className="eyebrow">Sincronização</p>
          <h1>Alterações recusadas</h1>
          <p className="subtitle">
            O servidor não aceitou estes dados. Tentar de novo não resolve sozinho: corrija a regra ou descarte a alteração.
          </p>
        </div>
      </header>

      {recusadas.length === 0 ? (
        <section className="panel empty-state">
          <CheckCircle2 size={30} />
          <strong>Nenhuma alteração recusada</strong>
          <p>{fila.length ? `${fila.length} alterações aguardando envio normal.` : 'Tudo o que foi feito neste aparelho já chegou ao servidor.'}</p>
        </section>
      ) : (
        <section className="panel sync-problems">
          {retidas > 0 && (
            <p className="muted">
              {retidas} {retidas === 1 ? 'alteração depende' : 'alterações dependem'} destas e só serão enviadas depois delas.
            </p>
          )}
          <ul>
            {recusadas.map((operacao) => (
              <li key={operacao.id}>
                <AlertTriangle size={20} aria-hidden="true" />
                <div>
                  <strong>{ROTULO[operacao.entidade]} · {referencia(operacao)}</strong>
                  <p>{operacao.erro}</p>
                  <small>Feita em {dataHora.format(new Date(operacao.criadaEm))}</small>
                </div>
                <div className="row-actions">
                  <button className="button ghost" onClick={() => void reenviar(operacao)}><RotateCcw size={16} /> Tentar de novo</button>
                  <button className="button ghost" onClick={() => void descartar(operacao)}><Trash2 size={16} /> Descartar</button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
