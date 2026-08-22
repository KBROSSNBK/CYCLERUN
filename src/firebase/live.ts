import { collection, deleteDoc, doc, onSnapshot, query, setDoc, where } from 'firebase/firestore'
import { getDb } from './app'
import type { LivePresence } from '@/types'

/**
 * Ubicacion en vivo entre amigos.
 *
 *   liveLocations/{uid} -> posicion actual + `visibleTo`
 *
 * `visibleTo` contiene exactamente los uid de los amigos aceptados. Las reglas
 * de Firestore solo dejan leer el documento a quien aparece en esa lista, de
 * modo que la ubicacion nunca es publica y deja de serlo en cuanto se deshace
 * la amistad o se desactiva el compartir.
 *
 * Se escribe un unico documento por usuario (no un historial): al dejar de
 * compartir se borra y no queda rastro de la posicion en la nube.
 */

/** Se considera desconectado a quien lleve mas de este tiempo sin actualizar. */
export const STALE_AFTER_MS = 90000

export type LiveUpdate = Omit<LivePresence, 'visibleTo' | 'receivedAt'> & {
  visibleTo: string[]
}

export async function publishPresence(presence: LiveUpdate): Promise<void> {
  await setDoc(doc(getDb(), 'liveLocations', presence.uid), presence)
}

export async function clearPresence(uid: string): Promise<void> {
  await deleteDoc(doc(getDb(), 'liveLocations', uid)).catch(() => undefined)
}

/**
 * Escucha en tiempo real la posicion de los amigos que estan compartiendo.
 * La consulta filtra por `visibleTo`, que es justo lo que autorizan las reglas.
 *
 * Caducidad
 * ---------
 * Se combinan dos criterios porque ninguno basta por separado:
 *
 *  - la marca del emisor (`updatedAt`), que falla si los dos telefonos tienen
 *    los relojes desincronizados;
 *  - el momento en que ESTE dispositivo vio **cambiar** el documento, que solo
 *    se anota cuando `updatedAt` cambia de verdad. Anotarlo en cada snapshot
 *    haria pasar por reciente un documento de hace una hora, que es justo lo
 *    que ocurre cuando a un amigo se le bloquea el telefono y deja de emitir.
 */
export function watchFriendsLive(
  uid: string,
  onChange: (presences: LivePresence[]) => void,
  onError?: (error: Error) => void,
): () => void {
  const liveQuery = query(
    collection(getDb(), 'liveLocations'),
    where('visibleTo', 'array-contains', uid),
  )

  // uid del amigo -> { ultima marca vista, cuando la vimos cambiar }
  const seen = new Map<string, { updatedAt: number; changedAt: number }>()

  return onSnapshot(
    liveQuery,
    (snapshot) => {
      const now = Date.now()
      const presences = snapshot.docs.map((snap) => {
        const presence = snap.data() as LivePresence
        const previous = seen.get(presence.uid)
        if (!previous || previous.updatedAt !== presence.updatedAt) {
          seen.set(presence.uid, { updatedAt: presence.updatedAt, changedAt: now })
        }
        // En la primera aparicion todavia no hay ningun cambio observado, de
        // modo que manda la marca del emisor.
        const changedAt = previous ? (seen.get(presence.uid) as { changedAt: number }).changedAt : null
        return { ...presence, receivedAt: changedAt ?? undefined }
      })

      for (const uidSeen of [...seen.keys()]) {
        if (!snapshot.docs.some((snap) => snap.id === uidSeen)) seen.delete(uidSeen)
      }

      onChange(presences.sort((a, b) => b.updatedAt - a.updatedAt))
    },
    (error) => {
      // Silenciar el error dejaria un mapa vacio sin explicacion, que es
      // exactamente lo que no queremos: se propaga a la interfaz.
      onError?.(error as Error)
      onChange([])
    },
  )
}

/**
 * Se considera caducada una posicion que ni es reciente segun el reloj de quien
 * la emitio, ni se ha visto cambiar en este dispositivo. Basta con que se
 * cumpla una de las dos para seguir mostrandola.
 */
export function isStale(presence: LivePresence, now = Date.now()): boolean {
  if (now - presence.updatedAt < STALE_AFTER_MS) return false
  if (presence.receivedAt !== undefined && now - presence.receivedAt < STALE_AFTER_MS) return false
  return true
}

/** Antigüedad real del dato, para poder avisar en la interfaz. */
export function presenceAge(presence: LivePresence, now = Date.now()): number {
  const byClock = now - presence.updatedAt
  const bySighting = presence.receivedAt !== undefined ? now - presence.receivedAt : byClock
  return Math.max(0, Math.min(byClock, bySighting))
}
