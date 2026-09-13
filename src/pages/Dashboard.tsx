import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowRight, Plus, Search, Wrench } from 'lucide-react'
import { Link } from 'react-router-dom'
import { db } from '../db/database'
import { STATUS_LABEL, STATUS_OS } from '../db/types'
import { StatusBadge } from '../components/StatusBadge'
import { carregarDadosDemonstracao } from '../db/seed'
import { modoNuvem } from '../auth/supabase'

const data = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' })

export function Dashboard() {
  const [busca, setBusca] = useState('')
  const [status, setStatus] = useState('todos')
  const ordens = useLiveQuery(() => db.ordens.orderBy('atualizadaEm').reverse().toArray(), [], [])
  const clientes = useLiveQuery(() => db.clientes.toArray(), [], [])
  const mapaClientes = useMemo(() => new Map(clientes.map((c) => [c.id, c])), [clientes])

  const filtradas = ordens.filter((ordem) => {
    const cliente = mapaClientes.get(ordem.clienteId)
    const texto = `${ordem.numero} ${cliente?.nome} ${ordem.marca} ${ordem.modelo}`.toLowerCase()
    return (status === 'todos' || ordem.status === status) && texto.includes(busca.toLowerCase())
  })

  const abertas = ordens.filter((o) => o.status !== 'entregue').length
  const prontas = ordens.filter((o) => o.status === 'pronto').length

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Painel da assistência</p>
          <h1>Ordens de serviço</h1>
          <p className="subtitle">Acompanhe cada aparelho, mesmo quando a internet cair.</p>
        </div>
        <Link className="button primary no-print" to="/nova"><Plus size={18} /> Abrir nova OS</Link>
      </header>

      <section className="metrics" aria-label="Resumo">
        <article><span>Em aberto</span><strong>{abertas}</strong><small>aparelhos na oficina</small></article>
        <article><span>Prontas</span><strong>{prontas}</strong><small>aguardando retirada</small></article>
        <article><span>Total</span><strong>{ordens.length}</strong><small>ordens cadastradas</small></article>
      </section>

      <section className="panel">
        <div className="toolbar no-print">
          <label className="search-field"><Search size={18} /><input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar cliente, aparelho ou número" /></label>
          <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filtrar por status">
            <option value="todos">Todos os status</option>
            {STATUS_OS.map((item) => <option value={item} key={item}>{STATUS_LABEL[item]}</option>)}
          </select>
          {!modoNuvem && <button className="text-button" onClick={() => void carregarDadosDemonstracao(true)}>Recarregar demonstração</button>}
        </div>
        <div className="order-list">
          {filtradas.map((ordem) => {
            const cliente = mapaClientes.get(ordem.clienteId)
            return (
              <Link to={`/ordens/${ordem.id}`} className="order-row" key={ordem.id}>
                <span className="order-number">#{ordem.numero}</span>
                <span className="order-main">
                  <strong>{ordem.marca} {ordem.modelo}</strong>
                  <small>{cliente?.nome ?? 'Cliente'} · {ordem.aparelho}</small>
                </span>
                <StatusBadge status={ordem.status} />
                <time>{data.format(new Date(ordem.atualizadaEm))}</time>
                <ArrowRight size={18} aria-hidden="true" />
              </Link>
            )
          })}
          {filtradas.length === 0 && (
            <div className="empty-state"><Wrench size={30} /><strong>Nenhuma OS encontrada</strong><p>Altere os filtros ou abra uma nova ordem de serviço.</p></div>
          )}
        </div>
      </section>
    </div>
  )
}
