import { useRef, useState, type ReactNode } from 'react'

/** Piezas visuales reutilizables. Sin logica de dominio. */

export function StatTile({
  label,
  value,
  unit,
  size = 'md',
  tone,
}: {
  label: string
  value: ReactNode
  unit?: string
  size?: 'sm' | 'md' | 'lg'
  tone?: 'accent' | 'warn' | 'danger' | 'muted'
}) {
  const toneClass =
    tone === 'accent'
      ? 'text-accent'
      : tone === 'warn'
        ? 'text-warn'
        : tone === 'danger'
          ? 'text-danger'
          : tone === 'muted'
            ? 'text-muted'
            : ''
  return (
    <div className="stat">
      <span className="stat__label">{label}</span>
      <span className={`stat__value ${size === 'lg' ? 'stat__value--lg' : ''} ${toneClass}`}>
        {value}
        {unit && <span className="stat__unit">{unit}</span>}
      </span>
    </div>
  )
}

export function Notice({
  tone = 'info',
  icon,
  children,
}: {
  tone?: 'info' | 'warn' | 'danger'
  icon?: string
  children: ReactNode
}) {
  return (
    <div className={`notice notice--${tone}`}>
      {icon && <span className="notice__icon">{icon}</span>}
      <div>{children}</div>
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: string
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="empty">
      <span className="empty__icon">{icon}</span>
      <div>
        <p style={{ fontWeight: 700, color: 'var(--text)' }}>{title}</p>
        {description && <p style={{ marginTop: 4, fontSize: '0.86rem' }}>{description}</p>}
      </div>
      {action}
    </div>
  )
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  tone = 'primary',
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  message?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'primary' | 'danger'
  onConfirm: () => void
  onCancel: () => void
}) {
  if (!open) return null
  return (
    <div className="overlay" role="dialog" aria-modal="true" onClick={onCancel}>
      <div className="dialog" onClick={(event) => event.stopPropagation()}>
        <h2 className="dialog__title">{title}</h2>
        {message && <div className="dialog__body">{message}</div>}
        <div className="btn-group">
          <button type="button" className="btn" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`btn ${tone === 'danger' ? 'btn--danger' : 'btn--primary'}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (value: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`switch ${checked ? 'is-on' : ''}`}
      onClick={() => onChange(!checked)}
    />
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (value: T) => void
}) {
  return (
    <div className="segmented" role="group">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`segmented__option ${option.value === value ? 'is-active' : ''}`}
          onClick={() => onChange(option.value)}
          aria-pressed={option.value === value}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="row" style={{ justifyContent: 'center', padding: 'var(--gap-5)' }}>
      <span className="spinner" />
      {label && <span className="text-muted">{label}</span>}
    </div>
  )
}

export function SkeletonList({ count = 3 }: { count?: number }) {
  return (
    <div className="stack">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="skeleton" style={{ height: 96 }} />
      ))}
    </div>
  )
}

/**
 * Deslizador que solo se mueve arrastrando el punto.
 *
 * Un `<input type="range">` nativo salta al valor allí donde toques la barra, y
 * en una pantalla táctil eso hace muy fácil descolocar un ajuste sin querer.
 * Aquí la barra es inerte: el valor solo cambia arrastrando el punto o con el
 * teclado, que se mantiene por accesibilidad.
 */
export function RangeSlider({
  value,
  min,
  max,
  step,
  label,
  onChange,
}: {
  value: number
  min: number
  max: number
  step: number
  label: string
  onChange: (value: number) => void
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)

  const percent = max > min ? ((value - min) / (max - min)) * 100 : 0
  const decimals = decimalsOf(step)

  const snap = (raw: number): number => {
    const stepped = Math.round((raw - min) / step) * step + min
    return Number(Math.min(max, Math.max(min, stepped)).toFixed(decimals))
  }

  const valueAt = (clientX: number): number => {
    const track = trackRef.current
    if (!track) return value
    const rect = track.getBoundingClientRect()
    const ratio = rect.width > 0 ? (clientX - rect.left) / rect.width : 0
    return snap(min + Math.min(1, Math.max(0, ratio)) * (max - min))
  }

  const nudge = (steps: number) => onChange(snap(value + steps * step))

  return (
    <div className="slider">
      <div className="slider__track" ref={trackRef}>
        <div className="slider__fill" style={{ width: `${percent}%` }} />
        <div
          className={`slider__thumb ${dragging ? 'is-dragging' : ''}`}
          style={{ left: `${percent}%` }}
          role="slider"
          tabIndex={0}
          aria-label={label}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value}
          onPointerDown={(event) => {
            event.preventDefault()
            event.currentTarget.setPointerCapture(event.pointerId)
            setDragging(true)
          }}
          onPointerMove={(event) => {
            if (dragging) onChange(valueAt(event.clientX))
          }}
          onPointerUp={(event) => {
            event.currentTarget.releasePointerCapture(event.pointerId)
            setDragging(false)
          }}
          onPointerCancel={() => setDragging(false)}
          onKeyDown={(event) => {
            const keys: Record<string, () => void> = {
              ArrowRight: () => nudge(1),
              ArrowUp: () => nudge(1),
              ArrowLeft: () => nudge(-1),
              ArrowDown: () => nudge(-1),
              PageUp: () => nudge(10),
              PageDown: () => nudge(-10),
              Home: () => onChange(min),
              End: () => onChange(max),
            }
            const action = keys[event.key]
            if (action) {
              event.preventDefault()
              action()
            }
          }}
        />
      </div>
    </div>
  )
}

/** Decimales del paso, para no arrastrar errores de coma flotante. */
function decimalsOf(step: number): number {
  const text = String(step)
  const dot = text.indexOf('.')
  return dot === -1 ? 0 : text.length - dot - 1
}
