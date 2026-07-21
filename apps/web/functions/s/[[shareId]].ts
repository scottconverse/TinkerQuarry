import { getShareUrl, getThumbnailUrl, readShare, type Env } from '../_lib/share';
import { applySecurityHeaders } from '../_lib/securityHeaders';

function normalizeShareIdParam(value: string | string[] | undefined): string | null {
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value) && value.length === 1 && typeof value[0] === 'string') {
    return value[0];
  }

  return null;
}

function formatRawParamValue(value: string | string[] | undefined): string {
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.join('/');
  }

  return 'missing';
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function replaceMetaTag(
  html: string,
  selector: { attr: string; name: string },
  content: string
): string {
  const escapedName = selector.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(
    `<meta\\s+${selector.attr}=["']${escapedName}["']\\s+content=["'][^"']*["']\\s*\\/?>`,
    'i'
  );
  const replacement = `<meta ${selector.attr}="${selector.name}" content="${escapeHtmlAttribute(content)}" />`;
  // WEB-2: String.prototype.replace interprets $&, $`, $' and $n inside a
  // replacement STRING. The replacement carries attacker-controlled text (the
  // share title), and escapeHtmlAttribute does not escape '$'. The function form
  // of replace never performs substitution, so pass a replacer instead of a
  // string on BOTH branches.
  if (pattern.test(html)) {
    return html.replace(pattern, () => replacement);
  }
  return html.replace('</head>', () => `  ${replacement}\n  </head>`);
}

type ShareDebugInfo = {
  rawParam: string | string[] | undefined;
  shareId: string | null;
  shareFound: boolean;
  metadataApplied: boolean;
  hasThumbnail: boolean;
  ogTitle: string | null;
  ogImage: string | null;
  twitterCard: string | null;
};

/**
 * WEB-11: these headers used to ship on every public response with no gate.
 * x-share-og-title exposed the user's own title and x-share-found was a
 * share-existence oracle. They are diagnostics, so they are off unless the
 * deployment explicitly asks for them.
 */
function shareDebugEnabled(env: Env): boolean {
  return env.SHARE_DEBUG_HEADERS === 'true';
}

