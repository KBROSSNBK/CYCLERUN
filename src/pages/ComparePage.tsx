import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { EmptyState, SkeletonList } from '@/components/ui'
import { useRides } from '@/hooks/useRides'
import { useSettings } from '@/hooks/useSettings'
import type { Ride } from '@/types'
import {
  formatDate,
  formatDistance,
  formatDuration,
  formatElevation,
  formatSignedDistance,
  formatSignedDuration,
  formatSignedSpeed,
  formatSpeedWithUnit,
} from '@/utils/format'

/**
 * Comparacion de dos carreras.
 * Las carreras se eligen por parametros de la URL (?a=…&b=…), de modo que la
 * pantalla es enlazable y sirve de base para comparaciones futuras contra un
 * segmento o contra la mejor marca personal.
 */
export function ComparePage() {
  const [params, setParams] = useSearchParams()
  const { rides, loading } = useRides()
  const { settings } = useSettings()

  const idA = params.get('a') ?? ''
  const idB = params.get('b') ?? ''
  const rideA = useMemo(() => rides.find((ride) => ride.id === idA) ?? null, [rides, idA])
  const rideB = useMemo(() => rides.find((ride) => ride.id === idB) ?? null, [rides, idB])

  if (loading) return <SkeletonList count={3} />

  if (rides.length < 2) {
    return (
      <>
        <h1 className="page-title">Comparar carreras</h1>
        <EmptyState
          icon="⚖️"
          title="Necesitas al menos dos carreras"
          description="Cuando tengas más salidas registradas podrás compararlas aquí."
        />
      </>
    )
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Comparar carreras</h1>
          <p className="page-subtitle">Elige dos salidas y mira las diferencias</p>
        </div>
      </div>

      <div className="grid-2">
        <RideSelect
          label="Carrera A"
          rides={rides}
          value={idA}
          exclude={idB}
          settings={settings}
          onChange={(value) => {
            params.set('a', value)
            setParams(params, { replace: true })
          }}
        />
        <RideSelect
          label="Carrera B"
          rides={rides}
          value={idB}
          exclude={idA}
          settings={settings}
          onChange={(value) => {
            params.set('b', value)
            setParams(params, { replace: true })
          }}
        />
      </div>

      {rideA && rideB ? (
        <section className="section">
          <h2 className="section__title">Diferencias (B respecto a A)</h2>
          <div className="card stack">
            <DiffRow
              label="Distancia"
              a={formatDistance(rideA.distance, settings.distanceUnit)}
              b={formatDistance(rideB.distance, settings.distanceUnit)}
              diff={formatSignedDistance(rideB.distance - rideA.distance, settings.distanceUnit)}
              positive={rideB.distance >= rideA.distance}
            />
            <DiffRow
              label="Duración"
              a={formatDuration(rideA.duration)}
              b={formatDuration(rideB.duration)}
              diff={formatSignedDuration(rideB.duration - rideA.duration)}
              positive={rideB.duration <= rideA.duration}
            />
            <DiffRow
              label="Velocidad media"
              a={formatSpeedWithUnit(rideA.averageSpeed, settings.speedUnit)}
              b={formatSpeedWithUnit(rideB.averageSpeed, settings.speedUnit)}
              diff={formatSignedSpeed(rideB.averageSpeed - rideA.averageSpeed, settings.speedUnit)}
              positive={rideB.averageSpeed >= rideA.averageSpeed}
            />
            <DiffRow
              label="Velocidad máxima"
              a={formatSpeedWithUnit(rideA.maxSpeed, settings.speedUnit)}
              b={formatSpeedWithUnit(rideB.maxSpeed, settings.speedUnit)}
              diff={formatSignedSpeed(rideB.maxSpeed - rideA.maxSpeed, settings.speedUnit)}
              positive={rideB.maxSpeed >= rideA.maxSpeed}
            />
            <DiffRow
              label="Desnivel positivo"
              a={formatElevation(rideA.elevationGain)}
              b={formatElevation(rideB.elevationGain)}
              diff={`${rideB.elevationGain >= rideA.elevationGain ? '+' : '-'}${formatElevation(
                Math.abs(rideB.elevationGain - rideA.elevationGain),
              )}`}
              positive={rideB.elevationGain >= rideA.elevationGain}
            />
          </div>
        </section>
      ) : (
        <p className="text-muted center" style={{ marginTop: 'var(--gap-5)' }}>
          Selecciona las dos carreras que quieres comparar.
        </p>
      )}
    </>
  )
}

function RideSelect({
  label,
  rides,
  value,
  exclude,
  settings,
  onChange,
}: {
  label: string
  rides: Ride[]
  value: string
  exclude: string
  settings: { distanceUnit: 'km' | 'mi' }
  onChange: (value: string) => void
}) {
  return (
    <div className="card">
      <p className="stat__label" style={{ marginBottom: 'var(--gap-2)' }}>
        {label}
      </p>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Sin seleccionar</option>
        {rides
          .filter((ride) => ride.id !== exclude)
          .map((ride) => (
            <option key={ride.id} value={ride.id}>
              {formatDate(ride.startTime)} · {formatDistance(ride.distance, settings.distanceUnit)}
            </option>
          ))}
      </select>
    </div>
  )
}

function DiffRow({
  label,
  a,
  b,
  diff,
  positive,
}: {
  label: string
  a: string
  b: string
  diff: string
  positive: boolean
}) {
  return (
    <div className="field" style={{ paddingBottom: 'var(--gap-3)' }}>
      <div className="field__row">
        <span className="field__label">{label}</span>
        <span className={`diff ${positive ? 'diff--up' : 'diff--down'}`}>{diff}</span>
      </div>
      <div className="row row--between text-muted numeric" style={{ fontSize: '0.85rem' }}>
        <span>A · {a}</span>
        <span>B · {b}</span>
      </div>
    </div>
  )
}
