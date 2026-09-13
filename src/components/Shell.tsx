import { ClipboardList, Plus, RefreshCcw, WifiOff } from 'lucide-react'
import { useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
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

export function Shell() {
  const [estado, setEstado] = useState<keyof typeof rotulos>('local')
  const pendentes = useLiveQuery(() => db.filaSync.count(), [], 0)

  useEffect(() => observarSync(setEstado), [])

  return (
    <div className="app-shell">
      {!supabase && <div className="no-print" style={{ position: 'fixed', bottom: 72, right: 16, zIndex: 10, maxWidth: 300, background: '#fff', padding: 12, border: '1px solid #ddd', borderRadius: 12, fontSize: 12 }}>Demonstração com dados fictícios. Alterações ficam apenas neste navegador.</div>}
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
        </div>
        <p className="version">OS Fácil v0.1.0</p>
      </aside>
      <main className="main-content">{supabase && <div className="no-print" style={{ padding: '12px 24px', textAlign: 'right' }}><button className="text-button" onClick={() => void supabase!.auth.signOut({ scope: 'local' }).then(() => window.location.reload())}>Sair da conta</button></div>}<Outlet /></main>
      <nav className="bottom-nav no-print" aria-label="Navegação móvel">
        <NavLink to="/" end><ClipboardList size={20} /><span>Ordens</span></NavLink>
        <NavLink to="/nova"><Plus size={20} /><span>Nova OS</span></NavLink>
      </nav>
    </div>
  )
}
