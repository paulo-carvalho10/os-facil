import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, HashRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import { App } from './App'
import { carregarDadosDemonstracao } from './db/seed'
import './styles.css'
import { modoNuvem, demonstracaoPublica } from './auth/supabase'
const Router = demonstracaoPublica ? HashRouter : BrowserRouter

registerSW({ immediate: true })

async function iniciar() {
  if (!modoNuvem) await carregarDadosDemonstracao()
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <Router>
        <App />
      </Router>
    </StrictMode>,
  )
}

void iniciar()
