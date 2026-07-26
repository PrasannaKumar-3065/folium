import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Vite configuration — portable across local machines, CI, and Replit.
 *
 * Environment variables (set in .env or your shell):
 *   PORT                    Dev server port          (default: 5000)
 *   VITE_HOST               Dev server host          (default: 0.0.0.0)
 *   VITE_API_PROXY_TARGET   Proxy /api to this URL   (default: none)
 *
 * If VITE_API_PROXY_TARGET is set, all /api/* requests are forwarded to
 * that origin during development so you avoid CORS issues when running the
 * frontend and backend separately. Leave it unset if the backend is served
 * from the same origin or if you point VITE_API_URL at the full backend URL.
 */
export default defineConfig({
  plugins: [react()],

  server: {
    host:         process.env.VITE_HOST || '0.0.0.0',
    port:         Number(process.env.PORT) || 5000,
    allowedHosts: true,

    // Optional dev-server proxy — uncomment VITE_API_PROXY_TARGET in .env
    // to forward /api/* to your local backend without touching app code.
    proxy: process.env.VITE_API_PROXY_TARGET
      ? {
          '/api': {
            target:       process.env.VITE_API_PROXY_TARGET,
            changeOrigin: true,
          },
        }
      : undefined,
  },

  build: {
    // Output to dist/ — drop into any static host (Vercel, Netlify, S3, …)
    outDir: 'dist',
  },
})
