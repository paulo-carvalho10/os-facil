export function origemPermitida(origem: string | null, configuracao: string): boolean {
  const permitidas = configuracao.split(',').map((item) => item.trim()).filter(Boolean)
  return origem === null || permitidas.includes(origem)
}

export function bearerToken(authorization: string | null): string | null {
  const match = authorization?.match(/^Bearer ([^\s]+)$/i)
  return match?.[1] ?? null
}

export function caminhoPublico(path: string): boolean {
  return /\/public\/os\/[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{16}$/.test(path)
}
