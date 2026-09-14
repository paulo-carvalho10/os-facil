import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    tailwindcss(),
    // A demonstração também é PWA: é o único lugar onde um visitante pode ver o
    // aplicativo abrir sem internet. Por isso nada aqui usa caminho absoluto. Na
    // demonstração o app vive em /os-facil/, e "/" apontaria para fora dele.
    // start_url, scope e navigateFallback ficam com o padrão do plugin, que segue
    // o base do Vite; os ícones são relativos ao próprio manifest.
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: mode === 'demo' ? 'OS Fácil (demonstração)' : 'OS Fácil',
        short_name: 'OS Fácil',
        description: 'Ordens de serviço offline para assistências técnicas.',
        theme_color: '#171a16',
        background_color: '#f4f2ea',
        display: 'standalone',
        lang: 'pt-BR',
        icons: [
          { src: 'icon-192.svg', sizes: '192x192', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon-512.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}']
      },
      devOptions: { enabled: true }
    })
  ],
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./tests/setup.ts']
  }
}))
