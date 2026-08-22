import type { AggregateStats, KmSplit, PersonalRecords, Ride, RoutePoint } from '@/types'
import { haversine } from './geo'

/**
 * Analitica derivada: tramos por kilometro, series para los graficos,
 * totales historicos y records personales.
 * Son funciones puras para poder reutilizarlas en el reporte, en las
 * estadisticas y, mas adelante, en la comparacion de carreras.
 */

/** Divide el track en tramos de un kilometro (el ultimo puede ser parcial). */
export function computeKmSplits(points: RoutePoint[], segmentLength = 1000): KmSplit[] {
  if (points.length < 2) return []

  const splits: KmSplit[] = []
  let accumulated = 0
  let splitDistance = 0
  let splitStartTime = points[0].timestamp
  let splitGain = 0
  let previous = points[0]
  let km = 1

  for (let i = 1; i < points.length; i++) {
    const point = points[i]
    // Un cambio de tramo indica una pausa: no se acumula ni distancia ni tiempo.
    if (point.segment !== previous.segment) {
      splitStartTime += point.timestamp - previous.timestamp
      previous = point
      continue
    }

    const delta = haversine(
      previous.latitude,
      previous.longitude,
      point.latitude,
      point.longitude,
    )
    if (previous.altitude !== null && point.altitude !== null) {
      const change = point.altitude - previous.altitude
      if (change > 0) splitGain += change
    }

    accumulated += delta
    splitDistance += delta

    while (splitDistance >= segmentLength) {
      // Interpolacion lineal para situar el instante exacto del corte.
      const excess = splitDistance - segmentLength
      const ratio = delta > 0 ? 1 - excess / delta : 1
      const crossTime = previous.timestamp + (point.timestamp - previous.timestamp) * ratio
      const duration = crossTime - splitStartTime
      splits.push({
        km,
        distance: segmentLength,
        duration,
        speed: duration > 0 ? segmentLength / (duration / 1000) : 0,
        elevationGain: splitGain,
      })
      km++
      splitStartTime = crossTime
      splitDistance = excess
      splitGain = 0
    }

    previous = point
  }

  if (splitDistance > segmentLength * 0.05) {
    const duration = previous.timestamp - splitStartTime
    splits.push({
      km,
      distance: splitDistance,
      duration,
      speed: duration > 0 ? splitDistance / (duration / 1000) : 0,
      elevationGain: splitGain,
    })
  }

  void accumulated
  return splits
}

export interface TrackSample {
  /** minutos desde el inicio */
  minute: number
  /** kilometros recorridos */
  km: number
  /** km/h */
  speed: number
  /** metros sobre el nivel del mar */
  altitude: number | null
}

/**
 * Serie temporal para los graficos de velocidad y altitud.
 * Se remuestrea a un maximo de `maxSamples` para que Recharts no tenga que
 * pintar miles de puntos en un movil.
 */
export function buildTrackSeries(points: RoutePoint[], maxSamples = 240): TrackSample[] {
  if (points.length === 0) return []
  const start = points[0].timestamp
  const step = Math.max(1, Math.ceil(points.length / maxSamples))

  const samples: TrackSample[] = []
  let distance = 0
  let previous = points[0]

  for (let i = 0; i < points.length; i++) {
    const point = points[i]
    if (i > 0 && point.segment === previous.segment) {
      distance += haversine(
        previous.latitude,
        previous.longitude,
        point.latitude,
        point.longitude,
      )
    }
    previous = point
    if (i % step !== 0 && i !== points.length - 1) continue
    samples.push({
      minute: Math.round(((point.timestamp - start) / 60000) * 10) / 10,
      km: Math.round((distance / 1000) * 100) / 100,
      speed: Math.round(point.computedSpeed * 3.6 * 10) / 10,
      altitude: point.altitude !== null ? Math.round(point.altitude) : null,
    })
  }
  return samples
}

export function hasElevationData(points: RoutePoint[]): boolean {
  return points.some((point) => point.altitude !== null)
}

// ------------------------------------------------------------------- historico

export function aggregate(rides: Ride[], now = Date.now()): AggregateStats {
  const weekStart = startOfWeek(now)
  const monthStart = startOfMonth(now)
  const yearStart = startOfYear(now)

  let totalDistance = 0
  let totalDuration = 0
  let totalMovingTime = 0
  let totalElevationGain = 0
  let maxSpeed = 0
  let maxDistance = 0
  let weekDistance = 0
  let monthDistance = 0
  let yearDistance = 0

  for (const ride of rides) {
    totalDistance += ride.distance
    totalDuration += ride.duration
    totalMovingTime += ride.movingTime
    totalElevationGain += ride.elevationGain
    if (ride.maxSpeed > maxSpeed) maxSpeed = ride.maxSpeed
    if (ride.distance > maxDistance) maxDistance = ride.distance
    if (ride.startTime >= weekStart) weekDistance += ride.distance
    if (ride.startTime >= monthStart) monthDistance += ride.distance
    if (ride.startTime >= yearStart) yearDistance += ride.distance
  }

  return {
    totalDistance,
    totalRides: rides.length,
    totalDuration,
    totalMovingTime,
    totalElevationGain,
    averageSpeed: totalMovingTime > 0 ? totalDistance / (totalMovingTime / 1000) : 0,
    maxSpeed,
    maxDistance,
    weekDistance,
    monthDistance,
    yearDistance,
  }
}

