import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { supabase } from './supabase'
import { selecionarBanco } from '../db/database'

export function Login({ children }: { children: ReactNode }) {
  const [liberado, setLiberado] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  useEffect(() => {
    if (!supabase) { setLiberado(true); setCarregando(false); return }
    let ativo = true
    let usuarioAtual = ''
    const validar = async () => {
      const { data: { session } } = await supabase!.auth.getSession()
      if (!ativo) return
      if (!session) { setLiberado(false); setCarregando(false); return }
      if (!navigator.onLine && usuarioAtual === session.user.id) { setCarregando(false); return }
      const { data, error } = await supabase!.rpc('acesso_oficina')
      if (!ativo) return
      if (error || data !== true) {
        setLiberado(false)
        setErro(error ? 'Não foi possível validar o acesso. Verifique a conexão e entre novamente.' : 'Esta conta ainda não foi autorizada pelo administrador da oficina.')
      } else {
        if (usuarioAtual !== session.user.id) selecionarBanco(`${new URL(import.meta.env.VITE_SUPABASE_URL).hostname}-${session.user.id}`)
        usuarioAtual = session.user.id
        setLiberado(true)
        setErro('')
      }
      setCarregando(false)
    }
    void validar()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') { setLiberado(false); setCarregando(false) }
      if (event === 'SIGNED_IN') window.setTimeout(() => void validar(), 0)
    })
    return () => { ativo = false; subscription.unsubscribe() }
  }, [])

  async function entrar(event: FormEvent) {
    event.preventDefault()
    setCarregando(true); setErro('')
    const { error } = await supabase!.auth.signInWithPassword({ email: email.trim(), password: senha })
    setSenha('')
    if (error) { setErro('Não foi possível entrar. Confira o e-mail e a senha.'); setCarregando(false) }
  }
  if (liberado) return <>{children}</>
  return <main className="public-page"><section className="portal-card" style={{ maxWidth: 460 }}>
    <p className="eyebrow">OS Fácil · Área da oficina</p><h1>Entre na sua conta</h1>
    <p>Somente operadores autorizados podem acessar clientes, ordens e fotos.</p>
    <form onSubmit={(e) => void entrar(e)} style={{ display: 'grid', gap: 16, marginTop: 24 }}>
      <label>E-mail<input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      <label>Senha<input type="password" autoComplete="current-password" required value={senha} onChange={(e) => setSenha(e.target.value)} /></label>
      {erro && <p role="alert">{erro}</p>}
      <button className="button primary" disabled={carregando}>{carregando ? 'Verificando acesso…' : 'Entrar'}</button>
    </form>
  </section></main>
}
