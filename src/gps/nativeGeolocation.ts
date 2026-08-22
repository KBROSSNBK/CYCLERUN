import type { GeoFix } from '@/types'

/**
 * Geolocalizacion nativa (Android).
 *
 * En el navegador, apagar la pantalla congela la pagina y corta `watchPosition`:
 * es imposible registrar un recorrido con el telefono bloqueado. Dentro de la
 * aplicacion nativa se usa en su lugar un servicio en primer plano que sigue
 * recibiendo posiciones con la pantalla apagada, a cambio de una notificacion
 * permanente (la que Android exige para poder hacerlo).
 *
 * El plugin se carga bajo demanda: la version web no arrastra ni un byte de
 * Capacitor.
 */

interface NativeLocation {
  latitude: number
  longitude: number
  accuracy: number | null
  altitude: number | null
  altitudeAccuracy: number | null
  /** rumbo en grados */
  bearing: number | null
  /** m/s */
  speed: number | null
  /** epoch en ms */
  time: number | null
  simulated?: boolean
}

interface NativeError {
  code?: string
  message?: string
}

interface BackgroundGeolocationPlugin {
  addWatcher(
    options: {
      backgroundMessage?: string
      backgroundTitle?: string
      requestPermissions?: boolean
      stale?: boolean
      distanceFilter?: number
    },
    callback: (position?: NativeLocation, error?: NativeError) => void,
  ): Promise<string>
  removeWatcher(options: { id: string }): Promise<void>
  openSettings(): Promise<void>
}

/** true cuando la interfaz corre dentro de la aplicacion nativa. */
export function isNativeRuntime(): boolean {
  if (typeof window === 'undefined') return false
  const capacitor = (window as Window & { Capacitor?: { isNativePlatform?: () => boolean } })
    .Capacitor
  return capacitor?.isNativePlatform?.() === true
}

let plugin: BackgroundGeolocationPlugin | null = null

/**
 * El paquete del plugin solo contiene codigo nativo y tipos: no hay modulo JS
 * que importar, hay que registrarlo contra el puente de Capacitor. Se carga de
 * forma diferida para que la version web no arrastre Capacitor en su paquete.
 */
async function loadPlugin(): Promise<BackgroundGeolocationPlugin> {
  if (plugin) return plugin
  const { registerPlugin } = await import('@capacitor/core')
  plugin = registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation')
  return plugin
}

export interface NativeWatchHandlers {
  onFix: (fix: GeoFix) => void
  onError: (message: string, denied: boolean) => void
}

/**
 * Arranca el seguimiento nativo y devuelve la funcion para detenerlo.
 * `distanceFilter` en 0 deja que sea la aplicacion quien decida que descartar:
 * el filtrado por precision y por saltos ya vive en `gpsService`, y aplicar dos
 * criterios distintos daria resultados incoherentes entre plataformas.
 */
export async function startNativeWatch(
  handlers: NativeWatchHandlers,
): Promise<() => void> {
  const plugin = await loadPlugin()

  const id = await plugin.addWatcher(
    {
      backgroundTitle: 'CYCLERUN está registrando tu recorrido',
      backgroundMessage: 'Toca para volver a la aplicación.',
      requestPermissions: true,
      // No entregar la ultima posicion conocida al arrancar: seria un punto
      // viejo que falsearia el inicio del recorrido.
      stale: false,
      distanceFilter: 0,
    },
    (position, error) => {
      if (error) {
        handlers.onError(
          error.message ?? 'Error de ubicación',
          error.code === 'NOT_AUTHORIZED',
        )
        return
      }
      if (!position) return
      handlers.onFix({
        latitude: position.latitude,
        longitude: position.longitude,
        timestamp: position.time ?? Date.now(),
        accuracy: position.accuracy,
        altitude: position.altitude,
        speed: position.speed,
        heading: position.bearing,
      })
    },
  )

  return () => {
    void plugin.removeWatcher({ id }).catch(() => undefined)
  }
}

/** Abre los ajustes del sistema para conceder el permiso de ubicacion. */
export async function openNativeSettings(): Promise<void> {
  if (!isNativeRuntime()) return
  const plugin = await loadPlugin()
  await plugin.openSettings().catch(() => undefined)
}
