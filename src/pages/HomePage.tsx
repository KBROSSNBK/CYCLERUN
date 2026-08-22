import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  MonthDots,
  MonthMinutesChart,
  SpeedLegend,
  SpeedRoute,
  WeekSpeedChart,
  speedBands,
} from '@/components/HomeCards'
import { TopBar } from '@/components/Layout'
import { ConfirmDialog, Notice, SkeletonList } from '@/components/ui'
import { activityOf } from '@/config/activities'
import { isNativeRuntime } from '@/gps/nativeGeolocation'
import { useAuth } from '@/hooks/useAuth'
import { useInstallPrompt } from '@/hooks/useInstallPrompt'
import { useRides } from '@/hooks/useRides'
import { useRideRecovery } from '@/hooks/useRideRecovery'
import { useRideState } from '@/hooks/useRideEngine'
import { useSettings } from '@/hooks/useSettings'
import {
  distanceUnitLabel,
  formatDistance,
  formatDistanceValue,
  formatDuration,
  formatRelative,
  formatSpeed,
  speedUnitLabel,
} from '@/utils/format'
import { aggregate } from '@/utils/stats'

/**
 * Panel de inicio.
 *
 * Se ha resuelto como una rejilla de tarjetas (bento): cada una responde a una
 * pregunta concreta (que hice la ultima vez, como voy esta semana, cuantos dias
 * he salido este mes) y todas se pueden leer de un vistazo.
 */
