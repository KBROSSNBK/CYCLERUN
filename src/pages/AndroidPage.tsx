import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Notice } from '@/components/ui'
import { isNativeRuntime } from '@/gps/nativeGeolocation'
import { formatDate } from '@/utils/format'

/**
 * Pagina de instalacion de la aplicacion de Android.
 *
 * Es la que se comparte con los amigos: un solo enlace que explica que es,
 * para que sirve y como instalarlo, en vez de mandar el APK a pelo. La
 * informacion del archivo se consulta a GitHub en el momento, de modo que la
 * fecha y el tamano mostrados son siempre los reales.
 */

const RELEASE_API = 'https://api.github.com/repos/KBROSSNBK/CYCLERUN/releases/tags/android-latest'
const APK_URL =
  'https://github.com/KBROSSNBK/CYCLERUN/releases/download/android-latest/cyclerun.apk'
const APP_URL = 'https://kbrossnbk.github.io/CYCLERUN/#/android'

interface ReleaseInfo {
  size: number
  updatedAt: number
}

export function AndroidPage() {
  const [release, setRelease] = useState<ReleaseInfo | null>(null)
  const [shared, setShared] = useState(false)
  const native = isNativeRuntime()

  useEffect(() => {
    let cancelled = false
    fetch(RELEASE_API)
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { assets?: Array<{ size: number; updated_at: string }> } | null) => {
        const asset = data?.assets?.[0]
        if (cancelled || !asset) return
        setRelease({ size: asset.size, updatedAt: new Date(asset.updated_at).getTime() })
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  const share = async () => {
    const text = `Instálate CYCLERUN para registrar tus salidas en bici y vernos en el mapa: ${APP_URL}`
    if (navigator.share) {
      await navigator.share({ title: 'CYCLERUN para Android', text, url: APP_URL }).catch(
        () => undefined,
      )
      return
    }
    await navigator.clipboard?.writeText(APP_URL).catch(() => undefined)
    setShared(true)
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">🤖 CYCLERUN para Android</h1>
          <p className="page-subtitle">Registra con el móvil bloqueado</p>
        </div>
        <Link to="/" className="btn btn--sm btn--ghost">
          ← Inicio
        </Link>
      </div>

      {native ? (
        <Notice tone="info" icon="✅">
          Ya estás usando la aplicación de Android. Comparte esta página con quien quieras que se
          la instale.
        </Notice>
      ) : (
        <div className="card card--accent">
          <p style={{ fontWeight: 700, fontSize: '1.05rem' }}>
            La versión web deja de registrar al bloquear la pantalla
          </p>
          <p className="text-muted" style={{ fontSize: '0.88rem', marginTop: 8 }}>
            El navegador congela la página y corta el acceso al GPS; es una limitación del sistema.
            La aplicación de Android usa un servicio con notificación permanente que sigue
            registrando el recorrido con el móvil bloqueado o en segundo plano.
          </p>
          <a
            href={APK_URL}
            className="btn btn--primary btn--lg btn--block"
            style={{ marginTop: 'var(--gap-4)' }}
          >
            ⬇ DESCARGAR APK
          </a>
          {release && (
            <p className="text-dim center" style={{ fontSize: '0.75rem', marginTop: 'var(--gap-3)' }}>
              {(release.size / 1048576).toFixed(1)} MB · actualizado el{' '}
              {formatDate(release.updatedAt)}
            </p>
          )}
        </div>
      )}

      <section className="section">
        <h2 className="section__title">Cómo instalarlo</h2>
        <div className="card">
          <ol className="steps">
            <li>
              <strong>Descarga el archivo</strong> en el móvil con el botón de arriba.
            </li>
            <li>
              <strong>Ábrelo desde las notificaciones.</strong> Android avisará de que procede de un
              origen desconocido, porque no viene de Play Store: toca <em>Ajustes</em> y permite la
              instalación desde el navegador.
            </li>
            <li>
              <strong>Concede la ubicación como «Permitir siempre»</strong> y deja activada la
              ubicación precisa. Con «solo mientras se usa» no funcionará con la pantalla apagada,
              que es justo para lo que sirve esta versión.
            </li>
            <li>
              <strong>Acepta las notificaciones.</strong> Android exige una notificación visible
              mientras se registra en segundo plano; es la que permite que no lo corte el sistema.
            </li>
            <li>
              <strong>Entra con Google</strong>, la misma cuenta que en la web: tus carreras y tus
              amigos son los mismos.
            </li>
          </ol>
        </div>
      </section>

      <section className="section">
        <h2 className="section__title">Compartir</h2>
        <div className="card stack">
          <p className="text-muted" style={{ fontSize: '0.88rem' }}>
            Pásale este enlace a quien quieras que se instale la app y os veáis en el mapa.
          </p>
          <code className="share-link">{APP_URL}</code>
          <button type="button" className="btn btn--primary" onClick={() => void share()}>
            {shared ? '✅ Enlace copiado' : 'Compartir enlace'}
          </button>
        </div>
      </section>

      <Notice tone="warn" icon="⚠️">
        La aplicación está firmada en modo de depuración porque no se distribuye por Play Store.
        Se instala y funciona con normalidad, pero puede que Play Protect muestre un aviso la
        primera vez: es lo esperable en cualquier APK instalado a mano.
      </Notice>

      <Notice tone="info" icon="🌐">
        Si prefieres no instalar nada, la versión web funciona igual mientras tengas la pantalla
        encendida. <Link to="/">Volver a la aplicación</Link>
      </Notice>
    </>
  )
}
