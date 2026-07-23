/**
 * WEB-9: apps/web is the project's only internet-facing surface, and it renders
 * third-party-authored content by design. Before this it sent no security header
 * at all beyond COEP/COOP — no CSP, no nosniff, no referrer policy, no framing
 * control.
 *
 * These values are mirrored in `public/_headers` for static assets. Pages
 * Functions build their own Headers object and must not be assumed to inherit
 * that file, so `applySecurityHeaders` re-applies them on generated responses.
 * `functions/__tests__/securityHeaders.test.ts` asserts the two stay in sync.
 */

/**
 * SHA-256 of the two inline <script> blocks in index.html (the browser-support
 * gate and the Object.hasOwn polyfill). Allow-listing them by hash keeps
 * 'unsafe-inline' out of script-src. The test recomputes these from index.html,
 * so editing an inline script fails CI instead of breaking production silently.
 */
const INLINE_SCRIPT_HASHES = [
  "'sha256-w/8ncPR4twldixGHvLIa95nXidNedpKfRZtAISMqOjU='",
  "'sha256-B4OUEBxa1zbFRXTWckbAQK84cDt3D8GhGpuGkzo/WfM='",
];

export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  // 'wasm-unsafe-eval' is required for the OpenSCAD/tree-sitter WebAssembly
  // runtimes; blob: is required for the workers Vite and Monaco spawn.
  `script-src 'self' 'wasm-unsafe-eval' blob: ${INLINE_SCRIPT_HASHES.join(" ")}`,
  // Monaco and the styling layer inject style elements at runtime.
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "worker-src 'self' blob:",
  "child-src 'self' blob:",
  "media-src 'self' blob:",
  // Deliberately open: users configure their own model provider endpoints
  // (Anthropic, OpenAI, or any OpenAI-compatible base URL, including a local
  // engine), so an allow-list here would break a supported configuration.
  "connect-src * data: blob:",
].join("; ");

export const SECURITY_HEADERS: Record<string, string> = {
  "Content-Security-Policy": CONTENT_SECURITY_POLICY,
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  // Redundant with frame-ancestors, kept for browsers that predate CSP level 2.
  "X-Frame-Options": "DENY",
  // Only features the app has no use for. USB/serial are left alone because the
  // printer-connector flow may need them.
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
};

/** Apply the standard security headers to a Headers object, in place. */
export function applySecurityHeaders(headers: Headers): Headers {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(name, value);
  }
  return headers;
}
