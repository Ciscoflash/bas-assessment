/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL the browser uses for API calls: "/api" (via the Vite proxy) or an absolute URL. */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
