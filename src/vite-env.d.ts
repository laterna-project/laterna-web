/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Address of the Laterna server when the app is not served from the same origin. */
  readonly VITE_LATERNA_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
