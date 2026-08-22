import {
  DEFAULT_ACTIVITY,
  settingsForActivity,
  type ActivityType,
} from '@/config/activities'
import { DEFAULT_SETTINGS, PREVIEW_MAX_POINTS, type AppSettings } from '@/config/defaults'
import { gpsService, type AcceptedFix } from '@/gps/gpsService'
import * as localStore from '@/storage/localStore'
import type { ActiveSession } from '@/storage/localStore'
import type {
  ActivitySpan,
  Ride,
  RideState,
  RideStats,
  RideWithTrack,
  RoutePoint,
} from '@/types'
import { buildPreviewIndices } from '@/utils/geo'
import { createId } from '@/utils/id'

/**
 * Motor de carrera.
 *
 * Concentra toda la logica de una carrera: estados, distancia, tiempos,
 * velocidades, desnivel y persistencia local. La interfaz solo lee el estado
 * publicado y llama a start / pause / resume / finish; no calcula nada.
 *
 * Contabilidad del tiempo
 * -----------------------
 * Los tiempos no se derivan de las marcas temporales del GPS sino de un reloj
 * propio que avanza cada 500 ms. De este modo una perdida de senal no congela
 * el cronometro ni inventa tiempo de movimiento: si no hay fixes recientes el
 * intervalo se contabiliza como tiempo detenido.
 */

const TICK_MS = 500
const PERSIST_EVERY_MS = 4000

const EMPTY_STATS: RideStats = {
  distance: 0,
  duration: 0,
  movingTime: 0,
  stoppedTime: 0,
  pausedTime: 0,
  averageSpeed: 0,
  overallAverageSpeed: 0,
  maxSpeed: 0,
  elevationGain: 0,
  elevationLoss: 0,
}

const INITIAL_STATE: RideState = {
  ...EMPTY_STATS,
  status: 'idle',
  rideId: null,
  startTime: null,
  endTime: null,
  currentSpeed: 0,
  isStopped: false,
  pointCount: 0,
  lastPoint: null,
  segment: 0,
  activity: DEFAULT_ACTIVITY,
  activities: [],
}

type StateListener = (state: RideState) => void
type PointListener = (point: RoutePoint) => void

class RideEngine {
  /** ajustes tal y como los definio el usuario */
  private baseSettings: AppSettings = DEFAULT_SETTINGS
  /** ajustes efectivos, ya adaptados al medio de transporte en uso */
  private settings: AppSettings = DEFAULT_SETTINGS
  private state: RideState = INITIAL_STATE
  private points: RoutePoint[] = []
  private userId: string | null = null

  /** tramos de medio de transporte ya cerrados */
  private closedSpans: ActivitySpan[] = []
  /** marca de inicio del tramo en curso */
  private spanStart: { activity: ActivityType; startTime: number; distance: number; movingTime: number } | null =
    null

  private stateListeners = new Set<StateListener>()
  private pointListeners = new Set<PointListener>()

  private unsubscribeFix: (() => void) | null = null
  private ticker: ReturnType<typeof setInterval> | null = null
  private lastTickAt = 0

  private stopCandidateSince: number | null = null
  private lastElevation: number | null = null
  private pendingPersist: RoutePoint[] = []
  private lastPersistAt = 0
  private resumedAt: number | null = null

  // ------------------------------------------------------------------ ajustes

  configure(settings: AppSettings): void {
    this.baseSettings = settings
    // Fuera de carrera manda la preferencia guardada; durante una carrera manda
    // lo que el usuario haya elegido sobre la marcha.
    const activity = this.isActive() ? this.state.activity : settings.defaultActivity
    if (activity !== this.state.activity) this.patch({ activity })
    this.settings = settingsForActivity(settings, activity)
    gpsService.configure(this.settings)
  }

  setUser(userId: string | null): void {
    this.userId = userId
  }

