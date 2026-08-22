import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ActivityBreakdown } from '@/components/ActivityPicker'
import { ElevationChart, SpeedChart } from '@/components/Charts'
import { TrackMap } from '@/components/RouteMap'
import { ConfirmDialog, Notice, Spinner, StatTile } from '@/components/ui'
import { activityOf } from '@/config/activities'
import { useAuth } from '@/hooks/useAuth'
import { useSettings } from '@/hooks/useSettings'
import { exportRide, type ExportFormat } from '@/services/exportService'
import { deleteRide, loadRide } from '@/services/ridesRepository'
import type { RideWithTrack } from '@/types'
import {
  distanceUnitLabel,
  formatDistance,
  formatDistanceValue,
  formatDuration,
  formatElevation,
  formatLongDate,
  formatSpeed,
  formatTime,
  speedUnitLabel,
} from '@/utils/format'
import { buildTrackSeries, computeKmSplits, hasElevationData } from '@/utils/stats'

/** Reporte completo de una carrera: resumen, mapa, graficos y tramos. */
export function RideReportPage() {
  const { rideId = '' } = useParams()
  const { user } = useAuth()
  const { settings } = useSettings()
  const navigate = useNavigate()

  const [ride, setRide] = useState<(RideWithTrack & { synced: boolean }) | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [exporting, setExporting] = useState<ExportFormat | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    loadRide(user?.uid ?? null, rideId)
      .then((result) => {
        if (cancelled) return
        if (!result) setError('No se ha encontrado la carrera.')
        setRide(result)
      })
      .catch((err: Error) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [rideId, user?.uid])

  const series = useMemo(() => (ride ? buildTrackSeries(ride.points) : []), [ride])
  const splits = useMemo(() => (ride ? computeKmSplits(ride.points) : []), [ride])
  const maxSplitSpeed = useMemo(
    () => splits.reduce((max, split) => Math.max(max, split.speed), 0),
    [splits],
  )

  if (loading) return <Spinner label="Cargando carrera…" />

  if (error || !ride) {
    return (
      <>
        <Notice tone="danger" icon="⚠️">
          {error ?? 'No se ha encontrado la carrera.'}
        </Notice>
        <Link to="/history" className="btn btn--block" style={{ marginTop: 'var(--gap-4)' }}>
          Volver al historial
        </Link>
      </>
    )
  }

  const handleExport = async (format: ExportFormat) => {
    setExporting(format)
    try {
      await exportRide(ride, format)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setExporting(null)
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">
            {activityOf(ride.activity).icon} {ride.title ?? activityOf(ride.activity).label}
          </h1>
          <p className="page-subtitle">
            {formatLongDate(ride.startTime)} · {formatTime(ride.startTime)} –{' '}
            {formatTime(ride.endTime)}
          </p>
        </div>
        <Link to="/history" className="btn btn--sm btn--ghost">
          ← Historial
        </Link>
      </div>

      {!ride.synced && (
        <Notice tone="warn" icon="📶">
          Esta carrera está guardada solo en este dispositivo. Se subirá a la nube en cuanto haya
          conexión y sesión iniciada.
        </Notice>
      )}

      <div className="card card--accent hero-summary" style={{ marginTop: 'var(--gap-4)' }}>
        <p className="hero-summary__title">🏁 Carrera completada</p>
        <p className="hero-summary__distance numeric">
          {formatDistanceValue(ride.distance, settings.distanceUnit)}
          <span className="stat__unit" style={{ fontSize: '1.2rem' }}>
            {distanceUnitLabel(settings.distanceUnit)}
          </span>
        </p>
        <p className="hero-summary__time numeric">{formatDuration(ride.duration)}</p>
        <div style={{ marginTop: 'var(--gap-4)', display: 'flex', justifyContent: 'center' }}>
          <ActivityBreakdown
            spans={ride.activities ?? []}
            formatDistance={(meters) => formatDistance(meters, settings.distanceUnit)}
          />
        </div>
      </div>

      <section className="section">
        <h2 className="section__title">Resumen</h2>
        <div className="grid-2">
          <div className="card">
            <StatTile
              label="Velocidad media"
              value={formatSpeed(ride.averageSpeed, settings.speedUnit)}
              unit={speedUnitLabel(settings.speedUnit)}
              tone="accent"
            />
          </div>
          <div className="card">
            <StatTile
              label="Velocidad máxima"
              value={formatSpeed(ride.maxSpeed, settings.speedUnit)}
              unit={speedUnitLabel(settings.speedUnit)}
            />
          </div>
          <div className="card">
            <StatTile label="Tiempo en movimiento" value={formatDuration(ride.movingTime)} />
          </div>
          <div className="card">
            <StatTile label="Tiempo detenido" value={formatDuration(ride.stoppedTime)} />
          </div>
          <div className="card">
            <StatTile
              label="Desnivel positivo"
              value={`+${formatElevation(ride.elevationGain)}`}
              tone="accent"
            />
          </div>
          <div className="card">
            <StatTile label="Desnivel negativo" value={`-${formatElevation(ride.elevationLoss)}`} />
          </div>
        </div>
      </section>

      {ride.points.length > 1 && (
        <section className="section">
          <h2 className="section__title">Mapa del recorrido</h2>
          <TrackMap points={ride.points} className="map map--fixed" />
        </section>
      )}

      {series.length > 1 && (
        <section className="section">
          <h2 className="section__title">Gráfico de velocidad</h2>
          <div className="card chart-card">
            <SpeedChart data={series} unitLabel={speedUnitLabel(settings.speedUnit)} />
          </div>
        </section>
      )}

      {hasElevationData(ride.points) && (
        <section className="section">
          <h2 className="section__title">Gráfico de altitud</h2>
          <div className="card chart-card">
            <ElevationChart data={series} />
          </div>
        </section>
      )}

      {splits.length > 0 && (
        <section className="section">
          <h2 className="section__title">Rendimiento por kilómetro</h2>
          <div className="card">
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Km</th>
                    <th>Tiempo</th>
                    <th>Velocidad</th>
                    <th style={{ width: '35%' }}>Ritmo</th>
                  </tr>
                </thead>
                <tbody>
                  {splits.map((split) => (
                    <tr key={split.km}>
                      <td>{split.km}</td>
                      <td>{formatDuration(split.duration)}</td>
                      <td>
                        {formatSpeed(split.speed, settings.speedUnit)}{' '}
                        <span className="text-dim" style={{ fontSize: '0.75rem' }}>
                          {speedUnitLabel(settings.speedUnit)}
                        </span>
                      </td>
                      <td>
                        <div
                          className="split-bar"
                          style={{
                            width: `${maxSplitSpeed > 0 ? (split.speed / maxSplitSpeed) * 100 : 0}%`,
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {splits.length > 0 && splits[splits.length - 1].distance < 950 && (
              <p className="text-dim" style={{ fontSize: '0.75rem', marginTop: 'var(--gap-3)' }}>
                El último tramo es parcial ({formatDistance(splits[splits.length - 1].distance)}).
              </p>
            )}
          </div>
        </section>
      )}

      <section className="section">
        <h2 className="section__title">Exportar carrera</h2>
        <div className="btn-group">
          {(['gpx', 'csv', 'json'] as ExportFormat[]).map((format) => (
            <button
              key={format}
              type="button"
              className="btn"
              disabled={exporting !== null || ride.points.length === 0}
              onClick={() => void handleExport(format)}
            >
              {exporting === format ? '…' : format.toUpperCase()}
            </button>
          ))}
        </div>
        {ride.points.length === 0 && (
          <p className="text-dim" style={{ fontSize: '0.78rem', marginTop: 'var(--gap-2)' }}>
            El recorrido detallado no está disponible sin conexión.
          </p>
        )}
      </section>

      <section className="section">
        <div className="btn-group">
          <Link to={`/compare?a=${ride.id}`} className="btn">
            Comparar
          </Link>
          <button type="button" className="btn btn--danger" onClick={() => setConfirmDelete(true)}>
            Eliminar
          </button>
        </div>
      </section>

      <ConfirmDialog
        open={confirmDelete}
        title="¿Eliminar esta carrera?"
        message="Se borrará del dispositivo y de la nube. No se puede deshacer."
        confirmLabel="Eliminar"
        tone="danger"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          void deleteRide(user?.uid ?? null, ride.id)
            .then(() => navigate('/history'))
            .catch((err: Error) => setError(err.message))
          setConfirmDelete(false)
        }}
      />
    </>
  )
}
