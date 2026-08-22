import { Suspense, lazy, useEffect } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { Layout } from '@/components/Layout'
import { AuthProvider } from '@/hooks/useAuth'
import { FriendsProvider } from '@/hooks/useFriends'
import { useSettings } from '@/hooks/useSettings'
import { FriendsPage } from '@/pages/FriendsPage'
import { GpsDiagnosticsPage } from '@/pages/GpsDiagnosticsPage'
import { HistoryPage } from '@/pages/HistoryPage'
import { HomePage } from '@/pages/HomePage'
import { RecordsPage } from '@/pages/RecordsPage'
import { RidePage } from '@/pages/RidePage'
import { SettingsPage } from '@/pages/SettingsPage'
import { Spinner } from '@/components/ui'
import { rideEngine } from '@/services/rideEngine'
import { applyTheme } from '@/services/settingsService'
import { startSyncWatcher } from '@/services/syncService'

/**
 * Se usa HashRouter porque GitHub Pages sirve archivos estaticos: sin un
 * servidor que reescriba las rutas, recargar en /history devolveria un 404.
 */
// Las pantallas con graficos cargan Recharts, que pesa mas que el resto de la
// aplicacion junta: se cargan bajo demanda para que abrir la app y empezar a
// pedalear siga siendo inmediato con datos moviles.
const RideReportPage = lazy(() =>
  import('@/pages/RideReportPage').then((module) => ({ default: module.RideReportPage })),
)
const StatsPage = lazy(() =>
  import('@/pages/StatsPage').then((module) => ({ default: module.StatsPage })),
)
const ComparePage = lazy(() =>
  import('@/pages/ComparePage').then((module) => ({ default: module.ComparePage })),
)

export default function App() {
  const { settings } = useSettings()

  useEffect(() => {
    applyTheme(settings.theme)
  }, [settings.theme])

  useEffect(() => startSyncWatcher(), [])

  return (
    <AuthProvider>
      <FriendsProvider>
        <HashRouter>
          <UpdatePrompt />
          <Suspense fallback={<Spinner label="Cargando…" />}>
            <Routes>
              <Route element={<Layout />}>
                <Route index element={<HomePage />} />
                <Route path="ride" element={<RidePage />} />
                <Route path="friends" element={<FriendsPage />} />
                <Route path="history" element={<HistoryPage />} />
                <Route path="rides/:rideId" element={<RideReportPage />} />
                <Route path="stats" element={<StatsPage />} />
                <Route path="records" element={<RecordsPage />} />
                <Route path="compare" element={<ComparePage />} />
                <Route path="settings" element={<SettingsPage />} />
                <Route path="gps" element={<GpsDiagnosticsPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </Suspense>
        </HashRouter>
      </FriendsProvider>
    </AuthProvider>
  )
}

/**
 * Actualizacion de la aplicacion.
 *
 * Si no hay una carrera en curso se aplica sola: obligar al usuario a aceptar
 * un aviso deja telefonos ejecutando mezclas de codigo nuevo con estilos
 * antiguos servidos por el service worker, que es dificil de diagnosticar. Con
 * una carrera abierta no se recarga jamas sin permiso: la recarga interrumpiria
 * el registro.
 */
function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({ immediate: true })

  useEffect(() => {
    if (needRefresh && !rideEngine.isActive()) void updateServiceWorker(true)
  }, [needRefresh, updateServiceWorker])

  if (!needRefresh) return null

  return (
    <div
      className="notice notice--info"
      style={{
        position: 'fixed',
        left: 'var(--gap-3)',
        right: 'var(--gap-3)',
        top: 'calc(var(--safe-top) + var(--gap-3))',
        zIndex: 800,
        alignItems: 'center',
      }}
    >
      <span className="notice__icon">⬆️</span>
      <div style={{ flex: 1 }}>Hay una versión nueva. Se aplicará al terminar la carrera.</div>
      <div className="row" style={{ gap: 'var(--gap-2)' }}>
        <button type="button" className="btn btn--sm" onClick={() => setNeedRefresh(false)}>
          Ahora no
        </button>
        <button
          type="button"
          className="btn btn--sm btn--primary"
          onClick={() => void updateServiceWorker(true)}
        >
          Actualizar
        </button>
      </div>
    </div>
  )
}
