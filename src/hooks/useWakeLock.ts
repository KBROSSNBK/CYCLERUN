import { useEffect, useRef } from 'react'

type WakeLockSentinelLike = { release: () => Promise<void>; released: boolean }

/**
 * Impide que la pantalla se apague mientras se registra una carrera.
 * Solo esta disponible en navegadores con Screen Wake Lock API (Chrome,
 * Edge y Safari 16.4+). Donde no exista, simplemente no hace nada.
 * El bloqueo se vuelve a pedir al regresar a la pestana, porque el sistema lo
 * libera automaticamente al pasar a segundo plano.
 */
export function useWakeLock(enabled: boolean): void {
  const sentinel = useRef<WakeLockSentinelLike | null>(null)

  useEffect(() => {
    if (!enabled) return
    const wakeLock = (navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> } }).wakeLock
    if (!wakeLock) return

    let cancelled = false

    const request = async () => {
      try {
        const lock = await wakeLock.request('screen')
        if (cancelled) {
          void lock.release()
          return
        }
        sentinel.current = lock
      } catch {
        // El sistema puede rechazarlo (bateria baja); no es un error critico.
      }
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && sentinel.current?.released !== false) {
        void request()
      }
    }

    void request()
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', handleVisibility)
      void sentinel.current?.release().catch(() => undefined)
      sentinel.current = null
    }
  }, [enabled])
}
