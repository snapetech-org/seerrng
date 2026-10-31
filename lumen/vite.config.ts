import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
// @ts-expect-error plain JS dev helper, no types
import { extrasMock } from './mocks/extras.mjs';

// In development Vite stands in for the Lumen container: the app is served here and
// /api + /imageproxy go to SeerrNG, so sign-in cookies stay same-origin.
const SEERR_URL = process.env.SEERR_URL || 'http://localhost:5070';

// LUMEN_MOCKS=1 answers comics, magazines, games, sports and adult with sample data
// (mocks/extras.mjs), for test servers that have no service connected for them.
const mocks: Plugin = {
  name: 'lumen-extras-mocks',
  configureServer(server) {
    server.middlewares.use('/api/v1', extrasMock(SEERR_URL));
  },
};

export default defineConfig({
  plugins: [react(), ...(process.env.LUMEN_MOCKS ? [mocks] : [])],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: SEERR_URL, changeOrigin: false },
      '/imageproxy': { target: SEERR_URL, changeOrigin: false },
      '/avatarproxy': { target: SEERR_URL, changeOrigin: false },
      ...(process.env.SEERR_EXTRAS_URL
        ? {
            '/seerr-classic': {
              target: process.env.SEERR_EXTRAS_URL,
              changeOrigin: false,
            },
          }
        : {}),
    },
  },
});
