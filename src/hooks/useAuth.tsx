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
import { ensureUserDoc } from '@/firebase/rides'
import {
  observeAuth,
  signInWithGoogle,
  signOut as firebaseSignOut,
  type AppUser,
} from '@/firebase/auth'
import { rideEngine } from '@/services/rideEngine'
import { setSyncUser } from '@/services/syncService'

/**
 * Sesion del usuario.
 *
 * `mode` distingue tres situaciones que la interfaz debe tratar distinto:
 *  - "firebase": hay proyecto configurado y sesion iniciada
 *  - "anonymous": hay proyecto pero todavia no se ha iniciado sesion
 *  - "local": no hay proyecto configurado; la app funciona solo en el
 *    dispositivo y no se pide iniciar sesion
 */
export type AuthMode = 'firebase' | 'anonymous' | 'local'

interface AuthContextValue {
  user: AppUser | null
  loading: boolean
  mode: AuthMode
  error: string | null
  signIn: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null)
  const [loading, setLoading] = useState(firebaseEnabled)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!firebaseEnabled) {
      rideEngine.setUser(null)
      setSyncUser(null)
      return
    }
    return observeAuth((nextUser) => {
      setUser(nextUser)
      setLoading(false)
      rideEngine.setUser(nextUser?.uid ?? null)
      setSyncUser(nextUser?.uid ?? null)
      if (nextUser) {
        void ensureUserDoc(nextUser.uid, {
          displayName: nextUser.displayName,
          email: nextUser.email,
          photoURL: nextUser.photoURL,
        }).catch(() => undefined)
      }
    })
  }, [])

  const signIn = useCallback(async () => {
    setError(null)
    setLoading(true)
    try {
      await signInWithGoogle()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  const signOut = useCallback(async () => {
    await firebaseSignOut()
    setUser(null)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      error,
      mode: !firebaseEnabled ? 'local' : user ? 'firebase' : 'anonymous',
      signIn,
      signOut,
    }),
    [user, loading, error, signIn, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return context
}
