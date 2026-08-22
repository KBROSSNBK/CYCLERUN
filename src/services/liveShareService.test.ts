import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '@/config/defaults'
import type { GeoFix } from '@/types'

/**
 * Pruebas de la publicacion de la posicion en vivo.
 *
 * Cubren el caso que fallaba en la practica: dos amigos con el compartir
 * activado que no se veian porque la posicion solo se publicaba mientras habia
 * una carrera grabando, y porque nadie vigilaba el motor cuando aun no se
 * estaba publicando.
 */

const fixListeners = new Set<(accepted: unknown) => void>()
let lastFix: GeoFix | null = null

vi.mock('@/firebase/app', () => ({ firebaseEnabled: true }))

const publishPresence = vi.fn(async (_presence: Record<string, unknown>) => undefined)
const clearPresence = vi.fn(async (_uid: string) => undefined)
vi.mock('@/firebase/live', () => ({
  publishPresence: (presence: Record<string, unknown>) => publishPresence(presence),
  clearPresence: (uid: string) => clearPresence(uid),
}))

vi.mock('@/gps/gpsService', () => ({
  gpsService: {
    configure: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    reset: vi.fn(),
    onFix: (cb: (accepted: unknown) => void) => {
      fixListeners.add(cb)
      return () => fixListeners.delete(cb)
    },
    getState: () => ({
      status: 'ready',
      accuracy: 5,
      lastFix,
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

const { liveShareService } = await import('./liveShareService')
const { rideEngine } = await import('./rideEngine')

const USER = { uid: 'yo', displayName: 'Sebastián', email: 's@e.cl', photoURL: null }

function makeFix(): GeoFix {
  return {
    latitude: -33.4489,
    longitude: -70.6693,
    timestamp: Date.now(),
    accuracy: 8,
    altitude: 570,
    speed: 5,
    heading: 90,
  }
}

/** Simula un fix aceptado por el servicio GPS. */
function emitFix(delta = 10) {
  lastFix = makeFix()
  fixListeners.forEach((cb) =>
    cb({ fix: lastFix, speed: 5, delta, dt: 1000, moved: true }),
  )
}

/** Deja correr las microtareas pendientes (escrituras encadenadas). */
async function flush() {
  for (let i = 0; i < 6; i++) await Promise.resolve()
}

beforeEach(async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-08-22T10:00:00Z'))
  fixListeners.clear()
  lastFix = null
  publishPresence.mockClear()
  clearPresence.mockClear()
  rideEngine.reset()
  rideEngine.configure(DEFAULT_SETTINGS)
  liveShareService.setVisible(false)
  await liveShareService.stop()
  liveShareService.configure({ user: null, friendUids: [], enabled: false, intervalMs: 8000 })
  publishPresence.mockClear()
  clearPresence.mockClear()
})

afterEach(async () => {
  liveShareService.setVisible(false)
  await liveShareService.stop()
  rideEngine.reset()
  vi.useRealTimers()
})

describe('condiciones para publicar', () => {
  it('no publica si el usuario no lo ha activado', () => {
    liveShareService.configure({ user: USER, friendUids: ['amigo'], enabled: false })
    liveShareService.setVisible(true)
    emitFix()
    expect(publishPresence).not.toHaveBeenCalled()
  })

  it('no publica si todavia no hay amigos aceptados', () => {
    liveShareService.configure({ user: USER, friendUids: [], enabled: true })
    liveShareService.setVisible(true)
    emitFix()
    expect(publishPresence).not.toHaveBeenCalled()
    expect(liveShareService.getSnapshot().blockedBy).toContain('amigos')
  })

  it('no publica sin sesion iniciada', () => {
    liveShareService.configure({ user: null, friendUids: ['amigo'], enabled: true })
    liveShareService.setVisible(true)
    emitFix()
    expect(publishPresence).not.toHaveBeenCalled()
  })

  it('explica por que no se publica cuando falta el GPS', () => {
    liveShareService.configure({ user: USER, friendUids: ['amigo'], enabled: true })
    liveShareService.setVisible(true)
    expect(liveShareService.getSnapshot().blockedBy).toContain('GPS')
  })
})

describe('publicacion con la pantalla de amigos abierta', () => {
  it('publica sin necesidad de estar grabando una carrera', async () => {
    liveShareService.configure({ user: USER, friendUids: ['amigo'], enabled: true })
    lastFix = makeFix()
    liveShareService.setVisible(true)
    await flush()

    expect(publishPresence).toHaveBeenCalledTimes(1)
    const payload = publishPresence.mock.calls[0][0]
    expect(payload.uid).toBe('yo')
    expect(payload.status).toBe('online')
    expect(payload.visibleTo).toEqual(['amigo'])
  })

  it('retira la posicion al cerrar la pantalla', async () => {
    liveShareService.configure({ user: USER, friendUids: ['amigo'], enabled: true })
    lastFix = makeFix()
    liveShareService.setVisible(true)
    await flush()

    liveShareService.setVisible(false)
    await flush()
    expect(clearPresence).toHaveBeenCalledWith('yo')
  })

  it('respeta el intervalo entre escrituras', async () => {
    liveShareService.configure({ user: USER, friendUids: ['amigo'], enabled: true, intervalMs: 8000 })
    lastFix = makeFix()
    liveShareService.setVisible(true)
    await flush()
    expect(publishPresence).toHaveBeenCalledTimes(1)

    // Varios fixes seguidos no deben disparar una escritura por cada uno.
    for (let i = 0; i < 5; i++) {
      vi.advanceTimersByTime(1000)
      emitFix()
      await flush()
    }
    expect(publishPresence).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(4000)
    emitFix()
    await flush()
    expect(publishPresence).toHaveBeenCalledTimes(2)
  })
})

describe('publicacion durante la carrera', () => {
  it('empieza a publicar al iniciar una carrera aunque no se este mirando el mapa', async () => {
    liveShareService.configure({ user: USER, friendUids: ['amigo'], enabled: true })
    lastFix = makeFix()
    // La pantalla de amigos NO está abierta.
    expect(publishPresence).not.toHaveBeenCalled()

    rideEngine.start()
    await flush()

    expect(publishPresence).toHaveBeenCalled()
    const payload = publishPresence.mock.calls[0][0]
    expect(payload.status).toBe('recording')
  })

  it('deja de publicar y borra la posicion al terminar', async () => {
    liveShareService.configure({ user: USER, friendUids: ['amigo'], enabled: true })
    lastFix = makeFix()
    rideEngine.start()
    await flush()
    expect(publishPresence).toHaveBeenCalled()

    await rideEngine.finish()
    rideEngine.reset()
    await flush()

    expect(clearPresence).toHaveBeenCalledWith('yo')
  })

  it('marca la pausa para que los amigos la vean', async () => {
    liveShareService.configure({ user: USER, friendUids: ['amigo'], enabled: true })
    lastFix = makeFix()
    rideEngine.start()
    await flush()
    publishPresence.mockClear()

    vi.advanceTimersByTime(9000)
    rideEngine.pause()
    await flush()

    const payload = publishPresence.mock.calls.at(-1)?.[0]
    expect(payload?.status).toBe('paused')
  })
})

describe('privacidad', () => {
  it('deja de publicar y retira la posicion al desactivar el ajuste', async () => {
    liveShareService.configure({ user: USER, friendUids: ['amigo'], enabled: true })
    lastFix = makeFix()
    liveShareService.setVisible(true)
    await flush()
    expect(publishPresence).toHaveBeenCalled()

    liveShareService.configure({ enabled: false })
    await flush()
    expect(clearPresence).toHaveBeenCalledWith('yo')
  })

  it('retira la posicion al cerrar sesion', async () => {
    liveShareService.configure({ user: USER, friendUids: ['amigo'], enabled: true })
    lastFix = makeFix()
    liveShareService.setVisible(true)
    await flush()

    liveShareService.configure({ user: null })
    await flush()
    expect(clearPresence).toHaveBeenCalledWith('yo')
  })

  it('solo hace visible la posicion a los amigos indicados', async () => {
    liveShareService.configure({ user: USER, friendUids: ['a', 'b'], enabled: true })
    lastFix = makeFix()
    liveShareService.setVisible(true)
    await flush()

    const payload = publishPresence.mock.calls[0][0]
    expect(payload.visibleTo).toEqual(['a', 'b'])
  })
})
