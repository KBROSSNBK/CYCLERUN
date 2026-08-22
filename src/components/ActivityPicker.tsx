import { ACTIVITIES, activityOf, type ActivityType } from '@/config/activities'

/**
 * Seleccion del medio de transporte.
 *
 * `ActivityChips` se usa antes de arrancar y `ActivitySheet` durante la
 * carrera, donde el cambio debe hacerse de un toque y con dianas grandes.
 */

export function ActivityChips({
  value,
  onChange,
}: {
  value: ActivityType
  onChange: (activity: ActivityType) => void
}) {
  return (
    <div className="activity-chips" role="radiogroup" aria-label="Medio de transporte">
      {ACTIVITIES.map((activity) => (
        <button
          key={activity.id}
          type="button"
          role="radio"
          aria-checked={activity.id === value}
          className={`activity-chip ${activity.id === value ? 'is-active' : ''}`}
          onClick={() => onChange(activity.id)}
        >
          <span className="activity-chip__icon" aria-hidden>
            {activity.icon}
          </span>
          {activity.label}
        </button>
      ))}
    </div>
  )
}

/** Boton compacto que muestra el medio actual (cabecera de la carrera). */
export function ActivityBadge({
  value,
  onClick,
}: {
  value: ActivityType
  onClick: () => void
}) {
  const activity = activityOf(value)
  return (
    <button type="button" className="badge badge--activity" onClick={onClick}>
      <span aria-hidden>{activity.icon}</span>
      {activity.label}
      <span aria-hidden style={{ opacity: 0.6 }}>
        ▾
      </span>
    </button>
  )
}

export function ActivitySheet({
  open,
  value,
  onSelect,
  onClose,
}: {
  open: boolean
  value: ActivityType
  onSelect: (activity: ActivityType) => void
  onClose: () => void
}) {
  if (!open) return null
  return (
    <div className="overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="dialog" onClick={(event) => event.stopPropagation()}>
        <h2 className="dialog__title">Medio de transporte</h2>
        <p className="dialog__body" style={{ marginBottom: 'var(--gap-4)' }}>
          Puedes cambiarlo durante la carrera: el tramo recorrido con cada medio queda registrado
          por separado.
        </p>
        <div className="activity-grid">
          {ACTIVITIES.map((activity) => (
            <button
              key={activity.id}
              type="button"
              className={`activity-tile ${activity.id === value ? 'is-active' : ''}`}
              onClick={() => {
                onSelect(activity.id)
                onClose()
              }}
            >
              <span className="activity-tile__icon" aria-hidden>
                {activity.icon}
              </span>
              {activity.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="btn btn--block"
          style={{ marginTop: 'var(--gap-4)' }}
          onClick={onClose}
        >
          Cerrar
        </button>
      </div>
    </div>
  )
}

/** Desglose por medio de transporte, para el reporte de la carrera. */
export function ActivityBreakdown({
  spans,
  formatDistance,
}: {
  spans: Array<{ activity: ActivityType; distance: number }>
  formatDistance: (meters: number) => string
}) {
  const merged = new Map<ActivityType, number>()
  for (const span of spans) {
    merged.set(span.activity, (merged.get(span.activity) ?? 0) + span.distance)
  }
  const entries = [...merged.entries()].filter(([, distance]) => distance > 0)
  if (entries.length <= 1) return null

  return (
    <div className="row" style={{ gap: 'var(--gap-3)', flexWrap: 'wrap' }}>
      {entries.map(([activity, distance]) => (
        <span key={activity} className="badge">
          <span aria-hidden>{activityOf(activity).icon}</span>
          {formatDistance(distance)}
        </span>
      ))}
    </div>
  )
}
