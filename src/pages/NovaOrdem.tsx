import { ArrowLeft, Check, LoaderCircle } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { criarOrdem } from '../db/database'
import type { NovaOSInput } from '../db/types'
import { BarcodeScanner } from '../components/BarcodeScanner'
import { LIMITES, validarNovaOS } from '../domain/validacao'

const inicial: NovaOSInput = {
  clienteNome: '', clienteTelefone: '', clienteDocumento: '', aparelho: 'Celular',
  marca: '', modelo: '', imeiOuSerie: '', defeitoRelatado: '', acessorios: '',
}

export function NovaOrdem() {
  const [dados, setDados] = useState(inicial)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const navegar = useNavigate()

  function campo<K extends keyof NovaOSInput>(chave: K, valor: NovaOSInput[K]) {
    setDados((atual) => ({ ...atual, [chave]: valor }))
  }

  async function enviar(evento: FormEvent) {
    evento.preventDefault()
    const erros = validarNovaOS(dados)
    if (erros.length) {
      setErro(erros.join(' '))
      return
    }
    setSalvando(true)
    setErro('')
    try {
      const ordem = await criarOrdem(dados)
      navegar(`/ordens/${ordem.id}`, { state: { criada: true } })
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível abrir a OS.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="page narrow-page">
      <Link to="/" className="back-link"><ArrowLeft size={17} /> Voltar para as ordens</Link>
      <header className="page-header compact"><div><p className="eyebrow">Nova entrada</p><h1>Abrir ordem de serviço</h1><p className="subtitle">Os dados são salvos neste aparelho antes da sincronização.</p></div></header>
      <form className="form-stack" onSubmit={(e) => void enviar(e)}>
        <fieldset className="panel form-section">
          <legend>Cliente</legend>
          <div className="field-grid two">
            <label>
              <span>Nome completo *</span>
              <input value={dados.clienteNome} maxLength={LIMITES.clienteNome.max} onChange={(e) => campo('clienteNome', e.target.value)} />
            </label>
            <label>
              <span>Telefone *</span>
              <input type="tel" value={dados.clienteTelefone} maxLength={LIMITES.clienteTelefone.max} onChange={(e) => campo('clienteTelefone', e.target.value)} placeholder="(11) 99999-9999" />
            </label>
            <label>
              <span>CPF ou documento</span>
              <input value={dados.clienteDocumento} maxLength={LIMITES.clienteDocumento.max} onChange={(e) => campo('clienteDocumento', e.target.value)} />
            </label>
          </div>
        </fieldset>
        <fieldset className="panel form-section">
          <legend>Aparelho</legend>
          <div className="field-grid three">
            <label><span>Tipo *</span><select value={dados.aparelho} onChange={(e) => campo('aparelho', e.target.value)}><option>Celular</option><option>Tablet</option><option>Notebook</option><option>Videogame</option><option>Outro</option></select></label>
            <label>
              <span>Marca *</span>
              <input value={dados.marca} maxLength={LIMITES.marca.max} onChange={(e) => campo('marca', e.target.value)} />
            </label>
            <label>
              <span>Modelo *</span>
              <input value={dados.modelo} maxLength={LIMITES.modelo.max} onChange={(e) => campo('modelo', e.target.value)} />
            </label>
            <label className="span-2">
              <span>IMEI ou número de série</span>
              <div className="input-with-action">
                <input value={dados.imeiOuSerie} maxLength={LIMITES.imeiOuSerie.max} onChange={(e) => campo('imeiOuSerie', e.target.value)} />
                <BarcodeScanner onValue={(valor) => campo('imeiOuSerie', valor)} />
              </div>
            </label>
          </div>
        </fieldset>
        <fieldset className="panel form-section">
          <legend>Atendimento</legend>
          <div className="field-grid two">
            <label className="span-2">
              <span>Defeito relatado *</span>
              <textarea rows={4} value={dados.defeitoRelatado} maxLength={LIMITES.defeitoRelatado.max} onChange={(e) => campo('defeitoRelatado', e.target.value)} />
            </label>
            <label>
              <span>Acessórios entregues</span>
              <input value={dados.acessorios} maxLength={LIMITES.acessorios.max} onChange={(e) => campo('acessorios', e.target.value)} placeholder="Capa, carregador..." />
            </label>
            <label>
              <span>Orçamento previsto</span>
              <input type="number" min="0" max={LIMITES.orcamentoMaximo} step="0.01" value={dados.orcamento ?? ''} onChange={(e) => campo('orcamento', e.target.value ? Number(e.target.value) : undefined)} />
            </label>
          </div>
        </fieldset>
        {erro && <p className="form-error">{erro}</p>}
        <div className="form-footer"><Link to="/" className="button ghost">Cancelar</Link><button className="button primary" disabled={salvando}>{salvando ? <LoaderCircle className="spin" size={18} /> : <Check size={18} />} Salvar OS offline</button></div>
      </form>
    </div>
  )
}