  /**
   * Cambia el medio de transporte. Se puede hacer en mitad de la carrera: el
   * tramo anterior se cierra con su distancia y su tiempo, y el filtro GPS pasa
   * a usar los limites del nuevo medio.
   */
  setActivity(activity: ActivityType): void {
    if (this.state.activity === activity) return
    const now = Date.now()

    if (this.isActive()) {
      const closed = this.closeSpan(now)
      if (closed) this.closedSpans.push(closed)
      this.openSpan(activity, now)
    }

    this.settings = settingsForActivity(this.baseSettings, activity)
    gpsService.configure(this.settings)
    this.patch({ activity, activities: this.currentSpans(now) })
    if (this.isActive()) void this.persistSession()
  }

  private openSpan(activity: ActivityType, now: number): void {
    this.spanStart = {
      activity,
      startTime: now,
      distance: this.state.distance,
      movingTime: this.state.movingTime,
    }
  }

  private closeSpan(now: number): ActivitySpan | null {
    if (!this.spanStart) return null
    const span: ActivitySpan = {
      activity: this.spanStart.activity,
      startTime: this.spanStart.startTime,
      endTime: now,
      distance: Math.max(0, this.state.distance - this.spanStart.distance),
      movingTime: Math.max(0, this.state.movingTime - this.spanStart.movingTime),
    }
    this.spanStart = null
    return span
  }

  /** Tramos cerrados mas el que esta abierto en este momento. */
  private currentSpans(now: number): ActivitySpan[] {
    const spans = [...this.closedSpans]
    if (this.spanStart) {
      spans.push({
        activity: this.spanStart.activity,
        startTime: this.spanStart.startTime,
        endTime: now,
        distance: Math.max(0, this.state.distance - this.spanStart.distance),
        movingTime: Math.max(0, this.state.movingTime - this.spanStart.movingTime),
      })
    }
    return spans
  }

  // -------------------------------------------------------------- suscripciones

  subscribe = (listener: StateListener): (() => void) => {
    this.stateListeners.add(listener)
    return () => {
      this.stateListeners.delete(listener)
    }
  }

  getSnapshot = (): RideState => this.state

  /** Notificacion por punto aceptado; el mapa la usa para dibujar sin re-render. */
  onPoint(listener: PointListener): () => void {
    this.pointListeners.add(listener)
    return () => {
      this.pointListeners.delete(listener)
    }
  }

  getPoints(): RoutePoint[] {
    return this.points
  }

  isActive(): boolean {
    return this.state.status === 'recording' || this.state.status === 'paused'
  }

  // ------------------------------------------------------------------- control

  /** Enciende el receptor y pasa a modo "buscando senal", sin registrar nada. */
  prepare(): void {
    gpsService.configure(this.settings)
    gpsService.start()
    if (this.state.status === 'idle') {
      this.patch({ status: 'acquiring' })
    }
  }

  /** Comienza a registrar. Exige que el GPS ya este entregando posiciones. */
  start(): void {
    if (this.isActive()) return

    const now = Date.now()
    gpsService.reset()
    gpsService.start()

    this.points = []
    this.pendingPersist = []
    this.stopCandidateSince = null
    this.lastElevation = null
    this.lastTickAt = now
    this.lastPersistAt = now
    this.resumedAt = now
    this.closedSpans = []

    this.state = {
      ...INITIAL_STATE,
      status: 'recording',
      rideId: createId(),
      startTime: now,
      segment: 0,
      activity: this.state.activity,
    }
    this.openSpan(this.state.activity, now)
    this.emitState()

    this.attach()
    void this.persistSession()
  }

  pause(): void {
    if (this.state.status !== 'recording') return
    this.patch({ status: 'paused', currentSpeed: 0, isStopped: false })
    this.stopCandidateSince = null
    void this.flush()
  }

