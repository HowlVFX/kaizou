/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional absolute API origin (e.g. http://localhost:3000). Empty = same origin via the dev proxy. */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
