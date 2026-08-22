import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ActivityBadge, ActivityChips, ActivitySheet } from '@/components/ActivityPicker'
import { GpsIndicator } from '@/components/GpsIndicator'
import { LiveMap } from '@/components/RouteMap'
import { ConfirmDialog, Notice, StatTile } from '@/components/ui'
import { gpsService } from '@/gps/gpsService'
import { useFriends } from '@/hooks/useFriends'
import { useGpsState } from '@/hooks/useGps'
import { useRideState } from '@/hooks/useRideEngine'
import { useSettings } from '@/hooks/useSettings'
import { useWakeLock } from '@/hooks/useWakeLock'
import type { ActivityType } from '@/config/activities'
import { rideEngine } from '@/services/rideEngine'
import { syncNow } from '@/services/syncService'
import type { RideWithTrack } from '@/types'
import {
  distanceUnitLabel,
  formatDistance,
  formatDistanceValue,
  formatDuration,
  formatSpeed,
  speedUnitLabel,
} from '@/utils/format'

/**
 * Pantalla de carrera. Tiene tres momentos claramente separados:
 *   1. adquisicion de senal  -> no se registra nada todavia
 *   2. grabacion / pausa     -> interfaz de numeros grandes
 *   3. resumen               -> confirmacion de que la carrera esta guardada
 */