  resume(): void {
    if (this.state.status !== 'paused') return
    // Un nuevo tramo evita que el mapa dibuje una linea recta entre el punto
    // donde se pauso y el punto donde se reanuda.
    gpsService.reset()
    this.lastTickAt = Date.now()
    this.resumedAt = Date.now()
    this.stopCandidateSince = null
    this.patch({ status: 'recording', segment: this.state.segment + 1 })
    void this.persistSession()
  }

  /**
   * Cierra la carrera, la deja guardada localmente y devuelve el resultado.
   * La subida a Firebase la realiza despues el servicio de sincronizacion, de
   * forma que finalizar nunca depende de tener conexion.
   */
  async finish(): Promise<RideWithTrack> {
    const now = Date.now()
    this.tick(now)
    this.detach()

    const ride = this.buildRide(now)
    const points = this.points.slice()

    this.patch({ status: 'finished', endTime: now, currentSpeed: 0 })

    try {
      await localStore.savePendingRide({
        ride,
        points,
        userId: this.userId,
        attempts: 0,
        lastError: null,
        savedAt: now,
      })
      await localStore.clearActiveRide(ride.id)
    } catch (error) {
      // Si IndexedDB falla se avisa en la interfaz; los datos siguen en memoria
      // hasta que el usuario reintente el guardado desde el reporte.
      console.error('[cyclerun] no se ha podido guardar la carrera en local', error)
    }

    return { ...ride, points }
  }

  /** Descarta la carrera en curso sin guardarla. */
  async discard(): Promise<void> {
    const rideId = this.state.rideId
    this.detach()
    this.points = []
    this.pendingPersist = []
    this.closedSpans = []
    this.spanStart = null
    this.state = { ...INITIAL_STATE, activity: this.state.activity }
    this.emitState()
    if (rideId) await localStore.clearActiveRide(rideId)
  }

  /** Vuelve al estado inicial tras mostrar el resumen. */
  reset(): void {
    this.detach()
    this.points = []
    this.pendingPersist = []
    this.closedSpans = []
    this.spanStart = null
    this.state = { ...INITIAL_STATE, activity: this.state.activity }
    this.emitState()
  }

  // ---------------------------------------------------------------- recuperacion

  /** Retoma una carrera interrumpida, en pausa para que el usuario decida. */
  restore(session: ActiveSession, points: RoutePoint[]): void {
    this.points = points
    this.pendingPersist = []
    this.stopCandidateSince = null
    this.lastElevation = lastAltitude(points)
    this.lastTickAt = Date.now()
    this.lastPersistAt = Date.now()
    this.closedSpans = session.activities ?? []
    this.spanStart = null

    const last = points.length > 0 ? points[points.length - 1] : null
    this.state = {
      ...session.stats,
      status: 'paused',
      rideId: session.rideId,
      startTime: session.startTime,
      endTime: null,
      currentSpeed: 0,
      isStopped: false,
      pointCount: points.length,
      lastPoint: last,
      segment: session.segment + 1,
      activity: session.activity ?? DEFAULT_ACTIVITY,
      activities: this.closedSpans,
    }
    this.settings = settingsForActivity(this.baseSettings, this.state.activity)
    gpsService.configure(this.settings)
    this.emitState()
    this.attach()
    gpsService.start()
  }

  /** Cierra directamente una carrera recuperada, sin reanudarla. */
  async finishRestored(): Promise<RideWithTrack> {
    const last = this.state.lastPoint
    const endTime = last ? last.timestamp : Date.now()
    this.detach()
    const ride = this.buildRide(endTime)
    const points = this.points.slice()
    this.patch({ status: 'finished', endTime })
    await localStore.savePendingRide({
      ride,
      points,
      userId: this.userId,
      attempts: 0,
      lastError: null,
      savedAt: Date.now(),
    })
    await localStore.clearActiveRide(ride.id)
    return { ...ride, points }
  }

  // ------------------------------------------------------------------ internos

  private attach(): void {
    this.detachListenersOnly()
    this.unsubscribeFix = gpsService.onFix((accepted) => this.handleFix(accepted))
    this.ticker = setInterval(() => this.tick(Date.now()), TICK_MS)
  }

