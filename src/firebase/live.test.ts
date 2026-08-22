import { describe, expect, it, vi } from 'vitest'
import type { LivePresence } from '@/types'

vi.mock('./app', () => ({ getDb: () => ({}) }))

const { STALE_AFTER_MS, isStale, presenceAge } = await import('./live')

function presence(overrides: Partial<LivePresence> = {}): LivePresence {
  return {
    uid: 'amigo',
    displayName: 'Amigo',
    photoURL: null,
    latitude: -33.4,
    longitude: -70.6,
    accuracy: 8,
    speed: 4,
    heading: null,
    distance: 1200,
    status: 'recording',
    rideId: 'r1',
    updatedAt: Date.now(),
    visibleTo: ['yo'],
    ...overrides,
  }
}

describe('caducidad de la posicion en vivo', () => {
  const now = Date.UTC(2026, 7, 22, 12, 0, 0)

  it('una posicion recien emitida esta vigente', () => {
    expect(isStale(presence({ updatedAt: now - 5000 }), now)).toBe(false)
  })

  it('caduca la posicion de un telefono que dejo de emitir', () => {
    // Caso real: se bloquea la pantalla y el documento se queda congelado.
    const congelada = presence({ updatedAt: now - 50 * 60000, receivedAt: now - 50 * 60000 })
    expect(isStale(congelada, now)).toBe(true)
  })

  it('no revive por aparecer en un snapshot nuevo sin haber cambiado', () => {
    // `receivedAt` solo se refresca cuando `updatedAt` cambia de verdad; si se
    // anotase en cada snapshot, esta posicion pasaria por reciente.
    const congelada = presence({ updatedAt: now - 30 * 60000, receivedAt: now - 30 * 60000 })
    expect(isStale(congelada, now)).toBe(true)
  })

  it('tolera el desfase de relojes entre dos telefonos', () => {
    // El emisor cree que es una hora antes, pero lo hemos visto cambiar ahora.
    const desfasada = presence({ updatedAt: now - 3600000, receivedAt: now - 2000 })
    expect(isStale(desfasada, now)).toBe(false)
  })

  it('acepta un emisor con el reloj adelantado', () => {
    expect(isStale(presence({ updatedAt: now + 120000 }), now)).toBe(false)
  })

  it('el umbral es de minuto y medio', () => {
    expect(STALE_AFTER_MS).toBe(90000)
    expect(isStale(presence({ updatedAt: now - 89000, receivedAt: now - 89000 }), now)).toBe(false)
    expect(isStale(presence({ updatedAt: now - 91000, receivedAt: now - 91000 }), now)).toBe(true)
  })

  it('la antiguedad se toma del criterio mas favorable', () => {
    expect(presenceAge(presence({ updatedAt: now - 10000, receivedAt: now - 60000 }), now)).toBe(
      10000,
    )
    expect(presenceAge(presence({ updatedAt: now - 3600000, receivedAt: now - 4000 }), now)).toBe(
      4000,
    )
  })
})
