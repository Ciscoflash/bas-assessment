import { existsSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

/** The backend folder: .env and relative paths (like DB_PATH) resolve from here, whatever the cwd. */
export const BACKEND_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Load backend/.env if present. Variables already set in the real environment win.
const envFile = resolve(BACKEND_ROOT, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
  /** SQLite file, relative to the backend folder, or ":memory:" for a throwaway database. */
  DB_PATH: z.string().min(1).default('./data/lending.db'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** Comma-separated origins allowed to call the API directly (not needed when using the Vite proxy). */
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  /** Business time zone as minutes from UTC (Lagos = +60). Only affects "today" for display statuses. */
  BUSINESS_UTC_OFFSET_MINUTES: z.coerce.number().int().min(-720).max(840).default(60),
});

/** Parse and validate an environment. Exported so it can be tested without touching process.env. */
export function parseConfig(source: Record<string, string | undefined>) {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid backend environment (see backend/.env.example):\n${problems}`);
  }
  const env = parsed.data;
  return {
    env: env.NODE_ENV,
    host: env.HOST,
    port: env.PORT,
    dbPath: env.DB_PATH === ':memory:' || isAbsolute(env.DB_PATH) ? env.DB_PATH : resolve(BACKEND_ROOT, env.DB_PATH),
    logLevel: env.LOG_LEVEL,
    corsOrigins: env.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean),
    businessUtcOffsetMinutes: env.BUSINESS_UTC_OFFSET_MINUTES,
  } as const;
}

export const config = parseConfig(process.env);
export type Config = typeof config;
