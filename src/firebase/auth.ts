import {
  GoogleAuthProvider,
  browserLocalPersistence,
  getRedirectResult,
  onAuthStateChanged,
  setPersistence,
  signInWithPopup,
  signInWithRedirect,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth'
import { firebaseEnabled, getFirebaseAuth } from './app'

/**
 * Autenticacion con Google.
 *
 * Se intenta primero con ventana emergente porque conserva el estado de la
 * aplicacion; si el navegador la bloquea (habitual en Safari de iOS o dentro
 * de una PWA instalada) se recurre a la redireccion.
 */

export interface AppUser {
  uid: string
  displayName: string | null
  email: string | null
  photoURL: string | null
}

export function toAppUser(user: User | null): AppUser | null {
  if (!user) return null
  return {
    uid: user.uid,
    displayName: user.displayName,
    email: user.email,
    photoURL: user.photoURL,
  }
}

export function observeAuth(callback: (user: AppUser | null) => void): () => void {
  if (!firebaseEnabled) {
    callback(null)
    return () => {}
  }
  const auth = getFirebaseAuth()
  // Recoge la sesion cuando se vuelve de un inicio por redireccion.
  void getRedirectResult(auth).catch(() => undefined)
  return onAuthStateChanged(auth, (user) => callback(toAppUser(user)))
}

export async function signInWithGoogle(): Promise<AppUser | null> {
  if (!firebaseEnabled) throw new Error('Firebase no está configurado')
  const auth = getFirebaseAuth()
  const provider = new GoogleAuthProvider()
  provider.setCustomParameters({ prompt: 'select_account' })

  await setPersistence(auth, browserLocalPersistence)

  try {
    const credential = await signInWithPopup(auth, provider)
    return toAppUser(credential.user)
  } catch (error) {
    if (shouldFallbackToRedirect(error)) {
      await signInWithRedirect(auth, provider)
      return null // la app se recarga y `observeAuth` recibe el usuario
    }
    throw new Error(describeAuthError(error))
  }
}

export async function signOut(): Promise<void> {
  if (!firebaseEnabled) return
  await firebaseSignOut(getFirebaseAuth())
}

function shouldFallbackToRedirect(error: unknown): boolean {
  const code = (error as { code?: string })?.code ?? ''
  return (
    code === 'auth/popup-blocked' ||
    code === 'auth/operation-not-supported-in-this-environment' ||
    code === 'auth/cancelled-popup-request'
  )
}

export function describeAuthError(error: unknown): string {
  const code = (error as { code?: string })?.code ?? ''
  switch (code) {
    case 'auth/popup-closed-by-user':
      return 'Has cerrado la ventana de inicio de sesión.'
    case 'auth/network-request-failed':
      return 'Sin conexión: no se ha podido contactar con Firebase.'
    case 'auth/unauthorized-domain':
      return 'Este dominio no está autorizado en Firebase Authentication. Añádelo en Authentication → Settings → Authorized domains.'
    case 'auth/operation-not-allowed':
      return 'El proveedor de Google no está habilitado en tu proyecto de Firebase.'
    default:
      return (error as Error)?.message ?? 'No se ha podido iniciar sesión.'
  }
}
