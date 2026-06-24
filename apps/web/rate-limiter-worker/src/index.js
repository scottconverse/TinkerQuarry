export class ShareRateLimiter {
  constructor(state) {
    this.state = state;
  }

  async fetch(request) {
    if (request.method !== "POST") {
      return new Response(null, { status: 405 });
    }

    const { limit, ttlSeconds } = await request.json();
    if (
      typeof limit !== "number" ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      typeof ttlSeconds !== "number" ||
      !Number.isInteger(ttlSeconds) ||
      ttlSeconds < 1
    ) {
      return new Response(null, { status: 400 });
    }

    const now = Date.now();
    const expiresAt = now + ttlSeconds * 1000;
    const record = (await this.state.storage.get("bucket")) ?? {
      count: 0,
      expiresAt,
    };
    const next =
      record.expiresAt <= now ? { count: 0, expiresAt } : { ...record };

    if (next.count >= limit) {
      return new Response(null, { status: 429 });
    }

    next.count += 1;
    await this.state.storage.put("bucket", next, {
      expirationTtl: ttlSeconds,
    });
    return new Response(null, { status: 204 });
  }
}

export default {
  fetch() {
    return new Response("Not found", { status: 404 });
  },
};
