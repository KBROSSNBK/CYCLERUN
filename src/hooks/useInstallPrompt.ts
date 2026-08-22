import { useCallback, useEffect, useState } from 'react'

/**
 * Instalacion en el telefono (A2HS).
 *
 * Chrome y Edge disparan `beforeinstallprompt` y permiten lanzar el dialogo
 * nativo. Safari de iOS no lo implementa, asi que ahi se muestran las
 * instrucciones manuales, que es lo unico posible.
 */

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export interface InstallState {
  /** true si la app ya se abre como aplicacion instalada */
  installed: boolean
  /** true si el navegador ofrece el dialogo nativo */
  canPrompt: boolean
  /** true en iOS, donde hay que explicar el proceso manualmente */
  needsManualSteps: boolean
  install: () => Promise<boolean>
}

export function useInstallPrompt(): InstallState {
  const [deferred, setDeferred] = useState<InstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(() => isStandalone())

  useEffect(() => {
    const onBeforeInstall = (event: Event) => {
      event.preventDefault()
      setDeferred(event as InstallPromptEvent)
    }
    const onInstalled = () => {
      setInstalled(true)
      setDeferred(null)
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const install = useCallback(async () => {
    if (!deferred) return false
    await deferred.prompt()
    const choice = await deferred.userChoice
    setDeferred(null)
    return choice.outcome === 'accepted'
  }, [deferred])

  return {
    installed,
    canPrompt: deferred !== null,
    needsManualSteps: !installed && deferred === null && isIos(),
    install,
  }
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iPhone|iPad|iPod/i.test(navigator.userAgent)
}
