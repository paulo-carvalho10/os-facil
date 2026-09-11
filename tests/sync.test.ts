import { describe, expect, it } from 'vitest'
import { calcularProximaTentativa, escolherMaisRecente, deveTentarAgora } from '../src/domain/sync'

describe('sincronização', () => {
  it('aumenta a espera entre falhas e limita o atraso máximo', () => {
    const base = Date.parse('2026-09-11T12:00:00Z')
    expect(Date.parse(calcularProximaTentativa(0, base)) - base).toBe(5_000)
    expect(Date.parse(calcularProximaTentativa(2, base)) - base).toBe(60_000)
    expect(Date.parse(calcularProximaTentativa(99, base)) - base).toBe(30 * 60_000)
  })

  it('só libera uma tentativa quando o horário chegou', () => {
    const agora = Date.parse('2026-09-11T12:00:00Z')
    expect(deveTentarAgora('2026-09-11T11:59:59Z', agora)).toBe(true)
    expect(deveTentarAgora('2026-09-11T12:00:01Z', agora)).toBe(false)
  })

  it('resolve conflito pela data de alteração mais recente', () => {
    const local = { valor: 'local', atualizadoEm: '2026-09-11T10:00:00Z' }
    const remoto = { valor: 'remoto', atualizadoEm: '2026-09-11T10:01:00Z' }
    expect(escolherMaisRecente(local, remoto)).toBe(remoto)
    expect(escolherMaisRecente(remoto, local)).toBe(remoto)
  })
})
