import type { ReactNode } from 'react'

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
