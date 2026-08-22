import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'

/**
 * `base` debe coincidir con la ruta en la que se sirve la app.
 *  - Desarrollo  -> siempre "/"
 *  - GitHub Pages -> "/<nombre-del-repositorio>/"
 *
 * El workflow de despliegue exporta VITE_BASE_PATH automaticamente a partir
 * del nombre del repositorio, por lo que no hay que tocar nada al renombrarlo.
 * Para builds locales se usa DEFAULT_BASE (ver README).
 */
const DEFAULT_BASE = '/CYCLERUN/'

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const base = command === 'build' ? env.VITE_BASE_PATH || DEFAULT_BASE : '/'

  return {
    base,
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    build: {
      target: 'es2020',
      sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks: {
            firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore'],
            leaflet: ['leaflet'],
            charts: ['recharts'],
          },
        },
      },
    },
    plugins: [
      react(),
      VitePWA({
        registerType: 'prompt',
        includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
        manifest: {
          id: base,
          name: 'CYCLERUN',
          short_name: 'CYCLERUN',
          description: 'Registra tus carreras en bicicleta mediante GPS.',
          lang: 'es',
          start_url: base,
          scope: base,
          display: 'standalone',
          orientation: 'any',
          background_color: '#0b0f14',
          theme_color: '#0b0f14',
          categories: ['sports', 'health', 'navigation'],
          icons: [
            { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
          navigateFallbackDenylist: [/^\/__/],
          cleanupOutdatedCaches: true,
          runtimeCaching: [
            {
              // Teselas de OpenStreetMap: cache-first para poder ver el mapa sin conexion.
              urlPattern: /^https:\/\/[abc]\.tile\.openstreetmap\.org\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'osm-tiles',
                expiration: { maxEntries: 1500, maxAgeSeconds: 60 * 60 * 24 * 30 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
          ],
        },
        devOptions: { enabled: false },
      }),
    ],
  }
})
