import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  CONTENT_SECURITY_POLICY,
  SECURITY_HEADERS,
  applySecurityHeaders,
} from '../_lib/securityHeaders';

const webRoot = path.resolve(__dirname, '../..');
const headersFile = readFileSync(path.join(webRoot, 'public/_headers'), 'utf8');
const indexHtml = readFileSync(path.join(webRoot, 'index.html'), 'utf8');

function headerValue(name: string): string | null {
  const match = headersFile.match(new RegExp(`^\\s*${name}:\\s*(.+)$`, 'im'));
  return match ? match[1].trim() : null;
}

function inlineScriptBodies(html: string): string[] {
  const bodies: string[] = [];
  const pattern = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    bodies.push(match[1]);
  }
  return bodies;
}

// WEB-9: public/_headers used to be three lines setting only COEP and COOP.
// A repo-wide grep for CSP / nosniff / referrer-policy / frame-ancestors /
// permissions-policy returned zero matches, on the project's ONLY
// internet-facing surface — which renders third-party-authored content.
describe('static security headers (public/_headers)', () => {
  it('still sets the cross-origin isolation headers the app requires', () => {
    expect(headerValue('Cross-Origin-Embedder-Policy')).toBe('require-corp');
    expect(headerValue('Cross-Origin-Opener-Policy')).toBe('same-origin');
  });

  it('sets a Content-Security-Policy', () => {
    expect(headerValue('Content-Security-Policy')).toBe(CONTENT_SECURITY_POLICY);
  });

  it('sets the remaining baseline security headers', () => {
    expect(headerValue('X-Content-Type-Options')).toBe('nosniff');
    expect(headerValue('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(headerValue('X-Frame-Options')).toBe('DENY');
    expect(headerValue('Permissions-Policy')).toBeTruthy();
  });

  it('forbids framing and plugin content in the policy itself', () => {
    expect(CONTENT_SECURITY_POLICY).toContain("frame-ancestors 'none'");
    expect(CONTENT_SECURITY_POLICY).toContain("object-src 'none'");
    expect(CONTENT_SECURITY_POLICY).toContain("base-uri 'self'");
  });

  it("does not weaken script-src with 'unsafe-inline' or 'unsafe-eval'", () => {
    const scriptSrc = CONTENT_SECURITY_POLICY.split(';')
      .map((directive) => directive.trim())
      .find((directive) => directive.startsWith('script-src'));

    expect(scriptSrc).toBeTruthy();
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    // 'wasm-unsafe-eval' is required for WebAssembly and is NOT 'unsafe-eval'.
    expect(scriptSrc?.replace("'wasm-unsafe-eval'", '')).not.toContain("'unsafe-eval'");
  });

  // index.html ships two inline <script> blocks (the browser-support gate and an
  // Object.hasOwn polyfill). They are allowed by hash, so this test fails if
  // anyone edits them without updating the policy — instead of the app silently
  // breaking in production.
  it('allows exactly the inline scripts index.html actually ships, by hash', () => {
    const bodies = inlineScriptBodies(indexHtml);
    expect(bodies.length).toBeGreaterThan(0);

    for (const body of bodies) {
      const digest = createHash('sha256').update(body, 'utf8').digest('base64');
      expect(CONTENT_SECURITY_POLICY).toContain(`'sha256-${digest}'`);
    }

    const declaredHashes =
      CONTENT_SECURITY_POLICY.match(/'sha256-[A-Za-z0-9+/=]+'/g) ?? [];
    expect(declaredHashes).toHaveLength(bodies.length);
  });
});

describe('applySecurityHeaders', () => {
  it('applies every declared header to a response', () => {
    const headers = applySecurityHeaders(new Headers());

    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      expect(headers.get(name)).toBe(value);
    }
    expect(headers.get('Content-Security-Policy')).toBe(CONTENT_SECURITY_POLICY);
  });
});
