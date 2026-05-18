import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/habit-tracker-app/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      devOptions: {
        enabled: true,
      },
      includeAssets: [
        'favicon.svg',
        'apple-touch-icon.png',
      ],
      manifest: {
        name: 'Habit Tracker - Ngọc Liên',
        short_name: 'Habit Tracker',
        description: 'App theo dõi thói quen và công việc hằng ngày của Ngọc Liên',
        theme_color: '#FFF9F4',
        background_color: '#FFF9F4',
        display: 'standalone',
        scope: '/habit-tracker-app/',
        start_url: '/habit-tracker-app/',
        icons: [
          {
            src: '/habit-tracker-app/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/habit-tracker-app/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: '/habit-tracker-app/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
      },
    }),
  ],
})