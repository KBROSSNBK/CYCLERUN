import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  writeBatch,
} from 'firebase/firestore'
import type { AppUser } from './auth'
import { getDb } from './app'
import type { Friend, FriendRequest, PublicProfile } from '@/types'

/**
 * Amigos.
 *
 * Modelo de datos:
 *   users/{uid}                          -> perfil (incluye friendCode)
 *   users/{uid}/friends/{friendUid}      -> amistad aceptada (bidireccional)
 *   users/{uid}/friendRequests/{fromUid} -> solicitudes recibidas
 *   friendCodes/{code}                   -> { uid }  indice publico por codigo
 *   emailIndex/{hash}                    -> { uid }  indice por email (SHA-256)
 *
 * Nadie puede listar el directorio de usuarios: para encontrar a alguien hay
 * que conocer su codigo o su correo exacto, y aun asi solo se crea una
 * solicitud que la otra persona debe aceptar. Los indices no guardan ningun
 * dato personal, solo el uid al que apuntan.
 */

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // sin caracteres ambiguos
const CODE_LENGTH = 6

// ------------------------------------------------------------------- indices

/** Codigo corto y estable derivado del uid. */
async function deriveCode(uid: string, salt = 0): Promise<string> {
  const digest = await sha256(`cyclerun:${uid}:${salt}`)
  let code = ''
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[digest[i] % CODE_ALPHABET.length]
  }
  return code
}

async function sha256(value: string): Promise<Uint8Array> {
  const data = new TextEncoder().encode(value)
  const buffer = await crypto.subtle.digest('SHA-256', data)
  return new Uint8Array(buffer)
}

