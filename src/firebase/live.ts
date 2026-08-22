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
 * La caducidad se mide con `receivedAt` —el momento en que ESTE dispositivo
 * recibio el dato— y no con la marca de tiempo que escribio el emisor: si los
 * relojes de los dos telefonos no coinciden, comparar marcas ajenas haria
 * desaparecer del mapa a un amigo que esta perfectamente conectado.
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
  return onSnapshot(
    liveQuery,
    (snapshot) => {
      const receivedAt = Date.now()
      const presences = snapshot.docs
        .map((snap) => ({ ...(snap.data() as LivePresence), receivedAt }))
        .sort((a, b) => b.updatedAt - a.updatedAt)
      onChange(presences)
    },
    (error) => {
      // Silenciar el error dejaria un mapa vacio sin explicacion, que es
      // exactamente lo que no queremos: se propaga a la interfaz.
      onError?.(error as Error)
      onChange([])
    },
  )
}

export function isStale(presence: LivePresence, now = Date.now()): boolean {
  const reference = presence.receivedAt ?? presence.updatedAt
  return now - reference >= STALE_AFTER_MS
}
