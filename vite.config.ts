import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Design tokens (§10) mirrored here as raw hex because vite.config.ts can't safely
// import src/design/tokens.ts (that file may pull in browser-only code down the line).
// If you change --bg or the icon assets, update both places.
const THEME_COLOR = '#14171A';
const BACKGROUND_COLOR = '#14171A';

// GitHub Pages serves a "user/org Pages" repo (named exactly `<username>.github.io`) at
// the domain root, but any other repo name ("project Pages") at a sub-path —
// https://username.github.io/reponame/, not https://username.github.io/. Vite's `base`
// and the PWA manifest's start_url/scope both need to reflect that sub-path or every
// asset 404s once deployed. build-apk.yml sets VITE_BASE_PATH automatically by checking
// the repo name; local `npm run dev`/`npm run build` default to '/' since local preview
// doesn't care.
const BASE_PATH = process.env.VITE_BASE_PATH || '/';

export default defineConfig({
  base: BASE_PATH,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'robots.txt'],
      manifest: {
        name: 'Trajectory',
        short_name: 'Trajectory',
        description:
          'Adaptive nutrition tracking with ICMR/IFCT 2017 + Open Food Facts, and a Kalman-filter TDEE engine.',
        start_url: BASE_PATH,
        scope: BASE_PATH,
        display: 'standalone',
        orientation: 'portrait',
        theme_color: THEME_COLOR,
        background_color: BACKGROUND_COLOR,
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // App shell + hashed build assets are precached automatically by Vite's manifest.
        // ICMR data (static, bundled) and OFF seed data (small, refreshed fortnightly per
        // §6.2) are also static build assets, so they're covered by the default glob.
        globPatterns: ['**/*.{js,css,html,svg,png,json,woff2}'],
        // Runtime cache for the live OFF fallback search / barcode lookups (§6.3, §6.4) —
        // network-first so a fresh result is preferred, but a recent cached response keeps
        // things fast on a flaky connection instead of failing outright.
        runtimeCaching: [
          {
            urlPattern: ({ url }: { url: URL }) =>
              url.hostname === 'search.openfoodfacts.org' ||
              url.hostname === 'world.openfoodfacts.org',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'off-live-search',
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
        ],
      },
      devOptions: {
        // Lets `npm run dev` register a service worker too, so offline behavior (§11) can
        // be exercised without a full build.
        enabled: true,
      },
    }),
  ],
  build: {
    target: 'es2020',
    sourcemap: true,
  },
  server: {
    port: 5173,
  },
});