const EMPTY_RECORD = { value: 0, rideId: null, date: null }

export function computeRecords(rides: Ride[]): PersonalRecords {
  const records: PersonalRecords = {
    maxSpeed: { ...EMPTY_RECORD },
    maxDistance: { ...EMPTY_RECORD },
    maxElevation: { ...EMPTY_RECORD },
    maxMovingTime: { ...EMPTY_RECORD },
    bestAverageSpeed: { ...EMPTY_RECORD },
  }

  for (const ride of rides) {
    consider(records, 'maxSpeed', ride.maxSpeed, ride)
    consider(records, 'maxDistance', ride.distance, ride)
    consider(records, 'maxElevation', ride.elevationGain, ride)
    consider(records, 'maxMovingTime', ride.movingTime, ride)
    // La media solo es representativa a partir de un kilometro recorrido.
    if (ride.distance >= 1000) consider(records, 'bestAverageSpeed', ride.averageSpeed, ride)
  }
  return records
}

function consider(
  records: PersonalRecords,
  key: keyof PersonalRecords,
  value: number,
  ride: Ride,
): void {
  if (value > records[key].value) {
    records[key] = { value, rideId: ride.id, date: ride.startTime }
  }
}

// -------------------------------------------------------------------- graficos

export interface PeriodBucket {
  label: string
  km: number
  rides: number
  minutes: number
}

/** Distancia por dia de los ultimos `days` dias. */
export function distanceByDay(rides: Ride[], days = 14, now = Date.now()): PeriodBucket[] {
  const buckets: PeriodBucket[] = []
  const today = startOfDay(now)
  for (let i = days - 1; i >= 0; i--) {
    const day = today - i * 86400000
    buckets.push({ label: shortDay(day), km: 0, rides: 0, minutes: 0 })
  }
  for (const ride of rides) {
    const index = Math.floor((startOfDay(ride.startTime) - today) / 86400000) + days - 1
    if (index >= 0 && index < buckets.length) {
      buckets[index].km += ride.distance / 1000
      buckets[index].rides += 1
      buckets[index].minutes += ride.duration / 60000
    }
  }
  return buckets.map((bucket) => ({ ...bucket, km: Math.round(bucket.km * 100) / 100 }))
}

/** Distancia por mes de los ultimos `months` meses. */
export function distanceByMonth(rides: Ride[], months = 6, now = Date.now()): PeriodBucket[] {
  const reference = new Date(now)
  const buckets: PeriodBucket[] = []
  const keys: string[] = []
  for (let i = months - 1; i >= 0; i--) {
    const date = new Date(reference.getFullYear(), reference.getMonth() - i, 1)
    keys.push(monthKey(date.getTime()))
    buckets.push({ label: monthLabel(date.getTime()), km: 0, rides: 0, minutes: 0 })
  }
  for (const ride of rides) {
    const index = keys.indexOf(monthKey(ride.startTime))
    if (index >= 0) {
      buckets[index].km += ride.distance / 1000
      buckets[index].rides += 1
      buckets[index].minutes += ride.duration / 60000
    }
  }
  return buckets.map((bucket) => ({ ...bucket, km: Math.round(bucket.km * 100) / 100 }))
}

// ---------------------------------------------------------------------- fechas

export function startOfDay(timestamp: number): number {
  const date = new Date(timestamp)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

/** Semana que empieza en lunes, como es habitual en Espana. */
export function startOfWeek(timestamp: number): number {
  const date = new Date(startOfDay(timestamp))
  const day = (date.getDay() + 6) % 7
  date.setDate(date.getDate() - day)
  return date.getTime()
}

export function startOfMonth(timestamp: number): number {
  const date = new Date(timestamp)
  return new Date(date.getFullYear(), date.getMonth(), 1).getTime()
}

export function startOfYear(timestamp: number): number {
  return new Date(new Date(timestamp).getFullYear(), 0, 1).getTime()
}

const dayFormatter = new Intl.DateTimeFormat('es', { day: '2-digit', month: 'short' })
const monthFormatter = new Intl.DateTimeFormat('es', { month: 'short' })

function shortDay(timestamp: number): string {
  return dayFormatter.format(new Date(timestamp)).replace('.', '')
}

function monthLabel(timestamp: number): string {
  return monthFormatter.format(new Date(timestamp)).replace('.', '')
}

function monthKey(timestamp: number): string {
  const date = new Date(timestamp)
  return `${date.getFullYear()}-${date.getMonth()}`
}
