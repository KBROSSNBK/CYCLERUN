import { useCallback, useEffect, useState } from 'react'
import { rideEngine } from '@/services/rideEngine'
import * as localStore from '@/storage/localStore'
import type { ActiveSession } from '@/storage/localStore'

/**
 * Recuperacion de una carrera interrumpida.
 *
 * Si la pestana se cierra a mitad de una carrera, en IndexedDB queda la sesion
 * activa con todos sus puntos. Al volver a abrir la aplicacion se ofrece
 * retomarla o cerrarla y guardarla; nunca se descarta sin preguntar.
 */
export function useRideRecovery(): {
  session: ActiveSession | null
  points: number
  restore: () => void
  finish: () => Promise<string | null>
  discard: () => Promise<void>
  dismiss: () => void
} {
  const [session, setSession] = useState<ActiveSession | null>(null)
  const [points, setPoints] = useState(0)

  useEffect(() => {
    let cancelled = false
    // Si ya hay una carrera viva en memoria no hay nada que recuperar.
    if (rideEngine.isActive()) return

    void localStore
      .getActiveSession()
      .then(async (found) => {
        if (cancelled || !found) return
        const stored = await localStore.getActivePoints(found.rideId)
        if (cancelled) return
        setSession(found)
        setPoints(stored.length)
      })
      .catch(() => undefined)

    return () => {
      cancelled = true
    }
  }, [])

  const restore = useCallback(() => {
    if (!session) return
    void localStore.getActivePoints(session.rideId).then((stored) => {
      rideEngine.restore(session, stored)
      setSession(null)
    })
  }, [session])

  const finish = useCallback(async () => {
    if (!session) return null
    const stored = await localStore.getActivePoints(session.rideId)
    rideEngine.restore(session, stored)
    const ride = await rideEngine.finishRestored()
    rideEngine.reset()
    setSession(null)
    return ride.id
  }, [session])

  const discard = useCallback(async () => {
    if (!session) return
    await localStore.clearActiveRide(session.rideId)
    setSession(null)
  }, [session])

  const dismiss = useCallback(() => setSession(null), [])

  return { session, points, restore, finish, discard, dismiss }
}
