import { describe, expect, it } from 'vitest'
import { bearing, boundsOf, buildPreview, haversine, simplify, splitSegments } from './geo'
import type { RoutePoint } from '@/types'

function point(latitude: number, longitude: number, segment = 0): RoutePoint {
  return {
    latitude,
    longitude,
    timestamp: 0,
    accuracy: 5,
    altitude: null,
    speed: null,
    heading: null,
    computedSpeed: 0,
    moving: true,
    segment,
  }
}

describe('haversine', () => {
  it('devuelve cero para el mismo punto', () => {
    expect(haversine(40.4168, -3.7038, 40.4168, -3.7038)).toBe(0)
  })

  it('calcula un grado de latitud como ~111 km', () => {
    const distance = haversine(40, -3, 41, -3)
    expect(distance).toBeGreaterThan(111100)
    expect(distance).toBeLessThan(111400)
  })

  it('coincide con la distancia conocida Madrid - Barcelona (~505 km)', () => {
    const distance = haversine(40.4168, -3.7038, 41.3874, 2.1686)
    expect(distance / 1000).toBeGreaterThan(500)
    expect(distance / 1000).toBeLessThan(510)
  })

  it('mide correctamente desplazamientos cortos de ciclismo', () => {
    // 0.0001 grados de latitud son ~11.1 m
    const distance = haversine(40.4168, -3.7038, 40.4169, -3.7038)
    expect(distance).toBeGreaterThan(10)
    expect(distance).toBeLessThan(12)
  })

  it('es simetrica', () => {
    const ida = haversine(40.4, -3.7, 40.5, -3.6)
    const vuelta = haversine(40.5, -3.6, 40.4, -3.7)
    expect(ida).toBeCloseTo(vuelta, 6)
  })
})

describe('bearing', () => {
  it('devuelve norte al desplazarse hacia arriba', () => {
    expect(bearing(point(40, -3), point(41, -3))).toBeCloseTo(0, 1)
  })

  it('devuelve este al desplazarse a la derecha', () => {
    expect(bearing(point(40, -3), point(40, -2))).toBeGreaterThan(89)
    expect(bearing(point(40, -3), point(40, -2))).toBeLessThan(91)
  })
})

describe('boundsOf', () => {
  it('devuelve null sin puntos', () => {
    expect(boundsOf([])).toBeNull()
  })

  it('encierra todos los puntos', () => {
    const bounds = boundsOf([
      [40, -3],
      [41, -2],
      [39, -4],
    ])
    expect(bounds).toEqual([
      [39, -4],
      [41, -2],
    ])
  })
})

describe('simplify', () => {
  it('conserva los extremos', () => {
    const line: Array<[number, number]> = [
      [40, -3],
      [40.001, -3],
      [40.002, -3],
      [40.003, -3],
    ]
    const result = simplify(line, 5)
    expect(result[0]).toEqual([40, -3])
    expect(result[result.length - 1]).toEqual([40.003, -3])
  })

  it('elimina los puntos intermedios de una recta', () => {
    const line: Array<[number, number]> = []
    for (let i = 0; i < 50; i++) line.push([40 + i * 0.0001, -3])
    expect(simplify(line, 5).length).toBe(2)
  })

  it('conserva los vertices de un giro pronunciado', () => {
    const line: Array<[number, number]> = [
      [40, -3],
      [40.005, -3],
      [40.005, -2.995],
    ]
    expect(simplify(line, 5).length).toBe(3)
  })
})

describe('buildPreview', () => {
  it('respeta el limite de puntos', () => {
    const points: RoutePoint[] = []
    for (let i = 0; i < 3000; i++) {
      // zigzag para que la simplificacion no pueda descartarlo todo
      points.push(point(40 + i * 0.0002, -3 + (i % 2) * 0.0004))
    }
    const preview = buildPreview(points, 100)
    expect(preview.length).toBeLessThanOrEqual(100)
    expect(preview.length).toBeGreaterThan(1)
  })

  it('devuelve vacio sin puntos', () => {
    expect(buildPreview([], 100)).toEqual([])
  })
})

describe('splitSegments', () => {
  it('separa los tramos generados por las pausas', () => {
    const points = [
      point(40, -3, 0),
      point(40.001, -3, 0),
      point(40.01, -3, 1),
      point(40.011, -3, 1),
    ]
    const segments = splitSegments(points)
    expect(segments).toHaveLength(2)
    expect(segments[0]).toHaveLength(2)
    expect(segments[1]).toHaveLength(2)
  })
})