export function RidePage() {
  const ride = useRideState()
  const gps = useGpsState()
  const { settings, update } = useSettings()
  const navigate = useNavigate()
  const [finished, setFinished] = useState<RideWithTrack | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [follow, setFollow] = useState(settings.autoFollow)
  const [pickingActivity, setPickingActivity] = useState(false)
  const { liveFriends } = useFriends()

  const recording = ride.status === 'recording'
  const paused = ride.status === 'paused'
  const active = recording || paused

  useWakeLock(settings.keepScreenAwake && active)

  // Enciende el receptor al entrar y lo apaga al salir si no hay carrera viva.
  useEffect(() => {
    rideEngine.configure(settings)
    rideEngine.prepare()
    return () => {
      if (!rideEngine.isActive()) gpsService.stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Aviso del navegador al intentar cerrar la pestana con una carrera abierta.
  useEffect(() => {
    if (!active) return
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [active])

  // Vuelca a IndexedDB al pasar a segundo plano: es cuando el sistema puede
  // descartar la pestana sin previo aviso.
  useEffect(() => {
    const flush = () => {
      if (rideEngine.isActive()) void rideEngine.flush()
    }
    document.addEventListener('visibilitychange', flush)
    window.addEventListener('pagehide', flush)
    return () => {
      document.removeEventListener('visibilitychange', flush)
      window.removeEventListener('pagehide', flush)
    }
  }, [])

  const vibrate = useCallback(
    (pattern: number | number[]) => {
      if (settings.hapticFeedback && navigator.vibrate) navigator.vibrate(pattern)
    },
    [settings.hapticFeedback],
  )

  const handleStart = useCallback(() => {
    vibrate(40)
    rideEngine.start()
  }, [vibrate])

  const handleFinish = useCallback(async () => {
    vibrate([60, 40, 60])
    setConfirming(false)
    const result = await rideEngine.finish()
    setFinished(result)
    void syncNow()
  }, [vibrate])

  if (finished) {
    return (
      <FinishedSummary
        ride={finished}
        onOpenReport={() => {
          const id = finished.id
          rideEngine.reset()
          setFinished(null)
          navigate(`/rides/${id}`)
        }}
        onClose={() => {
          rideEngine.reset()
          setFinished(null)
          navigate('/')
        }}
      />
    )
  }

  if (!active) {
    return <AcquireScreen onStart={handleStart} />
  }

  return (
    <div className="ride">
      <div className="ride__top">
        <ActivityBadge value={ride.activity} onClick={() => setPickingActivity(true)} />
        <GpsIndicator gps={gps} />
        <span className={`badge ${recording ? 'badge--ok' : 'badge--warn'}`}>
          <span className={`dot ${recording ? 'dot--pulse' : ''}`} aria-hidden />
          {recording ? (ride.isStopped ? 'DETENIDO' : 'GRABANDO') : 'EN PAUSA'}
        </span>
      </div>

      {paused && <div className="ride__paused-banner">⏸ Carrera pausada</div>}

      <div className="ride__primary">
        <div className={`speed numeric ${ride.isStopped || paused ? 'speed--stopped' : ''}`}>
          {formatSpeed(paused ? 0 : ride.currentSpeed, settings.speedUnit)}
        </div>
        <div className="speed__unit">{speedUnitLabel(settings.speedUnit)}</div>

        <div className="ride__headline">
          <StatTile
            label="Distancia"
            value={formatDistanceValue(ride.distance, settings.distanceUnit)}
            unit={distanceUnitLabel(settings.distanceUnit)}
          />
          <StatTile label="Tiempo" value={formatDuration(ride.duration)} />
        </div>
      </div>

      <div className="ride__secondary">
        <StatTile label="Promedio" value={formatSpeed(ride.averageSpeed, settings.speedUnit)} />
        <StatTile label="Máxima" value={formatSpeed(ride.maxSpeed, settings.speedUnit)} />
        <StatTile label="En movimiento" value={formatDuration(ride.movingTime)} />
      </div>

      <div className="ride__map">
        <LiveMap follow={follow} onFollowChange={setFollow} friends={liveFriends} />
      </div>

      <div className="ride__controls">
        {recording ? (
          <button
            type="button"
            className="btn btn--warn btn--lg"
            onClick={() => {
              vibrate(30)
              rideEngine.pause()
            }}
          >
            ⏸ PAUSAR
          </button>
        ) : (
          <button
            type="button"
            className="btn btn--primary btn--lg"
            onClick={() => {
              vibrate(30)
              rideEngine.resume()
            }}
          >
            ▶ REANUDAR
          </button>
        )}
        <button type="button" className="btn btn--danger btn--lg" onClick={() => setConfirming(true)}>
          ⏹ FINALIZAR
        </button>
      </div>

      <ActivitySheet
        open={pickingActivity}
        value={ride.activity}
        onSelect={(activity) => changeActivity(activity, update)}
        onClose={() => setPickingActivity(false)}
      />

      <ConfirmDialog
        open={confirming}
        title="¿Quieres finalizar esta carrera?"
        message={
          <>
            Llevas {formatDistance(ride.distance, settings.distanceUnit)} en{' '}
            {formatDuration(ride.duration)}. La carrera se guardará automáticamente.
          </>
        }
        confirmLabel="Finalizar"
        cancelLabel="Continuar"
        tone="danger"
        onCancel={() => setConfirming(false)}
        onConfirm={() => void handleFinish()}
      />
    </div>
  )
}

/** Paso previo: no se empieza a registrar hasta que la senal es utilizable. */
function AcquireScreen({ onStart }: { onStart: () => void }) {
  const gps = useGpsState()
  const { settings, update } = useSettings()
  const startedAt = useRef(Date.now())
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => setElapsed(Date.now() - startedAt.current), 1000)
    return () => clearInterval(timer)
  }, [])

  const accuracy = gps.accuracy
  const ready = accuracy !== null && accuracy <= settings.readyAccuracy && gps.status !== 'lost'
  const usable = accuracy !== null && accuracy <= settings.maxAccuracy && gps.status !== 'lost'
  const blocked =
    gps.status === 'denied' || gps.status === 'unsupported' || gps.status === 'unavailable'

  if (blocked) {
    return (
      <div className="acquire">
        <span style={{ fontSize: '3rem' }}>🛑</span>
        <div>
          <h1 className="page-title">No se puede acceder al GPS</h1>
          <p className="text-muted" style={{ marginTop: 8 }}>
            {gps.message}
          </p>
        </div>
        <Link to="/gps" className="btn btn--primary">
          Abrir diagnóstico del GPS
        </Link>
        <Link to="/" className="btn btn--ghost">
          Volver al inicio
        </Link>
      </div>
    )
  }

  return (
    <div className="acquire">
      <div className={`acquire__ring ${ready ? 'is-ready' : ''}`}>
        <div>
          <div className="acquire__ring-value numeric">
            {accuracy !== null ? `±${Math.round(accuracy)}` : '--'}
          </div>
          <div className="stat__label" style={{ textAlign: 'center' }}>
            metros
          </div>
        </div>
      </div>

      <div>
        <h1 className="page-title">{ready ? 'GPS listo' : 'Buscando GPS…'}</h1>
        <p className="text-muted" style={{ marginTop: 8, maxWidth: 320 }}>
          {ready
            ? 'La precisión es suficiente para empezar a registrar.'
            : usable
              ? 'La señal aún no es precisa. Puedes esperar unos segundos o empezar igualmente.'
              : 'Sal a un lugar despejado y mantén el teléfono a la vista del cielo.'}
        </p>
      </div>

      <GpsIndicator gps={gps} />

      <div style={{ width: '100%', maxWidth: 420 }}>
        <p className="stat__label center" style={{ marginBottom: 'var(--gap-2)' }}>
          Medio de transporte
        </p>
        <ActivityChips
          value={settings.defaultActivity}
          onChange={(activity) => changeActivity(activity, update)}
        />
      </div>

      <div className="stack" style={{ width: '100%', maxWidth: 340 }}>
        <button
          type="button"
          className="btn btn--primary btn--hero btn--block"
          disabled={!usable}
          onClick={onStart}
        >
          {ready ? 'COMENZAR' : usable ? 'EMPEZAR IGUALMENTE' : 'ESPERANDO SEÑAL…'}
        </button>
        <Link to="/" className="btn btn--ghost btn--block">
          Cancelar
        </Link>
      </div>

      {elapsed > 20000 && !usable && (
        <Notice tone="warn" icon="⏳">
          Está tardando más de lo normal. Comprueba que la ubicación del dispositivo esté activada
          y que el navegador tenga permiso. <Link to="/gps">Ver diagnóstico</Link>
        </Notice>
      )}
    </div>
  )
}

/** Confirmacion inmediata al terminar, antes de abrir el reporte completo. */
function FinishedSummary({
  ride,
  onOpenReport,
  onClose,
}: {
  ride: RideWithTrack
  onOpenReport: () => void
  onClose: () => void
}) {
  const { settings } = useSettings()
  return (
    <div className="acquire">
      <div className="hero-summary">
        <p className="hero-summary__title">🏁 Carrera completada</p>
        <p className="hero-summary__distance numeric">
          {formatDistanceValue(ride.distance, settings.distanceUnit)}
          <span className="stat__unit" style={{ fontSize: '1.2rem' }}>
            {distanceUnitLabel(settings.distanceUnit)}
          </span>
        </p>
        <p className="hero-summary__time numeric">{formatDuration(ride.duration)}</p>
      </div>

      <div className="grid-2" style={{ width: '100%', maxWidth: 420 }}>
        <div className="card">
          <StatTile
            label="Promedio"
            value={formatSpeed(ride.averageSpeed, settings.speedUnit)}
            unit={speedUnitLabel(settings.speedUnit)}
          />
        </div>
        <div className="card">
          <StatTile
            label="Máxima"
            value={formatSpeed(ride.maxSpeed, settings.speedUnit)}
            unit={speedUnitLabel(settings.speedUnit)}
          />
        </div>
      </div>

      <Notice tone="info" icon="💾">
        Carrera guardada en el dispositivo. Se sincronizará con la nube en cuanto haya conexión.
      </Notice>

      <div className="stack" style={{ width: '100%', maxWidth: 340 }}>
        <button type="button" className="btn btn--primary btn--lg btn--block" onClick={onOpenReport}>
          VER REPORTE
        </button>
        <button type="button" className="btn btn--ghost btn--block" onClick={onClose}>
          Volver al inicio
        </button>
      </div>
    </div>
  )
}

/**
 * Cambia el medio de transporte y lo recuerda como preferencia para la
 * siguiente carrera.
 */
function changeActivity(activity: ActivityType, update: (patch: { defaultActivity: ActivityType }) => void): void {
  update({ defaultActivity: activity })
  rideEngine.setActivity(activity)
}
