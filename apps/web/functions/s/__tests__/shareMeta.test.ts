import { onRequestGet, onRequestHead } from '../[[shareId]]';
import { CONTENT_SECURITY_POLICY } from '../../_lib/securityHeaders';
import { createMockEnv, createPagesContext } from '../../__tests__/test-utils';

function buildHtmlResponse() {
  return new Response(
    `<!doctype html><html><head>
      <meta property="og:title" content="Base Title" />
      <meta property="og:image" content="/base.png" />
      <meta name="twitter:card" content="summary" />
    </head><body>hi</body></html>`,
    {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    }
  );
}

// WEB-11: nine x-share-* debug headers shipped on every public response with no
// env gate. x-share-og-title leaked the user's title and x-share-found was a
// share-existence oracle. Per-request console.info logged share ids too. And
// toHeaderValue() was applied to exactly the three values that could NOT contain
// anything dangerous, skipping the two that come straight off the URL.
describe('/s/[[shareId]] debug headers', () => {
  const shareRecord = JSON.stringify({
    id: 'abc12345',
    code: 'compressed',
    title: 'Bracket',
    createdAt: '2026-03-29T18:00:00.000Z',
    forkedFrom: null,
    thumbnailKey: null,
    thumbnailUploadTokenHash: null,
    codeSize: 11,
  });

  it('emits no x-share-* headers by default', async () => {
    const { env } = createMockEnv({ 'share:abc12345': shareRecord });

    const response = await onRequestGet(
      createPagesContext({
        request: new Request('https://studio.test/s/abc12345'),
        env: env as never,
        params: { shareId: 'abc12345' },
        next: async () => buildHtmlResponse(),
      }) as never
    );

    const leaked = [...response.headers.keys()].filter((name) =>
      name.toLowerCase().startsWith('x-share-')
    );
    expect(leaked).toEqual([]);
  });

  it('does not log share ids on every public request', async () => {
    const { env } = createMockEnv({ 'share:abc12345': shareRecord });
    const info = jest.spyOn(console, 'info').mockImplementation(() => undefined);

    await onRequestGet(
      createPagesContext({
        request: new Request('https://studio.test/s/abc12345'),
        env: env as never,
        params: { shareId: 'abc12345' },
        next: async () => buildHtmlResponse(),
      }) as never
    );

    expect(info).not.toHaveBeenCalled();
    info.mockRestore();
  });

  it('emits the debug headers only when explicitly enabled', async () => {
    const { env } = createMockEnv({ 'share:abc12345': shareRecord });
    (env as { SHARE_DEBUG_HEADERS?: string }).SHARE_DEBUG_HEADERS = 'true';

    const response = await onRequestGet(
      createPagesContext({
        request: new Request('https://studio.test/s/abc12345'),
        env: env as never,
        params: { shareId: 'abc12345' },
        next: async () => buildHtmlResponse(),
      }) as never
    );

    expect(response.headers.get('x-share-found')).toBe('true');
    expect(response.headers.get('x-share-id')).toBe('abc12345');
  });

  // PROBE-5: a control character reaching the raw param threw
  // `TypeError: Headers.set: "ab\ncd" is an invalid header value` — an
  // unhandled 500 on the public route.
  it('sanitizes the URL-derived values the old code skipped', async () => {
    const { env } = createMockEnv();
    (env as { SHARE_DEBUG_HEADERS?: string }).SHARE_DEBUG_HEADERS = 'true';

    const response = await onRequestGet(
      createPagesContext({
        request: new Request('https://studio.test/s/whatever'),
        env: env as never,
        params: { shareId: 'ab\ncd' },
        next: async () => new Response('plain'),
      }) as never
    );

    expect(response.headers.get('x-share-param-raw')).toBe('ab?cd');
    expect(response.headers.get('x-share-id')).toBe('ab?cd');
  });
});

