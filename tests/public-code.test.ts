import { describe, expect, it } from 'vitest'
import { codigoPublicoValido, gerarCodigoPublico } from '../src/domain/public-code'

describe('código público', () => {
  it('gera código aleatório, não sequencial e sem caracteres ambíguos', () => {
    const codigos = new Set(Array.from({ length: 100 }, () => gerarCodigoPublico()))
    expect(codigos.size).toBe(100)
    for (const codigo of codigos) {
      expect(codigo).toHaveLength(16)
      expect(codigoPublicoValido(codigo)).toBe(true)
      expect(codigo).not.toMatch(/[01IO]/)
    }
  })

  it('recusa tamanho curto', () => {
    expect(() => gerarCodigoPublico(8)).toThrow(/12 caracteres/)
  })
})
