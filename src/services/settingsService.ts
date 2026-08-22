import {
  DEFAULT_SETTINGS,
  SETTINGS_LIMITS,
  type AppSettings,
  type ThemeMode,
} from '@/config/defaults'

/**
 * Preferencias del usuario.
 * Viven en localStorage (sincronas, disponibles antes del primer render) y se
 * publican mediante un pequeno store observable que consume `useSettings`.
 */

const STORAGE_KEY = 'cyclerun.settings.v1'

type Listener = (settings: AppSettings) => void

let current: AppSettings = load()
const listeners = new Set<Listener>()

function load(): AppSettings {
  if (typeof localStorage === 'undefined') return DEFAULT_SETTINGS
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_SETTINGS
    return sanitize({ ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<AppSettings>) })
  } catch {
    return DEFAULT_SETTINGS
  }
}

/** Recorta cualquier valor fuera de rango: la configuracion nunca rompe el GPS. */
function sanitize(settings: AppSettings): AppSettings {
  const next = { ...settings }
  for (const key of Object.keys(SETTINGS_LIMITS) as Array<keyof typeof SETTINGS_LIMITS>) {
    const limit = SETTINGS_LIMITS[key]
    const value = Number(next[key])
    next[key] = Number.isFinite(value)
      ? Math.min(limit.max, Math.max(limit.min, value))
      : DEFAULT_SETTINGS[key]
  }
  if (next.maxAccuracy < next.goodAccuracy) next.maxAccuracy = next.goodAccuracy
  return next
}

export function getSettings(): AppSettings {
  return current
}

export function subscribeSettings(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function updateSettings(patch: Partial<AppSettings>): AppSettings {
  current = sanitize({ ...current, ...patch })
  persist()
  listeners.forEach((cb) => cb(current))
  return current
}

export function resetSettings(): AppSettings {
  current = { ...DEFAULT_SETTINGS }
  persist()
  listeners.forEach((cb) => cb(current))
  return current
}

function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current))
  } catch {
    // Modo privado o cuota agotada: la app sigue funcionando con los valores
    // en memoria durante esta sesion.
  }
}

/** Aplica el tema al documento; se llama al arrancar y al cambiar el ajuste. */
export function applyTheme(mode: ThemeMode): void {
  if (typeof document === 'undefined') return
  const prefersDark =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-color-scheme: dark)').matches !== false
  const resolved = mode === 'system' ? (prefersDark ? 'dark' : 'light') : mode
  document.documentElement.dataset.theme = resolved
  const meta = document.querySelector('meta[name="theme-color"]')
  meta?.setAttribute('content', resolved === 'dark' ? '#0b0f14' : '#f4f6fa')
}
