import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PeriodBarChart } from '@/components/Charts'
import { EmptyState, Segmented, SkeletonList, StatTile } from '@/components/ui'
import { useRides } from '@/hooks/useRides'
import { useSettings } from '@/hooks/useSettings'
import {
  distanceUnitLabel,
  formatDistance,
  formatDurationLong,
  formatElevation,
  formatSpeed,
  speedUnitLabel,
} from '@/utils/format'
import { aggregate, distanceByDay, distanceByMonth } from '@/utils/stats'

type Period = 'days' | 'months'

/** Estadisticas historicas del usuario. */
export function StatsPage() {
  const { rides, loading } = useRides()
  const { settings } = useSettings()
  const [period, setPeriod] = useState<Period>('days')

  const totals = useMemo(() => aggregate(rides), [rides])
  const chartData = useMemo(
    () => (period === 'days' ? distanceByDay(rides, 14) : distanceByMonth(rides, 6)),
    [rides, period],
  )

  if (loading) return <SkeletonList count={4} />

  if (rides.length === 0) {
    return (
      <>
        <h1 className="page-title">Estadísticas</h1>
        <EmptyState
          icon="📊"
          title="Sin datos todavía"
          description="Cuando registres carreras verás aquí tu evolución."
          action={
            <Link to="/ride" className="btn btn--primary">
              Iniciar carrera
            </Link>
          }
        />
      </>
    )
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Estadísticas</h1>
          <p className="page-subtitle">Todo tu historial en cifras</p>
        </div>
      </div>

      <div className="grid-2">
        <div className="card card--accent">
          <StatTile
            label="Kilómetros totales"
            value={(totals.totalDistance / 1000).toFixed(1)}
            unit={distanceUnitLabel(settings.distanceUnit)}
            size="lg"
            tone="accent"
          />
        </div>
        <div className="card">
          <StatTile label="Carreras" value={totals.totalRides} size="lg" />
        </div>
      </div>

      <section className="section">
        <h2 className="section__title">Distancia</h2>
        <div className="card chart-card">
          <div className="row row--between chart-card__title" style={{ paddingRight: 'var(--gap-3)' }}>
            <span className="text-muted" style={{ fontSize: '0.82rem' }}>
              {period === 'days' ? 'Últimos 14 días' : 'Últimos 6 meses'}
            </span>
            <Segmented
              value={period}
              options={[
                { value: 'days', label: 'Días' },
                { value: 'months', label: 'Meses' },
              ]}
              onChange={setPeriod}
            />
          </div>
          <PeriodBarChart data={chartData} unitLabel={distanceUnitLabel(settings.distanceUnit)} />
        </div>
      </section>

      <section className="section">
        <h2 className="section__title">Totales</h2>
        <div className="grid-2">
          <div className="card">
            <StatTile label="Tiempo total" value={formatDurationLong(totals.totalDuration)} />
          </div>
          <div className="card">
            <StatTile label="En movimiento" value={formatDurationLong(totals.totalMovingTime)} />
          </div>
          <div className="card">
            <StatTile
              label="Velocidad media histórica"
              value={formatSpeed(totals.averageSpeed, settings.speedUnit)}
              unit={speedUnitLabel(settings.speedUnit)}
            />
          </div>
          <div className="card">
            <StatTile
              label="Velocidad máxima"
              value={formatSpeed(totals.maxSpeed, settings.speedUnit)}
              unit={speedUnitLabel(settings.speedUnit)}
            />
          </div>
          <div className="card">
            <StatTile
              label="Distancia máxima"
              value={formatDistance(totals.maxDistance, settings.distanceUnit)}
            />
          </div>
          <div className="card">
            <StatTile label="Desnivel acumulado" value={formatElevation(totals.totalElevationGain)} />
          </div>
        </div>
      </section>

      <section className="section">
        <h2 className="section__title">Periodos</h2>
        <div className="grid-3">
          <div className="card">
            <StatTile
              label="Esta semana"
              value={formatDistance(totals.weekDistance, settings.distanceUnit)}
            />
          </div>
          <div className="card">
            <StatTile
              label="Este mes"
              value={formatDistance(totals.monthDistance, settings.distanceUnit)}
            />
          </div>
          <div className="card">
            <StatTile
              label="Este año"
              value={formatDistance(totals.yearDistance, settings.distanceUnit)}
            />
          </div>
        </div>
      </section>

      <section className="section">
        <Link to="/records" className="btn btn--block">
          🏆 Ver mis récords
        </Link>
      </section>
    </>
  )
}
