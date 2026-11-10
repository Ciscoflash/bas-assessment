/**
 * Browser-side configuration. Only VITE_-prefixed variables reach the browser,
 * so nothing secret belongs here. See frontend/.env.example.
 */
export const env = {
  /** Without a trailing slash. Defaults to the dev proxy. */
  apiBaseUrl: (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/+$/, ''),
} as const;
