export type MockKvStore = Map<string, string>;

export function createMockEnv(initialKv: Record<string, string> = {}) {
  const kvStore: MockKvStore = new Map(Object.entries(initialKv));
  const limiterStore: Map<string, number> = new Map();
  const rateLimiter = {
    idFromName: (name: string) => name,
    get: (id: string) => ({
      fetch: async (request: Request) => {
        const { limit } = (await request.json()) as { limit: number };
        const current = limiterStore.get(id) ?? 0;
        if (current >= limit) {
          return new Response(null, { status: 429 });
        }
        limiterStore.set(id, current + 1);
        return new Response(null, { status: 204 });
      },
    }),
  };

  return {
    env: {
      SHARE_KV: {
        get: async (key: string) => kvStore.get(key) ?? null,
        put: async (key: string, value: string) => {
          kvStore.set(key, value);
        },
      },
      SHARE_R2: {},
      SHARE_RATE_LIMITER: rateLimiter,
    },
    kvStore,
    limiterStore,
  };
}

export function createPagesContext(args: {
  request: Request;
  env: {
    SHARE_KV: {
      get: (key: string) => Promise<string | null>;
      put: (key: string, value: string, options?: unknown) => Promise<void>;
    };
    SHARE_R2: unknown;
    SHARE_RATE_LIMITER?: unknown;
  };
  params?: Record<string, unknown>;
  next?: () => Promise<Response>;
}) {
  return {
    request: args.request,
    env: args.env,
    params: (args.params ?? {}) as never,
    next: args.next ?? (async () => new Response('ok')),
  };
}
