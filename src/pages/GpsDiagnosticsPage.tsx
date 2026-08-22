import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { GpsIndicator } from '@/components/GpsIndicator'
import { Notice, StatTile } from '@/components/ui'
import { gpsService } from '@/gps/gpsService'
import {
  describeEnvironment,
  permissionHelp,
  watchPermission,
  type EnvironmentReport,
} from '@/gps/permissions'
import { useGpsState } from '@/hooks/useGps'
import { useSettings } from '@/hooks/useSettings'
import { formatAccuracy, formatTime } from '@/utils/format'

/**
 * Diagnostico del GPS.
 * Muestra sin rodeos por que el GPS no funciona y que puede hacer el usuario,
 * que es la duda mas frecuente en una aplicacion de este tipo.
 */
export function GpsDiagnosticsPage() {
  const gps = useGpsState()
  const { settings } = useSettings()
  const [report, setReport] = useState<EnvironmentReport | null>(null)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)

  useEffect(() => {
    void describeEnvironment().then(setReport)
    return watchPermission(() => {
      void describeEnvironment().then(setReport)
    })
  }, [])

  useEffect(() => {
    gpsService.configure(settings)
    gpsService.start()
    return () => {
      gpsService.stop()
    }
  }, [settings])

  const help = report ? permissionHelp(report) : []
  const fix = gps.lastFix

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Diagnóstico del GPS</h1>
          <p className="page-subtitle">Estado real del receptor de este dispositivo</p>
        </div>
        <Link to="/settings" className="btn btn--sm btn--ghost">
          ← Ajustes
        </Link>
      </div>

      <div className="card stack">
        <div className="row row--between">
          <span className="field__label">Estado</span>
          <GpsIndicator gps={gps} showAccuracy={false} />
        </div>
        <p className="text-muted" style={{ fontSize: '0.88rem' }}>
          {gps.message}
        </p>
        <div className="grid-2">
          <StatTile label="Precisión" value={formatAccuracy(gps.accuracy)} tone={
            gps.accuracy === null
              ? 'muted'
              : gps.accuracy <= settings.goodAccuracy
                ? 'accent'
                : gps.accuracy <= settings.maxAccuracy
                  ? 'warn'
                  : 'danger'
          } />
          <StatTile
            label="Último fix"
            value={gps.lastFixAt ? formatTime(gps.lastFixAt) : '—'}
          />
          <StatTile label="Lecturas descartadas" value={gps.rejected} />
          <StatTile
            label="Satélite / red"
            value={fix?.altitude !== null && fix?.altitude !== undefined ? 'Con altitud' : 'Sin altitud'}
          />
        </div>
      </div>

      {help.length > 0 && (
        <Notice tone="danger" icon="🛑">
          <strong>Cómo solucionarlo</strong>
          <ul style={{ marginTop: 8, paddingLeft: 16, listStyle: 'disc' }}>
            {help.map((line) => (
              <li key={line} style={{ marginBottom: 4 }}>
                {line}
              </li>
            ))}
          </ul>
        </Notice>
      )}

      <section className="section">
        <h2 className="section__title">Entorno</h2>
        <div className="card">
          <CheckRow label="Geolocalización disponible" ok={report?.supported ?? false} />
          <CheckRow
            label="Conexión segura (HTTPS)"
            ok={report?.secureContext ?? false}
            hint="La API de ubicación solo funciona en HTTPS o en localhost."
          />
          <CheckRow
            label="Permiso concedido"
            ok={report?.permission === 'granted'}
            pending={report?.permission === 'prompt' || report?.permission === 'unknown'}
            hint={
              report?.permission === 'prompt'
                ? 'El navegador lo preguntará al iniciar una carrera.'
                : report?.permission === 'unknown'
                  ? 'Este navegador no permite consultar el estado del permiso.'
                  : undefined
            }
          />
          <CheckRow
            label="Precisión suficiente"
            ok={gps.accuracy !== null && gps.accuracy <= settings.readyAccuracy}
            pending={gps.accuracy === null}
            hint={`Se considera listo con ±${settings.readyAccuracy} m o menos.`}
          />
        </div>
      </section>

      {fix && (
        <section className="section">
          <h2 className="section__title">Última lectura</h2>
          <div className="card">
            <div className="grid-2">
              <StatTile label="Latitud" value={fix.latitude.toFixed(6)} />
              <StatTile label="Longitud" value={fix.longitude.toFixed(6)} />
              <StatTile
                label="Altitud"
                value={fix.altitude !== null ? `${fix.altitude.toFixed(0)} m` : 'No disponible'}
              />
              <StatTile
                label="Rumbo"
                value={fix.heading !== null ? `${fix.heading.toFixed(0)}°` : 'No disponible'}
              />
              <StatTile
                label="Velocidad del receptor"
                value={fix.speed !== null ? `${(fix.speed * 3.6).toFixed(1)} km/h` : 'No disponible'}
              />
              <StatTile label="Precisión" value={formatAccuracy(fix.accuracy)} />
            </div>
          </div>
        </section>
      )}

      <section className="section">
        <button
          type="button"
          className="btn btn--block"
          disabled={testing}
          onClick={() => {
            setTesting(true)
            setTestResult(null)
            gpsService
              .getCurrentFix()
              .then((result) =>
                setTestResult(
                  `Lectura correcta: ±${Math.round(result.accuracy ?? 0)} m a las ${formatTime(
                    result.timestamp,
                  )}`,
                ),
              )
              .catch((error: Error) => setTestResult(`Error: ${error.message}`))
              .finally(() => setTesting(false))
          }}
        >
          {testing ? 'Solicitando ubicación…' : 'Probar una lectura puntual'}
        </button>
        {testResult && (
          <p className="text-muted center" style={{ marginTop: 'var(--gap-3)', fontSize: '0.85rem' }}>
            {testResult}
          </p>
        )}
      </section>

      <Notice tone="info" icon="ℹ️">
        La precisión depende del teléfono, del clima y del entorno. Entre edificios altos o en
        túneles es normal perder señal; CYCLERUN descarta esas lecturas en lugar de inventar
        distancia.
      </Notice>
    </>
  )
}

function CheckRow({
  label,
  ok,
  pending,
  hint,
}: {
  label: string
  ok: boolean
  pending?: boolean
  hint?: string
}) {
  return (
    <div className="field">
      <div className="field__row">
        <span className="field__label">{label}</span>
        <span className={`badge ${ok ? 'badge--ok' : pending ? 'badge--warn' : 'badge--danger'}`}>
          {ok ? '🟢 Sí' : pending ? '🟡 Pendiente' : '🔴 No'}
        </span>
      </div>
      {hint && <p className="field__hint">{hint}</p>}
    </div>
  )
}
