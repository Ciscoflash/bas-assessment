import { defineConfig } from 'vitest/config';

export default defineConfig({
  // parity/ is the only place the frontend and backend money code meet.
  test: { projects: ['backend', 'frontend', 'parity'] },
});
