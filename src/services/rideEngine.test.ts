import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '@/config/defaults'
import type { GeoFix } from '@/types'

/**
 * El motor se prueba contra un servicio GPS simulado: aqui la simulacion es
 * legitima (es la unica forma de comprobar el calculo sin salir en bici), pero
 * la aplicacion en produccion solo consume `watchPosition` real.
 */

const listeners = new Set<(accepted: unknown) => void>()

vi.mock('@/gps/gpsService', () => ({
  gpsService: {
    configure: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    reset: vi.fn(),
    onFix: (cb: (accepted: unknown) => void) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    getState: () => ({
      status: 'ready',
      accuracy: 5,
      lastFix: null,
      lastFixAt: Date.now(),
      rejected: 0,
      message: '',
    }),
  },
}))

vi.mock('@/storage/localStore', () => ({
  saveActiveSession: vi.fn(async () => undefined),
  appendActivePoints: vi.fn(async () => undefined),
  getActivePoints: vi.fn(async () => []),
  clearActiveRide: vi.fn(async () => undefined),
  savePendingRide: vi.fn(async () => undefined),
}))

const { rideEngine } = await import('./rideEngine')
const localStore = await import('@/storage/localStore')

function emit({
  delta = 10,
  dt = 1000,
  speed = 10,
  altitude = null as number | null,
}: {
  delta?: number
  dt?: number
  speed?: number
  altitude?: number | null
} = {}) {
  vi.advanceTimersByTime(dt)
  // Las coordenadas se desplazan de forma coherente con `delta` (~11.1 m por
  // cada 0.0001 grados de latitud) para que la vista previa sea realista.
  cursor += delta / 111132
  const fix: GeoFix = {
    latitude: cursor,
    longitude: -3.7038,
    timestamp: Date.now(),
    accuracy: 5,
    altitude,
    speed,
    heading: null,
  }
  listeners.forEach((cb) => cb({ fix, speed, delta, dt, moved: delta >= DEFAULT_SETTINGS.minMoveDistance }))
}

let cursor = 40.4168

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-08-22T10:00:00Z'))
  cursor = 40.4168
  listeners.clear()
  rideEngine.reset()
  rideEngine.setActivity(DEFAULT_SETTINGS.defaultActivity)
  rideEngine.configure(DEFAULT_SETTINGS)
  rideEngine.setUser(null)
  vi.clearAllMocks()
})

afterEach(() => {
  rideEngine.reset()
  vi.useRealTimers()
})

describe('ciclo de vida', () => {
  it('empieza en reposo', () => {
    expect(rideEngine.getSnapshot().status).toBe('idle')
    expect(rideEngine.isActive()).toBe(false)
  })

  it('al iniciar pasa a grabar y asigna identificador', () => {
    rideEngine.start()
    const state = rideEngine.getSnapshot()
    expect(state.status).toBe('recording')
    expect(state.rideId).toBeTruthy()
    expect(state.startTime).toBe(Date.now())
    expect(rideEngine.isActive()).toBe(true)
  })

  it('iniciar dos veces no reinicia la carrera', () => {
    rideEngine.start()
    const first = rideEngine.getSnapshot().rideId
    rideEngine.start()
    expect(rideEngine.getSnapshot().rideId).toBe(first)
  })
})

