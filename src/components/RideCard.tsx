import { Link } from 'react-router-dom'
import { activityOf } from '@/config/activities'
import type { AppSettings } from '@/config/defaults'
import type { RideListItem } from '@/services/ridesRepository'
import {
  formatDate,
  formatDistance,
  formatDuration,
  formatSpeed,
  formatTime,
  speedUnitLabel,
} from '@/utils/format'
import { RouteThumbnail } from './RouteMap'

/** Tarjeta del historial: miniatura del recorrido y tres metricas clave. */
export function RideCard({
  ride,
  index,
  settings,
}: {
  ride: RideListItem
  index?: number
  settings: AppSettings
}) {
  return (
    <Link to={`/rides/${ride.id}`} className="card card--link">
      <div className="ride-card">
        <RouteThumbnail lat={ride.previewLat ?? []} lon={ride.previewLon ?? []} />
        <div style={{ minWidth: 0 }}>
          <div className="row row--between" style={{ gap: 'var(--gap-2)' }}>
            <strong style={{ fontSize: '0.95rem' }}>
              {activityOf(ride.activity).icon}{' '}
              {ride.title ?? (index !== undefined ? `Carrera #${index}` : activityOf(ride.activity).label)}
            </strong>
            {!ride.synced && (
              <span className="badge badge--warn" style={{ fontSize: '0.62rem' }}>
                Sin subir
              </span>
            )}
          </div>
          <div className="ride-card__metrics">
            <span className="ride-card__metric">
              <strong>{formatDistance(ride.distance, settings.distanceUnit)}</strong>
            </span>
            <span className="ride-card__metric">
              <strong>{formatDuration(ride.duration)}</strong>
            </span>
            <span className="ride-card__metric">
              <strong>
                {formatSpeed(ride.averageSpeed, settings.speedUnit)}{' '}
                <span style={{ fontSize: '0.7rem', fontWeight: 600 }}>
                  {speedUnitLabel(settings.speedUnit)}
                </span>
              </strong>
            </span>
          </div>
          <p className="text-dim" style={{ fontSize: '0.75rem', marginTop: 6 }}>
            {formatDate(ride.startTime)} · {formatTime(ride.startTime)}
          </p>
        </div>
      </div>
    </Link>
  )
}
