export interface Env {
  SHARE_KV: KVNamespace;
  SHARE_R2: R2Bucket;
  SHARE_RATE_LIMITER: {
    idFromName(name: string): unknown;
    get(id: unknown): {
      fetch(request: Request): Promise<Response>;
    };
  };
  /**
   * WEB-11: set to "true" to emit the x-share-* diagnostic headers and the
   * per-request share-meta log. Off everywhere by default — share ids are the
   * only access control on a share, so they must not be logged or echoed back.
   */
  SHARE_DEBUG_HEADERS?: string;
  /**
   * Rate-limit identity to use when Cloudflare supplies no `cf-connecting-ip`
   * — i.e. `wrangler pages dev`, which does not inject it. Operator-set, never
   * read from a request, so a client still cannot choose its own bucket. Leave
   * unset in production so the service fails closed (WEB-8).
   */
  SHARE_DEV_FALLBACK_IP?: string;
}

export interface ShareRecord {
  id: string;
  code: string;
  title: string;
  createdAt: string;
  forkedFrom: string | null;
  thumbnailKey: string | null;
  thumbnailUploadTokenHash: string | null;
  /**
   * SHA-256 of the single-use delete token handed to the creator at share time.
   * Lets the creator retract a share; the raw token is never stored (WEB-5).
   */
  deleteTokenHash?: string | null;
  /** User-facing size budget: bytes of design SOURCE the user wrote. */
  codeSize: number;
  /**
   * Bytes of the blob that was actually compressed into `code`.
   * For single-file shares this equals codeSize. For project shares the stored
   * blob is the JSON envelope, which is always larger than the file contents.
   * The read path caps decompression with THIS value, never codeSize (WEB-1).
   */
  payloadSize?: number;
  format?: "project";
}

export interface ProjectSharePayload {
  files: Record<string, string>;
  renderTarget: string;
}

export const MAX_CODE_BYTES = 51_200;
export const MAX_PROJECT_FILES = 50;
/**
 * Hard ceiling on the stored (decompressed) blob. A project share wraps up to
 * MAX_CODE_BYTES of file content in a JSON envelope of file paths, so the stored
 * blob is legitimately larger than the user-facing budget — but still bounded.
 */
export const MAX_PAYLOAD_BYTES = MAX_CODE_BYTES * 2;
/**
 * WEB-5: shares used to be written with no expiry at all, and there was no
 * delete path anywhere, so a shared design was uploaded permanently with no way
 * to retract it. One year is long enough for a link to stay useful and short
 * enough that nothing is retained forever.
 */
export const SHARE_TTL_SECONDS = 365 * 24 * 60 * 60;

export function extractPrimaryCode(
  share: ShareRecord,
  decompressed: string,
): string {
  if (share.format === "project") {
    const payload = parseProjectSharePayload(decompressed);
    return payload.files[payload.renderTarget] ?? "";
  }
  return decompressed;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const nanoAlphabet =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

export function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(data), { ...init, headers });
}

export function getRequestOrigin(request: Request): string {
  return new URL(request.url).origin;
}

export function getShareUrl(origin: string, shareId: string): string {
  return `${origin}/s/${shareId}`;
}

export function getThumbnailUrl(origin: string, shareId: string): string {
  return `${origin}/api/share/${shareId}/thumbnail`;
}

export function sanitizeTitle(title: unknown): string {
  if (typeof title !== "string") {
    return "Untitled Design";
  }

  const nextTitle = title.trim().slice(0, 100);
  return nextTitle || "Untitled Design";
}

export function validateForkedFrom(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  return /^[a-zA-Z0-9]{8}$/.test(value) ? value : null;
}

/**
 * WEB-8: only `cf-connecting-ip` is trustworthy — Cloudflare sets it itself and
 * a client cannot forge it. `x-forwarded-for` IS client-controlled, so trusting
 * it let any caller choose its own rate-limit bucket, and the old "anonymous"
 * fallback merged every such caller into one shared bucket. Fail closed instead.
 */
export function extractClientIp(request: Request): string | null {
  const ip = request.headers.get("cf-connecting-ip")?.trim();
  return ip ? ip : null;
}

/**
 * Expand an IPv6 textual address into its eight 16-bit groups, or null if it is
 * not a well-formed IPv6 address.
 */
