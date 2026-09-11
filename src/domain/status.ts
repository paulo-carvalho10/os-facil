import { STATUS_OS, type StatusOS } from '../db/types'

export function proximoStatus(atual: StatusOS): StatusOS | null {
  const indice = STATUS_OS.indexOf(atual)
  return STATUS_OS[indice + 1] ?? null
}

export function podeAvancarStatus(atual: StatusOS, proximo: StatusOS): boolean {
  return proximoStatus(atual) === proximo
}
