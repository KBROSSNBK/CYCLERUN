/**
 * Deteccion de soporte y de permisos de geolocalizacion.
 * Se mantiene aparte del servicio GPS porque la pantalla de diagnostico la
 * consulta sin necesidad de arrancar un `watchPosition`.
 */

export type PermissionStatus = 'granted' | 'denied' | 'prompt' | 'unknown'

export interface EnvironmentReport {
  supported: boolean
  secureContext: boolean
  permission: PermissionStatus
  /** true si el navegador expone la Permissions API para geolocation */
  canQueryPermission: boolean
  userAgentHint: string
}

export function isGeolocationSupported(): boolean {
  return typeof navigator !== 'undefined' && 'geolocation' in navigator
}

/**
 * La Geolocation API solo funciona en contextos seguros (HTTPS o localhost).
 * Es la causa mas habitual de "no funciona el GPS" al abrir la app por IP.
 */
export function isSecureContext(): boolean {
  if (typeof window === 'undefined') return false
  if (window.isSecureContext) return true
  const host = window.location.hostname
  return host === 'localhost' || host === '127.0.0.1' || host === '::1'
}

export async function queryPermission(): Promise<PermissionStatus> {
  if (typeof navigator === 'undefined' || !navigator.permissions?.query) return 'unknown'
  try {
    const result = await navigator.permissions.query({ name: 'geolocation' as PermissionName })
    return result.state as PermissionStatus
  } catch {
    return 'unknown'
  }
}

/** Notifica cambios de permiso mientras la app esta abierta. */
export function watchPermission(onChange: (state: PermissionStatus) => void): () => void {
  if (typeof navigator === 'undefined' || !navigator.permissions?.query) return () => {}
  let status: PermissionStatus_ | null = null
  let cancelled = false
  const handler = () => {
    if (status) onChange(status.state as PermissionStatus)
  }
  navigator.permissions
    .query({ name: 'geolocation' as PermissionName })
    .then((result) => {
      if (cancelled) return
      status = result
      result.addEventListener('change', handler)
      onChange(result.state as PermissionStatus)
    })
    .catch(() => {})
  return () => {
    cancelled = true
    status?.removeEventListener('change', handler)
  }
}

type PermissionStatus_ = {
  state: string
  addEventListener: (type: string, cb: () => void) => void
  removeEventListener: (type: string, cb: () => void) => void
}

export async function describeEnvironment(): Promise<EnvironmentReport> {
  const supported = isGeolocationSupported()
  return {
    supported,
    secureContext: isSecureContext(),
    permission: supported ? await queryPermission() : 'denied',
    canQueryPermission: Boolean(navigator?.permissions?.query),
    userAgentHint: detectPlatform(),
  }
}

function detectPlatform(): string {
  if (typeof navigator === 'undefined') return 'desconocido'
  const ua = navigator.userAgent
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS'
  if (/Android/i.test(ua)) return 'Android'
  if (/Windows/i.test(ua)) return 'Windows'
  if (/Mac OS X/i.test(ua)) return 'macOS'
  return 'desconocido'
}

/** Instrucciones concretas segun el motivo del bloqueo y la plataforma. */
export function permissionHelp(report: EnvironmentReport): string[] {
  if (!report.supported) {
    return [
      'Este navegador no expone la API de geolocalización.',
      'Prueba con Chrome, Safari o Edge actualizados.',
    ]
  }
  if (!report.secureContext) {
    return [
      'La geolocalización exige una conexión segura (HTTPS).',
      'Abre la aplicación mediante HTTPS o desde localhost.',
    ]
  }
  if (report.permission === 'denied') {
    if (report.userAgentHint === 'iOS') {
      return [
        'Ajustes → Privacidad y seguridad → Localización: activa el servicio.',
        'Ajustes → Safari → Ubicación: selecciona «Preguntar» o «Permitir».',
        'Recarga después la aplicación.',
      ]
    }
    if (report.userAgentHint === 'Android') {
      return [
        'Toca el candado de la barra de direcciones → Permisos → Ubicación → Permitir.',
        'Comprueba que la ubicación del teléfono esté activada.',
        'Recarga después la aplicación.',
      ]
    }
    return [
      'Abre los permisos del sitio en tu navegador y permite la ubicación.',
      'Recarga después la aplicación.',
    ]
  }
  return []
}
