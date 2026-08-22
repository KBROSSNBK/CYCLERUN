import { firebaseEnabled } from '@/firebase/app'
import type { AppUser } from '@/firebase/auth'
import { clearPresence, publishPresence } from '@/firebase/live'
import { gpsService } from '@/gps/gpsService'
import { rideEngine } from './rideEngine'

/**
 * Publicacion de la posicion en vivo para los amigos.
 *
 * Se publica en dos situaciones, y en ninguna otra:
 *
 *  1. **Durante una carrera**, si el usuario tiene activado el compartir.
 *  2. **Con la pantalla de Amigos abierta**, para poder veros en el mapa antes
 *     de salir. Esto es lo que permite que dos personas se vean a la vez sin
 *     tener que estar las dos grabando.
 *
 * En cuanto se cierra esa pantalla y no hay carrera, o se desactiva el ajuste,
 * o se cierra sesion, el documento se borra de Firestore.
 *
 * La escritura va limitada por `intervalMs` para no gastar cuota: con 8 s son
 * unas 450 escrituras por hora.
 */

interface LiveConfig {
  user: AppUser | null
  friendUids: string[]
  enabled: boolean
  intervalMs: number
}

export interface LiveShareState {
  /** true si ahora mismo se esta publicando la posicion */
  sharing: boolean
  /** motivo por el que se publica */
  reason: 'ride' | 'screen' | null
  lastPublishAt: number | null
  lastError: string | null
  /** por que no se esta publicando, en lenguaje llano */
  blockedBy: string | null
}

type Listener = (state: LiveShareState) => void

class LiveShareService {
  private config: LiveConfig = { user: null, friendUids: [], enabled: false, intervalMs: 8000 }
  private visible = false

  /** escucha permanente del motor: detecta que empieza o termina una carrera */
  private unsubscribeRide: (() => void) | null = null
  /** escuchas activas solo mientras se publica */
  private unsubscribeFix: (() => void) | null = null
  private heartbeat: ReturnType<typeof setInterval> | null = null

  private lastPublishAt = 0
  private publishing = false
  private hasPublished = false
  /** ultimo estado publicado, para detectar cambios que no pueden esperar */
  private lastPublishedStatus: string | null = null
  /** hay un cambio de estado esperando a que termine la escritura en curso */
  private needsRepublish = false

  private state: LiveShareState = {
    sharing: false,
    reason: null,
    lastPublishAt: null,
    lastError: null,
    blockedBy: null,
  }
  private listeners = new Set<Listener>()

  // ------------------------------------------------------------ suscripciones

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getSnapshot = (): LiveShareState => this.state

  // ----------------------------------------------------------------- control

  configure(config: Partial<LiveConfig>): void {
    const previousUid = this.config.user?.uid
    this.config = { ...this.config, ...config }
    this.reconcile(previousUid)
  }

  /**
   * Marca que el usuario esta mirando el mapa de amigos. Mientras sea cierto
   * se publica la posicion aunque no haya carrera.
   */
  setVisible(visible: boolean): void {
    if (this.visible === visible) return
    this.visible = visible
    this.reconcile(this.config.user?.uid)
  }

  /** Retira la posicion publicada (fin de carrera, cierre de sesion, salida). */
  async stop(): Promise<void> {
    const uid = this.config.user?.uid
    this.detach()
    this.unsubscribeRide?.()
    this.unsubscribeRide = null
    if (uid) await this.withdraw(uid)
  }

  // ---------------------------------------------------------------- internos

  /** Condiciones para vigilar el motor, aunque todavia no se publique nada. */
  private canArm(): boolean {
    return (
      firebaseEnabled &&
      this.config.enabled &&
      this.config.user !== null &&
      this.config.friendUids.length > 0
    )
  }

  private shouldPublish(): boolean {
    return this.canArm() && (this.visible || rideEngine.isActive())
  }

  private describeBlock(): string | null {
    if (!firebaseEnabled) return 'Firebase no está configurado'
    if (!this.config.user) return 'Inicia sesión con Google'
    if (!this.config.enabled) return 'Activa «Compartir ubicación en vivo»'
    if (this.config.friendUids.length === 0) return 'Todavía no tienes amigos aceptados'
    if (!this.visible && !rideEngine.isActive()) return 'Abre esta pantalla o inicia una carrera'
    if (!gpsService.getState().lastFix) return 'Esperando la primera posición del GPS'
    return null
  }

