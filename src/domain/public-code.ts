const ALFABETO = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'

export function gerarCodigoPublico(tamanho = 16): string {
  if (tamanho < 12) throw new Error('O código público precisa ter ao menos 12 caracteres.')
  const bytes = new Uint8Array(tamanho)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => ALFABETO[byte % ALFABETO.length]).join('')
}

export function codigoPublicoValido(codigo: string): boolean {
  return codigo.length >= 12 && [...codigo].every((char) => ALFABETO.includes(char))
}