describe('distancia', () => {
  it('acumula la distancia entre puntos, sin contar el primero', () => {
    rideEngine.start()
    for (let i = 0; i < 5; i++) emit({ delta: 10 })
    // 5 puntos -> 4 desplazamientos validos
    expect(rideEngine.getSnapshot().distance).toBeCloseTo(40, 5)
    expect(rideEngine.getSnapshot().pointCount).toBe(5)
  })

  it('ignora los microdesplazamientos por debajo del umbral', () => {
    rideEngine.start()
    emit({ delta: 0 })
    for (let i = 0; i < 5; i++) emit({ delta: 1, speed: 1 })
    expect(rideEngine.getSnapshot().distance).toBe(0)
  })

  it('no suma distancia mientras la carrera esta pausada', () => {
    rideEngine.start()
    emit({ delta: 10 })
    emit({ delta: 10 })
    const before = rideEngine.getSnapshot()
    rideEngine.pause()
    emit({ delta: 50 })
    emit({ delta: 50 })
    const after = rideEngine.getSnapshot()
    expect(after.distance).toBe(before.distance)
    expect(after.pointCount).toBe(before.pointCount)
  })

  it('no cuenta como recorrido el salto producido durante la pausa', () => {
    rideEngine.start()
    emit({ delta: 10 })
    emit({ delta: 10 })
    rideEngine.pause()
    vi.advanceTimersByTime(60000)
    rideEngine.resume()
    // El primer punto tras reanudar puede estar lejos: no debe sumar.
    emit({ delta: 800 })
    expect(rideEngine.getSnapshot().distance).toBeCloseTo(10, 5)
    emit({ delta: 10 })
    expect(rideEngine.getSnapshot().distance).toBeCloseTo(20, 5)
  })
})

describe('tiempos', () => {
  it('separa tiempo total, en movimiento y en pausa', () => {
    rideEngine.start()
    for (let i = 0; i < 10; i++) emit({ delta: 10 })
    const moving = rideEngine.getSnapshot()
    expect(moving.duration).toBe(10000)
    expect(moving.movingTime).toBe(10000)
    expect(moving.stoppedTime).toBe(0)

    rideEngine.pause()
    vi.advanceTimersByTime(5000)
    const paused = rideEngine.getSnapshot()
    // La pausa no engorda ni la duracion ni el tiempo en movimiento.
    expect(paused.duration).toBe(10000)
    expect(paused.movingTime).toBe(10000)
    expect(paused.pausedTime).toBeGreaterThanOrEqual(4500)
  })

  it('detecta la parada y contabiliza tiempo detenido', () => {
    rideEngine.start()
    for (let i = 0; i < 3; i++) emit({ delta: 10, speed: 10 })
    expect(rideEngine.getSnapshot().isStopped).toBe(false)

    // Velocidad por debajo del umbral (2 km/h = 0.55 m/s) durante mas de 5 s.
    for (let i = 0; i < 7; i++) emit({ delta: 0, speed: 0.1 })
    const state = rideEngine.getSnapshot()
    expect(state.isStopped).toBe(true)
    expect(state.stoppedTime).toBeGreaterThan(0)
    expect(state.movingTime).toBeLessThan(state.duration)
  })

  it('vuelve a movimiento en cuanto se supera el umbral', () => {
    rideEngine.start()
    for (let i = 0; i < 8; i++) emit({ delta: 0, speed: 0 })
    expect(rideEngine.getSnapshot().isStopped).toBe(true)
    emit({ delta: 10, speed: 10 })
    expect(rideEngine.getSnapshot().isStopped).toBe(false)
  })
})

describe('velocidades', () => {
  it('registra la velocidad maxima alcanzada', () => {
    rideEngine.start()
    emit({ delta: 10, speed: 8 })
    emit({ delta: 12, speed: 12 })
    emit({ delta: 9, speed: 9 })
    expect(rideEngine.getSnapshot().maxSpeed).toBe(12)
  })

  it('no toma como maxima una velocidad registrada estando detenido', () => {
    rideEngine.start()
    for (let i = 0; i < 8; i++) emit({ delta: 0, speed: 0 })
    const max = rideEngine.getSnapshot().maxSpeed
    expect(max).toBe(0)
  })

  it('calcula la media sobre el tiempo en movimiento', () => {
    rideEngine.start()
    for (let i = 0; i < 11; i++) emit({ delta: 10, speed: 10 })
    const state = rideEngine.getSnapshot()
    // 100 m en 11 s de movimiento
    expect(state.averageSpeed).toBeCloseTo(state.distance / (state.movingTime / 1000), 6)
  })
})

