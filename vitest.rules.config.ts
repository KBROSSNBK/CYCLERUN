import { defineConfig } from 'vitest/config'
import { fileURLToPath, URL } from 'node:url'

/**
 * Configuracion aparte para las pruebas de las reglas de seguridad: necesitan
 * el emulador de Firestore en marcha, asi que no deben ejecutarse junto con las
 * pruebas normales (`npm test`). Se lanzan con `npm run test:rules`, que
 * arranca el emulador alrededor de esta ejecucion.
 */
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['tests/rules/**/*.test.ts'],
    // El emulador tarda en responder la primera vez.
    testTimeout: 20000,
    hookTimeout: 20000,
    fileParallelism: false,
  },
})