export function HomePage() {
  const navigate = useNavigate()
  const { settings } = useSettings()
  const { rides, loading } = useRides()
  const { mode, signIn, loading: authLoading } = useAuth()
  const ride = useRideState()
  const recovery = useRideRecovery()
  const install = useInstallPrompt()
  const [discarding, setDiscarding] = useState(false)

  const totals = useMemo(() => aggregate(rides), [rides])
  const lastRide = rides[0]
  const rideInProgress = ride.status === 'recording' || ride.status === 'paused'
  const activity = activityOf(settings.defaultActivity)

  const activityDistance = useMemo(
    () =>
      rides
        .filter((item) => (item.activity ?? 'bike') === settings.defaultActivity)
        .reduce((total, item) => total + item.distance, 0),
    [rides, settings.defaultActivity],
  )

  const bands = useMemo(() => speedBands(lastRide?.previewSpeed ?? []), [lastRide])

  return (
    <>
      <TopBar />

      {recovery.session && (
        <div className="card card--accent" style={{ marginBottom: 'var(--gap-4)' }}>
          <strong>Carrera interrumpida</strong>
          <p className="text-muted" style={{ fontSize: '0.86rem', margin: '6px 0 var(--gap-4)' }}>
            Quedó una carrera sin cerrar con {recovery.points} puntos y{' '}
            {formatDistance(recovery.session.stats.distance, settings.distanceUnit)}. Puedes
            retomarla o guardarla tal cual.
          </p>
          <div className="btn-group">
            <button type="button" className="btn btn--sm" onClick={() => setDiscarding(true)}>
              Descartar
            </button>
            <button
              type="button"
              className="btn btn--sm"
              onClick={() => {
                void recovery.finish().then((id) => {
                  if (id) navigate(`/rides/${id}`)
                })
              }}
            >
              Guardar
            </button>
            <button
              type="button"
              className="btn btn--sm btn--primary"
              onClick={() => {
                recovery.restore()
                navigate('/ride')
              }}
            >
              Retomar
            </button>
          </div>
        </div>
      )}

      <section className="hero">
        <div>
          <h1 className="hero__title">
            {rideInProgress ? 'Carrera en curso' : '¿Listo para pedalear?'}
          </h1>
          <p className="hero__subtitle">
            {rideInProgress
              ? 'Vuelve a la pantalla de carrera para continuar.'
              : `Saldrás ${activity.withLabel} · toca para cambiarlo`}
          </p>
        </div>
        <button
          type="button"
          className="btn btn--primary btn--hero btn--block"
          onClick={() => navigate('/ride')}
        >
          {rideInProgress ? '↩ VOLVER A LA CARRERA' : `${activity.icon} INICIAR CARRERA`}
        </button>
      </section>

      {mode === 'anonymous' && !authLoading && (
        <Notice tone="info" icon="☁️">
          Inicia sesión con Google para guardar tus carreras en la nube y ver a tus amigos.{' '}
          <button
            type="button"
            className="btn btn--sm btn--primary"
            style={{ marginTop: 'var(--gap-2)' }}
            onClick={() => void signIn()}
          >
            Entrar con Google
          </button>
        </Notice>
      )}

      {mode === 'local' && (
        <Notice tone="warn" icon="📵">
          Firebase no está configurado: las carreras se guardan solo en este dispositivo. Consulta
          el README para conectar tu proyecto.
        </Notice>
      )}

      {loading ? (
        <SkeletonList count={3} />
      ) : (
        <div className="bento">
          {/* Última carrera */}
          {lastRide ? (
            <Link to={`/rides/${lastRide.id}`} className="bento__card bento__card--wide bento__card--route">
              <div className="bento__head">
                <div>
                  <p className="bento__title">Última</p>
                  <p className="bento__title">carrera</p>
                </div>
                <span className="bento__badge" aria-hidden>
                  {activityOf(lastRide.activity).icon}
                </span>
              </div>
              <div className="bento__route">
                <SpeedRoute
                  lat={lastRide.previewLat ?? []}
                  lon={lastRide.previewLon ?? []}
                  speed={lastRide.previewSpeed}
                  width={300}
                  height={150}
                />
              </div>
              <div className="bento__pills">
                <span className="pill pill--blue">
                  {formatDistance(lastRide.distance, settings.distanceUnit)}
                </span>
                <span className="pill pill--green">{formatDuration(lastRide.duration)}</span>
              </div>
              <div className="row row--between" style={{ marginTop: 'var(--gap-3)' }}>
                <span className="bento__hint">
                  {formatRelative(lastRide.startTime)} · toca para abrir
                </span>
                <SpeedLegend bands={bands} />
              </div>
            </Link>
          ) : (
            <div className="bento__card bento__card--wide center">
              <p className="bento__title">Sin carreras</p>
              <p className="bento__hint" style={{ marginTop: 8 }}>
                Tu primera salida aparecerá aquí con el recorrido y las métricas.
              </p>
            </div>
          )}

          {/* Medio de transporte */}
          <Link to="/ride" className="bento__card bento__card--tall bento__card--yellow">
            <p className="bento__title">{activity.cardTitle}</p>
            <BikeArt icon={activity.icon} />
            <div>
              <p className="bento__metric numeric">
                {formatDistanceValue(activityDistance, settings.distanceUnit)}
                <span className="bento__unit">{distanceUnitLabel(settings.distanceUnit)}</span>
              </p>
              <p className="bento__hint bento__hint--dark">acumulados</p>
            </div>
          </Link>

          {/* Velocidad media diaria */}
          <Link to="/stats" className="bento__card bento__card--salmon">
            <div className="row row--between">
              <p className="bento__label">Vel. media diaria</p>
              <span className="bento__label">{speedUnitLabel(settings.speedUnit)}</span>
            </div>
            <WeekSpeedChart rides={rides} />
          </Link>

          {/* Actividad del mes */}
          <div className="bento__card">
            <p className="bento__label center">Salidas del mes</p>
            <MonthDots rides={rides} />
          </div>

          {/* Minutos por franja del mes */}
          <Link to="/stats" className="bento__card bento__card--wide">
            <div className="row row--between">
              <div>
                <p className="bento__title">Este mes</p>
                <p className="bento__hint">en minutos</p>
              </div>
              <span className="bento__badge">📊</span>
            </div>
            <MonthMinutesChart rides={rides} />
          </Link>

          {/* Totales */}
          <div className="bento__card bento__card--green">
            <p className="bento__label">Distancia total</p>
            <p className="bento__metric numeric">
              {formatDistanceValue(totals.totalDistance, settings.distanceUnit)}
              <span className="bento__unit">{distanceUnitLabel(settings.distanceUnit)}</span>
            </p>
            <p className="bento__hint bento__hint--dark">
              {totals.totalRides} {totals.totalRides === 1 ? 'carrera' : 'carreras'}
            </p>
          </div>

          <Link to="/records" className="bento__card">
            <p className="bento__label">Mejor velocidad</p>
            <p className="bento__metric numeric">
              {formatSpeed(totals.maxSpeed, settings.speedUnit)}
              <span className="bento__unit">{speedUnitLabel(settings.speedUnit)}</span>
            </p>
            <p className="bento__hint">🏆 ver récords</p>
          </Link>
        </div>
      )}

      {!isNativeRuntime() && (
        <section className="section">
          <div className="card card--accent">
            <div className="row row--between" style={{ gap: 'var(--gap-3)' }}>
              <div>
                <strong>Llévala en el móvil</strong>
                <p className="text-muted" style={{ fontSize: '0.84rem', marginTop: 4 }}>
                  La app de Android sigue registrando con la pantalla bloqueada; la web se detiene
                  al apagarla.
                </p>
              </div>
              <Link to="/android" className="btn btn--sm btn--primary">
                Ver
              </Link>
            </div>

            {(install.canPrompt || install.needsManualSteps) && !install.installed && (
              <p className="field__hint" style={{ marginTop: 'var(--gap-3)' }}>
                {install.canPrompt ? (
                  <>
                    También puedes añadirla como acceso directo sin instalar nada.{' '}
                    <button
                      type="button"
                      className="btn btn--sm"
                      style={{ marginTop: 'var(--gap-2)' }}
                      onClick={() => void install.install()}
                    >
                      Añadir a la pantalla de inicio
                    </button>
                  </>
                ) : (
                  'En iPhone: toca Compartir y luego «Añadir a pantalla de inicio».'
                )}
              </p>
            )}
          </div>
        </section>
      )}

      <ConfirmDialog
        open={discarding}
        title="¿Descartar la carrera interrumpida?"
        message="Se eliminarán los puntos registrados. Esta acción no se puede deshacer."
        confirmLabel="Descartar"
        tone="danger"
        onCancel={() => setDiscarding(false)}
        onConfirm={() => {
          void recovery.discard()
          setDiscarding(false)
        }}
      />
    </>
  )
}

/** Ilustracion de la tarjeta del medio de transporte. */
function BikeArt({ icon }: { icon: string }) {
  return (
    <div className="bike-art" aria-hidden>
      <svg viewBox="0 0 160 100" role="presentation">
        <g fill="none" stroke="var(--bento-ink)" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="34" cy="66" r="26" />
          <circle cx="126" cy="66" r="26" />
          <path d="M34 66 L74 66 L58 30 L100 30 L126 66" />
          <path d="M58 30 L52 30" />
          <path d="M100 30 L108 30" />
          <path d="M74 66 L92 34" />
        </g>
        <g fill="var(--bento-ink)">
          <circle cx="34" cy="66" r="5" />
          <circle cx="126" cy="66" r="5" />
          <circle cx="74" cy="66" r="6" />
        </g>
      </svg>
      <span className="bike-art__icon">{icon}</span>
    </div>
  )
}
