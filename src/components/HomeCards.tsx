import { useMemo } from 'react'
import type { Ride } from '@/types'
import { startOfDay, startOfWeek } from '@/utils/stats'

/**
 * Tarjetas del panel de inicio.
 *
 * Los graficos van en SVG escrito a mano en lugar de con una libreria: son
 * piezas pequenas, fijas y muy repetidas, y asi el panel principal no arrastra
 * el peso de Recharts (que solo se carga en el reporte y en estadisticas).
 */

// --------------------------------------------------- recorrido por velocidad

export interface SpeedBand {
  from: number
  to: number
  color: string
}

const BAND_COLORS = ['var(--bento-blue)', 'var(--bento-orange)', 'var(--bento-red)']

/** Tres franjas de velocidad calculadas sobre la propia carrera, en km/h. */
export function speedBands(speeds: number[]): SpeedBand[] {
  const kmh = speeds.map((value) => value * 3.6).filter((value) => Number.isFinite(value))
  const max = kmh.length ? Math.max(...kmh) : 0
  if (max <= 0) return []
  const first = Math.round(max * 0.45)
  const second = Math.round(max * 0.75)
  return [
    { from: 0, to: first, color: BAND_COLORS[0] },
    { from: first, to: second, color: BAND_COLORS[1] },
    { from: second, to: Math.ceil(max), color: BAND_COLORS[2] },
  ]
}

function bandColor(speedKmh: number, bands: SpeedBand[]): string {
  for (const band of bands) {
    if (speedKmh <= band.to) return band.color
  }
  return bands.length ? bands[bands.length - 1].color : BAND_COLORS[0]
}

/**
 * Recorrido dibujado en SVG y coloreado por tramos de velocidad.
 * No carga teselas: es una miniatura, no un mapa navegable.
 */
