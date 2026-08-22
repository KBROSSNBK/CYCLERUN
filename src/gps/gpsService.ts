import type { AppSettings } from '@/config/defaults'
import { DEFAULT_SETTINGS } from '@/config/defaults'
import type { GeoFix, GpsState, GpsStatus } from '@/types'
import { haversine } from '@/utils/geo'
import { isNativeRuntime, startNativeWatch } from './nativeGeolocation'
import { isGeolocationSupported, isSecureContext } from './permissions'

/**
 * Servicio GPS.
 *
 * Responsabilidades (y solo estas: aqui no hay nada de la carrera ni de la UI):
 *  - arrancar / detener `navigator.geolocation.watchPosition`
 *  - descartar lecturas imprecisas
 *  - descartar saltos de posicion fisicamente imposibles en bicicleta
 *  - calcular una velocidad instantanea suavizada
 *  - detectar la perdida de senal
 *  - publicar los fixes aceptados y el estado del receptor
 *
 * No se simulan posiciones en ningun caso: los datos proceden siempre del
 * receptor del dispositivo.
 */

/** Fix aceptado, con los valores derivados que necesita el motor de carrera. */
export interface AcceptedFix {
  fix: GeoFix
  /** velocidad suavizada, m/s */
  speed: number
  /** distancia respecto al fix aceptado anterior, en metros */
  delta: number
  /** tiempo transcurrido desde el fix anterior, en ms */
  dt: number
  /** true si el desplazamiento supera el umbral anti-jitter */
  moved: boolean
}

export type RejectionReason = 'accuracy' | 'jump' | 'throttled' | 'duplicate'

type FixListener = (accepted: AcceptedFix) => void
type StateListener = (state: GpsState) => void
type RejectionListener = (reason: RejectionReason, fix: GeoFix) => void

type GpsOptions = Pick<
  AppSettings,
  | 'goodAccuracy'
  | 'maxAccuracy'
  | 'maxPlausibleSpeed'
  | 'speedSmoothingWindow'
  | 'updateInterval'
  | 'signalLostAfter'
  | 'minMoveDistance'
>

const STATUS_MESSAGES: Record<GpsStatus, string> = {
  unsupported: 'Este navegador no permite geolocalización',
  denied: 'Permiso de ubicación denegado',
  unavailable: 'Ubicación no disponible',
  searching: 'Buscando señal GPS…',
  ready: 'GPS listo',
  weak: 'GPS débil',
  lost: 'Señal GPS perdida',
}

class GpsService {
  private options: GpsOptions = pickOptions(DEFAULT_SETTINGS)
  private watchId: number | null = null
  /** funcion para detener el seguimiento nativo, si esta en uso */
  private nativeStop: (() => void) | null = null
  private startingNative = false
  private watchdog: ReturnType<typeof setInterval> | null = null

  private fixListeners = new Set<FixListener>()
  private stateListeners = new Set<StateListener>()
  private rejectionListeners = new Set<RejectionListener>()

  private lastAccepted: GeoFix | null = null
  private speedWindow: number[] = []
  private smoothedSpeed = 0

  private state: GpsState = {
    status: 'searching',
    accuracy: null,
    lastFix: null,
    lastFixAt: null,
    rejected: 0,
    message: STATUS_MESSAGES.searching,
  }

  // ---------------------------------------------------------------- lifecycle

  isRunning(): boolean {
    return this.watchId !== null || this.nativeStop !== null
  }

  configure(settings: AppSettings): void {
    this.options = pickOptions(settings)
  }

  /**
   * Arranca el seguimiento. Es idempotente: llamarlo dos veces no duplica el
   * watch, de modo que varias pantallas pueden pedirlo sin coordinarse.
   *
   * Dentro de la aplicacion nativa se usa el servicio en primer plano, que
   * sigue entregando posiciones con la pantalla apagada; en el navegador, la
   * Geolocation API, que se detiene al bloquear el telefono.
   */
  start(): void {
    if (this.isRunning() || this.startingNative) return

    if (isNativeRuntime()) {
      this.startNative()
      return
    }

    if (!isGeolocationSupported()) {
      this.setStatus('unsupported')
      return
    }
    if (!isSecureContext()) {
      this.setStatus('unavailable', 'La geolocalización requiere HTTPS')
      return
    }

    this.setStatus('searching')
    this.watchId = navigator.geolocation.watchPosition(
      (position) => this.handleFix(toFix(position)),
      (error) => this.handleError(error),
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 30000,
      },
    )