function expandIpv6(value: string): number[] | null {
  let text = value;

  // An embedded dotted quad (e.g. ::ffff:198.51.100.7) is two 16-bit groups.
  const dotted = text.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (dotted) {
    const octets = dotted[1].split(".").map((part) => Number(part));
    if (octets.some((o) => !Number.isInteger(o) || o < 0 || o > 255)) {
      return null;
    }
    const high = ((octets[0] << 8) | octets[1]).toString(16);
    const low = ((octets[2] << 8) | octets[3]).toString(16);
    text = `${text.slice(0, text.length - dotted[1].length)}${high}:${low}`;
  }

  const halves = text.split("::");
  if (halves.length > 2) {
    return null;
  }

  const parseGroups = (part: string): number[] | null => {
    if (part === "") {
      return [];
    }
    const groups: number[] = [];
    for (const chunk of part.split(":")) {
      if (!/^[0-9a-f]{1,4}$/.test(chunk)) {
        return null;
      }
      groups.push(parseInt(chunk, 16));
    }
    return groups;
  };

  if (halves.length === 1) {
    const groups = parseGroups(halves[0]);
    return groups && groups.length === 8 ? groups : null;
  }

  const head = parseGroups(halves[0]);
  const tail = parseGroups(halves[1]);
  if (!head || !tail) {
    return null;
  }
  const fill = 8 - head.length - tail.length;
  if (fill < 1) {
    return null;
  }
  return [...head, ...new Array<number>(fill).fill(0), ...tail];
}

/**
 * WEB-4: the rate-limit bucket must match the unit of address ownership.
 * A residential IPv6 assignment is a /64 at minimum (commonly /56 or /48), so
 * keying on the full address gave one ordinary client 2^64 independent buckets
 * using addresses it legitimately owns. IPv4 stays exact.
 */
export function normalizeRateLimitIp(rawIp: string): string {
  const ip = rawIp.trim().toLowerCase().replace(/^\[/, "").replace(/\]$/, "");
  if (!ip.includes(":")) {
    return ip;
  }

  const withoutZone = ip.split("%")[0];
  const groups = expandIpv6(withoutZone);
  if (!groups) {
    // Unparseable: key it exactly rather than silently merging callers.
    return ip;
  }

  // IPv4-mapped/compatible addresses all live in the 0:0:0:0 /64. Key those on
  // the embedded IPv4 so unrelated IPv4 callers do not share one bucket.
  const embedded = withoutZone.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (embedded && groups.slice(0, 4).every((group) => group === 0)) {
    return embedded[1];
  }

  return `${groups
    .slice(0, 4)
    .map((group) => group.toString(16))
    .join(":")}::/64`;
}

export async function enforceShareRateLimit(
  request: Request,
  env: Env,
): Promise<Response | null> {
  const ip = extractClientIp(request);
  const now = new Date();
  const hourKey = `${now.getUTCFullYear()}-${now.getUTCMonth() + 1}-${now.getUTCDate()}-${now.getUTCHours()}`;

  if (!env.SHARE_RATE_LIMITER) {
    return json(
      { error: "Share service is missing its atomic rate limiter binding." },
      { status: 503 },
    );
  }

  // WEB-8: no trustworthy client address means no enforceable limit. Fall back
  // only to an operator-configured identity (local dev); otherwise fail closed.
  const identity = ip
    ? normalizeRateLimitIp(ip)
    : env.SHARE_DEV_FALLBACK_IP || null;
  if (!identity) {
    return json(
      { error: "Share service cannot identify the client address." },
      { status: 503 },
    );
  }

  const id = env.SHARE_RATE_LIMITER.idFromName(`${identity}:${hourKey}`);
  const limiter = env.SHARE_RATE_LIMITER.get(id);
  const response = await limiter.fetch(
    new Request("https://rate-limit.local/check", {
      method: "POST",
      body: JSON.stringify({ limit: 30, ttlSeconds: 3600 }),
    }),
  );

  if (response.status === 204) {
    return null;
  }
  if (response.status === 429) {
    return json(
      { error: "Too many shares. Try again in a few minutes." },
      { status: 429 },
    );
  }
  return json({ error: "Share rate limiter failed." }, { status: 503 });
}

/**
 * WEB-7: `byte % 62` over bytes 0..255 is biased — 256 % 62 == 8, so the first
 * eight symbols occur with probability 5/256 and the rest with 4/256. The share
 * id is the ONLY access control on a share, so draw uniformly: reject any byte
 * at or above the largest multiple of the alphabet length that fits in a byte
 * (248) and redraw instead of folding it onto the low symbols.
 */
