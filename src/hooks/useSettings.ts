import { useCallback, useSyncExternalStore } from 'react'
import type { AppSettings } from '@/config/defaults'
import {
  getSettings,
  resetSettings,
  subscribeSettings,
  updateSettings,
} from '@/services/settingsService'

/** Preferencias del usuario, reactivas en toda la aplicacion. */
export function useSettings(): {
  settings: AppSettings
  update: (patch: Partial<AppSettings>) => void
  reset: () => void
} {
  const settings = useSyncExternalStore(subscribeSettings, getSettings, getSettings)
  const update = useCallback((patch: Partial<AppSettings>) => {
    updateSettings(patch)
  }, [])
  const reset = useCallback(() => {
    resetSettings()
  }, [])
  return { settings, update, reset }
}
