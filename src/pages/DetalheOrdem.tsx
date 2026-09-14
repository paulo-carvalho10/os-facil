import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowLeft, CheckCircle2, Copy, ExternalLink, Printer } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { PhotoCapture } from '../components/PhotoCapture'
import { SignaturePad } from '../components/SignaturePad'
import { StatusBadge } from '../components/StatusBadge'
import { Timeline } from '../components/Timeline'
import { assinaturaVigente, atualizarStatus, db } from '../db/database'
import { STATUS_LABEL } from '../db/types'
import { proximoStatus } from '../domain/status'
import { LIMITES } from '../domain/validacao'

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const dataHora = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' })

export function DetalheOrdem() {
  const { id = '' } = useParams()
  const ordem = useLiveQuery(() => db.ordens.get(id), [id])
  const cliente = useLiveQuery(() => ordem ? db.clientes.get(ordem.clienteId) : undefined, [ordem?.clienteId])
  const eventos = useLiveQuery(() => db.eventos.where('osId').equals(id).sortBy('criadoEm'), [id], [])
  const fotos = useLiveQuery(() => db.fotos.where('osId').equals(id).toArray(), [id], [])
  const assinatura = useLiveQuery(() => assinaturaVigente(id), [id])
  const [observacao, setObservacao] = useState('')
  const [copiado, setCopiado] = useState(false)
  const [salvandoStatus, setSalvandoStatus] = useState(false)
  const [erroStatus, setErroStatus] = useState('')
  const urls = useMemo(() => fotos.map((foto) => ({ id: foto.id, url: URL.createObjectURL(foto.arquivo) })), [fotos])

  if (ordem === undefined) return <div className="page"><div className="skeleton tall" /></div>
  if (!ordem) return <div className="page"><div className="empty-state"><strong>Ordem não encontrada</strong><Link to="/">Voltar para a lista</Link></div></div>

  const seguinte = proximoStatus(ordem.status)
  const linkPublico = import.meta.env.MODE === 'demo'
    ? `${location.origin}${import.meta.env.BASE_URL}#/os/${ordem.codigoPublico}`
    : `${location.origin}/os/${ordem.codigoPublico}`

  async function avancar() {
    if (!seguinte) return
    setSalvandoStatus(true)
    setErroStatus('')
    try {
      await atualizarStatus(ordem!.id, seguinte, observacao)
      setObservacao('')
    } catch (falha) {
      setErroStatus(falha instanceof Error ? falha.message : 'Não foi possível atualizar o status.')
    } finally {
      setSalvandoStatus(false)
    }
  }

  async function copiar() {
    await navigator.clipboard.writeText(linkPublico)
    setCopiado(true)
    window.setTimeout(() => setCopiado(false), 1800)
  }

  return (
    <div className="page detail-page">
      <div className="no-print"><Link to="/" className="back-link"><ArrowLeft size={17} /> Voltar para as ordens</Link></div>
      <header className="detail-header">
        <div><p className="eyebrow">Ordem de serviço</p><h1>OS #{ordem.numero}</h1><p className="subtitle">Aberta em {dataHora.format(new Date(ordem.criadaEm))}</p></div>
        <div className="detail-header-actions"><StatusBadge status={ordem.status} /><button className="button ghost no-print" onClick={() => window.print()}><Printer size={17} /> Imprimir</button></div>
      </header>

      <div className="detail-layout">
        <div className="detail-main">
          <section className="panel detail-card">
            <div className="section-heading"><div><p className="eyebrow">Equipamento</p><h2>{ordem.marca} {ordem.modelo}</h2></div><span className="device-type">{ordem.aparelho}</span></div>
            <dl className="detail-grid">
              <div><dt>Cliente</dt><dd>{cliente?.nome}</dd></div>
              <div><dt>Telefone</dt><dd>{cliente?.telefone}</dd></div>
              <div><dt>IMEI / série</dt><dd>{ordem.imeiOuSerie || 'Não informado'}</dd></div>
              <div><dt>Orçamento</dt><dd>{ordem.orcamento != null ? moeda.format(ordem.orcamento) : 'A avaliar'}</dd></div>
              <div className="span-2"><dt>Defeito relatado</dt><dd>{ordem.defeitoRelatado}</dd></div>
              <div className="span-2"><dt>Acessórios</dt><dd>{ordem.acessorios || 'Nenhum'}</dd></div>
            </dl>
          </section>

          <section className="panel detail-card">
            <div className="section-heading"><div><p className="eyebrow">Registro visual</p><h2>Fotos de entrada</h2></div></div>
            <PhotoCapture osId={ordem.id} />
            {urls.length ? <div className="photo-grid">{urls.map((foto) => <img key={foto.id} src={foto.url} alt="Foto do aparelho na entrada" />)}</div> : <p className="muted">Nenhuma foto registrada. As fotos ficam guardadas no aparelho até a sincronização.</p>}
          </section>

          <section className="panel detail-card">
            <div className="section-heading"><div><p className="eyebrow">Comprovante</p><h2>Assinatura na entrega</h2></div></div>
            <SignaturePad osId={ordem.id} assinaturaAtual={assinatura?.png} />
          </section>
        </div>

        <aside className="detail-side">
          {seguinte && (
            <section className="panel status-action no-print">
              <p className="eyebrow">Próxima etapa</p>
              <h2>{STATUS_LABEL[seguinte]}</h2>
              <textarea rows={3} value={observacao} maxLength={LIMITES.observacao.max} onChange={(e) => setObservacao(e.target.value)} placeholder="Observação para a linha do tempo" />
              {erroStatus && <p className="form-error">{erroStatus}</p>}
              <button className="button primary full" onClick={() => void avancar()} disabled={salvandoStatus}><CheckCircle2 size={18} /> Atualizar status</button>
            </section>
          )}
          <section className="panel detail-card"><p className="eyebrow">Histórico</p><h2>Linha do tempo</h2><Timeline eventos={eventos} /></section>
          <section className="panel public-link-card no-print"><p className="eyebrow">Portal do cliente</p><h2>Acompanhamento sem login</h2><p>O código não revela o número sequencial da OS.</p><code>{ordem.codigoPublico}</code><div className="row-actions"><button className="button secondary" onClick={() => void copiar()}><Copy size={17} /> {copiado ? 'Copiado' : 'Copiar link'}</button><a className="button ghost" href={linkPublico} target="_blank"><ExternalLink size={17} /> Abrir</a></div></section>
        </aside>
      </div>

      <footer className="print-footer">OS Fácil · Oficina Horizonte · Documento gerado em {dataHora.format(new Date())}</footer>
    </div>
  )
}
