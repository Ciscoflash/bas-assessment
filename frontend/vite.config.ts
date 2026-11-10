import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

export default defineConfig(({ mode }) => {
  // '' prefix: read every variable from frontend/.env here. Only VITE_* ones are exposed to the browser.
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    server: {
      port: Number(env.FRONTEND_PORT || 5173),
      strictPort: true,
      // Dev only: forward /api to the backend so the browser sees one origin (no CORS needed).
      proxy: { '/api': env.API_PROXY_TARGET || 'http://127.0.0.1:4000' },
    },
    test: {
      name: 'frontend',
      environment: 'jsdom',
      include: ['test/**/*.test.{ts,tsx}'],
      setupFiles: ['test/setup.ts'],
      // Tests always talk to the mocked "/api" regardless of local .env.
      env: { VITE_API_BASE_URL: '/api' },
    },
  };
});
