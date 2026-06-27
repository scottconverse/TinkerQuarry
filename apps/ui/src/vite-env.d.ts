/// <reference types="vite/client" />

import type { ShareContext } from './types/share';

interface ImportMetaEnv {
  readonly VITE_SHARE_API_URL?: string;
  readonly VITE_ENABLE_PROD_SHARE_DEV?: string;
  readonly VITE_TQ_REPOSITORY_URL?: string;
  readonly VITE_TQ_MAC_RELEASE_BASE?: string;
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
