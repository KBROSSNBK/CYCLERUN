import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState, SkeletonList } from '@/components/ui'
import { useRides } from '@/hooks/useRides'
import { useSettings } from '@/hooks/useSettings'
import type { PersonalRecords } from '@/types'
import {
  formatDate,
  formatDistance,
  formatDurationLong,
  formatElevation,
  formatSpeedWithUnit,
} from '@/utils/format'
import { computeRecords } from '@/utils/stats'

/** "Mis récords": los mejores registros calculados sobre todo el historial. */
export function RecordsPage() {
  const { rides, loading } = useRides()
  const { settings } = useSettings()
  const records = useMemo(() => computeRecords(rides), [rides])

  if (loading) return <SkeletonList count={5} />

  if (rides.length === 0) {
    return (
      <>
        <h1 className="page-title">Mis récords</h1>
        <EmptyState
          icon="🏆"
          title="Aún no hay récords"
          description="Tus mejores marcas aparecerán aquí automáticamente."
          action={
            <Link to="/ride" className="btn btn--primary">
              Iniciar carrera
            </Link>
          }
        />
      </>
    )
  }

  const items: Array<{ key: keyof PersonalRecords; icon: string; label: string; value: string }> = [
    {
      key: 'maxSpeed',
      icon: '⚡',
      label: 'Mayor velocidad',
      value: formatSpeedWithUnit(records.maxSpeed.value, settings.speedUnit),
    },
    {
      key: 'maxDistance',
      icon: '📏',
      label: 'Mayor distancia',
      value: formatDistance(records.maxDistance.value, settings.distanceUnit),
    },
    {
      key: 'maxElevation',
      icon: '⛰️',
      label: 'Mayor desnivel',
      value: formatElevation(records.maxElevation.value),
    },
    {
      key: 'maxMovingTime',
      icon: '⏱️',
      label: 'Más tiempo en movimiento',
      value: formatDurationLong(records.maxMovingTime.value),
    },
    {
      key: 'bestAverageSpeed',
      icon: '🚀',
      label: 'Mejor velocidad media',
      value: formatSpeedWithUnit(records.bestAverageSpeed.value, settings.speedUnit),
    },
  ]

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Mis récords</h1>
          <p className="page-subtitle">Calculados sobre {rides.length} carreras</p>
        </div>
      </div>

      <div className="stack">
        {items.map((item) => {
          const record = records[item.key]
          const content = (
            <div className="record-item">
              <span className="record-item__icon" aria-hidden>
                {item.icon}
              </span>
              <div style={{ flex: 1 }}>
                <p className="stat__label">{item.label}</p>
                <p className="stat__value numeric" style={{ fontSize: '1.35rem' }}>
                  {record.value > 0 ? item.value : '—'}
                </p>
              </div>
              {record.date && (
                <span className="text-dim" style={{ fontSize: '0.75rem' }}>
                  {formatDate(record.date)}
                </span>
              )}
            </div>
          )
          return record.rideId ? (
            <Link key={item.key} to={`/rides/${record.rideId}`} className="card card--link">
              {content}
            </Link>
          ) : (
            <div key={item.key} className="card">
              {content}
            </div>
          )
        })}
      </div>
    </>
  )
}