async function hashEmail(email: string): Promise<string> {
  const bytes = await sha256(`cyclerun:email:${email.trim().toLowerCase()}`)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Registra al usuario en los indices de busqueda y devuelve su codigo.
 * Se ejecuta tras iniciar sesion; si el codigo ya esta ocupado por otro
 * usuario se prueba con una variante.
 */
export async function ensureDirectoryEntry(user: AppUser): Promise<string> {
  const db = getDb()

  let code = await deriveCode(user.uid)
  for (let salt = 1; salt <= 5; salt++) {
    const snapshot = await getDoc(doc(db, 'friendCodes', code))
    if (!snapshot.exists() || snapshot.data()?.uid === user.uid) break
    code = await deriveCode(user.uid, salt)
  }

  await setDoc(doc(db, 'friendCodes', code), { uid: user.uid }, { merge: true })
  await setDoc(
    doc(db, 'users', user.uid),
    { friendCode: code, updatedAt: serverTimestamp() },
    { merge: true },
  )

  if (user.email) {
    const hash = await hashEmail(user.email)
    // `merge` deja el documento intacto si ya apunta a este mismo usuario.
    await setDoc(doc(db, 'emailIndex', hash), { uid: user.uid }, { merge: true }).catch(() => {
      // Si el hash ya pertenece a otra cuenta las reglas rechazan la escritura;
      // el codigo de amistad sigue funcionando como alternativa.
    })
  }

  return code
}

export async function getFriendCode(uid: string): Promise<string | null> {
  const snapshot = await getDoc(doc(getDb(), 'users', uid))
  return (snapshot.data()?.friendCode as string | undefined) ?? null
}

// ------------------------------------------------------------------ busqueda

export async function findUidByCode(code: string): Promise<string | null> {
  const normalized = code.trim().toUpperCase().replace(/\s+/g, '')
  if (normalized.length !== CODE_LENGTH) return null
  const snapshot = await getDoc(doc(getDb(), 'friendCodes', normalized))
  return (snapshot.data()?.uid as string | undefined) ?? null
}

export async function findUidByEmail(email: string): Promise<string | null> {
  if (!email.includes('@')) return null
  const snapshot = await getDoc(doc(getDb(), 'emailIndex', await hashEmail(email)))
  return (snapshot.data()?.uid as string | undefined) ?? null
}

// --------------------------------------------------------------- solicitudes

export class FriendError extends Error {}

/** Envia una solicitud dejando el perfil del emisor en la bandeja del destinatario. */
export async function sendFriendRequest(from: AppUser, targetUid: string): Promise<void> {
  if (targetUid === from.uid) throw new FriendError('Ese es tu propio código.')

  const db = getDb()
  const alreadyFriends = await getDoc(doc(db, 'users', from.uid, 'friends', targetUid))
  if (alreadyFriends.exists()) throw new FriendError('Ya sois amigos.')

  await setDoc(doc(db, 'users', targetUid, 'friendRequests', from.uid), {
    fromUid: from.uid,
    displayName: from.displayName,
    photoURL: from.photoURL,
    email: from.email,
    createdAt: Date.now(),
  })
}

export function watchFriendRequests(
  uid: string,
  onChange: (requests: FriendRequest[]) => void,
): () => void {
  return onSnapshot(
    collection(getDb(), 'users', uid, 'friendRequests'),
    (snapshot) => {
      onChange(
        snapshot.docs.map((snap) => ({
          uid: snap.id,
          fromUid: snap.id,
          displayName: (snap.data().displayName as string | null) ?? null,
          photoURL: (snap.data().photoURL as string | null) ?? null,
          email: (snap.data().email as string | null) ?? null,
          createdAt: (snap.data().createdAt as number) ?? 0,
        })),
      )
    },
    () => onChange([]),
  )
}

/**
 * Acepta la solicitud escribiendo la amistad en las dos listas.
 * Las reglas permiten escribir en la lista del otro usuario precisamente
 * porque existe su solicitud pendiente.
 */
export async function acceptFriendRequest(me: AppUser, request: FriendRequest): Promise<void> {
  const db = getDb()
  const now = Date.now()
  const batch = writeBatch(db)

  batch.set(doc(db, 'users', me.uid, 'friends', request.fromUid), {
    uid: request.fromUid,
    displayName: request.displayName,
    photoURL: request.photoURL,
    since: now,
  })
  batch.set(doc(db, 'users', request.fromUid, 'friends', me.uid), {
    uid: me.uid,
    displayName: me.displayName,
    photoURL: me.photoURL,
    since: now,
  })
  batch.delete(doc(db, 'users', me.uid, 'friendRequests', request.fromUid))

  await batch.commit()
}

export async function rejectFriendRequest(uid: string, fromUid: string): Promise<void> {
  await deleteDoc(doc(getDb(), 'users', uid, 'friendRequests', fromUid))
}

// ------------------------------------------------------------ lista de amigos

export function watchFriends(uid: string, onChange: (friends: Friend[]) => void): () => void {
  return onSnapshot(
    collection(getDb(), 'users', uid, 'friends'),
    (snapshot) => {
      onChange(
        snapshot.docs
          .map((snap) => ({
            uid: snap.id,
            displayName: (snap.data().displayName as string | null) ?? null,
            photoURL: (snap.data().photoURL as string | null) ?? null,
            since: (snap.data().since as number) ?? 0,
            shareLocation: (snap.data().shareLocation as boolean | undefined) ?? true,
          }))
          .sort((a, b) => (a.displayName ?? '').localeCompare(b.displayName ?? '')),
      )
    },
    () => onChange([]),
  )
}

export async function listFriends(uid: string): Promise<Friend[]> {
  const snapshot = await getDocs(collection(getDb(), 'users', uid, 'friends'))
  return snapshot.docs.map((snap) => ({
    uid: snap.id,
    displayName: (snap.data().displayName as string | null) ?? null,
    photoURL: (snap.data().photoURL as string | null) ?? null,
    since: (snap.data().since as number) ?? 0,
    shareLocation: (snap.data().shareLocation as boolean | undefined) ?? true,
  }))
}

/**
 * Decide si un amigo concreto puede ver mi ubicacion en vivo.
 * Se guarda en mi propia lista de amigos, que solo yo puedo escribir: el otro
 * no puede concederse permiso a si mismo.
 */
export async function setFriendVisibility(
  uid: string,
  friendUid: string,
  allowed: boolean,
): Promise<void> {
  await setDoc(
    doc(getDb(), 'users', uid, 'friends', friendUid),
    { shareLocation: allowed },
    { merge: true },
  )
}

/** Elimina la amistad por ambos lados; cualquiera de los dos puede hacerlo. */
export async function removeFriend(uid: string, friendUid: string): Promise<void> {
  const db = getDb()
  await deleteDoc(doc(db, 'users', uid, 'friends', friendUid))
  await deleteDoc(doc(db, 'users', friendUid, 'friends', uid)).catch(() => {
    // Si las reglas lo impidieran, el otro usuario dejara de verte igualmente
    // porque tu documento en vivo ya no le incluira en `visibleTo`.
  })
}

export function profileOf(user: AppUser): PublicProfile {
  return { uid: user.uid, displayName: user.displayName, photoURL: user.photoURL }
}
