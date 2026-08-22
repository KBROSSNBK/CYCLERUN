import { describe, expect, it } from 'vitest'
import { decodeTrack, encodeTrack } from '@/firebase/trackCodec'
import { toCsv, toGpx } from '@/services/exportService'
import type { Ride, RideWithTrack, RoutePoint } from '@/types'
import { smoothSpeed } from '@/gps/gpsService'
import { aggregate, buildTrackSeries, computeKmSplits, computeRecords, startOfWeek } from './stats'

/** Track sintetico: recorrido recto hacia el norte a velocidad constante. */
function buildTrack(count: number, metersPerPoint = 10, msPerPoint = 1000): RoutePoint[] {
  const points: RoutePoint[] = []
  const start = Date.UTC(2026, 7, 22, 8, 0, 0)
  for (let i = 0; i < count; i++) {
    points.push({
      latitude: 40.4168 + (i * metersPerPoint) / 111132,
      longitude: -3.7038,
      timestamp: start + i * msPerPoint,
      accuracy: 6,
      altitude: 600 + i * 0.5,
      speed: metersPerPoint / (msPerPoint / 1000),
      heading: 0,
      computedSpeed: metersPerPoint / (msPerPoint / 1000),
      moving: true,
      segment: 0,
    })
  }
  return points
}

function buildRide(overrides: Partial<Ride> = {}): Ride {
  return {
    id: 'r1',
    userId: null,
    startTime: Date.UTC(2026, 7, 22, 8, 0, 0),
    endTime: Date.UTC(2026, 7, 22, 9, 0, 0),
    createdAt: Date.now(),
    pointCount: 100,
    activity: 'bike',
    activities: [],
    previewLat: [],
    previewLon: [],
    previewSpeed: [],
    distance: 20000,
    duration: 3600000,
    movingTime: 3400000,
    stoppedTime: 200000,
    pausedTime: 0,
    averageSpeed: 20000 / 3400,
    overallAverageSpeed: 20000 / 3600,
    maxSpeed: 11,
    elevationGain: 180,
    elevationLoss: 160,
    ...overrides,
  }
}

describe('smoothSpeed', () => {
  it('devuelve el unico valor disponible', () => {
    expect(smoothSpeed([4.2])).toBe(4.2)
  })

  it('descarta los picos aislados del GPS', () => {
    // 15, 38, 12, 41, 19 km/h -> el resultado no debe seguir los picos
    const kmh = [15, 38, 12, 41, 19].map((value) => value / 3.6)
    const result = smoothSpeed(kmh) * 3.6
    expect(result).toBeLessThan(25)
    expect(result).toBeGreaterThan(10)
  })

  it('sigue una velocidad estable sin distorsionarla', () => {
    const values = [20, 21, 20.5, 21.5, 20].map((value) => value / 3.6)
    expect(smoothSpeed(values) * 3.6).toBeCloseTo(20.6, 1)
  })

  it('devuelve cero sin lecturas', () => {
    expect(smoothSpeed([])).toBe(0)
  })
})

describe('computeKmSplits', () => {
  it('genera un tramo por kilometro completo', () => {
    const splits = computeKmSplits(buildTrack(251, 10, 1000)) // 2500 m
    expect(splits).toHaveLength(3)
    expect(splits[0].km).toBe(1)
    expect(splits[0].distance).toBe(1000)
    expect(splits[2].distance).toBeLessThan(1000)
  })

  it('calcula la velocidad de cada tramo', () => {
    const splits = computeKmSplits(buildTrack(201, 10, 1000)) // 10 m/s
    expect(splits[0].speed).toBeCloseTo(10, 1)
    expect(splits[0].duration).toBeCloseTo(100000, -3)
  })

  it('no devuelve tramos con un unico punto', () => {
    expect(computeKmSplits(buildTrack(1))).toEqual([])
  })
})

describe('buildTrackSeries', () => {
  it('limita el numero de muestras', () => {
    const series = buildTrackSeries(buildTrack(2000), 100)
    expect(series.length).toBeLessThanOrEqual(101)
  })

  it('acumula la distancia recorrida', () => {
    const series = buildTrackSeries(buildTrack(101, 10, 1000), 1000)
    expect(series[series.length - 1].km).toBeCloseTo(1, 1)
  })
})

