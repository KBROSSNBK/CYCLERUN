import type { RideWithTrack } from '@/types'
import { formatDate, formatTime } from '@/utils/format'

/**
 * Exportacion de una carrera a GPX, CSV o JSON.
 * El GPX sigue el esquema 1.1 con la extension TrackPointExtension, que es la
 * que entienden Strava, Garmin Connect, Komoot y similares.
 */

export type ExportFormat = 'gpx' | 'csv' | 'json'

export function buildFileName(ride: RideWithTrack, format: ExportFormat): string {
  const date = new Date(ride.startTime)
  const stamp = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
    '-',
    String(date.getHours()).padStart(2, '0'),
    String(date.getMinutes()).padStart(2, '0'),
  ].join('')
  return `cyclerun-${stamp}.${format}`
}

export function toGpx(ride: RideWithTrack): string {
  const name = ride.title ?? `Carrera CYCLERUN ${formatDate(ride.startTime)} ${formatTime(ride.startTime)}`
  const segments: string[] = []
  let currentSegment = -1
  let buffer: string[] = []

  for (const point of ride.points) {
    if (point.segment !== currentSegment) {
      if (buffer.length) segments.push(`    <trkseg>\n${buffer.join('\n')}\n    </trkseg>`)
      buffer = []
      currentSegment = point.segment
    }
    const extras: string[] = []
    if (point.altitude !== null) extras.push(`        <ele>${point.altitude.toFixed(1)}</ele>`)
    extras.push(`        <time>${new Date(point.timestamp).toISOString()}</time>`)
    const extension =
      point.computedSpeed > 0
        ? `        <extensions><gpxtpx:TrackPointExtension><gpxtpx:speed>${point.computedSpeed.toFixed(
            2,
          )}</gpxtpx:speed></gpxtpx:TrackPointExtension></extensions>`
        : ''
    buffer.push(
      `      <trkpt lat="${point.latitude.toFixed(6)}" lon="${point.longitude.toFixed(6)}">\n${extras.join(
        '\n',
      )}${extension ? `\n${extension}` : ''}\n      </trkpt>`,
    )
  }
  if (buffer.length) segments.push(`    <trkseg>\n${buffer.join('\n')}\n    </trkseg>`)

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="CYCLERUN"
     xmlns="http://www.topografix.com/GPX/1/1"
     xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1"
     xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
     xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>${escapeXml(name)}</name>
    <time>${new Date(ride.startTime).toISOString()}</time>
  </metadata>
  <trk>
    <name>${escapeXml(name)}</name>
    <type>cycling</type>
${segments.join('\n')}
  </trk>
</gpx>
`
}

export function toCsv(ride: RideWithTrack): string {
  const header = [
    'timestamp',
    'iso_time',
    'latitude',
    'longitude',
    'altitude_m',
    'accuracy_m',
    'device_speed_ms',
    'computed_speed_ms',
    'speed_kmh',
    'heading_deg',
    'moving',
    'segment',
  ].join(',')

  const rows = ride.points.map((point) =>
    [
      point.timestamp,
      new Date(point.timestamp).toISOString(),
      point.latitude.toFixed(6),
      point.longitude.toFixed(6),
      point.altitude !== null ? point.altitude.toFixed(1) : '',
      point.accuracy !== null ? point.accuracy.toFixed(1) : '',
      point.speed !== null ? point.speed.toFixed(2) : '',
      point.computedSpeed.toFixed(2),
      (point.computedSpeed * 3.6).toFixed(1),
      point.heading !== null ? point.heading.toFixed(1) : '',
      point.moving ? 1 : 0,
      point.segment,
    ].join(','),
  )

  return [header, ...rows].join('\n')
}

export function toJson(ride: RideWithTrack): string {
  return JSON.stringify({ ...ride, exportedAt: new Date().toISOString(), app: 'CYCLERUN' }, null, 2)
}

export function serialize(ride: RideWithTrack, format: ExportFormat): { content: string; mime: string } {
  switch (format) {
    case 'gpx':
      return { content: toGpx(ride), mime: 'application/gpx+xml' }
    case 'csv':
      return { content: toCsv(ride), mime: 'text/csv;charset=utf-8' }
    case 'json':
      return { content: toJson(ride), mime: 'application/json' }
  }
}

/**
 * Descarga el archivo. En moviles con soporte para la Web Share API se ofrece
 * primero compartir, que es lo que espera el usuario en iOS.
 */
export async function exportRide(ride: RideWithTrack, format: ExportFormat): Promise<void> {
  const { content, mime } = serialize(ride, format)
  const fileName = buildFileName(ride, format)
  const file = new File([content], fileName, { type: mime })

  if (typeof navigator !== 'undefined' && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: fileName })
      return
    } catch (error) {
      if ((error as Error)?.name === 'AbortError') return
      // si falla se descarga igualmente
    }
  }

  const url = URL.createObjectURL(file)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