describe('desnivel', () => {
  it('acumula subida y bajada por encima del umbral', () => {
    rideEngine.start()
    emit({ delta: 10, altitude: 600 })
    emit({ delta: 10, altitude: 610 })
    emit({ delta: 10, altitude: 605 })
    const state = rideEngine.getSnapshot()
    expect(state.elevationGain).toBeCloseTo(10, 5)
    expect(state.elevationLoss).toBeCloseTo(5, 5)
  })

  it('ignora el ruido de altitud por debajo del umbral', () => {
    rideEngine.start()
    emit({ delta: 10, altitude: 600 })
    emit({ delta: 10, altitude: 601 })
    emit({ delta: 10, altitude: 600 })
    const state = rideEngine.getSnapshot()
    expect(state.elevationGain).toBe(0)
    expect(state.elevationLoss).toBe(0)
  })
})

describe('finalizacion', () => {
  it('guarda la carrera en local y devuelve el resumen con el track', async () => {
    rideEngine.start()
    for (let i = 0; i < 6; i++) emit({ delta: 10, altitude: 600 + i })

    const ride = await rideEngine.finish()

    expect(ride.pointCount).toBe(6)
    expect(ride.points).toHaveLength(6)
    expect(ride.distance).toBeCloseTo(50, 5)
    expect(ride.endTime).toBeGreaterThan(ride.startTime)
    expect(ride.previewLat.length).toBeGreaterThan(0)
    expect(ride.previewLat.length).toBe(ride.previewLon.length)
    expect(localStore.savePendingRide).toHaveBeenCalledTimes(1)
    expect(rideEngine.getSnapshot().status).toBe('finished')
  })

  it('descarta la carrera sin guardarla', async () => {
    rideEngine.start()
    emit({ delta: 10 })
    await rideEngine.discard()
    expect(localStore.savePendingRide).not.toHaveBeenCalled()
    expect(localStore.clearActiveRide).toHaveBeenCalled()
    expect(rideEngine.getSnapshot().status).toBe('idle')
  })
})

describe('medio de transporte', () => {
  it('usa bicicleta por defecto', () => {
    rideEngine.start()
    expect(rideEngine.getSnapshot().activity).toBe('bike')
  })

  it('permite elegir el medio antes de empezar', () => {
    rideEngine.setActivity('run')
    rideEngine.start()
    expect(rideEngine.getSnapshot().activity).toBe('run')
  })

  it('cierra un tramo y abre otro al cambiar en mitad de la carrera', async () => {
    rideEngine.start()
    for (let i = 0; i < 5; i++) emit({ delta: 10 })

    rideEngine.setActivity('walk')
    for (let i = 0; i < 3; i++) emit({ delta: 2, speed: 1 })

    const ride = await rideEngine.finish()
    expect(ride.activities).toHaveLength(2)
    expect(ride.activities[0].activity).toBe('bike')
    expect(ride.activities[1].activity).toBe('walk')
    // Los primeros 40 m se hicieron en bici.
    expect(ride.activities[0].distance).toBeCloseTo(40, 5)
    expect(ride.activities[0].endTime).toBe(ride.activities[1].startTime)
  })

  it('asigna como principal el medio con mas distancia', async () => {
    rideEngine.start()
    for (let i = 0; i < 3; i++) emit({ delta: 2, speed: 1 })
    rideEngine.setActivity('car')
    for (let i = 0; i < 5; i++) emit({ delta: 100, speed: 25 })
    const ride = await rideEngine.finish()
    expect(ride.activity).toBe('car')
  })

  it('conserva el medio elegido al reiniciar el motor', () => {
    rideEngine.setActivity('mtb')
    rideEngine.reset()
    expect(rideEngine.getSnapshot().activity).toBe('mtb')
  })
})
