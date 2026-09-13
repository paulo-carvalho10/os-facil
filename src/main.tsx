import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import { App } from './App'
import { carregarDadosDemonstracao } from './db/seed'
import './styles.css'
import { modoNuvem } from './auth/supabase'

registerSW({ immediate: true })

async function iniciar() {
  if (!modoNuvem) await carregarDadosDemonstracao()
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </StrictMode>,
  )
}

void iniciar()
