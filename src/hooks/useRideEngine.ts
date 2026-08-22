import { useEffect, useSyncExternalStore } from 'react'
import { rideEngine } from '@/services/rideEngine'
import type { RideState } from '@/types'
import { useSettings } from './useSettings'

/**
 * Estado en vivo del motor de carrera.
 * Ademas mantiene el motor al dia con la configuracion del usuario, para que
 * cambiar un umbral surta efecto sin recargar.
 */
export function useRideState(): RideState {
  const { settings } = useSettings()

  useEffect(() => {
    rideEngine.configure(settings)
  }, [settings])

  return useSyncExternalStore(rideEngine.subscribe, rideEngine.getSnapshot, rideEngine.getSnapshot)
}