function withShareDebugHeaders(
  response: Response,
  debug: ShareDebugInfo,
  env: Env
): Response {
  if (!shareDebugEnabled(env)) {
    return response;
  }

  // WEB-11: run EVERY value through the sanitizer. It used to be applied only to
  // ogTitle/ogImage/twitterCard — values the code builds itself — and skipped
  // for x-share-param-raw and x-share-id, the two that come straight off the
  // URL. A control character in those threw `Headers.set: invalid header value`,
  // i.e. an unhandled 500 on the public route.
  const toHeaderValue = (value: string | null) =>
    (value ?? 'missing').replace(/[^\t\x20-\x7e]/g, '?');

  const headers = new Headers(response.headers);
  headers.set('x-share-meta-route', 'functions/s/[[shareId]]');
  headers.set(
    'x-share-param-type',
    Array.isArray(debug.rawParam) ? 'array' : debug.rawParam ? 'string' : 'missing'
  );
  headers.set('x-share-param-raw', toHeaderValue(formatRawParamValue(debug.rawParam)));
  headers.set('x-share-id', toHeaderValue(debug.shareId));
  headers.set('x-share-found', debug.shareFound ? 'true' : 'false');
  headers.set('x-share-meta-applied', debug.metadataApplied ? 'true' : 'false');
  headers.set('x-share-thumbnail', debug.hasThumbnail ? 'true' : 'false');
  headers.set('x-share-og-title', toHeaderValue(debug.ogTitle));
  headers.set('x-share-og-image', toHeaderValue(debug.ogImage));
  headers.set('x-share-twitter-card', toHeaderValue(debug.twitterCard));

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/** WEB-11: share ids are secrets — never log them on an ungated public route. */
function logShareMeta(env: Env, payload: Record<string, unknown>): void {
  if (!shareDebugEnabled(env)) {
    return;
  }
  console.info('[share-meta]', JSON.stringify(payload));
}

async function handleShareMeta(context: EventContext<Env, string, unknown>) {
  const rawShareParam = context.params.shareId;
  const shareId = normalizeShareIdParam(rawShareParam);
  const response = await context.next();

  if (!shareId) {
    logShareMeta(context.env, {
      route: 'functions/s/[[shareId]]',
      rawParam: rawShareParam,
      shareId: null,
      shareFound: false,
      metadataApplied: false,
      hasThumbnail: false,
    });

    return withShareDebugHeaders(
      response,
      {
        rawParam: rawShareParam,
        shareId: null,
        shareFound: false,
        metadataApplied: false,
        hasThumbnail: false,
        ogTitle: null,
        ogImage: null,
        twitterCard: null,
      },
      context.env
    );
  }

  const share = await readShare(context.env, shareId);
  if (!share) {
    logShareMeta(context.env, {
      route: 'functions/s/[[shareId]]',
      rawParam: rawShareParam,
      shareId,
      shareFound: false,
      metadataApplied: false,
      hasThumbnail: false,
    });

    return withShareDebugHeaders(
      response,
      {
        rawParam: rawShareParam,
        shareId,
        shareFound: false,
        metadataApplied: false,
        hasThumbnail: false,
        ogTitle: null,
        ogImage: null,
        twitterCard: null,
      },
      context.env
    );
  }

  const html = await response.text();
  const origin = new URL(context.request.url).origin;
  const shareUrl = getShareUrl(origin, shareId);
  const thumbnailUrl = share.thumbnailKey
    ? getThumbnailUrl(origin, shareId)
    : `${origin}/icon-512.png`;
  const ogTitle = `${share.title} — TinkerQuarry`;
  const twitterCard = share.thumbnailKey ? 'summary_large_image' : 'summary';

  const updated = [
    [{ attr: 'property', name: 'og:title' }, ogTitle],
    [
      { attr: 'property', name: 'og:description' },
      'Open this TinkerQuarry design. Customize parameters, validate it, and download a print-ready file.',
    ],
    [{ attr: 'property', name: 'og:image' }, thumbnailUrl],
    [{ attr: 'property', name: 'og:url' }, shareUrl],
    [{ attr: 'name', name: 'twitter:card' }, twitterCard],
    [{ attr: 'name', name: 'twitter:title' }, ogTitle],
    [
      { attr: 'name', name: 'twitter:description' },
      'Open this TinkerQuarry design. Customize parameters, validate it, and download a print-ready file.',
    ],
    [{ attr: 'name', name: 'twitter:image' }, thumbnailUrl],
  ].reduce(
    (acc, [selector, content]) =>
      replaceMetaTag(acc, selector as { attr: string; name: string }, content as string),
    html
  );

  const headers = new Headers(response.headers);
  headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  headers.set('Content-Type', 'text/html; charset=utf-8');
  // WEB-9: this route builds its own Headers, so it does not inherit
  // public/_headers. Re-apply the same policy here.
  applySecurityHeaders(headers);
  const rewrittenResponse = new Response(updated, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });

  logShareMeta(context.env, {
    route: 'functions/s/[[shareId]]',
    rawParam: rawShareParam,
    shareId,
    shareFound: true,
    metadataApplied: true,
    hasThumbnail: Boolean(share.thumbnailKey),
  });

  return withShareDebugHeaders(
    rewrittenResponse,
    {
      rawParam: rawShareParam,
      shareId,
      shareFound: true,
      metadataApplied: true,
      hasThumbnail: Boolean(share.thumbnailKey),
      ogTitle,
      ogImage: thumbnailUrl,
      twitterCard,
    },
    context.env
  );
}

export const onRequestGet: PagesFunction<Env> = handleShareMeta;
export const onRequestHead: PagesFunction<Env> = handleShareMeta;
