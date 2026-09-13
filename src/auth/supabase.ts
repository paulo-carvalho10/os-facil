import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
export const demonstracaoPublica = import.meta.env.MODE === 'demo'
export const supabase = !demonstracaoPublica && url && key ? createClient(url, key) : null
export const modoNuvem = Boolean(supabase)
