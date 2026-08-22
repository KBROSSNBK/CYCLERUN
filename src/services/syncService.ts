import { firebaseEnabled } from '@/firebase/app'
import { saveRide } from '@/firebase/rides'
import * as localStore from '@/storage/localStore'

/**
 * Sincronizacion de las carreras guardadas en local con Firestore.
 *
 * Al terminar, una carrera siempre se escribe primero en IndexedDB. Este
 * servicio vacia despues esa cola cuando hay sesion iniciada y conexion.
 * Mientras no lo consiga, la carrera permanece en el dispositivo y se muestra
 * igualmente en el historial marcada como pendiente.
 */

export interface SyncState {
  pending: number
  syncing: boolean
  lastError: string | null
  lastSyncAt: number | null
  online: boolean
}

type Listener = (state: SyncState) => void

let state: SyncState = {
  pending: 0,
  syncing: false,
  lastError: null,
  lastSyncAt: null,
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
}

const listeners = new Set<Listener>()
let currentUid: string | null = null
let retryTimer: ReturnType<typeof setTimeout> | null = null

export function subscribeSync(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getSyncState(): SyncState {
  return state
}

function publish(patch: Partial<SyncState>): void {
  state = { ...state, ...patch }
  listeners.forEach((cb) => cb(state))
}

export async function refreshPendingCount(): Promise<number> {
  try {
    const pending = await localStore.countPendingRides()
    publish({ pending })
    return pending
  } catch {
    return state.pending
  }
}

/** Registra el usuario actual e intenta vaciar la cola. */
export function setSyncUser(uid: string | null): void {
  currentUid = uid
  void refreshPendingCount()
  if (uid) void syncNow()
}

/**
 * Sube todas las carreras pendientes. Es seguro llamarla varias veces: las
 * ejecuciones concurrentes se descartan.
 */
export async function syncNow(): Promise<SyncState> {
  if (!firebaseEnabled || !currentUid || state.syncing) return state
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    publish({ online: false })
    return state
  }

  publish({ syncing: true, lastError: null })
  let failures = 0

  try {
    const pending = await localStore.getPendingRides()
    for (const item of pending) {
      try {
        const ride = { ...item.ride, userId: currentUid }
        await saveRide(currentUid, ride, item.points)
        await localStore.deletePendingRide(item.ride.id)
        await localStore.cacheRides([ride])
        await localStore.cacheTrack(ride.id, item.points)
      } catch (error) {
        failures++
        await localStore.savePendingRide({
          ...item,
          attempts: item.attempts + 1,
          lastError: (error as Error)?.message ?? 'Error desconocido',
        })
      }
    }

    const remaining = await localStore.countPendingRides()
    publish({
      syncing: false,
      pending: remaining,
      lastSyncAt: Date.now(),
      lastError: failures > 0 ? 'Algunas carreras no se han podido subir' : null,
    })
    if (remaining > 0) scheduleRetry()
  } catch (error) {
    publish({ syncing: false, lastError: (error as Error)?.message ?? 'Error de sincronización' })
    scheduleRetry()
  }

  return state
}

function scheduleRetry(): void {
  if (retryTimer !== null) return
  retryTimer = setTimeout(() => {
    retryTimer = null
    void syncNow()
  }, 30000)
}

/** Escucha los cambios de conectividad; se llama una vez al arrancar la app. */
export function startSyncWatcher(): () => void {
  if (typeof window === 'undefined') return () => {}

  const handleOnline = () => {
    publish({ online: true })
    void syncNow()
  }
  const handleOffline = () => publish({ online: false })

  window.addEventListener('online', handleOnline)
  window.addEventListener('offline', handleOffline)
  void refreshPendingCount()

  return () => {
    window.removeEventListener('online', handleOnline)
    window.removeEventListener('offline', handleOffline)
    if (retryTimer !== null) {
      clearTimeout(retryTimer)
      retryTimer = null
    }
  }
}
