import { defineConfig } from 'vitest/config'
import { fileURLToPath, URL } from 'node:url'

/**
 * Las pruebas cubren la logica de calculo (GPS, distancia, tiempos, tramos y
 * codificacion), que es donde un error pasa desapercibido y arruina una
 * carrera. La interfaz se verifica en el navegador.
 */
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