  private detach(): void {
    this.detachListenersOnly()
    void this.flush()
  }

  private detachListenersOnly(): void {
    this.unsubscribeFix?.()
    this.unsubscribeFix = null
    if (this.ticker !== null) {
      clearInterval(this.ticker)
      this.ticker = null
    }
  }

  /**
   * Reloj de la carrera. Reparte el intervalo transcurrido entre tiempo en
   * movimiento, tiempo detenido y tiempo en pausa.
   */
  private tick(now: number): void {
    const elapsed = Math.max(0, now - this.lastTickAt)
    this.lastTickAt = now
    if (elapsed === 0) return

    if (this.state.status === 'paused') {
      this.patch({ pausedTime: this.state.pausedTime + elapsed })
      return
    }
    if (this.state.status !== 'recording') return

    // Sin fixes recientes no hay prueba de movimiento: cuenta como parada.
    const gps = gpsService.getState()
    const stale =
      gps.lastFixAt !== null && now - gps.lastFixAt > this.settings.signalLostAfter

    const stopped = this.state.isStopped || stale
    const duration = this.state.duration + elapsed
    const movingTime = stopped ? this.state.movingTime : this.state.movingTime + elapsed
    const stoppedTime = stopped ? this.state.stoppedTime + elapsed : this.state.stoppedTime

    this.patch({
      duration,
      movingTime,
      stoppedTime,
      isStopped: stopped,
      currentSpeed: stale ? 0 : this.state.currentSpeed,
      averageSpeed: movingTime > 0 ? this.state.distance / (movingTime / 1000) : 0,
      overallAverageSpeed: duration > 0 ? this.state.distance / (duration / 1000) : 0,
    })

    if (now - this.lastPersistAt >= PERSIST_EVERY_MS) void this.flush()
  }

  private handleFix(accepted: AcceptedFix): void {
    if (this.state.status !== 'recording') return

    const { fix, speed, delta } = accepted
    const now = Date.now()

    // --- deteccion de parada -------------------------------------------------
    const speedKmh = speed * 3.6
    let isStopped = this.state.isStopped
    if (speedKmh < this.settings.stopSpeedThreshold) {
      if (this.stopCandidateSince === null) this.stopCandidateSince = now
      if (now - this.stopCandidateSince >= this.settings.stopDelay) isStopped = true
    } else {
      this.stopCandidateSince = null
      isStopped = false
    }

    // --- distancia -----------------------------------------------------------
    // El primer punto tras reanudar no suma: el hueco de la pausa no es recorrido.
    const isFirstOfSegment = this.resumedAt !== null
    if (isFirstOfSegment) this.resumedAt = null

    let distance = this.state.distance
    if (!isFirstOfSegment && !isStopped && delta >= this.settings.minMoveDistance) {
      distance += delta
    }

    // --- desnivel ------------------------------------------------------------
    let { elevationGain, elevationLoss } = this.state
    if (fix.altitude !== null) {
      if (this.lastElevation === null) {
        this.lastElevation = fix.altitude
      } else {
        const change = fix.altitude - this.lastElevation
        if (Math.abs(change) >= this.settings.elevationThreshold) {
          if (change > 0) elevationGain += change
          else elevationLoss += -change
          this.lastElevation = fix.altitude
        }
      }
    }

    // --- maximos -------------------------------------------------------------
    const maxSpeed = !isStopped && speed > this.state.maxSpeed ? speed : this.state.maxSpeed

    const point: RoutePoint = {
      ...fix,
      computedSpeed: speed,
      moving: !isStopped,
      segment: this.state.segment,
    }
    this.points.push(point)
    this.pendingPersist.push(point)

    this.patch({
      distance,
      currentSpeed: speed,
      maxSpeed,
      isStopped,
      elevationGain,
      elevationLoss,
      pointCount: this.points.length,
      lastPoint: point,
      averageSpeed: this.state.movingTime > 0 ? distance / (this.state.movingTime / 1000) : 0,
      overallAverageSpeed: this.state.duration > 0 ? distance / (this.state.duration / 1000) : 0,
    })

    this.pointListeners.forEach((cb) => cb(point))
  }

