import { useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Shell } from './components/Shell'
import { Dashboard } from './pages/Dashboard'
import { NovaOrdem } from './pages/NovaOrdem'
import { DetalheOrdem } from './pages/DetalheOrdem'
import { PortalCliente } from './pages/PortalCliente'
import { iniciarSincronizacao } from './sync/supabase-engine'
import { Login } from './auth/Login'

function Oficina() {
  useEffect(() => iniciarSincronizacao(), [])
  return <Shell />
}

export function App() {

  return (
    <Routes>
      <Route path="/os/:codigo" element={<PortalCliente />} />
      <Route element={<Login><Oficina /></Login>}>
        <Route index element={<Dashboard />} />
        <Route path="/nova" element={<NovaOrdem />} />
        <Route path="/ordens/:id" element={<DetalheOrdem />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
