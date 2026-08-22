import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore'

/**
 * Inicializacion perezosa de Firebase.
 *
 * Si faltan variables de entorno la aplicacion NO falla: arranca en "modo
 * local" y guarda las carreras unicamente en IndexedDB. Asi el proyecto se
 * puede ejecutar y desplegar antes de tener el proyecto de Firebase creado,
 * y una configuracion incompleta nunca deja al usuario con una pantalla en
 * blanco a mitad de una carrera.
 */

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

const REQUIRED_KEYS = ['apiKey', 'authDomain', 'projectId', 'appId'] as const

export const firebaseEnabled: boolean = REQUIRED_KEYS.every(
  (key) => typeof config[key] === 'string' && config[key].length > 0,
)

export const missingFirebaseKeys: string[] = REQUIRED_KEYS.filter(
  (key) => !config[key],
).map((key) => `VITE_FIREBASE_${camelToSnake(key)}`)

let app: FirebaseApp | null = null
let authInstance: Auth | null = null
let dbInstance: Firestore | null = null

function ensureApp(): FirebaseApp {
  if (!firebaseEnabled) throw new Error('Firebase no está configurado')
  if (!app) app = initializeApp(config)
  return app
}

export function getFirebaseAuth(): Auth {
  if (!authInstance) authInstance = getAuth(ensureApp())
  return authInstance
}

export function getDb(): Firestore {
  if (!dbInstance) {
    // Cache persistente: permite leer el historial sin conexion y reintenta
    // las escrituras automaticamente cuando vuelve la red.
    dbInstance = initializeFirestore(ensureApp(), {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    })
  }
  return dbInstance
}

function camelToSnake(value: string): string {
  return value.replace(/([A-Z])/g, '_$1').toUpperCase()
}
