/// <reference types="vite/client" />

import type { ShareContext } from '@ui/types/share';

interface ImportMetaEnv {
  /** Explicit share API origin. Empty/absent means same-origin (WEB-6). */
  readonly VITE_SHARE_API_URL?: string;
  /** Turns the share feature on. Set by .env.share / .env.share-dev (WEB-6). */
  readonly VITE_SHARE_ENABLED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare global {
  interface Window {
    __UNSUPPORTED_BROWSER?: boolean;
    __SHARE_CONTEXT?: ShareContext;
    __SHARE_API_BASE?: string;
    __SHARE_ENABLED?: boolean;
  }
}

export {};