    this.watchdog = setInterval(() => this.checkSignal(), 2000)
  }

  private startNative(): void {
    this.startingNative = true
    this.setStatus('searching')
    this.watchdog = setInterval(() => this.checkSignal(), 2000)

    void startNativeWatch({
      onFix: (fix) => this.handleFix(fix),
      onError: (message, denied) => {
        if (denied) {
          this.setStatus('denied')
          this.stop()
        } else {
          this.setStatus('unavailable', message)
        }
      },
    })
      .then((stopWatch) => {
        this.nativeStop = stopWatch
      })
      .catch((error: Error) => {
        this.setStatus('unavailable', error?.message ?? 'No se ha podido iniciar el GPS')
      })
      .finally(() => {
        this.startingNative = false
      })
  }

  stop(): void {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId)
      this.watchId = null
    }
    if (this.nativeStop) {
      this.nativeStop()
      this.nativeStop = null
    }
    if (this.watchdog !== null) {
      clearInterval(this.watchdog)
      this.watchdog = null
    }
  }

  /** Limpia el historial de suavizado; se llama al iniciar una carrera. */
  reset(): void {
    this.lastAccepted = null
    this.speedWindow = []
    this.smoothedSpeed = 0
    this.publish({ rejected: 0 })
  }

  // ------------------------------------------------------------ subscriptions

  onFix(listener: FixListener): () => void {
    this.fixListeners.add(listener)
    return () => this.fixListeners.delete(listener)
  }

  onState(listener: StateListener): () => void {
    this.stateListeners.add(listener)
    return () => this.stateListeners.delete(listener)
  }

  onRejection(listener: RejectionListener): () => void {
    this.rejectionListeners.add(listener)
    return () => this.rejectionListeners.delete(listener)
  }

  getState = (): GpsState => this.state

  /** Una unica lectura, util para centrar el mapa antes de empezar. */
  getCurrentFix(timeout = 15000): Promise<GeoFix> {
    return new Promise((resolve, reject) => {
      if (!isGeolocationSupported()) {
        reject(new Error('Geolocalización no disponible'))
        return
      }
      navigator.geolocation.getCurrentPosition(
        (position) => resolve(toFix(position)),
        (error) => reject(new Error(describeError(error))),
        { enableHighAccuracy: true, maximumAge: 0, timeout },
      )
    })
  }

  // -------------------------------------------------------------- procesamiento

  /** Procesa una posicion, venga del navegador o del servicio nativo. */
  private handleFix(fix: GeoFix): void {
    const now = Date.now()
    const {
      maxAccuracy,
      goodAccuracy,
      updateInterval,
      maxPlausibleSpeed,
      minMoveDistance,
    } = this.options

    // 1) Precision insuficiente -> lectura inservible.
    if (fix.accuracy !== null && fix.accuracy > maxAccuracy) {
      this.reject('accuracy', fix)
      this.publish({
        accuracy: fix.accuracy,
        status: this.state.lastFix ? 'weak' : 'searching',
        message: this.state.lastFix ? STATUS_MESSAGES.weak : STATUS_MESSAGES.searching,
      })
      return
    }

    const previous = this.lastAccepted

    if (previous) {
      const dt = fix.timestamp - previous.timestamp

      // 2) Lecturas repetidas o con reloj hacia atras.
      if (dt <= 0) {
        this.reject('duplicate', fix)
        return
      }

      // 3) Limitacion de frecuencia segun el intervalo configurado.
      if (dt < updateInterval) {
        this.rejectionListeners.forEach((cb) => cb('throttled', fix))
        return
      }

      const delta = haversine(previous.latitude, previous.longitude, fix.latitude, fix.longitude)
      const impliedSpeed = delta / (dt / 1000) // m/s

      // 4) Salto GPS: desplazamiento imposible para una bicicleta.
      if (impliedSpeed * 3.6 > maxPlausibleSpeed) {
        this.reject('jump', fix)
        this.publish({ status: 'weak', message: STATUS_MESSAGES.weak, accuracy: fix.accuracy })
        return
      }

      const speed = this.computeSpeed(fix, impliedSpeed)
      const moved = delta >= minMoveDistance

      this.lastAccepted = fix
      this.publish({
        status: fix.accuracy !== null && fix.accuracy > goodAccuracy ? 'weak' : 'ready',
        accuracy: fix.accuracy,
        lastFix: fix,
        lastFixAt: now,
      })
      this.emitFix({ fix, speed, delta, dt, moved })
      return
    }

    // Primer fix aceptado de la sesion.
    this.lastAccepted = fix
    const speed = this.computeSpeed(fix, null)
    this.publish({
      status: fix.accuracy !== null && fix.accuracy > goodAccuracy ? 'weak' : 'ready',
      accuracy: fix.accuracy,
      lastFix: fix,
      lastFixAt: now,
    })
    this.emitFix({ fix, speed, delta: 0, dt: 0, moved: false })
  }

  /**
   * Velocidad instantanea suavizada.
   *
   * La velocidad que informa el receptor procede del efecto Doppler y suele ser
   * mas estable que derivarla de dos posiciones, pero no es fiable en todos los
   * dispositivos: hay navegadores que devuelven siempre 0 o null aunque el
   * usuario se este moviendo. Por eso se contrasta con la velocidad implicita
   * en el desplazamiento y, cuando discrepan, manda el desplazamiento (que es
   * ademas lo que alimenta la distancia, de modo que ambas magnitudes nunca se
   * contradicen).
   *
   * El valor resultante pasa por un filtro de mediana + media recortada que
   * elimina los picos aislados sin el retardo de una media movil simple.
   */
  private computeSpeed(fix: GeoFix, impliedSpeed: number | null): number {
    const maxSpeed = this.options.maxPlausibleSpeed / 3.6
    const device =
      fix.speed !== null && Number.isFinite(fix.speed) && fix.speed >= 0 ? fix.speed : null
    const implied =
      impliedSpeed !== null && Number.isFinite(impliedSpeed) && impliedSpeed >= 0
        ? impliedSpeed
        : null

    let raw: number | null
    if (device !== null && implied !== null) {
      const tolerance = Math.max(1.5, implied * 0.5) // m/s
      raw = Math.abs(device - implied) <= tolerance ? device : implied
    } else {
      raw = device ?? implied
    }

    if (raw === null) return this.smoothedSpeed
    if (raw > maxSpeed) raw = maxSpeed

    const window = Math.max(1, Math.round(this.options.speedSmoothingWindow))
    this.speedWindow.push(raw)
    while (this.speedWindow.length > window) this.speedWindow.shift()

    this.smoothedSpeed = smoothSpeed(this.speedWindow)
    return this.smoothedSpeed
  }

  private checkSignal(): void {
    const { lastFixAt } = this.state
    if (lastFixAt === null) return
    if (this.state.status === 'denied' || this.state.status === 'unsupported') return
    if (Date.now() - lastFixAt > this.options.signalLostAfter) {
      if (this.state.status !== 'lost') {
        this.speedWindow = []
        this.smoothedSpeed = 0
        this.publish({ status: 'lost', message: STATUS_MESSAGES.lost })
      }
    }
  }

  private handleError(error: GeolocationPositionError): void {
    switch (error.code) {
      case error.PERMISSION_DENIED:
        this.setStatus('denied')
        this.stop()
        break
      case error.POSITION_UNAVAILABLE:
        this.setStatus('unavailable')
        break
      case error.TIMEOUT:
        this.publish({
          status: this.state.lastFix ? 'lost' : 'searching',
          message: this.state.lastFix ? STATUS_MESSAGES.lost : STATUS_MESSAGES.searching,
        })
        break
      default:
        this.setStatus('unavailable', describeError(error))
    }
  }

  // ------------------------------------------------------------------ helpers

  private reject(reason: RejectionReason, fix: GeoFix): void {
    this.state = { ...this.state, rejected: this.state.rejected + 1 }
    this.rejectionListeners.forEach((cb) => cb(reason, fix))
  }

  private setStatus(status: GpsStatus, message?: string): void {
    this.publish({ status, message: message ?? STATUS_MESSAGES[status] })
  }

  private publish(patch: Partial<GpsState>): void {
    const next: GpsState = { ...this.state, ...patch }
    if (patch.status && !patch.message) next.message = STATUS_MESSAGES[patch.status]
    this.state = next
    this.stateListeners.forEach((cb) => cb(next))
  }

  private emitFix(accepted: AcceptedFix): void {
    this.fixListeners.forEach((cb) => cb(accepted))
  }
}

