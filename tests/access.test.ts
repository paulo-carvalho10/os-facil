import { describe, expect, it } from 'vitest'
import { bearerToken, caminhoPublico, origemPermitida } from '../supabase/functions/api/access'

describe('fronteira de acesso da API', () => {
  it('recusa origins desconhecidas, wildcard e configuração vazia', () => {
    expect(origemPermitida('https://evil.example', 'https://app.example')).toBe(false)
    expect(origemPermitida('https://app.example', '')).toBe(false)
    expect(origemPermitida('https://app.example', '*')).toBe(false)
    expect(origemPermitida('https://app.example', 'https://app.example,http://localhost:3200')).toBe(true)
  })
  it('requisições sem Origin ainda precisam da autenticação da rota', () => {
    expect(origemPermitida(null, '')).toBe(true)
    expect(bearerToken(null)).toBeNull()
    expect(bearerToken('Basic senha')).toBeNull()
    expect(bearerToken('Bearer token extra')).toBeNull()
    expect(bearerToken('Bearer token')).toBe('token')
  })
  it('a exceção pública exige código aleatório completo', () => {
    expect(caminhoPublico('/api/public/os/TQ744LFKEN9NRKG6')).toBe(true)
    expect(caminhoPublico('/api/public/os/1001')).toBe(false)
    expect(caminhoPublico('/api/public/os/TQ744LFKEN9NRKG6/extra')).toBe(false)
    expect(caminhoPublico('/api/sync')).toBe(false)
  })
})
