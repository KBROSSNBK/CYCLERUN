import type { GpsState, GpsStatus } from '@/types'
import { formatAccuracy } from '@/utils/format'

/** Semaforo del estado del receptor GPS, visible durante toda la carrera. */

const TONE: Record<GpsStatus, string> = {
  ready: 'badge--ok',
  weak: 'badge--warn',
  lost: 'badge--danger',
  searching: 'badge--info',
  denied: 'badge--danger',
  unavailable: 'badge--danger',
  unsupported: 'badge--danger',
}

const SHORT_LABEL: Record<GpsStatus, string> = {
  ready: 'GPS',
  weak: 'GPS débil',
  lost: 'Sin señal',
  searching: 'Buscando…',
  denied: 'Sin permiso',
  unavailable: 'No disponible',
  unsupported: 'No compatible',
}

export function GpsIndicator({ gps, showAccuracy = true }: { gps: GpsState; showAccuracy?: boolean }) {
  const pulse = gps.status === 'searching' || gps.status === 'ready'
  return (
    <span className={`badge ${TONE[gps.status]}`} title={gps.message}>
      <span className={`dot ${pulse ? 'dot--pulse' : ''}`} aria-hidden />
      {SHORT_LABEL[gps.status]}
      {showAccuracy && gps.accuracy !== null && gps.status !== 'denied' && (
        <span className="numeric" style={{ opacity: 0.85 }}>
          {formatAccuracy(gps.accuracy)}
        </span>
      )}
    </span>
  )
}

export function gpsStatusTone(status: GpsStatus): 'ok' | 'warn' | 'danger' | 'info' {
  if (status === 'ready') return 'ok'
  if (status === 'weak') return 'warn'
  if (status === 'searching') return 'info'
  return 'danger'
}
