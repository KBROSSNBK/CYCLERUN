import type { AppSettings } from './defaults'

/**
 * Medios de transporte.
 *
 * El medio elegido no es solo una etiqueta: define el limite de velocidad
 * plausible con el que el servicio GPS descarta los saltos de posicion. Un
 * coche a 90 km/h no puede filtrarse con el mismo criterio que una bicicleta,
 * y una persona caminando necesita un umbral mucho mas fino.
 */

export type ActivityType =
  | 'bike'
  | 'ebike'
  | 'mtb'
  | 'scooter'
  | 'run'
  | 'walk'
  | 'motorbike'
  | 'car'

export interface ActivityDefinition {
  id: ActivityType
  label: string
  icon: string
  /** velocidad maxima plausible en km/h; null = usa el ajuste del usuario */
  speedLimit: number | null
  /** umbral de parada en km/h propio del medio */
  stopThreshold: number | null
  /** complemento para frases: «Saldrás {withLabel}» */
  withLabel: string
  /** titulo de la tarjeta del panel de inicio */
  cardTitle: string
}

export const ACTIVITIES: ActivityDefinition[] = [
  { id: 'bike', label: 'Bicicleta', icon: '🚴', speedLimit: null, stopThreshold: null, withLabel: 'en bicicleta', cardTitle: 'Mi bicicleta' },
  { id: 'ebike', label: 'Bici eléctrica', icon: '⚡', speedLimit: 60, stopThreshold: null, withLabel: 'en bici eléctrica', cardTitle: 'Mi bici eléctrica' },
  { id: 'mtb', label: 'Montaña', icon: '🚵', speedLimit: 80, stopThreshold: null, withLabel: 'en montaña', cardTitle: 'Mi MTB' },
  { id: 'scooter', label: 'Patinete', icon: '🛴', speedLimit: 45, stopThreshold: null, withLabel: 'en patinete', cardTitle: 'Mi patinete' },
  { id: 'run', label: 'Corriendo', icon: '🏃', speedLimit: 30, stopThreshold: 1.5, withLabel: 'corriendo', cardTitle: 'Corriendo' },
  { id: 'walk', label: 'Caminando', icon: '🚶', speedLimit: 15, stopThreshold: 1, withLabel: 'caminando', cardTitle: 'Caminando' },
  { id: 'motorbike', label: 'Moto', icon: '🏍️', speedLimit: 180, stopThreshold: 3, withLabel: 'en moto', cardTitle: 'Mi moto' },
  { id: 'car', label: 'Coche', icon: '🚗', speedLimit: 200, stopThreshold: 3, withLabel: 'en coche', cardTitle: 'Mi coche' },
]

const BY_ID = new Map(ACTIVITIES.map((activity) => [activity.id, activity]))

export const DEFAULT_ACTIVITY: ActivityType = 'bike'

export function activityOf(id: ActivityType | undefined | null): ActivityDefinition {
  return BY_ID.get(id ?? DEFAULT_ACTIVITY) ?? ACTIVITIES[0]
}

export function activityIcon(id: ActivityType | undefined | null): string {
  return activityOf(id).icon
}

export function activityLabel(id: ActivityType | undefined | null): string {
  return activityOf(id).label
}

/**
 * Ajustes efectivos del filtro GPS para un medio concreto.
 * La bicicleta respeta los valores configurados por el usuario; el resto de
 * medios aportan los suyos porque el usuario no deberia tener que reajustarlos
 * cada vez que cambia de vehiculo.
 */
export function settingsForActivity(settings: AppSettings, id: ActivityType): AppSettings {
  const activity = activityOf(id)
  return {
    ...settings,
    maxPlausibleSpeed: activity.speedLimit ?? settings.maxPlausibleSpeed,
    stopSpeedThreshold: activity.stopThreshold ?? settings.stopSpeedThreshold,
  }
}