export function randomShareId(length: number = 8): string {
  const alphabetLength = nanoAlphabet.length;
  const acceptLimit = 256 - (256 % alphabetLength);
  let id = "";

  while (id.length < length) {
    const bytes = crypto.getRandomValues(new Uint8Array(length - id.length));
    for (const byte of bytes) {
      if (byte >= acceptLimit) {
        continue;
      }
      id += nanoAlphabet[byte % alphabetLength];
      if (id.length === length) {
        break;
      }
    }
  }

  return id;
}

export function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return bytesToBase64Url(bytes);
}

export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(token));
  return bytesToHex(new Uint8Array(digest));
}

export async function compressSource(code: string): Promise<string> {
  const stream = new CompressionStream("gzip");
  const writer = stream.writable.getWriter();
  await writer.write(encoder.encode(code));
  await writer.close();
  const buffer = await new Response(stream.readable).arrayBuffer();
  return bytesToBase64(new Uint8Array(buffer));
}

export async function decompressSource(
  payload: string,
  maxBytes: number = MAX_CODE_BYTES,
): Promise<string> {
  const bytes = base64ToBytes(payload);
  const stream = new DecompressionStream("gzip");
  const writer = stream.writable.getWriter();
  await writer.write(bytes);
  await writer.close();
  const reader = stream.readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error("Compressed source exceeds allowed size.");
    }
    chunks.push(value);
  }

  const buffer = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return decoder.decode(buffer);
}

export async function parseShareRecord(
  value: string | null,
): Promise<ShareRecord | null> {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as ShareRecord;
  } catch {
    return null;
  }
}

export async function readShare(
  env: Env,
  shareId: string,
): Promise<ShareRecord | null> {
  const share = await parseShareRecord(
    await env.SHARE_KV.get(`share:${shareId}`),
  );
  if (!share) {
    return null;
  }
  if (
    !Number.isFinite(share.codeSize) ||
    share.codeSize < 1 ||
    share.codeSize > MAX_CODE_BYTES
  ) {
    return null;
  }
  if (share.payloadSize !== undefined) {
    if (
      !Number.isFinite(share.payloadSize) ||
      share.payloadSize < 1 ||
      share.payloadSize > MAX_PAYLOAD_BYTES
    ) {
      return null;
    }
  }
  if (typeof share.code !== "string" || share.code.length === 0) {
    return null;
  }
  return share;
}

/**
 * The decompression cap for a stored record. Single-file records written before
 * payloadSize existed fall back to codeSize, which is correct for them.
 */
export function shareDecompressionCap(share: ShareRecord): number {
  return share.payloadSize ?? share.codeSize;
}

export async function writeShare(env: Env, share: ShareRecord): Promise<void> {
  await env.SHARE_KV.put(`share:${share.id}`, JSON.stringify(share), {
    expirationTtl: SHARE_TTL_SECONDS,
  });
}

/**
 * Remove a share and its uploaded thumbnail. The R2 object goes first so a
 * failure cannot leave an unreachable-but-billed orphan behind.
 */
export async function deleteShare(env: Env, share: ShareRecord): Promise<void> {
  if (share.thumbnailKey) {
    await env.SHARE_R2.delete(share.thumbnailKey);
  }
  await env.SHARE_KV.delete(`share:${share.id}`);
}

/** `Authorization: Bearer <token>`, or null when absent/malformed. */
export function getBearerToken(request: Request): string | null {
  const header = request.headers.get("Authorization") || "";
  if (!header.startsWith("Bearer ")) {
    return null;
  }
  const token = header.slice("Bearer ".length).trim();
  return token || null;
}

/**
 * Constant-time comparison of two equal-length hex digests, so a delete token
 * cannot be recovered one byte at a time from response timing.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return diff === 0;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

export function parseProjectSharePayload(value: string): ProjectSharePayload {
  const payload = JSON.parse(value) as unknown;
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid project share payload.");
  }

  const { files, renderTarget } = payload as Partial<ProjectSharePayload>;
  if (
    !files ||
    typeof files !== "object" ||
    Array.isArray(files) ||
    typeof renderTarget !== "string"
  ) {
    throw new Error("Invalid project share payload.");
  }

  const entries = Object.entries(files);
  if (entries.length === 0 || entries.length > MAX_PROJECT_FILES) {
    throw new Error("Invalid project share payload.");
  }
  for (const [path, content] of entries) {
    if (typeof path !== "string" || typeof content !== "string") {
      throw new Error("Invalid project share payload.");
    }
  }
  if (!Object.prototype.hasOwnProperty.call(files, renderTarget)) {
    throw new Error("Invalid project share payload.");
  }

  return { files: files as Record<string, string>, renderTarget };
}
