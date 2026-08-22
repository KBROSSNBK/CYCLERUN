import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ConfirmDialog, Notice, Segmented, StatTile, Switch } from '@/components/ui'
import {
  SETTINGS_LIMITS,
  type AppSettings,
  type ThemeMode,
  type TunableSetting,
} from '@/config/defaults'
import { firebaseEnabled, missingFirebaseKeys } from '@/firebase/app'
import { useAuth } from '@/hooks/useAuth'
import { useRides, useSyncState } from '@/hooks/useRides'
import { useSettings } from '@/hooks/useSettings'
import { syncNow } from '@/services/syncService'
import * as localStore from '@/storage/localStore'

/** Configuracion de la aplicacion, cuenta y datos locales. */
export function SettingsPage() {
  const { settings, update, reset } = useSettings()
  const { user, mode, signIn, signOut } = useAuth()
  const sync = useSyncState()
  const { reload } = useRides()
  const [usage, setUsage] = useState<{ usage: number; quota: number } | null>(null)
  const [confirmWipe, setConfirmWipe] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)

  useEffect(() => {
    void localStore.estimateUsage().then(setUsage)
  }, [])

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Configuración</h1>
          <p className="page-subtitle">Ajusta la app a tu bicicleta y a tu teléfono</p>
        </div>
      </div>

      <section className="section">
        <h2 className="section__title">Cuenta</h2>
        <div className="card">
          {mode === 'local' ? (
            <>
              <Notice tone="warn" icon="📵">
                Firebase no está configurado. Faltan: {missingFirebaseKeys.join(', ') || '—'}.
                Las carreras se guardan solo en este dispositivo.
              </Notice>
            </>
          ) : user ? (
            <div className="row row--between">
              <div className="row">
                {user.photoURL ? (
                  <img className="avatar" src={user.photoURL} alt="" referrerPolicy="no-referrer" />
                ) : (
                  <span className="avatar" />
                )}
                <div>
                  <p style={{ fontWeight: 700 }}>{user.displayName ?? 'Ciclista'}</p>
                  <p className="text-dim" style={{ fontSize: '0.78rem' }}>
                    {user.email}
                  </p>
                </div>
              </div>
              <button type="button" className="btn btn--sm" onClick={() => void signOut()}>
                Cerrar sesión
              </button>
            </div>
          ) : (
            <div className="stack">
              <p className="text-muted" style={{ fontSize: '0.88rem' }}>
                Inicia sesión con Google para sincronizar tus carreras entre dispositivos.
              </p>
              <button type="button" className="btn btn--primary" onClick={() => void signIn()}>
                Entrar con Google
              </button>
            </div>
          )}
        </div>
      </section>

      <section className="section">
        <h2 className="section__title">Unidades</h2>
        <div className="card">
          <div className="field">
            <div className="field__row">
              <span className="field__label">Velocidad</span>
              <Segmented
                value={settings.speedUnit}
                options={[
                  { value: 'kmh', label: 'km/h' },
                  { value: 'mph', label: 'mph' },
                ]}
                onChange={(value) => update({ speedUnit: value })}
              />
            </div>
          </div>
          <div className="field">
            <div className="field__row">
              <span className="field__label">Distancia</span>
              <Segmented
                value={settings.distanceUnit}
                options={[
                  { value: 'km', label: 'km' },
                  { value: 'mi', label: 'millas' },
                ]}
                onChange={(value) => update({ distanceUnit: value })}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <h2 className="section__title">Detección de parada</h2>
        <div className="card">
          <Slider
            settings={settings}
            update={update}
            name="stopSpeedThreshold"
            label="Umbral de detención"
            hint="Por debajo de esta velocidad se considera que estás parado y el tiempo pasa a contar como detenido."
          />
          <Slider
            settings={settings}
            update={update}
            name="stopDelay"
            label="Retardo antes de marcar parada"
            hint="Evita que un semáforo de dos segundos cuente como parada."
            format={(value) => `${(value / 1000).toFixed(0)} s`}
          />
        </div>
      </section>

      <section className="section">
        <h2 className="section__title">Sensibilidad del GPS</h2>
        <div className="card">
          <Slider
            settings={settings}
            update={update}
            name="goodAccuracy"
            label="Precisión considerada buena"
            hint="Por encima de este valor el indicador muestra «GPS débil»."
          />
          <Slider
            settings={settings}
            update={update}
            name="maxAccuracy"
            label="Precisión máxima aceptada"
            hint="Las lecturas con menos precisión que este valor se descartan por completo."
          />
          <Slider
            settings={settings}
            update={update}
            name="maxPlausibleSpeed"
            label="Velocidad máxima válida"
            hint="Un desplazamiento que implique más velocidad que esta se trata como un salto del GPS y se ignora."
          />
          <Slider
            settings={settings}
            update={update}
            name="speedSmoothingWindow"
            label="Suavizado de la velocidad"
            hint="Número de lecturas usadas para calcular la velocidad mostrada. Más lecturas = más estable, menos reactivo."
          />
          <Slider
            settings={settings}
            update={update}
            name="updateInterval"
            label="Intervalo de actualización"
            hint="Tiempo mínimo entre puntos registrados."
            format={(value) => `${value} ms`}
          />
          <Slider
            settings={settings}
            update={update}
            name="minMoveDistance"
            label="Desplazamiento mínimo"
            hint="Movimientos menores se consideran ruido del GPS y no suman distancia."
          />
          <Slider
            settings={settings}
            update={update}
            name="elevationThreshold"
            label="Umbral de desnivel"
            hint="Cambio mínimo de altitud para acumular desnivel."
          />
          <div style={{ marginTop: 'var(--gap-3)' }}>
            <Link to="/gps" className="btn btn--block btn--sm">
              🛰️ Diagnóstico del GPS
            </Link>
          </div>
        </div>
      </section>

      <section className="section">
        <h2 className="section__title">Amigos y privacidad</h2>
        <div className="card">
          <ToggleField
            label="Compartir ubicación en vivo"
            hint="Solo con tus amigos aceptados y solo mientras grabas una carrera. Al finalizar, la posición se borra de la nube."
            checked={settings.shareLiveLocation}
            onChange={(value) => update({ shareLiveLocation: value })}
          />
          {settings.shareLiveLocation && (
            <Slider
              settings={settings}
              update={update}
              name="liveUpdateInterval"
              label="Frecuencia de actualización"
              hint="Cada cuánto se envía tu posición a tus amigos. Más frecuente gasta más batería y más datos."
              format={(value) => `${(value / 1000).toFixed(0)} s`}
            />
          )}
          <div style={{ marginTop: 'var(--gap-3)' }}>
            <Link to="/friends" className="btn btn--block btn--sm">
              👥 Gestionar amigos
            </Link>
          </div>
          <p className="field__hint" style={{ marginTop: 'var(--gap-3)' }}>
            Tus carreras guardadas son privadas: los amigos nunca las ven, solo tu posición en
            directo si activas esta opción.
          </p>
        </div>
      </section>

      <section className="section">
        <h2 className="section__title">Aplicación</h2>
        <div className="card">
          <div className="field">
            <div className="field__row">
              <span className="field__label">Tema</span>
              <Segmented<ThemeMode>
                value={settings.theme}
                options={[
                  { value: 'dark', label: 'Oscuro' },
                  { value: 'light', label: 'Claro' },
                  { value: 'system', label: 'Auto' },
                ]}
                onChange={(value) => update({ theme: value })}
              />
            </div>
          </div>
          <ToggleField
            label="Mantener la pantalla encendida"
            hint="Durante la carrera, si el navegador lo permite."
            checked={settings.keepScreenAwake}
            onChange={(value) => update({ keepScreenAwake: value })}
          />
          <ToggleField
            label="Seguimiento automático del mapa"
            hint="El mapa se centra en tu posición mientras pedaleas."
            checked={settings.autoFollow}
            onChange={(value) => update({ autoFollow: value })}
          />
          <ToggleField
            label="Vibración"
            hint="Al pausar, reanudar y finalizar."
            checked={settings.hapticFeedback}
            onChange={(value) => update({ hapticFeedback: value })}
          />
        </div>
      </section>

      <section className="section">
        <h2 className="section__title">Datos</h2>
        <div className="card stack">
          <div className="grid-2">
            <StatTile label="Pendientes de subir" value={sync.pending} />
            <StatTile
              label="Espacio usado"
              value={usage ? `${(usage.usage / 1048576).toFixed(1)} MB` : '—'}
            />
          </div>
          {firebaseEnabled && sync.pending > 0 && (
            <button
              type="button"
              className="btn btn--sm"
              disabled={sync.syncing || !user}
              onClick={() => void syncNow()}
            >
              {sync.syncing ? 'Sincronizando…' : 'Sincronizar ahora'}
            </button>
          )}
          <button type="button" className="btn btn--sm" onClick={() => setConfirmReset(true)}>
            Restaurar configuración
          </button>
          <button
            type="button"
            className="btn btn--sm btn--danger"
            onClick={() => setConfirmWipe(true)}
          >
            Borrar datos locales
          </button>
          <p className="field__hint">
            Borrar los datos locales elimina la caché y las carreras aún no subidas. Las que ya
            están en la nube se conservan.
          </p>
        </div>
      </section>

      <p className="text-dim center" style={{ fontSize: '0.75rem', marginTop: 'var(--gap-5)' }}>
        CYCLERUN · datos GPS reales del dispositivo · sin seguimiento de terceros
      </p>

      <ConfirmDialog
        open={confirmWipe}
        title="¿Borrar los datos locales?"
        message="Se eliminarán la caché y las carreras pendientes de subir."
        confirmLabel="Borrar"
        tone="danger"
        onCancel={() => setConfirmWipe(false)}
        onConfirm={() => {
          void localStore.wipeLocalData().then(() => reload())
          setConfirmWipe(false)
        }}
      />
      <ConfirmDialog
        open={confirmReset}
        title="¿Restaurar la configuración?"
        message="Todos los ajustes volverán a sus valores por defecto."
        confirmLabel="Restaurar"
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => {
          reset()
          setConfirmReset(false)
        }}
      />
    </>
  )
}

function Slider({
  settings,
  update,
  name,
  label,
  hint,
  format,
}: {
  settings: AppSettings
  update: (patch: Partial<AppSettings>) => void
  name: TunableSetting
  label: string
  hint: string
  format?: (value: number) => string
}) {
  const limit = SETTINGS_LIMITS[name]
  const value = settings[name]
  return (
    <div className="field">
      <div className="field__row">
        <span className="field__label">{label}</span>
        <span className="field__value">
          {format ? format(value) : `${value} ${limit.unit}`}
        </span>
      </div>
      <input
        type="range"
        min={limit.min}
        max={limit.max}
        step={limit.step}
        value={value}
        aria-label={label}
        onChange={(event) => update({ [name]: Number(event.target.value) } as Partial<AppSettings>)}
      />
      <p className="field__hint">{hint}</p>
    </div>
  )
}

function ToggleField({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string
  hint: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <div className="field">
      <div className="field__row">
        <div>
          <p className="field__label">{label}</p>
          <p className="field__hint">{hint}</p>
        </div>
        <Switch checked={checked} onChange={onChange} label={label} />
      </div>
    </div>
  )
}
