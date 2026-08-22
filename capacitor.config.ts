import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Envoltorio nativo de CYCLERUN.
 *
 * Existe por un motivo concreto: un navegador congela la pagina al apagarse la
 * pantalla y corta el acceso al GPS, de modo que la web no puede registrar un
 * recorrido con el telefono bloqueado. La aplicacion nativa arranca un servicio
 * en primer plano (con su notificacion permanente) que sigue recibiendo
 * posiciones aunque el movil este bloqueado.
 *
 * Los archivos web son exactamente los mismos que se publican en GitHub Pages:
 * se empaquetan desde `dist`, asi que la app funciona sin conexion.
 */
const config: CapacitorConfig = {
  appId: 'cl.kbros.cyclerun',
  appName: 'CYCLERUN',
  webDir: 'dist',
  android: {
    // El esquema https evita que el WebView trate el contenido como inseguro,
    // lo que bloquearia la geolocalizacion y el service worker.
    androidScheme: 'https',
  },
  plugins: {
    BackgroundGeolocation: {},
  },
}

export default config
