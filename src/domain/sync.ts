export const ATRASOS_SYNC_MS = [5_000, 15_000, 60_000, 5 * 60_000, 30 * 60_000] as const

export function calcularProximaTentativa(tentativas: number, agora = Date.now()): string {
  const indice = Math.min(Math.max(tentativas, 0), ATRASOS_SYNC_MS.length - 1)
  return new Date(agora + ATRASOS_SYNC_MS[indice]).toISOString()
}

export function deveTentarAgora(proximaTentativaEm: string, agora = Date.now()): boolean {
  return Date.parse(proximaTentativaEm) <= agora
}
