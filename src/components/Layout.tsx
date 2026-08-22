import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useRideState } from '@/hooks/useRideEngine'
import { useSyncState } from '@/hooks/useRides'

/**
 * Estructura de la aplicacion: contenido + navegacion inferior.
 * Durante una carrera la navegacion desaparece para dejar la pantalla libre y
 * evitar salidas accidentales.
 */

const TABS = [
  { to: '/', icon: '🏠', label: 'Inicio', end: true, tone: 'home' },
  { to: '/history', icon: '🗂️', label: 'Historial', end: false, tone: 'history' },
  { to: '/ride', icon: '🚴', label: 'Grabar', end: false, tone: 'record' },
  { to: '/friends', icon: '👥', label: 'Amigos', end: false, tone: 'friends' },
  { to: '/settings', icon: '⚙️', label: 'Ajustes', end: false, tone: 'settings' },
]

export function Layout() {
  const ride = useRideState()
  const location = useLocation()
  const immersive = location.pathname.startsWith('/ride') && ride.status !== 'idle'

  return (
    <div className="app">
      <main className={`app__content ${immersive ? 'app__content--flush' : ''}`}>
        <Outlet />
      </main>
      {!immersive && <BottomNav />}
    </div>
  )
}

function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="Navegación principal">
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.end}
          className={({ isActive }) =>
            `bottom-nav__item bottom-nav__item--${tab.tone} ${isActive ? 'is-active' : ''}`
          }
        >
          <span className="bottom-nav__icon" aria-hidden>
            {tab.icon}
          </span>
          {tab.label}
        </NavLink>
      ))}
    </nav>
  )
}

/** Cabecera con la marca, el estado de sincronizacion y el usuario. */
export function TopBar() {
  const { user, mode, signIn } = useAuth()
  const sync = useSyncState()

  return (
    <header className="topbar">
      <div className="topbar__brand">
        <span aria-hidden>🚴</span>
        CYCLERUN
      </div>
      <div className="row" style={{ gap: 'var(--gap-2)' }}>
        <SyncBadge pending={sync.pending} online={sync.online} syncing={sync.syncing} mode={mode} />
        {user ? (
          <NavLink to="/settings" aria-label="Ajustes de la cuenta">
            {user.photoURL ? (
              <img className="avatar" src={user.photoURL} alt="" referrerPolicy="no-referrer" />
            ) : (
              <span className="avatar" />
            )}
          </NavLink>
        ) : mode === 'anonymous' ? (
          <button type="button" className="btn btn--sm" onClick={() => void signIn()}>
            Entrar
          </button>
        ) : null}
      </div>
    </header>
  )
}

function SyncBadge({
  pending,
  online,
  syncing,
  mode,
}: {
  pending: number
  online: boolean
  syncing: boolean
  mode: string
}) {
  if (mode === 'local') {
    return (
      <span className="badge" title="Sin Firebase configurado: las carreras se guardan en este dispositivo">
        📵 Local
      </span>
    )
  }
  if (!online) return <span className="badge badge--warn">Sin conexión</span>
  if (syncing) return <span className="badge badge--info">Sincronizando…</span>
  if (pending > 0) return <span className="badge badge--warn">{pending} sin subir</span>
  return null
}
