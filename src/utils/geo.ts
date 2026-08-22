import type { GeoFix, RoutePoint } from '@/types'

const EARTH_RADIUS = 6371008.8 // metros, radio medio WGS84
const RAD = Math.PI / 180

export type LatLng = [number, number]

/**
 * Distancia sobre la superficie terrestre entre dos coordenadas, en metros.
 * Formula de Haversine: precisa para las distancias cortas que separan dos
 * fijaciones GPS consecutivas y estable frente a errores de redondeo.
 */
export function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * RAD
  const dLon = (lon2 - lon1) * RAD
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
  return 2 * EARTH_RADIUS * Math.asin(Math.min(1, Math.sqrt(a)))
}

export function distanceBetween(a: GeoFix, b: GeoFix): number {
  return haversine(a.latitude, a.longitude, b.latitude, b.longitude)
}

/** Rumbo inicial de A a B en grados (0 = norte, sentido horario). */
export function bearing(a: GeoFix, b: GeoFix): number {
  const lat1 = a.latitude * RAD
  const lat2 = b.latitude * RAD
  const dLon = (b.longitude - a.longitude) * RAD
  const y = Math.sin(dLon) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon)
  return (Math.atan2(y, x) / RAD + 360) % 360
}

/** Caja envolvente de una lista de coordenadas. */
export function boundsOf(points: LatLng[]): [LatLng, LatLng] | null {
  if (points.length === 0) return null
  let minLat = 90
  let maxLat = -90
  let minLon = 180
  let maxLon = -180
  for (const point of points) {
    const lat = point[0]
    const lon = point[1]
    if (lat < minLat) minLat = lat
    if (lat > maxLat) maxLat = lat
    if (lon < minLon) minLon = lon
    if (lon > maxLon) maxLon = lon
  }
  return [
    [minLat, minLon],
    [maxLat, maxLon],
  ]
}

/**
 * Simplificacion Ramer-Douglas-Peucker sobre coordenadas geograficas.
 * `tolerance` se expresa en metros aproximados; la longitud se escala segun
 * la latitud media del track para que la tolerancia sea isotropa.
 */
export function simplify(points: LatLng[], tolerance: number): LatLng[] {
  if (points.length <= 2) return points.slice()

  const midLat = points[Math.floor(points.length / 2)][0]
  const mPerDegLat = 111132
  const mPerDegLon = 111320 * Math.max(0.02, Math.cos(midLat * RAD))
  const tolDeg = tolerance / mPerDegLat
  const scale = mPerDegLon / mPerDegLat

  const keep = new Uint8Array(points.length)
  keep[0] = 1
  keep[points.length - 1] = 1

  const stack: Array<[number, number]> = [[0, points.length - 1]]
  while (stack.length) {
    const range = stack.pop() as [number, number]
    const first = range[0]
    const last = range[1]
    let maxDist = 0
    let index = -1
    const ay = points[first][0]
    const ax = points[first][1] * scale
    const by = points[last][0]
    const bx = points[last][1] * scale
    for (let i = first + 1; i < last; i++) {
      const py = points[i][0]
      const px = points[i][1] * scale
      const d = perpendicularDistance(px, py, ax, ay, bx, by)
      if (d > maxDist) {
        maxDist = d
        index = i
      }
    }
    if (index !== -1 && maxDist > tolDeg) {
      keep[index] = 1
      stack.push([first, index], [index, last])
    }
  }

  const out: LatLng[] = []
  for (let i = 0; i < points.length; i++) if (keep[i]) out.push(points[i])
  return out
}

function perpendicularDistance(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax
  const dy = by - ay
  if (dx === 0 && dy === 0) return Math.hypot(px - ax, py - ay)
  const t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)
  const clamped = Math.max(0, Math.min(1, t))
  return Math.hypot(px - (ax + clamped * dx), py - (ay + clamped * dy))
}

/**
 * Igual que `simplify` pero devolviendo los indices conservados, de modo que
 * se puedan arrastrar otros datos del punto (por ejemplo la velocidad) junto
 * con la coordenada.
 */
export function simplifyIndices(points: LatLng[], tolerance: number): number[] {
  if (points.length <= 2) return points.map((_, index) => index)

  const midLat = points[Math.floor(points.length / 2)][0]
  const mPerDegLat = 111132
  const mPerDegLon = 111320 * Math.max(0.02, Math.cos(midLat * RAD))
  const tolDeg = tolerance / mPerDegLat
  const scale = mPerDegLon / mPerDegLat

  const keep = new Uint8Array(points.length)
  keep[0] = 1
  keep[points.length - 1] = 1

  const stack: Array<[number, number]> = [[0, points.length - 1]]
  while (stack.length) {
    const range = stack.pop() as [number, number]
    const first = range[0]
    const last = range[1]
    let maxDist = 0
    let index = -1
    const ay = points[first][0]
    const ax = points[first][1] * scale
    const by = points[last][0]
    const bx = points[last][1] * scale
    for (let i = first + 1; i < last; i++) {
      const d = perpendicularDistance(points[i][1] * scale, points[i][0], ax, ay, bx, by)
      if (d > maxDist) {
        maxDist = d
        index = i
      }
    }
    if (index !== -1 && maxDist > tolDeg) {
      keep[index] = 1
      stack.push([first, index], [index, last])
    }
  }

  const indices: number[] = []
  for (let i = 0; i < points.length; i++) if (keep[i]) indices.push(i)
  return indices
}

/**
 * Reduce un track a como maximo `maxPoints` puntos, aumentando la tolerancia
 * hasta conseguirlo. Devuelve los indices del track original.
 */
export function buildPreviewIndices(points: RoutePoint[], maxPoints: number): number[] {
  if (points.length === 0) return []
  const coords: LatLng[] = points.map((p) => [p.latitude, p.longitude] as LatLng)
  let tolerance = 3
  let result = simplifyIndices(coords, tolerance)
  while (result.length > maxPoints && tolerance < 10000) {
    tolerance *= 2
    result = simplifyIndices(coords, tolerance)
  }
  if (result.length > maxPoints) {
    const step = Math.ceil(result.length / maxPoints)
    result = result.filter((_, i) => i % step === 0)
  }
  return result
}

/** Polilinea simplificada del recorrido. */
export function buildPreview(points: RoutePoint[], maxPoints: number): LatLng[] {
  return buildPreviewIndices(points, maxPoints).map(
    (index) => [points[index].latitude, points[index].longitude] as LatLng,
  )
}

/** Agrupa los puntos en tramos; los cortes corresponden a pausas manuales. */
export function splitSegments(points: RoutePoint[]): LatLng[][] {
  const segments: LatLng[][] = []
  let current: LatLng[] = []
  let segment = points.length ? points[0].segment : 0
  for (const p of points) {
    if (p.segment !== segment) {
      if (current.length) segments.push(current)
      current = []
      segment = p.segment
    }
    current.push([p.latitude, p.longitude])
  }
  if (current.length) segments.push(current)
  return segments
}