  /**
   * Ajusta las suscripciones al estado actual y publica o retira la posicion.
   *
   * Se separa en dos niveles a proposito: la vigilancia del motor debe estar
   * activa aunque todavia no se publique nada, porque si no, nadie se enteraria
   * de que el usuario acaba de pulsar «Iniciar carrera».
   */
  private reconcile(previousUid: string | undefined): void {
    if (this.canArm() && !this.unsubscribeRide) {
      this.unsubscribeRide = rideEngine.subscribe(() => this.reconcile(this.config.user?.uid))
    }
    if (!this.canArm() && this.unsubscribeRide) {
      this.unsubscribeRide()
      this.unsubscribeRide = null
    }

    const active = this.shouldPublish()

    if (active && !this.unsubscribeFix) {
      this.attach()
      // El GPS puede estar apagado si no hay carrera: hace falta encenderlo
      // para tener algo que publicar.
      gpsService.start()
      this.maybePublish(true)
    } else if (active) {
      this.maybePublish(false)
    } else {
      if (this.unsubscribeFix) this.detach()
      if (this.hasPublished) {
        const uid = this.config.user?.uid ?? previousUid
        if (uid) void this.withdraw(uid)
      }
    }

    this.publish({ blockedBy: this.describeBlock() })
  }

  private attach(): void {
    this.unsubscribeFix = gpsService.onFix(() => this.maybePublish(false))
    // Latido: parado en un semaforo no llegan fixes nuevos y el documento
    // envejeceria hasta desaparecer del mapa de los demas.
    this.heartbeat = setInterval(() => this.maybePublish(false), this.config.intervalMs)
  }

  private detach(): void {
    this.unsubscribeFix?.()
    this.unsubscribeFix = null
    if (this.heartbeat !== null) {
      clearInterval(this.heartbeat)
      this.heartbeat = null
    }
  }

  private maybePublish(force: boolean): void {
    if (!this.shouldPublish()) return

    const user = this.config.user
    if (!user) return

    const ride = rideEngine.getSnapshot()
    const riding = ride.status === 'recording' || ride.status === 'paused'
    const status =
      ride.status === 'recording' ? 'recording' : ride.status === 'paused' ? 'paused' : 'online'

    // Empezar, pausar o reanudar se publica al instante: hacer esperar al
    // limite de escrituras dejaria a los amigos viendo un estado falso durante
    // varios segundos.
    const statusChanged = status !== this.lastPublishedStatus
    const now = Date.now()
    if (!force && !statusChanged && now - this.lastPublishAt < this.config.intervalMs) return

    // La escritura que si tocaba hacer se encola si hay otra en vuelo; una que
    // solo estaba limitada por el intervalo, no: se descarta sin mas.
    if (this.publishing) {
      this.needsRepublish = true
      return
    }

    const fix = gpsService.getState().lastFix
    if (!fix) {
      this.publish({ blockedBy: this.describeBlock() })
      return
    }

    this.lastPublishAt = now
    this.publishing = true
    void publishPresence({
      uid: user.uid,
      displayName: user.displayName,
      photoURL: user.photoURL,
      latitude: fix.latitude,
      longitude: fix.longitude,
      accuracy: fix.accuracy,
      speed: ride.status === 'recording' ? ride.currentSpeed : 0,
      heading: fix.heading,
      distance: riding ? ride.distance : 0,
      status,
      rideId: riding ? ride.rideId : null,
      updatedAt: now,
      visibleTo: this.config.friendUids,
    })
      .then(() => {
        this.hasPublished = true
        this.lastPublishedStatus = status
        this.publish({
          sharing: true,
          reason: riding ? 'ride' : 'screen',
          lastPublishAt: now,
          lastError: null,
          blockedBy: null,
        })
      })
      .catch((error: Error) => {
        // Sin conexion no es grave: la posicion en vivo es efimera y el
        // siguiente intento la actualizara. Pero si son las reglas quienes lo
        // rechazan, hay que verlo.
        this.publish({ lastError: error?.message ?? 'No se ha podido publicar la posición' })
      })
      .finally(() => {
        this.publishing = false
        if (this.needsRepublish) {
          this.needsRepublish = false
          this.maybePublish(true)
        }
      })
  }

  private async withdraw(uid: string): Promise<void> {
    this.hasPublished = false
    this.lastPublishedStatus = null
    this.publish({ sharing: false, reason: null })
    await clearPresence(uid)
  }

  private publish(patch: Partial<LiveShareState>): void {
    const next = { ...this.state, ...patch }
    if (
      next.sharing === this.state.sharing &&
      next.reason === this.state.reason &&
      next.lastPublishAt === this.state.lastPublishAt &&
      next.lastError === this.state.lastError &&
      next.blockedBy === this.state.blockedBy
    ) {
      return
    }
    this.state = next
    this.listeners.forEach((cb) => cb(next))
  }
}

export const liveShareService = new LiveShareService()
