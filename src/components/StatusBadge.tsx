import { STATUS_LABEL, type StatusOS } from '../db/types'

export function StatusBadge({ status }: { status: StatusOS }) {
  return <span className={`status-badge status-${status}`}>{STATUS_LABEL[status]}</span>
}
