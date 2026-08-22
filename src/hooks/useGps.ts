import { useEffect, useState } from 'react'
import { gpsService } from '@/gps/gpsService'
import type { GpsState } from '@/types'

/** Estado del receptor GPS (precision, calidad de senal, ultimo fix). */
export function useGpsState(): GpsState {
  const [state, setState] = useState<GpsState>(() => gpsService.getState())
  useEffect(() => gpsService.onState(setState), [])
  return state
}

/**
 * Mantiene el GPS encendido mientras el componente este montado.
 * Al desmontarse solo lo apaga si no hay una carrera en curso: se lo indica el
 * parametro `keepAlive`.
 */
export function useGpsTracking(active: boolean, keepAlive = false): void {
  useEffect(() => {
    if (!active) return
    gpsService.start()
    return () => {
      if (!keepAlive) gpsService.stop()
    }
  }, [active, keepAlive])
}
