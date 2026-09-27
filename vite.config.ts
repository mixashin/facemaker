import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';
import { cspPlugin } from './src/csp.ts';

const MP_VER = JSON.parse(readFileSync('node_modules/@mediapipe/tasks-vision/package.json', 'utf8')).version as string;

// The version that the settings show: time of the build (UTC) and commit. A later build has a later time.
const commit = (() => { try { return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return 'no-git'; } })();
const BUILD = `${new Date().toISOString().slice(0, 16).replace('T', ' ')} ${commit}`;

export default defineConfig({
  base: '/',
  define: { __MP_VER__: JSON.stringify(MP_VER), __BUILD__: JSON.stringify(BUILD) },
  plugins: [
    preact(),
    cspPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png', 'icons/icon.svg'],
      manifest: {
        name: 'Facemaker',
        short_name: 'Facemaker',
        description: 'Face warps, stickers and voice effects. Local only.',
        lang: 'en',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#111111',
        theme_color: '#111111',
        icons: [
          { src: 'icons/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // The segmenter model is in the precache: a place must work offline at its first use (the face model loads at every start)
        globPatterns: ['**/*.{js,css,html,svg,png,webp,woff2}', 'models/selfie_segmenter-f16.tflite'],
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/mediapipe/') || url.pathname.startsWith('/models/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'ml-assets',
              expiration: { maxEntries: 12 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  worker: { format: 'iife' },
  build: { target: 'es2022' },
  test: { environment: 'node', passWithNoTests: true, exclude: ['**/node_modules/**', '**/dist/**', '**/.claude/**'] },
});
