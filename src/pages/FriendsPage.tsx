import { useCallback, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { FriendsMap, type MapFocus } from '@/components/RouteMap'
import { ConfirmDialog, EmptyState, Notice, Spinner, Switch } from '@/components/ui'
import { firebaseEnabled } from '@/firebase/app'
import { presenceAge } from '@/firebase/live'
import { isNativeRuntime } from '@/gps/nativeGeolocation'
import { useAuth } from '@/hooks/useAuth'
import { useFriends, useLiveShareState } from '@/hooks/useFriends'
import { useSettings } from '@/hooks/useSettings'
import type { Friend, LivePresence } from '@/types'
import { formatDistance, formatRelative, formatSpeedWithUnit } from '@/utils/format'

/**
 * Amigos y mapa en vivo.
 *
 * Para agregar a alguien hace falta su codigo de amistad o su correo exacto:
 * no existe un directorio que se pueda explorar. La ubicacion en vivo solo se
 * comparte entre amigos aceptados y unicamente si se activa el interruptor.
 */
export function FriendsPage() {
  const { user, mode, signIn } = useAuth()
  const { settings, update } = useSettings()
  const {
    friends,
    requests,
    liveFriends,
    friendCode,
    loading,
    liveError,
    addFriend,
    accept,
    reject,
    remove,
    setVisibility,
  } = useFriends()
  const live = useLiveShareState()
  // Solo cuentan los amigos con permiso concedido.
  const allowed = friends.filter((friend) => friend.shareLocation !== false).length

  const [query, setQuery] = useState('')
  const [message, setMessage] = useState<{ tone: 'info' | 'danger'; text: string } | null>(null)
  const [sending, setSending] = useState(false)
  const [pendingRemoval, setPendingRemoval] = useState<Friend | null>(null)
  const [focus, setFocus] = useState<MapFocus | null>(null)
  const mapRef = useRef<HTMLDivElement>(null)

  /**
   * Al tocar a un amigo el mapa se encuadra entre su posición y la mía, y sube
   * hasta el mapa si se ha pulsado desde la lista de abajo.
   *
   * Va antes de las salidas condicionales de abajo: declararlo después
   * cambiaría el número de hooks entre renders y React abortaría el árbol.
   */
  const focusFriend = useCallback((friendUid: string) => {
    setFocus({ uid: friendUid, nonce: Date.now() })
    mapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [])

  if (!firebaseEnabled) {
    return (
      <>
        <h1 className="page-title">Amigos</h1>
        <Notice tone="warn" icon="📵">
          Los amigos necesitan Firebase. Configura tu proyecto siguiendo el README y vuelve a
          entrar con tu cuenta de Google.
        </Notice>
      </>
    )
  }

  if (!user) {
    return (
      <>
        <h1 className="page-title">Amigos</h1>
        <EmptyState
          icon="👥"
          title="Entra con Google"
          description="Necesitas iniciar sesión para tener amigos y ver dónde están mientras pedaláis."
          action={
            <button type="button" className="btn btn--primary" onClick={() => void signIn()}>
              Entrar con Google
            </button>
          }
        />
        {mode === 'anonymous' && (
          <Notice tone="info" icon="🔒">
            Tu ubicación solo la ven los amigos a los que se lo permitas, y solo mientras la
            aplicación esté abierta.
          </Notice>
        )}
      </>
    )
  }

  const handleAdd = async () => {
    setSending(true)
    setMessage(null)
    try {
      const text = await addFriend(query)
      setMessage({ tone: 'info', text })
      setQuery('')
    } catch (error) {
      setMessage({ tone: 'danger', text: (error as Error).message })
    } finally {
      setSending(false)
    }
  }

  const shareCode = async () => {
    if (!friendCode) return
    const text = `Añádeme en CYCLERUN con mi código de amistad: ${friendCode}`
    if (navigator.share) {
      await navigator.share({ text }).catch(() => undefined)
      return
    }
    await navigator.clipboard?.writeText(friendCode).catch(() => undefined)
    setMessage({ tone: 'info', text: 'Código copiado al portapapeles.' })
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Amigos</h1>
          <p className="page-subtitle">
            {friends.length} {friends.length === 1 ? 'amigo' : 'amigos'}
            {liveFriends.length > 0 && ` · ${liveFriends.length} en ruta ahora`}
          </p>
        </div>
      </div>

      {friends.length > 0 && (
        <section className="section" style={{ marginTop: 0 }}>
          <h2 className="section__title">
            <span className="dot dot--pulse" style={{ color: 'var(--accent)' }} /> En vivo
          </h2>
          {liveFriends.length > 0 ? (
            <>
              <div ref={mapRef}>
                <FriendsMap
                  presences={liveFriends}
                  className="map map--live"
                  focus={focus}
                  onFocusLost={() => setFocus(null)}
                />
              </div>
              <p className="field__hint" style={{ marginTop: 'var(--gap-2)' }}>
                {focus
                  ? 'Siguiendo a tu amigo. Arrastra el mapa para dejar de seguirlo.'
                  : 'Toca a un amigo para veros a los dos en el mapa.'}
              </p>
              <div className="stack" style={{ marginTop: 'var(--gap-3)' }}>
                {liveFriends.map((presence) => (
                  <LiveFriendRow
                    key={presence.uid}
                    presence={presence}
                    settings={settings}
                    selected={focus?.uid === presence.uid}
                    onSelect={() => focusFriend(presence.uid)}
                  />
                ))}
              </div>
            </>
          ) : (
            <div className="card center text-muted" style={{ padding: 'var(--gap-5)' }}>
              <p style={{ fontSize: '2rem' }}>🗺️</p>
              <p style={{ marginTop: 'var(--gap-2)', fontSize: '0.9rem' }}>
                Ninguno de tus amigos está compartiendo su posición ahora mismo.
              </p>
              <p className="field__hint" style={{ marginTop: 'var(--gap-2)' }}>
                Aparecen aquí en cuanto abren la aplicación, con el interruptor activado y
                habiéndote dado permiso.
              </p>
            </div>
          )}
          {liveError && (
            <Notice tone="danger" icon="⚠️">
              No se ha podido escuchar a tus amigos: {liveError}
            </Notice>
          )}
        </section>
      )}

      <section className="section">
        <h2 className="section__title">Compartir mi posición</h2>
        <div className="card">
          <div className="field" style={{ borderBottom: 'none', paddingBottom: 0 }}>
            <div className="field__row">
              <div>
                <p className="field__label">Ubicación en vivo</p>
                <p className="field__hint">
                  Tus amigos autorizados te ven mientras la aplicación esté abierta, estés o no
                  grabando. Al cerrarla, tu posición se borra de la nube.
                </p>
              </div>
              <Switch
                checked={settings.shareLiveLocation}
                onChange={(value) => update({ shareLiveLocation: value })}
                label="Compartir ubicación en vivo"
              />
            </div>
          </div>

          {settings.shareLiveLocation && (
            <div style={{ marginTop: 'var(--gap-4)' }}>
              {live.sharing ? (
                <div className="badge badge--ok">
                  <span className="dot dot--pulse" aria-hidden />
                  Visible para {allowed} {allowed === 1 ? 'amigo' : 'amigos'}
                  {live.lastPublishAt && ` · ${formatRelative(live.lastPublishAt)}`}
                </div>
              ) : (
                <div className="badge badge--warn">⏳ {live.blockedBy ?? 'Preparando…'}</div>
              )}
            </div>
          )}

          {live.lastError && (
            <Notice tone="danger" icon="⚠️">
              No se ha podido publicar tu posición: {live.lastError}
            </Notice>
          )}

          <p className="field__hint" style={{ marginTop: 'var(--gap-3)' }}>
            {isNativeRuntime() ? (
              <>
                <strong>Sigue registrando con el móvil bloqueado.</strong> Verás una notificación
                permanente mientras esté activo. Al cerrar la aplicación se detiene y dejas de
                emitir.
              </>
            ) : (
              <>
                <strong>Con la pantalla bloqueada dejas de emitir.</strong> El navegador congela la
                página y corta el acceso al GPS; es una limitación del sistema, no de la app.
                Instala la aplicación de Android para seguir registrando con el móvil bloqueado.
              </>
            )}
          </p>
        </div>
      </section>

      <section className="section">
        <h2 className="section__title">Mi código de amistad</h2>
        <div className="card card--accent">
          <div className="row row--between">
            <span className="friend-code numeric">{friendCode ?? '······'}</span>
            <button
              type="button"
              className="btn btn--sm"
              disabled={!friendCode}
              onClick={() => void shareCode()}
            >
              Compartir
            </button>
          </div>
          <p className="field__hint" style={{ marginTop: 'var(--gap-3)' }}>
            Dáselo a quien quieras que te añada. También pueden encontrarte por el correo de tu
            cuenta de Google.
          </p>
        </div>
      </section>

      <section className="section">
        <h2 className="section__title">Añadir amigo</h2>
        <div className="card stack">
          <input
            type="text"
            value={query}
            placeholder="Código de amistad o correo"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !sending) void handleAdd()
            }}
          />
          <button
            type="button"
            className="btn btn--primary"
            disabled={sending || query.trim().length === 0}
            onClick={() => void handleAdd()}
          >
            {sending ? 'Enviando…' : 'Enviar solicitud'}
          </button>
          {message && (
            <Notice tone={message.tone} icon={message.tone === 'danger' ? '⚠️' : '✅'}>
              {message.text}
            </Notice>
          )}
        </div>
      </section>

      {requests.length > 0 && (
        <section className="section">
          <h2 className="section__title">Solicitudes recibidas</h2>
          <div className="stack">
            {requests.map((request) => (
              <div key={request.fromUid} className="card">
                <div className="row row--between">
                  <div className="row">
                    <Avatar url={request.photoURL} name={request.displayName} />
                    <div>
                      <p style={{ fontWeight: 700 }}>{request.displayName ?? 'Ciclista'}</p>
                      <p className="text-dim" style={{ fontSize: '0.75rem' }}>
                        {request.email ?? formatRelative(request.createdAt)}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="btn-group" style={{ marginTop: 'var(--gap-3)' }}>
                  <button
                    type="button"
                    className="btn btn--sm"
                    onClick={() => void reject(request)}
                  >
                    Rechazar
                  </button>
                  <button
                    type="button"
                    className="btn btn--sm btn--primary"
                    onClick={() => void accept(request)}
                  >
                    Aceptar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="section">
        <h2 className="section__title">Mis amigos</h2>
        {loading ? (
          <Spinner label="Cargando…" />
        ) : friends.length === 0 ? (
          <EmptyState
            icon="🤝"
            title="Todavía no tienes amigos"
            description="Comparte tu código de amistad o añade a alguien por su correo."
          />
        ) : (
          <div className="stack">
            {friends.map((friend) => {
              const live = liveFriends.find((presence) => presence.uid === friend.uid)
              return (
                <div key={friend.uid} className="card">
                  <div className="row row--between">
                    <div
                      className="row"
                      role={live ? 'button' : undefined}
                      tabIndex={live ? 0 : undefined}
                      style={live ? { cursor: 'pointer' } : undefined}
                      onClick={() => live && focusFriend(friend.uid)}
                      onKeyDown={(event) => {
                        if (live && (event.key === 'Enter' || event.key === ' ')) focusFriend(friend.uid)
                      }}
                    >
                      <Avatar url={friend.photoURL} name={friend.displayName} live={Boolean(live)} />
                      <div>
                        <p style={{ fontWeight: 700 }}>{friend.displayName ?? 'Ciclista'}</p>
                        <p className="text-dim" style={{ fontSize: '0.75rem' }}>
                          {live
                            ? `En ruta · ${formatDistance(live.distance, settings.distanceUnit)}`
                            : `Amigos desde ${new Date(friend.since).toLocaleDateString('es')}`}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn btn--sm btn--ghost text-danger"
                      onClick={() => setPendingRemoval(friend)}
                    >
                      Quitar
                    </button>
                  </div>

                  {/* Permiso individual: cada amigo se activa o desactiva por
                      separado, sin tocar a los demás. */}
                  <div
                    className="row row--between"
                    style={{ marginTop: 'var(--gap-3)', paddingTop: 'var(--gap-3)', borderTop: '1px solid var(--border)' }}
                  >
                    <div>
                      <p className="field__label" style={{ fontSize: '0.85rem' }}>
                        Puede ver mi ubicación
                      </p>
                      <p className="field__hint">
                        {friend.shareLocation === false
                          ? 'No te ve en el mapa.'
                          : 'Te ve en el mapa mientras tengas la app abierta.'}
                      </p>
                    </div>
                    <Switch
                      checked={friend.shareLocation !== false}
                      onChange={(value) => void setVisibility(friend.uid, value)}
                      label={`Compartir mi ubicación con ${friend.displayName ?? 'este amigo'}`}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <Notice tone="info" icon="🔒">
        Solo te ven los amigos que tengas activados aquí, y solo mientras la aplicación esté
        abierta: al cerrarla, tu posición se borra de la nube. Tus carreras guardadas siguen siendo
        privadas y no las ve nadie. <Link to="/settings">Ajustes de privacidad</Link>
      </Notice>

      <ConfirmDialog
        open={pendingRemoval !== null}
        title={`¿Quitar a ${pendingRemoval?.displayName ?? 'este amigo'}?`}
        message="Dejaréis de ver vuestra ubicación en vivo mutuamente."
        confirmLabel="Quitar"
        tone="danger"
        onCancel={() => setPendingRemoval(null)}
        onConfirm={() => {
          if (pendingRemoval) void remove(pendingRemoval.uid)
          setPendingRemoval(null)
        }}
      />
    </>
  )
}

function LiveFriendRow({
  presence,
  settings,
  selected,
  onSelect,
}: {
  presence: LivePresence
  settings: { speedUnit: 'kmh' | 'mph'; distanceUnit: 'km' | 'mi' }
  selected: boolean
  onSelect: () => void
}) {
  // La antigüedad se calcula con el criterio que menos penalice al emisor, para
  // no acusar de «desconectado» a quien solo tiene el reloj desajustado.
  const age = presenceAge(presence)
  const riding = presence.status === 'recording' || presence.status === 'paused'

  return (
    <button
      type="button"
      className={`card card--flat friend-row ${selected ? 'is-selected' : ''}`}
      onClick={onSelect}
    >
      <div className="row row--between">
        <div className="row">
          <Avatar url={presence.photoURL} name={presence.displayName} live />
          <div style={{ textAlign: 'left' }}>
            <p style={{ fontWeight: 700 }}>{presence.displayName ?? 'Ciclista'}</p>
            <p className="text-dim" style={{ fontSize: '0.75rem' }}>
              {presence.status === 'paused'
                ? 'En pausa'
                : presence.status === 'recording'
                  ? 'Pedaleando'
                  : 'Con la app abierta'}{' '}
              · {age < 30000 ? 'ahora mismo' : formatRelative(Date.now() - age)}
            </p>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p className="numeric" style={{ fontWeight: 750 }}>
            {formatSpeedWithUnit(presence.speed, settings.speedUnit)}
          </p>
          {riding && (
            <p className="text-dim numeric" style={{ fontSize: '0.75rem' }}>
              {formatDistance(presence.distance, settings.distanceUnit)}
            </p>
          )}
        </div>
      </div>
    </button>
  )
}

function Avatar({
  url,
  name,
  live,
}: {
  url: string | null
  name: string | null
  live?: boolean
}) {
  const initials = (name ?? 'C')
    .split(' ')
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('')
  return (
    <span className={`avatar-wrap ${live ? 'is-live' : ''}`}>
      {url ? (
        <img className="avatar" src={url} alt="" referrerPolicy="no-referrer" />
      ) : (
        <span className="avatar avatar--initials">{initials}</span>
      )}
    </span>
  )
}