export function SpeedRoute({
  lat,
  lon,
  speed,
  width = 300,
  height = 150,
  strokeWidth = 4,
}: {
  lat: number[]
  lon: number[]
  speed?: number[]
  width?: number
  height?: number
  strokeWidth?: number
}) {
  const bands = useMemo(() => speedBands(speed ?? []), [speed])

  if (lat.length < 2) {
    return (
      <div className="route-empty" style={{ height }}>
        Sin recorrido
      </div>
    )
  }

  const padding = strokeWidth + 6
  let minLat = Infinity
  let maxLat = -Infinity
  let minLon = Infinity
  let maxLon = -Infinity
  for (let i = 0; i < lat.length; i++) {
    if (lat[i] < minLat) minLat = lat[i]
    if (lat[i] > maxLat) maxLat = lat[i]
    if (lon[i] < minLon) minLon = lon[i]
    if (lon[i] > maxLon) maxLon = lon[i]
  }
  const spanLat = Math.max(maxLat - minLat, 1e-5)
  const spanLon = Math.max(maxLon - minLon, 1e-5)
  const scale = Math.min((width - padding * 2) / spanLon, (height - padding * 2) / spanLat)
  const offsetX = (width - spanLon * scale) / 2
  const offsetY = (height - spanLat * scale) / 2

  const x = (index: number) => offsetX + (lon[index] - minLon) * scale
  const y = (index: number) => height - (offsetY + (lat[index] - minLat) * scale)

  // Sin velocidades se dibuja una sola linea; con ellas, un segmento por color.
  const segments: Array<{ d: string; color: string }> = []
  if (!speed || speed.length !== lat.length || bands.length === 0) {
    segments.push({
      d: lat.map((_, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(i).toFixed(1)}`).join(' '),
      color: 'var(--accent)',
    })
  } else {
    let current = bandColor(speed[0] * 3.6, bands)
    let path = `M${x(0).toFixed(1)},${y(0).toFixed(1)}`
    for (let i = 1; i < lat.length; i++) {
      const color = bandColor(speed[i] * 3.6, bands)
      path += ` L${x(i).toFixed(1)},${y(i).toFixed(1)}`
      if (color !== current) {
        segments.push({ d: path, color: current })
        // El nuevo tramo arranca donde acaba el anterior para que no haya huecos.
        path = `M${x(i).toFixed(1)},${y(i).toFixed(1)}`
        current = color
      }
    }
    segments.push({ d: path, color: current })
  }

  return (
    <svg
      className="speed-route"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Recorrido de la carrera"
    >
      {segments.map((segment, index) => (
        <path
          key={index}
          d={segment.d}
          fill="none"
          stroke={segment.color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      <circle cx={x(0)} cy={y(0)} r={strokeWidth * 0.9} fill="var(--bento-blue)" />
      <circle
        cx={x(lat.length - 1)}
        cy={y(lat.length - 1)}
        r={strokeWidth * 0.9}
        fill="var(--bento-red)"
      />
    </svg>
  )
}

export function SpeedLegend({ bands }: { bands: SpeedBand[] }) {
  if (bands.length === 0) return null
  return (
    <div className="speed-legend">
      {bands.map((band) => (
        <span key={band.color} className="speed-legend__item">
          <span className="speed-legend__dot" style={{ background: band.color }} />
          {band.from}–{band.to}
        </span>
      ))}
    </div>
  )
}

// --------------------------------------------------- velocidad media diaria

/** Velocidad media (km/h) de cada dia de la semana en curso. */
export function WeekSpeedChart({ rides }: { rides: Ride[] }) {
  const days = useMemo(() => weekSpeeds(rides), [rides])
  const max = Math.max(...days.map((day) => day.speed), 1)
  const width = 260
  const height = 74
  const step = width / (days.length - 1)
  // La escala arranca siempre en cero: con un solo dia con datos, un dominio
  // ajustado al minimo dejaria la linea fuera del area de dibujo.
  const y = (value: number) => height - 14 - (value / max) * (height - 32)

  const path = days
    .map((day, index) => `${index === 0 ? 'M' : 'L'}${(index * step).toFixed(1)},${y(day.speed).toFixed(1)}`)
    .join(' ')

  return (
    <div>
      <svg className="mini-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Velocidad media por día">
        <path d={path} fill="none" stroke="var(--bento-ink)" strokeWidth="1.6" strokeLinejoin="round" />
        {days.map((day, index) => (
          <g key={day.label}>
            <circle cx={index * step} cy={y(day.speed)} r="3" fill="var(--bento-ink)" />
            <text
              x={index * step}
              y={y(day.speed) - 9}
              textAnchor="middle"
              className="mini-chart__value"
            >
              {day.speed > 0 ? Math.round(day.speed) : ''}
            </text>
          </g>
        ))}
      </svg>
      <div className="mini-chart__axis">
        {days.map((day) => (
          <span key={day.label}>{day.label}</span>
        ))}
      </div>
    </div>
  )
}

function weekSpeeds(rides: Ride[], now = Date.now()): Array<{ label: string; speed: number }> {
  const labels = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
  const start = startOfWeek(now)
  const distance = new Array(7).fill(0)
  const time = new Array(7).fill(0)

  for (const ride of rides) {
    const index = Math.floor((startOfDay(ride.startTime) - start) / 86400000)
    if (index >= 0 && index < 7) {
      distance[index] += ride.distance
      time[index] += ride.movingTime
    }
  }

  return labels.map((label, index) => ({
    label,
    speed: time[index] > 0 ? (distance[index] / (time[index] / 1000)) * 3.6 : 0,
  }))
}

// ------------------------------------------------------- actividad del mes

/** Rejilla de puntos: un punto por dia del mes en curso. */
export function MonthDots({ rides, now = Date.now() }: { rides: Ride[]; now?: number }) {
  const days = useMemo(() => monthActivity(rides, now), [rides, now])
  return (
    <div>
      <div className="dot-grid">
        {days.map((count, index) => (
          <span
            key={index}
            className={`dot-grid__dot ${count === 1 ? 'is-single' : count > 1 ? 'is-multi' : ''}`}
            title={`Día ${index + 1}: ${count} ${count === 1 ? 'carrera' : 'carreras'}`}
          />
        ))}
      </div>
      <div className="speed-legend" style={{ marginTop: 'var(--gap-3)' }}>
        <span className="speed-legend__item">
          <span className="speed-legend__dot" style={{ background: 'var(--bento-red)' }} /> 1 salida
        </span>
        <span className="speed-legend__item">
          <span className="speed-legend__dot" style={{ background: 'var(--bento-yellow)' }} /> varias
        </span>
      </div>
    </div>
  )
}

function monthActivity(rides: Ride[], now: number): number[] {
  const reference = new Date(now)
  const year = reference.getFullYear()
  const month = reference.getMonth()
  const days = new Date(year, month + 1, 0).getDate()
  const counts = new Array(days).fill(0)

  for (const ride of rides) {
    const date = new Date(ride.startTime)
    if (date.getFullYear() === year && date.getMonth() === month) {
      counts[date.getDate() - 1] += 1
    }
  }
  return counts
}

// ---------------------------------------------------- minutos por semana

/** Columnas de minutos por franja del mes, como el resumen mensual. */
export function MonthMinutesChart({ rides, now = Date.now() }: { rides: Ride[]; now?: number }) {
  const groups = useMemo(() => monthMinutes(rides, now), [rides, now])
  const max = Math.max(...groups.map((group) => group.minutes), 1)
  const today = new Date(now).getDate()

  return (
    <div className="minutes-chart">
      {groups.map((group) => {
        const active = today >= group.from && today <= group.to
        return (
          <div key={group.label} className="minutes-chart__column">
            <span className="minutes-chart__range">{group.label}</span>
            <div
              className={`minutes-chart__bar ${active ? 'is-current' : ''}`}
              style={{ height: `${Math.max(18, (group.minutes / max) * 100)}%` }}
            >
              <span>{Math.round(group.minutes)}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function monthMinutes(
  rides: Ride[],
  now: number,
): Array<{ label: string; from: number; to: number; minutes: number }> {
  const reference = new Date(now)
  const year = reference.getFullYear()
  const month = reference.getMonth()
  const lastDay = new Date(year, month + 1, 0).getDate()

  const ranges = [
    { from: 1, to: 7 },
    { from: 8, to: 14 },
    { from: 15, to: 21 },
    { from: 22, to: lastDay },
  ]

  return ranges.map((range) => {
    let minutes = 0
    for (const ride of rides) {
      const date = new Date(ride.startTime)
      if (
        date.getFullYear() === year &&
        date.getMonth() === month &&
        date.getDate() >= range.from &&
        date.getDate() <= range.to
      ) {
        minutes += ride.duration / 60000
      }
    }
    return { label: `${range.from}–${range.to}`, from: range.from, to: range.to, minutes }
  })
}
