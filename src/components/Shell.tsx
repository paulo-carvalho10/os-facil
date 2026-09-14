import { AlertTriangle, ClipboardList, Info, Plus, RefreshCcw, WifiOff, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/database'
import { observarSync, sincronizarAgora } from '../sync/supabase-engine'
import { supabase } from '../auth/supabase'

const rotulos = {
  offline: 'Sem conexão',
  sincronizando: 'Sincronizando',
  sincronizado: 'Tudo sincronizado',
  erro: 'Aguardando nova tentativa',
  local: 'Modo local',
}

const CHAVE_AVISO_FECHADO = 'os-facil:aviso-demonstracao-fechado'

/**
 * Aviso da demonstração. Fica no fluxo da página, e não flutuando sobre ela,
 * para nunca cobrir conteúdo. Fechar é lembrado só neste navegador; se o
 * armazenamento estiver bloqueado, o aviso apenas volta a aparecer.
 */
function AvisoDemonstracao() {
  const [visivel, setVisivel] = useState(() => {
    try {
      return localStorage.getItem(CHAVE_AVISO_FECHADO) !== '1'
    } catch {
      return true
    }
  })

  if (!visivel) return null

  function fechar() {
    try {
      localStorage.setItem(CHAVE_AVISO_FECHADO, '1')
    } catch {
      // Sem armazenamento, o aviso só some até recarregar.
    }
    setVisivel(false)
  }

  return (
    <div className="demo-notice-wrap no-print">
      <div className="demo-notice" role="note">
        <Info size={16} aria-hidden="true" />
        <span>Demonstração com dados fictícios. As alterações ficam só neste navegador.</span>
        <button type="button" onClick={fechar} aria-label="Fechar aviso da demonstração"><X size={16} /></button>
      </div>
    </div>
  )
}

export function Shell() {
  const [estado, setEstado] = useState<keyof typeof rotulos>('local')
  const pendentes = useLiveQuery(() => db.filaSync.filter((operacao) => operacao.estado !== 'recusada').count(), [], 0)
  const recusadas = useLiveQuery(() => db.filaSync.where('estado').equals('recusada').count(), [], 0)

  useEffect(() => observarSync(setEstado), [])

  const avisoRecusadas = supabase && recusadas > 0 && (
    <Link to="/sincronizacao" className="sync-alert no-print">
      <AlertTriangle size={16} />
      {recusadas} {recusadas === 1 ? 'alteração recusada pelo servidor' : 'alterações recusadas pelo servidor'}
    </Link>
  )

  return (
    <div className="app-shell">
      <aside className="sidebar no-print">
        <NavLink to="/" className="brand" aria-label="OS Fácil - início">
          <span className="brand-mark"><ClipboardList size={21} /></span>
          <span>OS Fácil</span>
        </NavLink>
        <p className="eyebrow sidebar-label">Oficina Horizonte</p>
        <nav className="main-nav" aria-label="Navegação principal">
          <NavLink to="/" end><ClipboardList size={19} /> Ordens de serviço</NavLink>
          <NavLink to="/nova"><Plus size={19} /> Nova OS</NavLink>
        </nav>
        <div className="sync-card">
          <div className="sync-title">
            {estado === 'offline' ? <WifiOff size={17} /> : <span className={`sync-dot ${estado}`} />}
            <strong>{estado === 'sincronizado' && pendentes > 0 ? 'Alterações aguardando envio' : rotulos[estado]}</strong>
          </div>
          <p>{supabase ? `${pendentes} ${pendentes === 1 ? 'alteração pendente' : 'alterações pendentes'}` : 'Dados salvos neste navegador'}</p>
          {supabase && <button className="text-button" onClick={() => void sincronizarAgora()}>
            <RefreshCcw size={14} /> Tentar agora
          </button>}
          {avisoRecusadas}
        </div>
        <p className="version">OS Fácil v0.1.0</p>
      </aside>
      <main className="main-content">
        {!supabase && <AvisoDemonstracao />}
        {supabase && (
          <div className="no-print" style={{ padding: '12px 24px', textAlign: 'right' }}>
            <button className="text-button" onClick={() => void supabase!.auth.signOut({ scope: 'local' }).then(() => window.location.reload())}>Sair da conta</button>
          </div>
        )}
        {/* No celular a barra lateral some; o aviso precisa aparecer no conteúdo. */}
        <div className="sync-alert-mobile">{avisoRecusadas}</div>
        <Outlet />
      </main>
      <nav className="bottom-nav no-print" aria-label="Navegação móvel">
        <NavLink to="/" end><ClipboardList size={20} /><span>Ordens</span></NavLink>
        <NavLink to="/nova"><Plus size={20} /><span>Nova OS</span></NavLink>
      </nav>
    </div>
  )
}
