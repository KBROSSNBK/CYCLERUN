import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit as fsLimit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  writeBatch,
} from 'firebase/firestore'
import type { Ride, RideWithTrack, RoutePoint } from '@/types'
import { getDb } from './app'
import { decodeTrack, encodeTrack, type TrackChunk } from './trackCodec'

/**
 * Acceso a Firestore.
 *
 * Modelo de datos:
 *   users/{uid}                        -> perfil minimo
 *   users/{uid}/rides/{rideId}         -> resumen de la carrera + polilinea previa
 *   users/{uid}/rides/{rideId}/track/* -> recorrido completo, troceado
 *
 * El resumen se lee en listados y estadisticas; el track solo al abrir el
 * reporte de una carrera concreta, de modo que el historial es barato.
 */

function ridesCollection(uid: string) {
  return collection(getDb(), 'users', uid, 'rides')
}

function rideDoc(uid: string, rideId: string) {
  return doc(getDb(), 'users', uid, 'rides', rideId)
}

function trackCollection(uid: string, rideId: string) {
  return collection(getDb(), 'users', uid, 'rides', rideId, 'track')
}

/** Crea o actualiza el documento de perfil del usuario. */
export async function ensureUserDoc(
  uid: string,
  profile: { displayName: string | null; email: string | null; photoURL: string | null },
): Promise<void> {
  await setDoc(
    doc(getDb(), 'users', uid),
    { ...profile, updatedAt: serverTimestamp() },
    { merge: true },
  )
}

/**
 * Guarda una carrera completa (resumen + track) en una unica escritura por
 * lotes: o se guarda todo o no se guarda nada.
 */
export async function saveRide(uid: string, ride: Ride, points: RoutePoint[]): Promise<void> {
  const db = getDb()
  const chunks = encodeTrack(points, ride.startTime)
  const batch = writeBatch(db)

  const { id, ...rideData } = ride
  batch.set(rideDoc(uid, id), {
    ...rideData,
    userId: uid,
    trackChunks: chunks.length,
    schemaVersion: 1,
  })

  for (const chunk of chunks) {
    batch.set(doc(trackCollection(uid, id), String(chunk.index).padStart(4, '0')), chunk)
  }

  await batch.commit()
}

export async function listRides(uid: string, max = 200): Promise<Ride[]> {
  const snapshot = await getDocs(
    query(ridesCollection(uid), orderBy('startTime', 'desc'), fsLimit(max)),
  )
  return snapshot.docs.map((snap) => ({ id: snap.id, ...(snap.data() as Omit<Ride, 'id'>) }))
}

export async function getRide(uid: string, rideId: string): Promise<Ride | null> {
  const snapshot = await getDoc(rideDoc(uid, rideId))
  if (!snapshot.exists()) return null
  return { id: snapshot.id, ...(snapshot.data() as Omit<Ride, 'id'>) }
}

export async function getTrack(uid: string, ride: Ride): Promise<RoutePoint[]> {
  const snapshot = await getDocs(trackCollection(uid, ride.id))
  const chunks = snapshot.docs.map((snap) => snap.data() as TrackChunk)
  return decodeTrack(chunks, ride.startTime)
}

export async function getRideWithTrack(
  uid: string,
  rideId: string,
): Promise<RideWithTrack | null> {
  const ride = await getRide(uid, rideId)
  if (!ride) return null
  const points = await getTrack(uid, ride)
  return { ...ride, points }
}

export async function deleteRide(uid: string, rideId: string): Promise<void> {
  const db = getDb()
  const trackSnapshot = await getDocs(trackCollection(uid, rideId))
  // Los lotes admiten 500 operaciones; el track se borra en tandas.
  const docs = trackSnapshot.docs
  for (let i = 0; i < docs.length; i += 400) {
    const batch = writeBatch(db)
    for (const snap of docs.slice(i, i + 400)) batch.delete(snap.ref)
    await batch.commit()
  }
  await deleteDoc(rideDoc(uid, rideId))
}

export async function renameRide(uid: string, rideId: string, title: string): Promise<void> {
  await setDoc(rideDoc(uid, rideId), { title }, { merge: true })
}
