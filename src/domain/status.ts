import { STATUS_OS, type StatusOS } from '../db/types'

export function proximoStatus(atual: StatusOS): StatusOS | null {
  const indice = STATUS_OS.indexOf(atual)
  return STATUS_OS[indice + 1] ?? null
}
