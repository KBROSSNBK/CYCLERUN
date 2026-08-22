import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { ActivitySpan, PendingRide, Ride, RideStats, RideStatus, RoutePoint } from '@/types'
import type { ActivityType } from '@/config/activities'

/**
 * Almacenamiento local (IndexedDB).
 *
 * Cumple tres funciones:
 *  1. Registrar la carrera en curso punto a punto, para poder recuperarla si
 *     el navegador se cierra o la pestana se descarta.
 *  2. Guardar las carreras terminadas que aun no se han podido subir a
 *     Firebase, y reintentarlo cuando vuelva la conexion.
 *  3. Cachear las carreras ya sincronizadas para poder consultarlas sin red.
 *
 * Ninguna carrera se pierde nunca en silencio: el punto 1 se escribe mientras
 * se pedalea y el punto 2 es la red de seguridad al finalizar.
 */

const DB_NAME = 'cyclerun'
const DB_VERSION = 1

/** Estado persistido de la carrera en curso. */
export interface ActiveSession {
  /** clave fija: solo puede haber una carrera activa */
  id: 'current'
  rideId: string
  userId: string | null
  startTime: number
  status: RideStatus
  segment: number
  activity: ActivityType
  activities: ActivitySpan[]
  stats: RideStats
  updatedAt: number
}

interface StoredPoint extends RoutePoint {
  seq?: number
  rideId: string
}

interface CycleRunDB extends DBSchema {
  activeSession: { key: string; value: ActiveSession }
  activePoints: { key: number; value: StoredPoint; indexes: { rideId: string } }
  pendingRides: { key: string; value: PendingRide }
  ridesCache: { key: string; value: Ride; indexes: { startTime: number } }
  tracksCache: { key: string; value: { rideId: string; points: RoutePoint[] } }
}

let dbPromise: Promise<IDBPDatabase<CycleRunDB>> | null = null

function db(): Promise<IDBPDatabase<CycleRunDB>> {
  if (!dbPromise) {
    dbPromise = openDB<CycleRunDB>(DB_NAME, DB_VERSION, {
      upgrade(database) {
        if (!database.objectStoreNames.contains('activeSession')) {
          database.createObjectStore('activeSession', { keyPath: 'id' })
        }
        if (!database.objectStoreNames.contains('activePoints')) {
          const store = database.createObjectStore('activePoints', {
            keyPath: 'seq',
            autoIncrement: true,
          })
          store.createIndex('rideId', 'rideId')
        }
        if (!database.objectStoreNames.contains('pendingRides')) {
          database.createObjectStore('pendingRides', { keyPath: 'ride.id' })
        }
        if (!database.objectStoreNames.contains('ridesCache')) {
          const store = database.createObjectStore('ridesCache', { keyPath: 'id' })
          store.createIndex('startTime', 'startTime')
        }
        if (!database.objectStoreNames.contains('tracksCache')) {
          database.createObjectStore('tracksCache', { keyPath: 'rideId' })
        }
      },
    })
  }
  return dbPromise
}

export function isIndexedDbAvailable(): boolean {
  return typeof indexedDB !== 'undefined'
}

// --------------------------------------------------------------- carrera activa

export async function saveActiveSession(session: ActiveSession): Promise<void> {
  const database = await db()
  await database.put('activeSession', session)
}

export async function getActiveSession(): Promise<ActiveSession | null> {
  const database = await db()
  return (await database.get('activeSession', 'current')) ?? null
}

export async function appendActivePoints(rideId: string, points: RoutePoint[]): Promise<void> {
  if (points.length === 0) return
  const database = await db()
  const tx = database.transaction('activePoints', 'readwrite')
  for (const point of points) {
    void tx.store.add({ ...point, rideId })
  }
  await tx.done
}

export async function getActivePoints(rideId: string): Promise<RoutePoint[]> {
  const database = await db()
  const stored = await database.getAllFromIndex('activePoints', 'rideId', rideId)
  return stored
    .sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
    .map(({ seq: _seq, rideId: _rideId, ...point }) => point)
}

export async function clearActiveRide(rideId?: string): Promise<void> {
  const database = await db()
  await database.delete('activeSession', 'current')
  const tx = database.transaction('activePoints', 'readwrite')
  if (rideId) {
    const index = tx.store.index('rideId')
    let cursor = await index.openCursor(IDBKeyRange.only(rideId))
    while (cursor) {
      void cursor.delete()
      cursor = await cursor.continue()
    }
  } else {
    await tx.store.clear()
  }
  await tx.done
}

// ------------------------------------------------------- cola de sincronizacion

export async function savePendingRide(pending: PendingRide): Promise<void> {
  const database = await db()
  await database.put('pendingRides', pending)
}

export async function getPendingRides(): Promise<PendingRide[]> {
  const database = await db()
  const all = await database.getAll('pendingRides')
  return all.sort((a, b) => b.ride.startTime - a.ride.startTime)
}

export async function getPendingRide(rideId: string): Promise<PendingRide | null> {
  const database = await db()
  return (await database.get('pendingRides', rideId)) ?? null
}

export async function deletePendingRide(rideId: string): Promise<void> {
  const database = await db()
  await database.delete('pendingRides', rideId)
}

export async function countPendingRides(): Promise<number> {
  const database = await db()
  return database.count('pendingRides')
}

// ------------------------------------------------------------- cache de lectura

export async function cacheRides(rides: Ride[]): Promise<void> {
  const database = await db()
  const tx = database.transaction('ridesCache', 'readwrite')
  for (const ride of rides) void tx.store.put(ride)
  await tx.done
}

export async function getCachedRides(): Promise<Ride[]> {
  const database = await db()
  const all = await database.getAll('ridesCache')
  return all.sort((a, b) => b.startTime - a.startTime)
}

export async function cacheTrack(rideId: string, points: RoutePoint[]): Promise<void> {
  const database = await db()
  await database.put('tracksCache', { rideId, points })
}

export async function getCachedTrack(rideId: string): Promise<RoutePoint[] | null> {
  const database = await db()
  const entry = await database.get('tracksCache', rideId)
  return entry?.points ?? null
}

export async function removeCachedRide(rideId: string): Promise<void> {
  const database = await db()
  await database.delete('ridesCache', rideId)
  await database.delete('tracksCache', rideId)
}

/** Borra por completo el almacenamiento local (opcion de Configuracion). */
export async function wipeLocalData(): Promise<void> {
  const database = await db()
  await Promise.all([
    database.clear('activeSession'),
    database.clear('activePoints'),
    database.clear('pendingRides'),
    database.clear('ridesCache'),
    database.clear('tracksCache'),
  ])
}

export async function estimateUsage(): Promise<{ usage: number; quota: number } | null> {
  if (!navigator.storage?.estimate) return null
  const estimate = await navigator.storage.estimate()
  return { usage: estimate.usage ?? 0, quota: estimate.quota ?? 0 }
}