  /** Vuelca a IndexedDB los puntos acumulados y el estado de la sesion. */
  async flush(): Promise<void> {
    const rideId = this.state.rideId
    if (!rideId) return
    const batch = this.pendingPersist
    this.pendingPersist = []
    this.lastPersistAt = Date.now()
    try {
      if (batch.length > 0) await localStore.appendActivePoints(rideId, batch)
      if (this.isActive()) await this.persistSession()
    } catch (error) {
      // Se devuelven los puntos a la cola para reintentar en el siguiente ciclo.
      this.pendingPersist = batch.concat(this.pendingPersist)
      console.error('[cyclerun] error al guardar puntos en local', error)
    }
  }

  private async persistSession(): Promise<void> {
    const { rideId, startTime, status, segment, activity } = this.state
    if (!rideId || startTime === null) return
    const session: ActiveSession = {
      id: 'current',
      rideId,
      userId: this.userId,
      startTime,
      status,
      segment,
      activity,
      activities: this.currentSpans(Date.now()),
      stats: extractStats(this.state),
      updatedAt: Date.now(),
    }
    await localStore.saveActiveSession(session)
  }

  private buildRide(endTime: number): Ride {
    const state = this.state
    const stats = extractStats(state)
    const previewIndices = buildPreviewIndices(this.points, PREVIEW_MAX_POINTS)

    const closed = this.closeSpan(endTime)
    if (closed) this.closedSpans.push(closed)
    // Se descartan los tramos residuales que no llegaron a registrar nada.
    const activities = this.closedSpans.filter(
      (span, index) => span.distance > 0 || span.endTime - span.startTime > 1000 || index === 0,
    )

    return {
      id: state.rideId ?? createId(),
      userId: this.userId,
      startTime: state.startTime ?? endTime,
      endTime,
      createdAt: Date.now(),
      pointCount: this.points.length,
      activity: primaryActivity(activities, state.activity),
      activities,
      previewLat: previewIndices.map((i) => round(this.points[i].latitude, 5)),
      previewLon: previewIndices.map((i) => round(this.points[i].longitude, 5)),
      previewSpeed: previewIndices.map((i) => round(this.points[i].computedSpeed, 1)),
      ...stats,
    }
  }

  private patch(patch: Partial<RideState>): void {
    this.state = { ...this.state, ...patch }
    this.emitState()
  }

  private emitState(): void {
    this.stateListeners.forEach((cb) => cb(this.state))
  }
}

/** Medio de transporte con el que se recorrio mas distancia. */
function primaryActivity(spans: ActivitySpan[], fallback: ActivityType): ActivityType {
  let best: ActivitySpan | null = null
  for (const span of spans) {
    if (!best || span.distance > best.distance) best = span
  }
  return best?.activity ?? fallback
}

export function extractStats(state: RideStats): RideStats {
  return {
    distance: state.distance,
    duration: state.duration,
    movingTime: state.movingTime,
    stoppedTime: state.stoppedTime,
    pausedTime: state.pausedTime,
    averageSpeed: state.averageSpeed,
    overallAverageSpeed: state.overallAverageSpeed,
    maxSpeed: state.maxSpeed,
    elevationGain: state.elevationGain,
    elevationLoss: state.elevationLoss,
  }
}

function lastAltitude(points: RoutePoint[]): number | null {
  for (let i = points.length - 1; i >= 0; i--) {
    const altitude = points[i].altitude
    if (altitude !== null) return altitude
  }
  return null
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

export const rideEngine = new RideEngine()
export { INITIAL_STATE as EMPTY_RIDE_STATE }
