import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { loadRides, type RideListItem } from '@/services/ridesRepository'
import { getSyncState, subscribeSync, type SyncState } from '@/services/syncService'
import { useAuth } from './useAuth'

/** Historial completo del usuario (nube + pendientes + cache local). */
export function useRides(): {
  rides: RideListItem[]
  loading: boolean
  error: string | null
  reload: () => void
} {
  const { user, loading: authLoading } = useAuth()
  const [rides, setRides] = useState<RideListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)
  const sync = useSyncState()

  const uid = user?.uid ?? null

  useEffect(() => {
    if (authLoading) return
    let cancelled = false
    setLoading(true)
    loadRides(uid)
      .then((result) => {
        if (cancelled) return
        setRides(result)
        setError(null)
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // `sync.pending` fuerza la recarga cuando termina una subida.
  }, [uid, authLoading, nonce, sync.pending])

  const reload = useCallback(() => setNonce((value) => value + 1), [])

  return { rides, loading, error, reload }
}

export function useSyncState(): SyncState {
  return useSyncExternalStore(subscribeSync, getSyncState, getSyncState)
}
