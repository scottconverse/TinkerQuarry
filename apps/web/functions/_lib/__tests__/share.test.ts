import {
  compressSource,
  decompressSource,
  enforceShareRateLimit,
  extractClientIp,
  getShareUrl,
  getThumbnailUrl,
  hashToken,
  json,
  normalizeRateLimitIp,
  parseShareRecord,
  parseProjectSharePayload,
  randomShareId,
  readShare,
  sanitizeTitle,
  validateForkedFrom,
  writeShare,
} from "../share";
import { createMockEnv } from "../../__tests__/test-utils";

describe("share helper utilities", () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date("2026-03-29T15:00:00.000Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("formats JSON responses and share URLs", async () => {
    const response = json({ ok: true }, { status: 201 });

    expect(response.status).toBe(201);
    expect(response.headers.get("Content-Type")).toBe(
      "application/json; charset=utf-8",
    );
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(getShareUrl("https://studio.test", "abc12345")).toBe(
      "https://studio.test/s/abc12345",
    );
    expect(getThumbnailUrl("https://studio.test", "abc12345")).toBe(
      "https://studio.test/api/share/abc12345/thumbnail",
    );
  });

  it("sanitizes title and fork references", () => {
    expect(sanitizeTitle("  Useful Design  ")).toBe("Useful Design");
    expect(sanitizeTitle("")).toBe("Untitled Design");
    expect(sanitizeTitle(null)).toBe("Untitled Design");
    expect(validateForkedFrom("abc12345")).toBe("abc12345");
    expect(validateForkedFrom("abc")).toBeNull();
    expect(validateForkedFrom(123)).toBeNull();
  });

  it("extracts the Cloudflare client IP and rate-limits per hour atomically", async () => {
    const { env, limiterStore } = createMockEnv();
    const request = new Request("https://studio.test/api/share", {
      headers: {
        "cf-connecting-ip": "203.0.113.9",
      },
    });

    expect(extractClientIp(request)).toBe("203.0.113.9");

    const first = await enforceShareRateLimit(request, env as never);
    expect(first).toBeNull();
    expect(limiterStore.get("203.0.113.9:2026-3-29-15")).toBe(1);

    limiterStore.set("203.0.113.9:2026-3-29-15", 30);
    const limited = await enforceShareRateLimit(request, env as never);
    expect(limited?.status).toBe(429);
    await expect(limited?.json()).resolves.toEqual({
      error: "Too many shares. Try again in a few minutes.",
    });
  });

  // WEB-8: x-forwarded-for is client-controlled, so trusting it let a caller
  // pick its own rate-limit bucket. Only cf-connecting-ip is trustworthy.
  it("ignores a client-supplied x-forwarded-for header and fails closed", async () => {
    const { env, limiterStore } = createMockEnv();
    const forged = new Request("https://studio.test/api/share", {
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
    });

    expect(extractClientIp(forged)).toBeNull();

    const response = await enforceShareRateLimit(forged, env as never);
    expect(response?.status).toBe(503);
    await expect(response?.json()).resolves.toEqual({
      error: "Share service cannot identify the client address.",
    });
    expect([...limiterStore.entries()]).toEqual([]);
  });

  it("does not let x-forwarded-for override the real Cloudflare client IP", async () => {
    const { env, limiterStore } = createMockEnv();
    const request = new Request("https://studio.test/api/share", {
      headers: {
        "cf-connecting-ip": "203.0.113.9",
        "x-forwarded-for": "1.2.3.4",
      },
    });

    expect(extractClientIp(request)).toBe("203.0.113.9");
    await enforceShareRateLimit(request, env as never);
    expect([...limiterStore.keys()]).toEqual(["203.0.113.9:2026-3-29-15"]);
  });

  // WEB-8 follow-on: `wrangler pages dev` does not inject cf-connecting-ip, so
  // failing closed alone would make local share testing impossible. The fallback
  // identity comes from an operator-set binding, never from a request header, so
  // a client still cannot choose its own bucket.
  it("uses the operator-configured fallback identity when Cloudflare gives no IP", async () => {
    const { env, limiterStore } = createMockEnv();
    (env as { SHARE_DEV_FALLBACK_IP?: string }).SHARE_DEV_FALLBACK_IP =
      "local-dev";

    const request = new Request("https://studio.test/api/share", {
      headers: { "x-forwarded-for": "1.2.3.4" },
    });

    const response = await enforceShareRateLimit(request, env as never);

    expect(response).toBeNull();
    // Keyed on the configured value — NOT on the header the client supplied.
    expect([...limiterStore.keys()]).toEqual(["local-dev:2026-3-29-15"]);
  });

  it("still enforces the limit against the fallback identity", async () => {
    const { env, limiterStore } = createMockEnv();
    (env as { SHARE_DEV_FALLBACK_IP?: string }).SHARE_DEV_FALLBACK_IP =
      "local-dev";

    let accepted = 0;
    for (let attempt = 0; attempt < 35; attempt += 1) {
      const response = await enforceShareRateLimit(
        new Request("https://studio.test/api/share", {
          headers: { "x-forwarded-for": `10.0.0.${attempt}` },
        }),
        env as never,
      );
      if (response === null) {
        accepted += 1;
      }
    }

    expect([...limiterStore.keys()]).toHaveLength(1);
    expect(accepted).toBe(30);
  });

  // WEB-4: a residential IPv6 allocation is a /64 at minimum, so keying the
  // Durable Object on the full address gave one caller 2^64 buckets.
  it("collapses an entire IPv6 /64 into a single rate-limit bucket", async () => {
    const { env, limiterStore } = createMockEnv();

    let accepted = 0;
    let rejected = 0;
    for (let host = 0; host < 40; host += 1) {
      const request = new Request("https://studio.test/api/share", {
        headers: {
          "cf-connecting-ip": `2001:db8:1:1::${host.toString(16)}`,
        },
      });
      const response = await enforceShareRateLimit(request, env as never);
      if (response === null) {
        accepted += 1;
      } else {
        rejected += 1;
        expect(response.status).toBe(429);
      }
    }

    expect([...limiterStore.keys()]).toHaveLength(1);
    expect(accepted).toBe(30);
    expect(rejected).toBe(10);
  });

  it("keys distinct IPv6 /64s and IPv4 addresses into distinct buckets", async () => {
    const { env, limiterStore } = createMockEnv();

    for (const ip of [
      "2001:db8:1:1::5",
      "2001:db8:1:2::5", // different /64
      "198.51.100.7",
      "198.51.100.8",
    ]) {
      await enforceShareRateLimit(
        new Request("https://studio.test/api/share", {
          headers: { "cf-connecting-ip": ip },
        }),
        env as never,
      );
    }

    expect([...limiterStore.keys()].sort()).toEqual([
      "198.51.100.7:2026-3-29-15",
      "198.51.100.8:2026-3-29-15",
      "2001:db8:1:1::/64:2026-3-29-15",
      "2001:db8:1:2::/64:2026-3-29-15",
    ]);
  });

  it("normalizes IPv6 forms without collapsing unrelated callers", () => {
    // Same /64 written three different ways.
    expect(normalizeRateLimitIp("2001:0DB8:0001:0001:0000:0000:0000:0005")).toBe(
      "2001:db8:1:1::/64",
    );
    expect(normalizeRateLimitIp("2001:db8:1:1::5")).toBe("2001:db8:1:1::/64");
    expect(normalizeRateLimitIp("[2001:db8:1:1::5]")).toBe("2001:db8:1:1::/64");
    expect(normalizeRateLimitIp("2001:db8:1:1::5%eth0")).toBe(
      "2001:db8:1:1::/64",
    );

    // IPv4 is keyed exactly.
    expect(normalizeRateLimitIp("198.51.100.7")).toBe("198.51.100.7");

    // IPv4-mapped addresses all share the 0:0:0:0 /64 — key on the embedded
    // IPv4 so unrelated IPv4 callers are not merged into one bucket.
    expect(normalizeRateLimitIp("::ffff:198.51.100.7")).toBe("198.51.100.7");
    expect(normalizeRateLimitIp("::ffff:198.51.100.8")).toBe("198.51.100.8");

    // Unparseable input is keyed exactly rather than silently merged.
    expect(normalizeRateLimitIp("not:an:ip:::x")).toBe("not:an:ip:::x");
  });

  it("fails closed when the atomic rate limiter binding is absent", async () => {
    const { env } = createMockEnv();
    const request = new Request("https://studio.test/api/share");
    const missingLimiterEnv = { ...env, SHARE_RATE_LIMITER: undefined };

    const response = await enforceShareRateLimit(request, missingLimiterEnv as never);

    expect(response?.status).toBe(503);
    await expect(response?.json()).resolves.toEqual({
      error: "Share service is missing its atomic rate limiter binding.",
    });
  });

  it("round-trips compressed source, hashes tokens, and reads persisted share records", async () => {
    const { env } = createMockEnv();
    const compressed = await compressSource("cube([10, 10, 10]);");
    await expect(decompressSource(compressed)).resolves.toBe(
      "cube([10, 10, 10]);",
    );

    const digest = await hashToken("thumbnail-token");
    expect(digest).toMatch(/^[0-9a-f]{64}$/);

    const shareRecord = {
      id: "abc12345",
      code: compressed,
      title: "Bracket",
      createdAt: "2026-03-29T15:00:00.000Z",
      forkedFrom: null,
      thumbnailKey: null,
      thumbnailUploadTokenHash: digest,
      codeSize: 21,
    };

    await writeShare(env as never, shareRecord);
    await expect(readShare(env as never, "abc12345")).resolves.toEqual(
      shareRecord,
    );
    await expect(
      parseShareRecord(JSON.stringify(shareRecord)),
    ).resolves.toEqual(shareRecord);
    await expect(parseShareRecord(null)).resolves.toBeNull();
    await expect(parseShareRecord("{not-json")).resolves.toBeNull();
  });

  it("bounds decompressed source and rejects invalid stored share records", async () => {
    const { env, kvStore } = createMockEnv();
    const compressed = await compressSource("cube([10, 10, 10]);");

    await expect(decompressSource(compressed, 5)).rejects.toThrow(
      "Compressed source exceeds allowed size.",
    );

    kvStore.set(
      "share:oversize",
      JSON.stringify({
        id: "oversize",
        code: compressed,
        title: "Too Large",
        createdAt: "2026-03-29T15:00:00.000Z",
        forkedFrom: null,
        thumbnailKey: null,
        thumbnailUploadTokenHash: null,
        codeSize: 51_201,
      }),
    );

    await expect(readShare(env as never, "oversize")).resolves.toBeNull();
  });

  // WEB-7: `byte % 62` over bytes 0..255 made the first 8 symbols 25% likelier
  // (256 % 62 == 8). The share id is the ONLY access control on a share.
  it("generates share ids without modulo bias", () => {
    jest.useRealTimers();
    const counts = new Map<string, number>();
    const draws = 50_000; // 50,000 x 8 chars = 400,000 symbols

    for (let i = 0; i < draws; i += 1) {
      for (const char of randomShareId()) {
        counts.set(char, (counts.get(char) ?? 0) + 1);
      }
    }

    const frequencies = [...counts.values()];
    expect(counts.size).toBe(62);

    const ratio = Math.max(...frequencies) / Math.min(...frequencies);
    // A biased generator measures ~1.25-1.30 here; a uniform one stays near 1.07.
    expect(ratio).toBeLessThan(1.15);
  });

  it("discards random bytes that would land in the biased tail", () => {
    // 248 is the largest multiple of 62 that fits in a byte, so 248..255 must be
    // rejected and redrawn rather than folded onto the first 8 symbols.
    const stream = [255, 254, 253, 252, 251, 250, 249, 248, 0, 1, 2, 3];
    let cursor = 0;
    const spy = jest
      .spyOn(globalThis.crypto, "getRandomValues")
      .mockImplementation((buffer: Uint8Array) => {
        for (let i = 0; i < buffer.length; i += 1) {
          buffer[i] = stream[cursor % stream.length];
          cursor += 1;
        }
        return buffer;
      });

    const id = randomShareId(4);
    spy.mockRestore();

    // Every byte in 248..255 was rejected; the id comes from bytes 0,1,2,3.
    expect(id).toBe("abcd");
  });

  it("validates project share payload shape", () => {
    expect(
      parseProjectSharePayload(
        JSON.stringify({
          files: { "main.scad": "cube(10);" },
          renderTarget: "main.scad",
        }),
      ),
    ).toEqual({
      files: { "main.scad": "cube(10);" },
      renderTarget: "main.scad",
    });

    expect(() =>
      parseProjectSharePayload(
        JSON.stringify({
          files: { "main.scad": "cube(10);" },
          renderTarget: "missing.scad",
        }),
      ),
    ).toThrow("Invalid project share payload.");
  });
});
