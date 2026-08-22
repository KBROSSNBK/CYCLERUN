import type { DistanceUnit, SpeedUnit } from '@/config/defaults'

const MS_TO_KMH = 3.6
const MS_TO_MPH = 2.2369362920544
const M_TO_MI = 0.000621371192

/** Convierte m/s a la unidad de velocidad elegida (valor numerico). */
export function speedValue(metersPerSecond: number, unit: SpeedUnit = 'kmh'): number {
  if (!Number.isFinite(metersPerSecond) || metersPerSecond <= 0) return 0
  return metersPerSecond * (unit === 'mph' ? MS_TO_MPH : MS_TO_KMH)
}

export function speedUnitLabel(unit: SpeedUnit = 'kmh'): string {
  return unit === 'mph' ? 'mph' : 'km/h'
}

/** "18.7" — sin unidad, pensado para numeros grandes con la unidad aparte. */
export function formatSpeed(metersPerSecond: number, unit: SpeedUnit = 'kmh'): string {
  return speedValue(metersPerSecond, unit).toFixed(1)
}

/** "18.7 km/h" */
export function formatSpeedWithUnit(metersPerSecond: number, unit: SpeedUnit = 'kmh'): string {
  return `${formatSpeed(metersPerSecond, unit)} ${speedUnitLabel(unit)}`
}

export function distanceUnitLabel(unit: DistanceUnit = 'km'): string {
  return unit === 'mi' ? 'mi' : 'km'
}

/** Valor numerico de la distancia en la unidad mayor (km o millas). */
export function distanceValue(meters: number, unit: DistanceUnit = 'km'): number {
  if (!Number.isFinite(meters) || meters <= 0) return 0
  return unit === 'mi' ? meters * M_TO_MI : meters / 1000
}

/**
 * "850 m" por debajo del kilometro, "12.48 km" por encima.
 * En millas siempre se usa la unidad mayor a partir de 0.1 mi.
 */
export function formatDistance(meters: number, unit: DistanceUnit = 'km'): string {
  if (!Number.isFinite(meters) || meters < 0) return unit === 'mi' ? '0.00 mi' : '0 m'
  if (unit === 'mi') {
    const mi = meters * M_TO_MI
    if (mi < 0.1) return `${Math.round(meters * 3.2808399)} ft`
    return `${mi.toFixed(2)} mi`
  }
  if (meters < 1000) return `${Math.round(meters)} m`
  return `${(meters / 1000).toFixed(2)} km`
}

/** Solo el numero, en la unidad mayor: "12.48" */
export function formatDistanceValue(meters: number, unit: DistanceUnit = 'km'): string {
  return distanceValue(meters, unit).toFixed(2)
}

/** "00:42:18" o "42:18" si dura menos de una hora. */
export function formatDuration(ms: number, forceHours = false): string {
  if (!Number.isFinite(ms) || ms < 0) ms = 0
  const total = Math.floor(ms / 1000)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  const mm = String(minutes).padStart(2, '0')
  const ss = String(seconds).padStart(2, '0')
  if (hours > 0 || forceHours) return `${String(hours).padStart(2, '0')}:${mm}:${ss}`
  return `${mm}:${ss}`
}

/** "2 h 14 min" — formato compacto para totales historicos. */
export function formatDurationLong(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0 min'
  const total = Math.floor(ms / 60000)
  const hours = Math.floor(total / 60)
  const minutes = total % 60
  if (hours === 0) return `${minutes} min`
  return `${hours} h ${String(minutes).padStart(2, '0')} min`
}

export function formatElevation(meters: number): string {
  if (!Number.isFinite(meters)) return '0 m'
  return `${Math.round(meters)} m`
}

export function formatAccuracy(meters: number | null): string {
  if (meters === null || !Number.isFinite(meters)) return '--'
  return `±${Math.round(meters)} m`
}

const dateFormatter = new Intl.DateTimeFormat('es', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})
const timeFormatter = new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit' })
const longDateFormatter = new Intl.DateTimeFormat('es', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

export function formatDate(timestamp: number): string {
  return dateFormatter.format(new Date(timestamp))
}

export function formatTime(timestamp: number): string {
  return timeFormatter.format(new Date(timestamp))
}

export function formatDateTime(timestamp: number): string {
  return `${formatDate(timestamp)} · ${formatTime(timestamp)}`
}

export function formatLongDate(timestamp: number): string {
  const text = longDateFormatter.format(new Date(timestamp))
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** "hace 2 h", "ayer", "hace 3 días" */
export function formatRelative(timestamp: number, now = Date.now()): string {
  const diff = now - timestamp
  const minutes = Math.round(diff / 60000)
  if (minutes < 1) return 'ahora mismo'
  if (minutes < 60) return `hace ${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `hace ${hours} h`
  const days = Math.round(hours / 24)
  if (days === 1) return 'ayer'
  if (days < 30) return `hace ${days} días`
  return formatDate(timestamp)
}

/** Diferencia con signo, para la pantalla de comparacion: "+2.4", "-04:32" */
export function withSign(value: string, positive: boolean): string {
  return positive ? `+${value}` : `-${value}`
}

export function formatSignedDistance(deltaMeters: number, unit: DistanceUnit = 'km'): string {
  const positive = deltaMeters >= 0
  return withSign(formatDistance(Math.abs(deltaMeters), unit), positive)
}

export function formatSignedDuration(deltaMs: number): string {
  const positive = deltaMs >= 0
  return withSign(formatDuration(Math.abs(deltaMs)), positive)
}

export function formatSignedSpeed(deltaMs: number, unit: SpeedUnit = 'kmh'): string {
  const positive = deltaMs >= 0
  return withSign(`${formatSpeed(Math.abs(deltaMs), unit)} ${speedUnitLabel(unit)}`, positive)
}
