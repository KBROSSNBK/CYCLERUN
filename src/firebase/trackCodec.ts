import { TRACK_CHUNK_SIZE } from '@/config/defaults'
import type { RoutePoint } from '@/types'

/**
 * Codificacion del track para Firestore.
 *
 * Un documento de Firestore no puede pasar de 1 MB y tampoco admite arrays
 * dentro de arrays, asi que el recorrido no se guarda como lista de objetos
 * sino en forma columnar (un array de numeros por campo) y troceado en
 * documentos de `TRACK_CHUNK_SIZE` puntos dentro de la subcoleccion `track`.
 *
 * Ademas:
 *  - las marcas de tiempo se almacenan como diferencia respecto al inicio,
 *  - los valores se redondean a la precision util de cada magnitud,
 *  - los campos ausentes usan centinelas porque Firestore no acepta NaN.
 *
 * Resultado: alrededor de 30 KB por cada 500 puntos, cinco veces menos que
 * guardando objetos completos.
 */

const NULL_ACCURACY = -1
const NULL_ALTITUDE = -9999
const NULL_SPEED = -1
const NULL_HEADING = -1

export interface TrackChunk {
  index: number
  count: number
  /** ms transcurridos desde `startTime` */
  t: number[]
  lat: number[]
  lon: number[]
  acc: number[]
  alt: number[]
  /** velocidad informada por el dispositivo (m/s) */
  spd: number[]
  /** velocidad calculada y suavizada (m/s) */
  csp: number[]
  hdg: number[]
  /** 1 = en movimiento */
  mov: number[]
  seg: number[]
}

export function encodeTrack(points: RoutePoint[], startTime: number): TrackChunk[] {
  const chunks: TrackChunk[] = []
  for (let offset = 0; offset < points.length; offset += TRACK_CHUNK_SIZE) {
    const slice = points.slice(offset, offset + TRACK_CHUNK_SIZE)
    chunks.push({
      index: chunks.length,
      count: slice.length,
      t: slice.map((p) => p.timestamp - startTime),
      lat: slice.map((p) => round(p.latitude, 6)),
      lon: slice.map((p) => round(p.longitude, 6)),
      acc: slice.map((p) => (p.accuracy === null ? NULL_ACCURACY : round(p.accuracy, 1))),
      alt: slice.map((p) => (p.altitude === null ? NULL_ALTITUDE : round(p.altitude, 1))),
      spd: slice.map((p) => (p.speed === null ? NULL_SPEED : round(p.speed, 2))),
      csp: slice.map((p) => round(p.computedSpeed, 2)),
      hdg: slice.map((p) => (p.heading === null ? NULL_HEADING : round(p.heading, 1))),
      mov: slice.map((p) => (p.moving ? 1 : 0)),
      seg: slice.map((p) => p.segment),
    })
  }
  return chunks
}

export function decodeTrack(chunks: TrackChunk[], startTime: number): RoutePoint[] {
  const points: RoutePoint[] = []
  for (const chunk of [...chunks].sort((a, b) => a.index - b.index)) {
    for (let i = 0; i < chunk.count; i++) {
      points.push({
        latitude: chunk.lat[i],
        longitude: chunk.lon[i],
        timestamp: startTime + chunk.t[i],
        accuracy: nullable(chunk.acc?.[i], NULL_ACCURACY),
        altitude: nullable(chunk.alt?.[i], NULL_ALTITUDE),
        speed: nullable(chunk.spd?.[i], NULL_SPEED),
        heading: nullable(chunk.hdg?.[i], NULL_HEADING),
        computedSpeed: chunk.csp?.[i] ?? 0,
        moving: (chunk.mov?.[i] ?? 1) === 1,
        segment: chunk.seg?.[i] ?? 0,
      })
    }
  }
  return points
}

function nullable(value: number | undefined, sentinel: number): number | null {
  if (value === undefined || value === sentinel) return null
  return value
}

function round(value: number, decimals: number): number {
  if (!Number.isFinite(value)) return 0
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}
