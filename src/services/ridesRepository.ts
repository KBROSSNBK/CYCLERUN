import { firebaseEnabled } from '@/firebase/app'
import * as remote from '@/firebase/rides'
import * as localStore from '@/storage/localStore'
import type { Ride, RideWithTrack } from '@/types'

/**
 * Punto unico de lectura de carreras para la interfaz.
 *
 * Combina tres fuentes y esconde esa complejidad al resto de la aplicacion:
 *  - Firestore, cuando hay sesion y conexion
 *  - la cache local de lo ya sincronizado, para consultar sin red
 *  - la cola de carreras pendientes de subir, que tambien deben verse
 *
 * Las pendientes se marcan con `synced: false` para poder indicarlo en la
 * interfaz.
 */

export interface RideListItem extends Ride {
  synced: boolean
}

export async function loadRides(uid: string | null): Promise<RideListItem[]> {
  const pending = await safe(localStore.getPendingRides, [])
  const pendingRides: RideListItem[] = pending.map((item) => ({
    ...item.ride,
    synced: false,
  }))

  let remoteRides: RideListItem[] = []
  if (uid && firebaseEnabled) {
    try {
      const rides = await remote.listRides(uid)
      remoteRides = rides.map((ride) => ({ ...ride, synced: true }))
      await localStore.cacheRides(rides)
    } catch {
      // Sin conexion o con error: se cae a la cache local.
      remoteRides = (await safe(localStore.getCachedRides, [])).map((ride) => ({
        ...ride,
        synced: true,
      }))
    }
  } else {
    remoteRides = (await safe(localStore.getCachedRides, [])).map((ride) => ({
      ...ride,
      synced: true,
    }))
  }

  const byId = new Map<string, RideListItem>()
  for (const ride of remoteRides) byId.set(ride.id, ride)
  // Una carrera pendiente prevalece sobre su posible copia cacheada.
  for (const ride of pendingRides) byId.set(ride.id, ride)

  return [...byId.values()].sort((a, b) => b.startTime - a.startTime)
}

export async function loadRide(
  uid: string | null,
  rideId: string,
): Promise<(RideWithTrack & { synced: boolean }) | null> {
  const pending = await safe(() => localStore.getPendingRide(rideId), null)
  if (pending) return { ...pending.ride, points: pending.points, synced: false }

  const cachedTrack = await safe(() => localStore.getCachedTrack(rideId), null)
  const cachedRides = await safe(localStore.getCachedRides, [])
  const cachedRide = cachedRides.find((ride) => ride.id === rideId)

  if (uid && firebaseEnabled) {
    try {
      const result = await remote.getRideWithTrack(uid, rideId)
      if (result) {
        await localStore.cacheRides([stripPoints(result)])
        await localStore.cacheTrack(result.id, result.points)
        return { ...result, synced: true }
      }
    } catch {
      // se intenta con la cache
    }
  }

  if (cachedRide && cachedTrack) return { ...cachedRide, points: cachedTrack, synced: true }
  if (cachedRide) return { ...cachedRide, points: [], synced: true }
  return null
}

export async function deleteRide(uid: string | null, rideId: string): Promise<void> {
  const pending = await safe(() => localStore.getPendingRide(rideId), null)
  if (pending) await localStore.deletePendingRide(rideId)
  await localStore.removeCachedRide(rideId)
  if (uid && firebaseEnabled) {
    try {
      await remote.deleteRide(uid, rideId)
    } catch (error) {
      throw new Error(
        `La carrera se ha borrado del dispositivo, pero no de la nube: ${
          (error as Error)?.message ?? 'error desconocido'
        }`,
      )
    }
  }
}

export async function renameRide(
  uid: string | null,
  rideId: string,
  title: string,
): Promise<void> {
  const pending = await safe(() => localStore.getPendingRide(rideId), null)
  if (pending) {
    await localStore.savePendingRide({ ...pending, ride: { ...pending.ride, title } })
    return
  }
  const cached = (await safe(localStore.getCachedRides, [])).find((ride) => ride.id === rideId)
  if (cached) await localStore.cacheRides([{ ...cached, title }])
  if (uid && firebaseEnabled) await remote.renameRide(uid, rideId, title)
}

function stripPoints(ride: RideWithTrack): Ride {
  const { points: _points, ...rest } = ride
  return rest
}

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn()
  } catch {
    return fallback
  }
}
