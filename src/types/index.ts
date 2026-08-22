import type { ActivityType } from '@/config/activities'

/**
 * Tipos de dominio de CYCLERUN.
 * Todas las magnitudes internas usan unidades del SI:
 *   distancia -> metros, velocidad -> m/s, tiempo -> milisegundos.
 * La conversion a km / km/h ocurre unicamente en la capa de formato.
 */

/** Lectura cruda de la Geolocation API, ya normalizada. */
export interface GeoFix {
  latitude: number
  longitude: number
  timestamp: number
  accuracy: number | null
  altitude: number | null
  /** velocidad reportada por el dispositivo, en m/s */
  speed: number | null
  /** rumbo en grados (0 = norte) */
  heading: number | null
}

/** Punto aceptado y almacenado dentro de una carrera. */
export interface RoutePoint extends GeoFix {
  /** velocidad calculada y suavizada por la app, en m/s */
  computedSpeed: number
  /** false si el punto se registro con el usuario detenido */
  moving: boolean
  /** indice de tramo; se incrementa al reanudar tras una pausa */
  segment: number
}

export type GpsStatus =
  | 'unsupported'
  | 'denied'
  | 'unavailable'
  | 'searching'
  | 'ready'
  | 'weak'
  | 'lost'

export interface GpsState {
  status: GpsStatus
  /** ultima precision conocida en metros */
  accuracy: number | null
  /** ultimo fix aceptado */
  lastFix: GeoFix | null
  /** timestamp del ultimo fix aceptado */
  lastFixAt: number | null
  /** numero de lecturas descartadas por precision o por salto */
  rejected: number
  message: string
}

/** Tramo de la carrera realizado con un mismo medio de transporte. */
export interface ActivitySpan {
  activity: ActivityType
  startTime: number
  endTime: number
  /** metros recorridos con ese medio */
  distance: number
  /** ms en movimiento con ese medio */
  movingTime: number
}

export type RideStatus = 'idle' | 'acquiring' | 'recording' | 'paused' | 'finished'

/** Metricas calculadas de una carrera. */
export interface RideStats {
  /** metros */
  distance: number
  /** ms de actividad (movimiento + detenido), sin contar pausas manuales */
  duration: number
  /** ms en movimiento */
  movingTime: number
  /** ms detenido (parada automatica detectada) */
  stoppedTime: number
  /** ms en pausa manual */
  pausedTime: number
  /** m/s, calculada sobre el tiempo en movimiento */
  averageSpeed: number
  /** m/s, calculada sobre la duracion total */
  overallAverageSpeed: number
  /** m/s */
  maxSpeed: number
  /** metros de desnivel acumulado positivo */
  elevationGain: number
  /** metros de desnivel acumulado negativo */
  elevationLoss: number
}

/** Documento de carrera (resumen). El track vive en una subcoleccion. */
export interface Ride extends RideStats {
  id: string
  userId: string | null
  startTime: number
  endTime: number
  createdAt: number
  pointCount: number
  /** medio de transporte principal (el de mayor distancia) */
  activity: ActivityType
  /** todos los tramos, en orden; hay mas de uno si se cambio de medio */
  activities: ActivitySpan[]
  /** polilinea simplificada para listados y miniaturas */
  previewLat: number[]
  previewLon: number[]
  /** velocidad (m/s) en cada punto de la vista previa, para colorear la ruta */
  previewSpeed: number[]
  /** nombre opcional dado por el usuario */
  title?: string
}

export interface RideWithTrack extends Ride {
  points: RoutePoint[]
}

/** Estado en vivo publicado por el motor de carrera. */
export interface RideState extends RideStats {
  status: RideStatus
  rideId: string | null
  startTime: number | null
  endTime: number | null
  /** m/s suavizada */
  currentSpeed: number
  /** true cuando la deteccion de parada considera al usuario detenido */
  isStopped: boolean
  pointCount: number
  lastPoint: RoutePoint | null
  segment: number
  /** medio de transporte en uso ahora mismo */
  activity: ActivityType
  activities: ActivitySpan[]
}

/** Tramo de un kilometro, para la tabla de rendimiento del reporte. */
export interface KmSplit {
  km: number
  /** metros reales de este tramo (el ultimo puede ser parcial) */
  distance: number
  /** ms empleados */
  duration: number
  /** m/s */
  speed: number
  elevationGain: number
}

export interface PersonalRecords {
  maxSpeed: { value: number; rideId: string | null; date: number | null }
  maxDistance: { value: number; rideId: string | null; date: number | null }
  maxElevation: { value: number; rideId: string | null; date: number | null }
  maxMovingTime: { value: number; rideId: string | null; date: number | null }
  bestAverageSpeed: { value: number; rideId: string | null; date: number | null }
}

export interface AggregateStats {
  totalDistance: number
  totalRides: number
  totalDuration: number
  totalMovingTime: number
  totalElevationGain: number
  averageSpeed: number
  maxSpeed: number
  maxDistance: number
  weekDistance: number
  monthDistance: number
  yearDistance: number
}

/** Estado de sincronizacion de una carrera guardada localmente. */
export interface PendingRide {
  ride: Ride
  points: RoutePoint[]
  /** uid con el que se debe subir; null = se subira con el usuario que inicie sesion */
  userId: string | null
  attempts: number
  lastError: string | null
  savedAt: number
}

// ---------------------------------------------------------------- social

/** Perfil publico minimo que se comparte entre amigos. */
export interface PublicProfile {
  uid: string
  displayName: string | null
  photoURL: string | null
}

export interface Friend extends PublicProfile {
  /** momento en el que se acepto la amistad */
  since: number
  /**
   * Si esta persona puede ver mi ubicacion en vivo. Viene activado por
   * defecto; la ausencia del campo se interpreta como `true`, para que las
   * amistades creadas antes de existir esta opcion sigan funcionando.
   */
  shareLocation?: boolean
}

export interface FriendRequest extends PublicProfile {
  /** uid de quien envia la solicitud (coincide con el id del documento) */
  fromUid: string
  email: string | null
  createdAt: number
}

/**
 * Posicion en vivo publicada durante una carrera.
 * Solo la pueden leer los uid incluidos en `visibleTo`, que son exactamente
 * los amigos aceptados de quien la publica.
 */
export interface LivePresence extends PublicProfile {
  latitude: number
  longitude: number
  accuracy: number | null
  /** m/s */
  speed: number
  heading: number | null
  /** metros recorridos en la carrera en curso */
  distance: number
  /** 'online' = app abierta compartiendo, sin carrera en curso */
  status: 'recording' | 'paused' | 'online'
  rideId: string | null
  /** marca de tiempo del emisor (su reloj) */
  updatedAt: number
  /**
   * Recorrido de la carrera en curso, simplificado. Permite que los amigos vean
   * por donde has pasado y no solo donde estas. Vacio si no hay carrera.
   */
  pathLat?: number[]
  pathLon?: number[]
  visibleTo: string[]
  /** momento en que este dispositivo recibio el dato; lo anade el lector */
  receivedAt?: number
}
