import type { ActivityType } from './activities'
/**
 * Configuracion por defecto de CYCLERUN.
 * Todo lo relacionado con el comportamiento del GPS y la deteccion de parada
 * es ajustable por el usuario desde la pantalla de Configuracion; estos son
 * los valores iniciales y los limites admitidos.
 */

export type ThemeMode = 'dark' | 'light' | 'system'
export type SpeedUnit = 'kmh' | 'mph'
export type DistanceUnit = 'km' | 'mi'

export interface AppSettings {
  /** medio de transporte con el que se inicia la siguiente carrera */
  defaultActivity: ActivityType

  /** ---- Unidades ---- */
  speedUnit: SpeedUnit
  distanceUnit: DistanceUnit

  /** ---- Filtrado GPS ---- */
  /** por debajo de esta precision (m) el fix se considera bueno */
  goodAccuracy: number
  /** por encima de esta precision (m) el fix se descarta */
  maxAccuracy: number
  /** precision (m) exigida para dar el GPS por "listo" antes de arrancar */
  readyAccuracy: number
  /** desplazamiento minimo (m) entre puntos para contar distancia (anti-jitter) */
  minMoveDistance: number
  /** velocidad (km/h) por encima de la cual el desplazamiento se considera un salto GPS */
  maxPlausibleSpeed: number
  /** numero de lecturas usadas para suavizar la velocidad instantanea */
  speedSmoothingWindow: number
  /** intervalo minimo (ms) entre puntos registrados */
  updateInterval: number
  /** ms sin fix tras los que se avisa de perdida de senal */
  signalLostAfter: number
  /** cambio minimo de altitud (m) para acumular desnivel */
  elevationThreshold: number

  /** ---- Deteccion de parada ---- */
  /** velocidad (km/h) por debajo de la cual se considera que no hay movimiento */
  stopSpeedThreshold: number
  /** ms por debajo del umbral para declarar la parada */
  stopDelay: number

  /** ---- Interfaz ---- */
  theme: ThemeMode
  /** mantener la pantalla encendida durante la carrera */
  keepScreenAwake: boolean
  /** el mapa sigue automaticamente la posicion */
  autoFollow: boolean
  /** vibrar al pausar / reanudar / finalizar */
  hapticFeedback: boolean

  /** ---- Amigos ---- */
  /** compartir la posicion en vivo con los amigos durante la carrera */
  shareLiveLocation: boolean
  /** cada cuanto se publica la posicion en vivo (ms) */
  liveUpdateInterval: number
}

export const DEFAULT_SETTINGS: AppSettings = {
  defaultActivity: 'bike',
  speedUnit: 'kmh',
  distanceUnit: 'km',

  goodAccuracy: 30,
  maxAccuracy: 100,
  readyAccuracy: 25,
  minMoveDistance: 2,
  maxPlausibleSpeed: 90,
  speedSmoothingWindow: 5,
  updateInterval: 1000,
  signalLostAfter: 10000,
  elevationThreshold: 2,

  stopSpeedThreshold: 2,
  stopDelay: 5000,

  theme: 'dark',
  keepScreenAwake: true,
  autoFollow: true,
  hapticFeedback: true,

  // Desactivado por defecto: compartir la ubicacion siempre debe ser una
  // decision explicita del usuario.
  shareLiveLocation: false,
  liveUpdateInterval: 8000,
}

/** Rangos admitidos por los controles de la pantalla de configuracion. */
export const SETTINGS_LIMITS = {
  goodAccuracy: { min: 5, max: 60, step: 1, unit: 'm' },
  maxAccuracy: { min: 20, max: 200, step: 5, unit: 'm' },
  readyAccuracy: { min: 5, max: 100, step: 5, unit: 'm' },
  minMoveDistance: { min: 0, max: 15, step: 1, unit: 'm' },
  maxPlausibleSpeed: { min: 40, max: 200, step: 5, unit: 'km/h' },
  speedSmoothingWindow: { min: 1, max: 15, step: 1, unit: 'lecturas' },
  updateInterval: { min: 250, max: 5000, step: 250, unit: 'ms' },
  signalLostAfter: { min: 5000, max: 60000, step: 1000, unit: 'ms' },
  elevationThreshold: { min: 0, max: 10, step: 0.5, unit: 'm' },
  stopSpeedThreshold: { min: 0.5, max: 10, step: 0.5, unit: 'km/h' },
  stopDelay: { min: 1000, max: 30000, step: 1000, unit: 'ms' },
  liveUpdateInterval: { min: 3000, max: 60000, step: 1000, unit: 'ms' },
} as const

export type TunableSetting = keyof typeof SETTINGS_LIMITS

/** Centro del mapa mientras no hay senal GPS. */
export const MAP_FALLBACK_CENTER: [number, number] = [40.4168, -3.7038]

/** Puntos por documento de la subcoleccion `track` en Firestore. */
export const TRACK_CHUNK_SIZE = 500

/** Maximo de puntos de la polilinea de vista previa guardada en el resumen. */
export const PREVIEW_MAX_POINTS = 300
