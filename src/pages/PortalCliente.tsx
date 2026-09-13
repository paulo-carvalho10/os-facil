import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowLeft, CheckCircle2, LockKeyhole, Wrench } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { StatusBadge } from '../components/StatusBadge'
import { Timeline } from '../components/Timeline'
import { db } from '../db/database'
import { STATUS_OS } from '../db/types'
import type { DadosPublicosOS } from '../db/types'
import { supabase } from '../auth/supabase'

export function PortalCliente() {
  const { codigo = '' } = useParams()
  const ordem = useLiveQuery(async () => supabase ? null : (await db.ordens.where('codigoPublico').equals(codigo).first()) ?? null, [codigo])
  const eventos = useLiveQuery(
    () => ordem ? db.eventos.where('osId').equals(ordem.id).filter((e) => e.publico).sortBy('criadoEm') : [],
    [ordem?.id], [],
  )
  const [remota, setRemota] = useState<DadosPublicosOS | null>(null)
  const [consultaRemotaFinalizada, setConsultaRemotaFinalizada] = useState(false)

  useEffect(() => {
    if (ordem || ordem === undefined) return
    if (!supabase) {
      setConsultaRemotaFinalizada(true)
      return
    }
    let ativo = true
    setConsultaRemotaFinalizada(false)
    setRemota(null)
    void supabase.rpc('consultar_os', { codigo }).then(({ data, error }) => {
      if (ativo) { setRemota(error ? null : data as DadosPublicosOS | null); setConsultaRemotaFinalizada(true) }
    })
    return () => { ativo = false }
  }, [codigo, ordem])

  if (ordem === undefined) return <div className="public-page"><div className="portal-card"><div className="skeleton tall" /></div></div>
  if (!ordem && !consultaRemotaFinalizada) return <div className="public-page"><div className="portal-card"><div className="skeleton tall" /></div></div>
  if (!ordem && !remota) return <div className="public-page"><div className="portal-card empty-state"><Wrench size={34} /><h1>Não encontramos esta OS</h1><p>Confira se o link recebido está completo.</p><Link to="/" className="back-link"><ArrowLeft size={17} /> Ir para o painel de demonstração</Link></div></div>

  const exibida = ordem ?? remota!
  const eventosExibidos = ordem ? eventos.map((evento) => ({ ...evento, observacao: undefined })) : remota!.eventos.map((evento) => ({ ...evento, osId: '', publico: true, atualizadoEm: evento.criadoEm }))
  const atual = STATUS_OS.indexOf(exibida.status)
  return (
    <div className="public-page">
      <header className="portal-brand"><span className="brand-mark"><Wrench size={20} /></span><span>Oficina Horizonte</span></header>
      <main className="portal-card">
        <div className="portal-top"><div><p className="eyebrow">Acompanhamento de reparo</p><h1>{exibida.marca} {exibida.modelo}</h1><p>Ordem de serviço #{exibida.numero}</p></div><StatusBadge status={exibida.status} /></div>
        <div className="progress-track" aria-label={`Etapa ${atual + 1} de ${STATUS_OS.length}`}>
          {STATUS_OS.map((status, indice) => <span key={status} className={indice <= atual ? 'done' : ''}>{indice <= atual && <CheckCircle2 size={17} />}</span>)}
        </div>
        <section className="portal-section"><p className="eyebrow">Atualizações</p><h2>Histórico do atendimento</h2><Timeline eventos={eventosExibidos} compacto /></section>
        <div className="privacy-note"><LockKeyhole size={19} /><div><strong>Consulta protegida</strong><p>Este link mostra apenas o aparelho e as atualizações do reparo. Seus dados pessoais não aparecem aqui.</p></div></div>
      </main>
      <footer className="portal-footer">OS Fácil v0.1.0 · Atualizações salvas mesmo sem internet</footer>
    </div>
  )
}
