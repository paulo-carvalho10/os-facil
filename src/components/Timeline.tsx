import type { EventoOS, StatusOS } from '../db/types'
import { STATUS_LABEL } from '../db/types'

const formatador = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
})

export function Timeline({ eventos, compacto = false }: { eventos: EventoOS[]; compacto?: boolean }) {
  return (
    <ol className={`timeline ${compacto ? 'compact' : ''}`}>
      {eventos.map((evento, indice) => (
        <li key={evento.id} className="timeline-item">
          <span className="timeline-dot" aria-hidden="true">{indice + 1}</span>
          <div>
            <div className="timeline-head">
              <strong>{STATUS_LABEL[evento.status as StatusOS]}</strong>
              <time>{formatador.format(new Date(evento.criadoEm))}</time>
            </div>
            {evento.observacao && <p>{evento.observacao}</p>}
          </div>
        </li>
      ))}
    </ol>
  )
}