/**
 * Mediana de la ventana y media de los valores que no se alejan de ella mas de
 * un 60 %. Con la secuencia 15 / 38 / 12 / 41 / 19 km/h devuelve ~15 km/h en
 * lugar de seguir los picos de 38 y 41.
 */
export function smoothSpeed(values: number[]): number {
  if (values.length === 0) return 0
  if (values.length === 1) return values[0]

  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const median =
    sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]

  const tolerance = Math.max(1.5, median * 0.6) // m/s
  let sum = 0
  let count = 0
  for (const value of values) {
    if (Math.abs(value - median) <= tolerance) {
      sum += value
      count++
    }
  }
  return count > 0 ? sum / count : median
}

function toFix(position: GeolocationPosition): GeoFix {
  const c = position.coords
  return {
    latitude: c.latitude,
    longitude: c.longitude,
    timestamp: position.timestamp || Date.now(),
    accuracy: Number.isFinite(c.accuracy) ? c.accuracy : null,
    altitude: c.altitude !== null && Number.isFinite(c.altitude) ? c.altitude : null,
    speed: c.speed !== null && Number.isFinite(c.speed) ? c.speed : null,
    heading: c.heading !== null && Number.isFinite(c.heading) ? c.heading : null,
  }
}

function describeError(error: GeolocationPositionError): string {
  switch (error.code) {
    case 1:
      return 'Permiso de ubicación denegado'
    case 2:
      return 'No se ha podido determinar la ubicación'
    case 3:
      return 'Tiempo de espera agotado buscando señal'
    default:
      return error.message || 'Error de geolocalización'
  }
}

function pickOptions(settings: AppSettings): GpsOptions {
  return {
    goodAccuracy: settings.goodAccuracy,
    maxAccuracy: settings.maxAccuracy,
    maxPlausibleSpeed: settings.maxPlausibleSpeed,
    speedSmoothingWindow: settings.speedSmoothingWindow,
    updateInterval: settings.updateInterval,
    signalLostAfter: settings.signalLostAfter,
    minMoveDistance: settings.minMoveDistance,
  }
}

/** Instancia unica compartida por toda la aplicacion. */
export const gpsService = new GpsService()
export { STATUS_MESSAGES }
