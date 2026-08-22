import { firebaseEnabled } from '@/firebase/app'
import type { AppUser } from '@/firebase/auth'
import { clearPresence, publishPresence } from '@/firebase/live'
import { gpsService } from '@/gps/gpsService'
import { rideEngine } from './rideEngine'

/**
 * Publicacion de la posicion en vivo para los amigos.
 *
 * Reglas de funcionamiento:
 *  - solo publica si el usuario lo ha activado explicitamente en Ajustes,
 *  - solo mientras hay una carrera en curso,
 *  - solo hacia los amigos aceptados (`visibleTo`),
 *  - borra el documento al terminar, al pausar la difusion o al cerrar sesion.
 *
 * La escritura va limitada por `intervalMs` para no gastar cuota de Firestore:
 * con 8 s son unas 450 escrituras por hora de pedaleo.
 */

interface LiveConfig {
  user: AppUser | null
  friendUids: string[]
  enabled: boolean
  intervalMs: number
}

class LiveShareService {
  private config: LiveConfig = { user: null, friendUids: [], enabled: false, intervalMs: 8000 }
  private unsubscribeFix: (() => void) | null = null
  private unsubscribeState: (() => void) | null = null
  private lastPublishAt = 0
  private publishing = false
  private hasPublished = false
  private lastStatus: string | null = null

  configure(config: Partial<LiveConfig>): void {
    const previous = this.config
    this.config = { ...previous, ...config }

    const shouldRun = this.canShare()
    if (shouldRun && !this.unsubscribeFix) this.attach()
    if (!shouldRun && this.unsubscribeFix) this.detach()

    // Si se desactiva o desaparece el usuario, se retira la posicion publicada.
    if (!shouldRun && this.hasPublished) {
      const uid = previous.user?.uid ?? this.config.user?.uid
      if (uid) void this.withdraw(uid)
    }
  }

  private canShare(): boolean {
    return firebaseEnabled && this.config.enabled && this.config.user !== null
  }

  private attach(): void {
    this.unsubscribeFix = gpsService.onFix(() => this.maybePublish(false))
    this.unsubscribeState = rideEngine.subscribe((state) => {
      // Un cambio de estado (pausa, reanudacion, fin) se publica al instante.
      if (state.status !== this.lastStatus) {
        this.lastStatus = state.status
        if (state.status === 'recording' || state.status === 'paused') {
          this.maybePublish(true)
        } else if (this.hasPublished && this.config.user) {
          void this.withdraw(this.config.user.uid)
        }
      }
    })
  }

  private detach(): void {
    this.unsubscribeFix?.()
    this.unsubscribeState?.()
    this.unsubscribeFix = null
    this.unsubscribeState = null
  }

  private maybePublish(force: boolean): void {
    if (!this.canShare() || this.publishing) return

    const user = this.config.user
    const state = rideEngine.getSnapshot()
    if (!user || (state.status !== 'recording' && state.status !== 'paused')) return

    const now = Date.now()
    if (!force && now - this.lastPublishAt < this.config.intervalMs) return

    const fix = gpsService.getState().lastFix
    if (!fix) return

    this.lastPublishAt = now
    this.publishing = true
    void publishPresence({
      uid: user.uid,
      displayName: user.displayName,
      photoURL: user.photoURL,
      latitude: fix.latitude,
      longitude: fix.longitude,
      accuracy: fix.accuracy,
      speed: state.status === 'paused' ? 0 : state.currentSpeed,
      heading: fix.heading,
      distance: state.distance,
      status: state.status === 'paused' ? 'paused' : 'recording',
      rideId: state.rideId,
      updatedAt: now,
      visibleTo: this.config.friendUids,
    })
      .then(() => {
        this.hasPublished = true
      })
      .catch(() => {
        // Sin conexion no pasa nada: la posicion en vivo es efimera y el
        // siguiente intento la actualizara.
      })
      .finally(() => {
        this.publishing = false
      })
  }

  private async withdraw(uid: string): Promise<void> {
    this.hasPublished = false
    await clearPresence(uid)
  }

  /** Retira la posicion publicada; se llama al finalizar la carrera. */
  async stop(): Promise<void> {
    const uid = this.config.user?.uid
    this.detach()
    if (uid) await this.withdraw(uid)
  }
}

export const liveShareService = new LiveShareService()