describe('/s/[[shareId]] metadata rewriting', () => {
  it('passes through responses with debug headers when the share id is missing or not found', async () => {
    const { env } = createMockEnv();
    // WEB-11: the x-share-* diagnostics are opt-in now.
    (env as { SHARE_DEBUG_HEADERS?: string }).SHARE_DEBUG_HEADERS = 'true';

    const missingParam = await onRequestGet(
      createPagesContext({
        request: new Request('https://studio.test/s'),
        env: env as never,
        params: {},
        next: async () => new Response('plain'),
      }) as never
    );
    expect(missingParam.headers.get('x-share-found')).toBe('false');
    expect(missingParam.headers.get('x-share-id')).toBe('missing');
    expect(await missingParam.text()).toBe('plain');

    const notFound = await onRequestGet(
      createPagesContext({
        request: new Request('https://studio.test/s/abc12345'),
        env: env as never,
        params: { shareId: 'abc12345' },
        next: async () => new Response('not-found'),
      }) as never
    );
    expect(notFound.headers.get('x-share-found')).toBe('false');
    expect(notFound.headers.get('x-share-id')).toBe('abc12345');
    expect(await notFound.text()).toBe('not-found');
  });

  it('rewrites OG/Twitter metadata and applies COEP/COOP headers for shares without thumbnails', async () => {
    const { env, kvStore } = createMockEnv({
      'share:abc12345': JSON.stringify({
        id: 'abc12345',
        code: 'compressed',
        title: 'Bracket',
        createdAt: '2026-03-29T18:00:00.000Z',
        forkedFrom: null,
        thumbnailKey: null,
        thumbnailUploadTokenHash: null,
        codeSize: 11,
      }),
    });
    (env as { SHARE_DEBUG_HEADERS?: string }).SHARE_DEBUG_HEADERS = 'true';
    expect(kvStore.size).toBeGreaterThan(0);

    const response = await onRequestGet(
      createPagesContext({
        request: new Request('https://studio.test/s/abc12345'),
        env: env as never,
        params: { shareId: 'abc12345' },
        next: async () => buildHtmlResponse(),
      }) as never
    );

    const html = await response.text();
    expect(html).toContain('content="Bracket — TinkerQuarry"');
    expect(html).toContain('content="https://studio.test/icon-512.png"');
    expect(html).toContain('content="https://studio.test/s/abc12345"');
    expect(response.headers.get('Cross-Origin-Embedder-Policy')).toBe('require-corp');
    expect(response.headers.get('Cross-Origin-Opener-Policy')).toBe('same-origin');
    expect(response.headers.get('x-share-meta-applied')).toBe('true');
    expect(response.headers.get('x-share-thumbnail')).toBe('false');
    expect(response.headers.get('x-share-twitter-card')).toBe('summary');
  });

  // WEB-9: /s/* builds its own Headers object, so it cannot be assumed to
  // inherit public/_headers. The security headers must be mirrored here.
  it('applies the full security header set to the rewritten share page', async () => {
    const { env } = createMockEnv({
      'share:abc12345': JSON.stringify({
        id: 'abc12345',
        code: 'compressed',
        title: 'Bracket',
        createdAt: '2026-03-29T18:00:00.000Z',
        forkedFrom: null,
        thumbnailKey: null,
        thumbnailUploadTokenHash: null,
        codeSize: 11,
      }),
    });

    const response = await onRequestGet(
      createPagesContext({
        request: new Request('https://studio.test/s/abc12345'),
        env: env as never,
        params: { shareId: 'abc12345' },
        next: async () => buildHtmlResponse(),
      }) as never
    );

    expect(response.headers.get('Content-Security-Policy')).toBe(
      CONTENT_SECURITY_POLICY
    );
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response.headers.get('Referrer-Policy')).toBe(
      'strict-origin-when-cross-origin'
    );
    expect(response.headers.get('X-Frame-Options')).toBe('DENY');
    // Cross-origin isolation must survive.
    expect(response.headers.get('Cross-Origin-Embedder-Policy')).toBe('require-corp');
    expect(response.headers.get('Cross-Origin-Opener-Policy')).toBe('same-origin');
  });

  it('uses the uploaded thumbnail URL and large twitter card when a thumbnail exists', async () => {
    const { env } = createMockEnv({
      'share:abc12345': JSON.stringify({
        id: 'abc12345',
        code: 'compressed',
        title: 'Bracket',
        createdAt: '2026-03-29T18:00:00.000Z',
        forkedFrom: null,
        thumbnailKey: 'thumbs/abc12345.png',
        thumbnailUploadTokenHash: null,
        codeSize: 11,
      }),
    });
    (env as { SHARE_DEBUG_HEADERS?: string }).SHARE_DEBUG_HEADERS = 'true';

    const response = await onRequestHead(
      createPagesContext({
        request: new Request('https://studio.test/s/abc12345', { method: 'HEAD' }),
        env: env as never,
        params: { shareId: ['abc12345'] },
        next: async () => buildHtmlResponse(),
      }) as never
    );

    const html = await response.text();
    expect(html).toContain('content="https://studio.test/api/share/abc12345/thumbnail"');
    expect(response.headers.get('x-share-thumbnail')).toBe('true');
    expect(response.headers.get('x-share-twitter-card')).toBe('summary_large_image');
    expect(response.headers.get('x-share-param-type')).toBe('array');
    expect(response.headers.get('x-share-param-raw')).toBe('abc12345');
  });

  it('escapes share titles before inserting them into meta tag attributes', async () => {
    const { env } = createMockEnv({
      'share:abc12345': JSON.stringify({
        id: 'abc12345',
        code: 'compressed',
        title: 'x" /><script>globalThis.__pwned=1</script><meta name="',
        createdAt: '2026-03-29T18:00:00.000Z',
        forkedFrom: null,
        thumbnailKey: null,
        thumbnailUploadTokenHash: null,
        codeSize: 11,
      }),
    });

    const response = await onRequestGet(
      createPagesContext({
        request: new Request('https://studio.test/s/abc12345'),
        env: env as never,
        params: { shareId: 'abc12345' },
        next: async () => buildHtmlResponse(),
      }) as never
    );

    const html = await response.text();
    expect(html).toContain(
      'content="x&quot; /&gt;&lt;script&gt;globalThis.__pwned=1&lt;/script&gt;&lt;meta name=&quot;'
    );
    expect(html).not.toContain('<script>globalThis.__pwned=1</script>');
    expect(html).not.toContain('content="x" />');
  });

  // WEB-2: String.prototype.replace interprets $&, $`, $' and $n inside the
  // REPLACEMENT string. escapeHtmlAttribute does not escape '$', so a title made
  // of "$`" amplified a 3,889-byte page into 2,414,765 bytes.
  it('does not let $-substitution patterns in a share title expand the page', async () => {
    async function renderWithTitle(title: string) {
      const { env } = createMockEnv({
        'share:abc12345': JSON.stringify({
          id: 'abc12345',
          code: 'compressed',
          title,
          createdAt: '2026-03-29T18:00:00.000Z',
          forkedFrom: null,
          thumbnailKey: null,
          thumbnailUploadTokenHash: null,
          codeSize: 11,
        }),
      });
      const response = await onRequestGet(
        createPagesContext({
          request: new Request('https://studio.test/s/abc12345'),
          env: env as never,
          params: { shareId: 'abc12345' },
          next: async () => buildHtmlResponse(),
        }) as never
      );
      return response.text();
    }

    const attack = '$`'.repeat(50); // 100 chars, exactly the sanitizeTitle cap
    const benign = 'a'.repeat(100); // same length, no substitution patterns

    const attackHtml = await renderWithTitle(attack);
    const benignHtml = await renderWithTitle(benign);

    // Zero amplification: an attack title of length N must produce exactly the
    // same page size as a benign title of length N. (Before the fix this was
    // 2,414,765 bytes against a 3,889-byte page in production.)
    expect(attackHtml.length).toBe(benignHtml.length);
    // The page must not have been duplicated into itself.
    expect(attackHtml.split('<!doctype html>').length - 1).toBe(1);
    // The literal title survives, verbatim, inside the attribute.
    expect(attackHtml).toContain(`content="${attack} — TinkerQuarry"`);
  });

  it('does not interpret $&, $\' and $n substitution patterns in a share title', async () => {
    const title = 'A$&B$1C$\'D$$E';
    const { env } = createMockEnv({
      'share:abc12345': JSON.stringify({
        id: 'abc12345',
        code: 'compressed',
        title,
        createdAt: '2026-03-29T18:00:00.000Z',
        forkedFrom: null,
        thumbnailKey: null,
        thumbnailUploadTokenHash: null,
        codeSize: 11,
      }),
    });

    const response = await onRequestGet(
      createPagesContext({
        request: new Request('https://studio.test/s/abc12345'),
        env: env as never,
        params: { shareId: 'abc12345' },
        next: async () => buildHtmlResponse(),
      }) as never
    );

    const html = await response.text();
    // $& and $' must survive as literal text (& and ' are HTML-escaped, as they
    // should be); they must NOT be expanded into the matched text / the suffix.
    expect(html).toContain('content="A$&amp;B$1C$&#39;D$$E — TinkerQuarry"');
    expect(html).not.toContain('<meta property="og:title" content="A<meta');
    expect(html.split('<!doctype html>').length - 1).toBe(1);
  });

  // The og:url fallback branch (html.replace('</head>', ...)) had the identical
  // bug and is the LIVE one, because index.html ships no og:url tag.
  it('does not let $-substitution escape through the missing-tag fallback branch', async () => {
    const title = '$`'.repeat(50);
    const { env } = createMockEnv({
      'share:abc12345': JSON.stringify({
        id: 'abc12345',
        code: 'compressed',
        title,
        createdAt: '2026-03-29T18:00:00.000Z',
        forkedFrom: null,
        thumbnailKey: null,
        thumbnailUploadTokenHash: null,
        codeSize: 11,
      }),
    });

    // A template with NO og:title tag at all forces the '</head>' fallback.
    const bare = () =>
      new Response('<!doctype html><html><head></head><body>hi</body></html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      });

    const response = await onRequestGet(
      createPagesContext({
        request: new Request('https://studio.test/s/abc12345'),
        env: env as never,
        params: { shareId: 'abc12345' },
        next: bare,
      }) as never
    );

    const html = await response.text();
    expect(html.length).toBeLessThan(4000);
    expect(html.split('<!doctype html>').length - 1).toBe(1);
    expect(html).toContain(`content="${title} — TinkerQuarry"`);
  });
});