describe('agregados historicos', () => {
  it('suma distancias y calcula la media global', () => {
    const rides = [buildRide(), buildRide({ id: 'r2', distance: 10000, movingTime: 1700000 })]
    const totals = aggregate(rides)
    expect(totals.totalRides).toBe(2)
    expect(totals.totalDistance).toBe(30000)
    expect(totals.maxDistance).toBe(20000)
    expect(totals.averageSpeed).toBeCloseTo(30000 / 5100, 5)
  })

  it('cuenta los kilometros de la semana en curso', () => {
    const now = Date.UTC(2026, 7, 22, 12, 0, 0)
    const rides = [
      buildRide({ id: 'esta', startTime: startOfWeek(now) + 3600000, distance: 5000 }),
      buildRide({ id: 'vieja', startTime: startOfWeek(now) - 86400000 * 9, distance: 8000 }),
    ]
    expect(aggregate(rides, now).weekDistance).toBe(5000)
  })

  it('elige el mejor registro de cada categoria', () => {
    const records = computeRecords([
      buildRide({ id: 'a', maxSpeed: 11, distance: 20000 }),
      buildRide({ id: 'b', maxSpeed: 15, distance: 12000 }),
    ])
    expect(records.maxSpeed.value).toBe(15)
    expect(records.maxSpeed.rideId).toBe('b')
    expect(records.maxDistance.rideId).toBe('a')
  })

  it('ignora las carreras muy cortas al calcular la mejor media', () => {
    const records = computeRecords([buildRide({ id: 'corta', distance: 400, averageSpeed: 30 })])
    expect(records.bestAverageSpeed.value).toBe(0)
  })
})

describe('codificacion del track para Firestore', () => {
  it('reconstruye los puntos sin perdida apreciable', () => {
    const points = buildTrack(20)
    const chunks = encodeTrack(points, points[0].timestamp)
    const decoded = decodeTrack(chunks, points[0].timestamp)

    expect(decoded).toHaveLength(points.length)
    expect(decoded[5].latitude).toBeCloseTo(points[5].latitude, 5)
    expect(decoded[5].timestamp).toBe(points[5].timestamp)
    expect(decoded[5].altitude).toBeCloseTo(points[5].altitude as number, 1)
    expect(decoded[5].moving).toBe(true)
  })

  it('trocea los recorridos largos', () => {
    const chunks = encodeTrack(buildTrack(1200), Date.now())
    expect(chunks.length).toBe(3)
    expect(chunks[0].count).toBe(500)
    expect(chunks[2].count).toBe(200)
  })

  it('conserva los campos ausentes como nulos', () => {
    const points = buildTrack(3).map((point) => ({ ...point, altitude: null, speed: null }))
    const decoded = decodeTrack(encodeTrack(points, points[0].timestamp), points[0].timestamp)
    expect(decoded[0].altitude).toBeNull()
    expect(decoded[0].speed).toBeNull()
  })

  it('no usa arrays anidados, que Firestore no admite', () => {
    const chunk = encodeTrack(buildTrack(5), Date.now())[0]
    for (const value of Object.values(chunk)) {
      if (Array.isArray(value)) {
        expect(value.every((item) => typeof item === 'number')).toBe(true)
      }
    }
  })
})

describe('exportacion', () => {
  const ride: RideWithTrack = { ...buildRide(), points: buildTrack(5) }

  it('genera un GPX con un punto por lectura', () => {
    const gpx = toGpx(ride)
    expect(gpx).toContain('<?xml version="1.0" encoding="UTF-8"?>')
    expect(gpx).toContain('<gpx version="1.1"')
    expect(gpx.match(/<trkpt /g)).toHaveLength(5)
    expect(gpx).toContain('<ele>600.0</ele>')
    expect(gpx).toContain('</gpx>')
  })

  it('abre un tramo GPX nuevo por cada pausa', () => {
    const withPause: RideWithTrack = {
      ...ride,
      points: [...buildTrack(3), ...buildTrack(3).map((p) => ({ ...p, segment: 1 }))],
    }
    expect(toGpx(withPause).match(/<trkseg>/g)).toHaveLength(2)
  })

  it('escapa los caracteres XML del titulo', () => {
    const gpx = toGpx({ ...ride, title: 'Ruta <A & B>' })
    expect(gpx).toContain('Ruta &lt;A &amp; B&gt;')
    expect(gpx).not.toContain('<name>Ruta <A')
  })

  it('genera un CSV con cabecera y una fila por punto', () => {
    const rows = toCsv(ride).trim().split('\n')
    expect(rows).toHaveLength(6)
    expect(rows[0]).toContain('latitude,longitude')
    expect(rows[1].split(',')).toHaveLength(12)
  })
})
