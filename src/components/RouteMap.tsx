import { useCallback, useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { MAP_FALLBACK_CENTER } from '@/config/defaults'
import { gpsService } from '@/gps/gpsService'
import { rideEngine } from '@/services/rideEngine'
import { getSettings } from '@/services/settingsService'
import type { LivePresence, RoutePoint } from '@/types'
import { formatDistance } from '@/utils/format'
import { boundsOf, splitSegments, type LatLng } from '@/utils/geo'

/**
 * Mapas basados en Leaflet + OpenStreetMap.
 *
 * El dibujo es imperativo a proposito: durante una carrera llegan posiciones
 * cada segundo y anadirlas a la polilinea existente evita volver a renderizar
 * el arbol de React una vez por punto.
 */

const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'

const ROUTE_STYLE: L.PolylineOptions = {
  color: '#00e5a0',
  weight: 5,
  opacity: 0.9,
  lineJoin: 'round',
  lineCap: 'round',
}

function createMap(container: HTMLElement): L.Map {
  const map = L.map(container, {
    zoomControl: false,
    attributionControl: true,
    preferCanvas: true,
  }).setView(MAP_FALLBACK_CENTER, 13)

  L.tileLayer(TILE_URL, {
    attribution: TILE_ATTRIBUTION,
    maxZoom: 19,
    crossOrigin: true,
  }).addTo(map)

  L.control.zoom({ position: 'topright' }).addTo(map)
  return map
}

function riderIcon(heading: number | null): L.DivIcon {
  const arrow =
    heading !== null
      ? `<span class="rider-marker__heading" style="transform: translate(-50%, 0) rotate(${heading}deg)"></span>`
      : ''
  return L.divIcon({
    className: '',
    html: `<div style="position:relative"><div class="rider-marker"></div>${arrow}</div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  })
}

function endpointIcon(color: string): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<div class="endpoint-marker" style="background:${color}"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  })
}

/**
 * Marcador de un amigo: foto pequena con su nombre y, si esta pedaleando, la
 * distancia que lleva. La foto se mantiene discreta a proposito para que no
 * tape el recorrido cuando varios amigos coinciden en la misma calle.
 */
const FRIEND_MARKER_SIZE = 22

function friendIcon(presence: LivePresence): L.DivIcon {
  const name = presence.displayName ?? 'Amigo'
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('')

  // La geometria va en el propio elemento, no solo en la hoja de estilos: un
  // marcador de mapa no puede quedar gigante porque el navegador sirva una
  // version cacheada del CSS. La hoja solo aporta color y sombra.
  const box = `width:${FRIEND_MARKER_SIZE}px;height:${FRIEND_MARKER_SIZE}px`
  const avatar = presence.photoURL
    ? `<img src="${escapeHtml(presence.photoURL)}" alt="" referrerpolicy="no-referrer"
         style="${box};border-radius:50%;object-fit:cover;display:block" />`
    : `<span style="font-size:9px;line-height:1;font-weight:800">${escapeHtml(initials)}</span>`

  const modifier =
    presence.status === 'paused'
      ? ' is-paused'
      : presence.status === 'recording'
        ? ' is-riding'
        : ''

  // Contador de la carrera en curso: aparece en cuanto esa persona empieza a
  // grabar, aunque lleve 0.00 km, y desaparece si solo tiene la app abierta.
  const riding = presence.status === 'recording' || presence.status === 'paused'
  const distance = riding
    ? `<em style="font-style:normal;font-size:9px;line-height:1.25">` +
      `${escapeHtml(formatDistance(presence.distance, getSettings().distanceUnit))}</em>`
    : ''

  return L.divIcon({
    className: '',
    html:
      `<div class="friend-marker${modifier}" style="${box}">${avatar}` +
      `<span class="friend-marker__label" style="top:${FRIEND_MARKER_SIZE + 3}px">` +
      `<b style="font-size:10px;line-height:1.25">${escapeHtml(name.split(' ')[0])}</b>${distance}` +
      `</span></div>`,
    iconSize: [FRIEND_MARKER_SIZE, FRIEND_MARKER_SIZE],
    iconAnchor: [FRIEND_MARKER_SIZE / 2, FRIEND_MARKER_SIZE / 2],
  })
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Paleta para distinguir a varios amigos a la vez sobre el mismo mapa. */
const FRIEND_COLORS = ['#5aa9ff', '#f0a184', '#c084fc', '#ffab4d', '#4ade80', '#f472b6']

function colorForUid(uid: string): string {
  let hash = 0
  for (let i = 0; i < uid.length; i++) hash = (hash * 31 + uid.charCodeAt(i)) >>> 0
  return FRIEND_COLORS[hash % FRIEND_COLORS.length]
}

export interface FriendLayer {
  marker: L.Marker
  path: L.Polyline | null
}

/**
 * Sincroniza con el mapa los marcadores y los recorridos de los amigos.
 *
 * Se reutilizan las capas existentes de cada uid en lugar de recrearlas: asi el
 * icono no parpadea y la linea no se redibuja entera en cada actualizacion.
 */
function syncFriendLayers(
  map: L.Map | null,
  store: Map<string, FriendLayer>,
  presences: LivePresence[],
): void {
  if (!map) return
  const seen = new Set<string>()

  for (const presence of presences) {
    seen.add(presence.uid)
    const position: L.LatLngExpression = [presence.latitude, presence.longitude]
    const layer = store.get(presence.uid)

    // Recorrido de su carrera en curso, si lo esta compartiendo.
    const coords: LatLng[] = []
    const lat = presence.pathLat ?? []
    const lon = presence.pathLon ?? []
    for (let i = 0; i < Math.min(lat.length, lon.length); i++) coords.push([lat[i], lon[i]])

    if (layer) {
      layer.marker.setLatLng(position)
      layer.marker.setIcon(friendIcon(presence))
      if (coords.length > 1) {
        if (layer.path) {
          layer.path.setLatLngs(coords)
        } else {
          layer.path = L.polyline(coords, friendPathStyle(presence.uid)).addTo(map)
        }
      } else if (layer.path) {
        layer.path.remove()
        layer.path = null
      }
      continue
    }

    const marker = L.marker(position, {
      icon: friendIcon(presence),
      interactive: false,
      keyboard: false,
      zIndexOffset: 500,
    }).addTo(map)
    const path =
      coords.length > 1 ? L.polyline(coords, friendPathStyle(presence.uid)).addTo(map) : null
    store.set(presence.uid, { marker, path })
  }

  for (const [uid, layer] of store) {
    if (!seen.has(uid)) {
      layer.marker.remove()
      layer.path?.remove()
      store.delete(uid)
    }
  }
}

/** El recorrido del amigo se dibuja mas fino que el propio, para distinguirlos. */
function friendPathStyle(uid: string): L.PolylineOptions {
  return {
    color: colorForUid(uid),
    weight: 3,
    opacity: 0.75,
    dashArray: '1 6',
    lineCap: 'round',
    lineJoin: 'round',
  }
}

function clearFriendLayers(store: Map<string, FriendLayer>): void {
  for (const layer of store.values()) {
    layer.marker.remove()
    layer.path?.remove()
  }
  store.clear()
}

// ------------------------------------------------------------------- mapa vivo

interface LiveMapProps {
  /** el mapa sigue la posicion mientras el usuario no arrastre */
  follow: boolean
  onFollowChange: (follow: boolean) => void
  /** amigos que estan compartiendo su posicion ahora mismo */
  friends?: LivePresence[]
}

export function LiveMap({ follow, onFollowChange, friends = [] }: LiveMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markerRef = useRef<L.Marker | null>(null)
  const accuracyRef = useRef<L.Circle | null>(null)
  const lineRef = useRef<L.Polyline | null>(null)
  const segmentRef = useRef<number>(-1)
  const friendMarkers = useRef(new Map<string, FriendLayer>())
  const followRef = useRef(follow)

  followRef.current = follow

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const map = createMap(containerRef.current)
    mapRef.current = map

    // Un arrastre manual desactiva el seguimiento automatico.
    const stopFollowing = () => onFollowChange(false)
    map.on('dragstart', stopFollowing)

    // Pinta lo ya recorrido (al volver a la pantalla con la carrera en curso).
    const existing = rideEngine.getPoints()
    if (existing.length > 0) {
      for (const segment of splitSegments(existing)) {
        L.polyline(segment, ROUTE_STYLE).addTo(map)
      }
      const last = existing[existing.length - 1]
      segmentRef.current = last.segment
      lineRef.current = L.polyline(
        splitSegments(existing).slice(-1)[0] ?? [],
        ROUTE_STYLE,
      ).addTo(map)
      map.setView([last.latitude, last.longitude], 16)
    }

    return () => {
      map.off('dragstart', stopFollowing)
      map.remove()
      mapRef.current = null
      markerRef.current = null
      accuracyRef.current = null
      lineRef.current = null
      segmentRef.current = -1
    }
  }, [onFollowChange])

  // Marcador y circulo de precision: se mueven con cada fix aunque no se este
  // grabando, para que el usuario vea donde esta antes de arrancar.
  useEffect(() => {
    return gpsService.onFix(({ fix }) => {
      const map = mapRef.current
      if (!map) return
      const position: L.LatLngExpression = [fix.latitude, fix.longitude]

      if (!markerRef.current) {
        markerRef.current = L.marker(position, {
          icon: riderIcon(fix.heading),
          interactive: false,
          keyboard: false,
          zIndexOffset: 1000,
        }).addTo(map)
        map.setView(position, 17)
      } else {
        markerRef.current.setLatLng(position)
        markerRef.current.setIcon(riderIcon(fix.heading))
      }

      if (fix.accuracy !== null) {
        if (!accuracyRef.current) {
          accuracyRef.current = L.circle(position, {
            radius: fix.accuracy,
            color: '#00e5a0',
            weight: 1,
            opacity: 0.35,
            fillOpacity: 0.08,
            interactive: false,
          }).addTo(map)
        } else {
          accuracyRef.current.setLatLng(position)
          accuracyRef.current.setRadius(fix.accuracy)
        }
      }

      if (followRef.current) map.panTo(position, { animate: true, duration: 0.4 })
    })
  }, [])

  // Traza: cada punto aceptado se anade a la polilinea del tramo actual.
  useEffect(() => {
    return rideEngine.onPoint((point: RoutePoint) => {
      const map = mapRef.current
      if (!map) return
      if (point.segment !== segmentRef.current || !lineRef.current) {
        segmentRef.current = point.segment
        lineRef.current = L.polyline([], ROUTE_STYLE).addTo(map)
      }
      lineRef.current.addLatLng([point.latitude, point.longitude])
    })
  }, [])

  // Amigos en vivo sobre el mismo mapa que la propia carrera.
  useEffect(() => {
    syncFriendLayers(mapRef.current, friendMarkers.current, friends)
  }, [friends])

  useEffect(() => {
    const store = friendMarkers.current
    return () => clearFriendLayers(store)
  }, [])

  const recenter = useCallback(() => {
    const map = mapRef.current
    const marker = markerRef.current
    onFollowChange(true)
    if (map && marker) map.setView(marker.getLatLng(), Math.max(map.getZoom(), 16))
  }, [onFollowChange])

  return (
    <>
      <div ref={containerRef} className="map" />
      {!follow && (
        <button type="button" className="map__recenter" onClick={recenter}>
          ◎ Recentrar
        </button>
      )}
    </>
  )
}

/** Hook auxiliar para el boton de recentrado de la pantalla de carrera. */
export function useFollowState(initial: boolean): [boolean, (value: boolean) => void] {
  const [follow, setFollow] = useState(initial)
  return [follow, setFollow]
}

// --------------------------------------------------------------- mapa estatico

interface TrackMapProps {
  points: RoutePoint[]
  className?: string
  /** resalta un punto concreto (usado al recorrer el grafico de velocidad) */
  highlight?: LatLng | null
}

export function TrackMap({ points, className, highlight }: TrackMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const highlightRef = useRef<L.CircleMarker | null>(null)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    mapRef.current = createMap(containerRef.current)
    return () => {
      mapRef.current?.remove()
      mapRef.current = null
      highlightRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const layers: L.Layer[] = []
    const segments = splitSegments(points)
    for (const segment of segments) {
      if (segment.length > 1) layers.push(L.polyline(segment, ROUTE_STYLE).addTo(map))
    }

    const all = segments.flat()
    if (all.length > 0) {
      layers.push(
        L.marker(all[0], { icon: endpointIcon('#4ea8ff'), interactive: false }).addTo(map),
      )
      layers.push(
        L.marker(all[all.length - 1], {
          icon: endpointIcon('#ff5a5a'),
          interactive: false,
        }).addTo(map),
      )
      const bounds = boundsOf(all)
      if (bounds) map.fitBounds(bounds, { padding: [24, 24] })
    }

    return () => {
      for (const layer of layers) layer.remove()
    }
  }, [points])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (!highlight) {
      highlightRef.current?.remove()
      highlightRef.current = null
      return
    }
    if (!highlightRef.current) {
      highlightRef.current = L.circleMarker(highlight, {
        radius: 7,
        color: '#ffffff',
        weight: 2,
        fillColor: '#ffb020',
        fillOpacity: 1,
      }).addTo(map)
    } else {
      highlightRef.current.setLatLng(highlight)
    }
  }, [highlight])

  return <div ref={containerRef} className={className ?? 'map map--fixed'} />
}

/**
 * Miniatura del recorrido en SVG a partir de la polilinea de vista previa.
 * No carga teselas: el historial puede tener decenas de tarjetas y no tendria
 * sentido pedir un mapa completo para cada una.
 */
export function RouteThumbnail({
  lat,
  lon,
  className,
}: {
  lat: number[]
  lon: number[]
  className?: string
}) {
  if (lat.length < 2) {
    return <div className={className ?? 'ride-card__thumb'} />
  }

  const width = 84
  const height = 68
  const padding = 6
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

  const path = lat
    .map((value, index) => {
      const x = offsetX + (lon[index] - minLon) * scale
      const y = height - (offsetY + (value - minLat) * scale)
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  return (
    <svg
      className={className ?? 'ride-card__thumb'}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Miniatura del recorrido"
    >
      <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

/** Amigo sobre el que centrar el mapa; el contador permite repetir el mismo. */
export interface MapFocus {
  uid: string
  nonce: number
}

/**
 * Mapa de los amigos que estan compartiendo ahora mismo.
 *
 * Muestra tambien la posicion propia, de modo que al elegir a un amigo el
 * encuadre incluye a los dos y se ve de un vistazo lo lejos que esta.
 */
export function FriendsMap({
  presences,
  className,
  focus,
  onFocusLost,
}: {
  presences: LivePresence[]
  className?: string
  focus?: MapFocus | null
  /** el usuario ha arrastrado el mapa: deja de seguir al amigo elegido */
  onFocusLost?: () => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markers = useRef(new Map<string, FriendLayer>())
  const selfMarker = useRef<L.Marker | null>(null)
  const fitted = useRef(false)
  const presencesRef = useRef(presences)
  const following = useRef(false)

  presencesRef.current = presences

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const map = createMap(containerRef.current)
    mapRef.current = map

    const release = () => {
      if (following.current) {
        following.current = false
        onFocusLost?.()
      }
    }
    map.on('dragstart', release)

    const store = markers.current
    return () => {
      map.off('dragstart', release)
      clearFriendLayers(store)
      selfMarker.current = null
      map.remove()
      mapRef.current = null
      fitted.current = false
    }
  }, [onFocusLost])

  // Posicion propia, para poder vernos a los dos a la vez.
  useEffect(() => {
    return gpsService.onFix(({ fix }) => {
      const map = mapRef.current
      if (!map) return
      const position: L.LatLngExpression = [fix.latitude, fix.longitude]
      if (selfMarker.current) {
        selfMarker.current.setLatLng(position)
      } else {
        selfMarker.current = L.marker(position, {
          icon: riderIcon(fix.heading),
          interactive: false,
          keyboard: false,
          zIndexOffset: 1000,
        }).addTo(map)
      }
    })
  }, [])

  useEffect(() => {
    const map = mapRef.current
    syncFriendLayers(map, markers.current, presences)
    if (!map || presences.length === 0) return

    // Mientras se sigue a un amigo, el encuadre se rehace con cada posicion
    // suya; si no, solo la primera vez, para no arrebatarle el mapa al usuario.
    if (following.current && focus) {
      fitBetween(map, presences.find((p) => p.uid === focus.uid))
      return
    }
    const bounds = boundsOf(presences.map((p) => [p.latitude, p.longitude] as LatLng))
    if (bounds && !fitted.current) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 })
      fitted.current = true
    }
  }, [presences, focus])

  // Al elegir un amigo se encuadra el mapa entre su posicion y la mia.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !focus) {
      following.current = false
      return
    }
    following.current = true
    fitBetween(map, presencesRef.current.find((p) => p.uid === focus.uid))
  }, [focus])

  useEffect(() => {
    fitted.current = false
  }, [presences.length])

  return <div ref={containerRef} className={className ?? 'map map--fixed'} />
}

/**
 * Encuadra el mapa para que quepan el amigo elegido y la posicion propia.
 * Si todavia no hay senal GPS propia, centra sobre el amigo.
 */
function fitBetween(map: L.Map, friend: LivePresence | undefined): void {
  if (!friend) return
  const points: LatLng[] = [[friend.latitude, friend.longitude]]

  const me = gpsService.getState().lastFix
  if (me) points.push([me.latitude, me.longitude])

  if (points.length === 1) {
    map.setView(points[0], Math.max(map.getZoom(), 15))
    return
  }

  const bounds = boundsOf(points)
  if (bounds) map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 })
}
