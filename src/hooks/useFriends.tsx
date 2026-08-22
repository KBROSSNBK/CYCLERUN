import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { firebaseEnabled } from '@/firebase/app'
import {
  FriendError,
  acceptFriendRequest,
  ensureDirectoryEntry,
  findUidByCode,
  findUidByEmail,
  rejectFriendRequest,
  removeFriend,
  sendFriendRequest,
  watchFriendRequests,
  watchFriends,
} from '@/firebase/friends'
import { watchFriendsLive } from '@/firebase/live'
import { liveShareService } from '@/services/liveShareService'
import type { Friend, FriendRequest, LivePresence } from '@/types'
import { useAuth } from './useAuth'
import { useSettings } from './useSettings'

/**
 * Estado social de la aplicacion: amigos, solicitudes y posiciones en vivo.
 *
 * Vive en un contexto porque lo consumen a la vez la pantalla de Amigos, el
 * mapa de la carrera y el servicio que publica la posicion: mantener una sola
 * suscripcion a Firestore evita multiplicar lecturas.
 */

interface FriendsContextValue {
  friends: Friend[]
  requests: FriendRequest[]
  liveFriends: LivePresence[]
  friendCode: string | null
  loading: boolean
  error: string | null
  /** Envia una solicitud a partir de un codigo de amistad o de un correo. */
  addFriend: (query: string) => Promise<string>
  accept: (request: FriendRequest) => Promise<void>
  reject: (request: FriendRequest) => Promise<void>
  remove: (friendUid: string) => Promise<void>
}

const FriendsContext = createContext<FriendsContextValue | null>(null)

export function FriendsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const { settings } = useSettings()
  const [friends, setFriends] = useState<Friend[]>([])
  const [requests, setRequests] = useState<FriendRequest[]>([])
  const [liveFriends, setLiveFriends] = useState<LivePresence[]>([])
  const [friendCode, setFriendCode] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const uid = user?.uid ?? null

  // Registro en el directorio y suscripciones en tiempo real.
  useEffect(() => {
    if (!firebaseEnabled || !user) {
      setFriends([])
      setRequests([])
      setLiveFriends([])
      setFriendCode(null)
      return
    }

    setLoading(true)
    void ensureDirectoryEntry(user)
      .then(setFriendCode)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))

    const unsubFriends = watchFriends(user.uid, setFriends)
    const unsubRequests = watchFriendRequests(user.uid, setRequests)
    const unsubLive = watchFriendsLive(user.uid, setLiveFriends)

    return () => {
      unsubFriends()
      unsubRequests()
      unsubLive()
    }
  }, [user])

  // Descarta a los amigos que dejan de emitir sin haber cerrado la carrera.
  useEffect(() => {
    if (liveFriends.length === 0) return
    const timer = setInterval(() => {
      setLiveFriends((current) =>
        current.filter((presence) => Date.now() - presence.updatedAt < 90000),
      )
    }, 15000)
    return () => clearInterval(timer)
  }, [liveFriends.length])

  const friendUids = useMemo(() => friends.map((friend) => friend.uid), [friends])

  // Mantiene al dia el servicio que publica la posicion en vivo.
  useEffect(() => {
    liveShareService.configure({
      user,
      friendUids,
      enabled: settings.shareLiveLocation && friendUids.length > 0,
      intervalMs: settings.liveUpdateInterval,
    })
  }, [user, friendUids, settings.shareLiveLocation, settings.liveUpdateInterval])

  const addFriend = useCallback(
    async (rawQuery: string): Promise<string> => {
      if (!user) throw new FriendError('Inicia sesión con Google para añadir amigos.')
      const query = rawQuery.trim()
      if (!query) throw new FriendError('Escribe un código de amistad o un correo.')

      const targetUid = query.includes('@')
        ? await findUidByEmail(query)
        : await findUidByCode(query)

      if (!targetUid) {
        throw new FriendError(
          query.includes('@')
            ? 'No hay ninguna cuenta de CYCLERUN con ese correo. Pídele su código de amistad.'
            : 'Ese código de amistad no existe.',
        )
      }

      await sendFriendRequest(user, targetUid)
      return 'Solicitud enviada. Aparecerás en su lista cuando la acepte.'
    },
    [user],
  )

  const accept = useCallback(
    async (request: FriendRequest) => {
      if (!user) return
      await acceptFriendRequest(user, request)
    },
    [user],
  )

  const reject = useCallback(
    async (request: FriendRequest) => {
      if (!uid) return
      await rejectFriendRequest(uid, request.fromUid)
    },
    [uid],
  )

  const remove = useCallback(
    async (friendUid: string) => {
      if (!uid) return
      await removeFriend(uid, friendUid)
    },
    [uid],
  )

  const value = useMemo<FriendsContextValue>(
    () => ({
      friends,
      requests,
      liveFriends,
      friendCode,
      loading,
      error,
      addFriend,
      accept,
      reject,
      remove,
    }),
    [friends, requests, liveFriends, friendCode, loading, error, addFriend, accept, reject, remove],
  )

  return <FriendsContext.Provider value={value}>{children}</FriendsContext.Provider>
}

export function useFriends(): FriendsContextValue {
  const context = useContext(FriendsContext)
  if (!context) throw new Error('useFriends debe usarse dentro de <FriendsProvider>')
  return context
}
