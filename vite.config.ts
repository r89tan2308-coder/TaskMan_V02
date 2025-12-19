import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: {
        enabled: true
      },
      workbox: {
        navigateFallback: '/index.html'
      },
      manifest: {
        name: 'TaskMan PWA',
        short_name: 'TaskMan',
        start_url: '.',
        display: 'standalone',
        theme_color: '#0f172a',
        background_color: '#0b1220',
        icons: []
      }
    })
  ]
});
