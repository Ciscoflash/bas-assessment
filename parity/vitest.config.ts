import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { name: 'parity', include: ['*.test.ts'], environment: 'node' } });
