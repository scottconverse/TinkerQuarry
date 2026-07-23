import {
  getBearerToken,
  getThumbnailUrl,
  hashToken,
  json,
  readShare,
  timingSafeEqual,
  type Env,
  writeShare,
} from '../../../_lib/share';

const MAX_THUMBNAIL_BYTES = 512 * 1024;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
/** A share thumbnail is a small preview render; nothing legitimate exceeds this. */
const MAX_THUMBNAIL_DIMENSION = 4096;

const VALID_BIT_DEPTHS = new Set([1, 2, 4, 8, 16]);
const VALID_COLOUR_TYPES = new Set([0, 2, 3, 4, 6]);

/** CRC-32 with the PNG polynomial, over a chunk's type + data bytes. */
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * WEB-10: the old check compared only the 8-byte PNG signature, so ANY 512 KB
 * blob prefixed with those bytes was stored to R2 and served back from the
 * project's own origin as image/png, cached immutable for a year — an arbitrary
 * file host. Walk the real chunk structure instead: every chunk must declare a
 * length that fits, carry a valid CRC, start with a well-formed IHDR, contain
 * image data, and end at IEND with no trailing bytes.
 */
function isPng(buffer: ArrayBuffer): boolean {
  const bytes = new Uint8Array(buffer);
  if (bytes.byteLength < PNG_SIGNATURE.length) {
    return false;
  }
  if (PNG_SIGNATURE.some((byte, index) => bytes[index] !== byte)) {
    return false;
  }

  const view = new DataView(buffer);
  let offset = PNG_SIGNATURE.length;
  let sawIhdr = false;
  let sawData = false;
  let sawEnd = false;

  while (offset < bytes.byteLength) {
    // length (4) + type (4) + data + crc (4)
    if (offset + 8 > bytes.byteLength) {
      return false;
    }
    const length = view.getUint32(offset);
    if (length > 0x7fffffff) {
      return false;
    }
    const dataStart = offset + 8;
    const crcStart = dataStart + length;
    if (crcStart + 4 > bytes.byteLength) {
      return false;
    }

    const type = String.fromCharCode(
      bytes[offset + 4],
      bytes[offset + 5],
      bytes[offset + 6],
      bytes[offset + 7]
    );
    if (!/^[A-Za-z]{4}$/.test(type)) {
      return false;
    }
    if (crc32(bytes.subarray(offset + 4, crcStart)) !== view.getUint32(crcStart)) {
      return false;
    }

    if (!sawIhdr) {
      // The first chunk must be a well-formed IHDR.
      if (type !== 'IHDR' || length !== 13) {
        return false;
      }
      const width = view.getUint32(dataStart);
      const height = view.getUint32(dataStart + 4);
      if (width < 1 || height < 1) {
        return false;
      }
      if (width > MAX_THUMBNAIL_DIMENSION || height > MAX_THUMBNAIL_DIMENSION) {
        return false;
      }
      if (!VALID_BIT_DEPTHS.has(bytes[dataStart + 8])) {
        return false;
      }
      if (!VALID_COLOUR_TYPES.has(bytes[dataStart + 9])) {
        return false;
      }
      if (bytes[dataStart + 10] !== 0 || bytes[dataStart + 11] !== 0) {
        return false;
      }
      if (bytes[dataStart + 12] > 1) {
        return false;
      }
      sawIhdr = true;
    } else if (type === 'IHDR') {
      return false; // exactly one header
    }

    if (type === 'IDAT') {
      sawData = true;
    }
    if (type === 'IEND') {
      sawEnd = true;
      offset = crcStart + 4;
      break;
    }

    offset = crcStart + 4;
  }

  // IEND must terminate the file exactly — no smuggled trailing payload.
  return sawIhdr && sawData && sawEnd && offset === bytes.byteLength;
}

async function buildThumbnailResponse(
  context: EventContext<Env, string, unknown>,
  includeBody: boolean
) {
  const shareId = context.params.id;
  if (!shareId || typeof shareId !== 'string') {
    return json({ error: 'Missing share id.' }, { status: 400 });
  }

  const share = await readShare(context.env, shareId);
  if (!share?.thumbnailKey) {
    return json({ error: 'Thumbnail not found.' }, { status: 404 });
  }

  const object = includeBody
    ? await context.env.SHARE_R2.get(share.thumbnailKey)
    : await context.env.SHARE_R2.head(share.thumbnailKey);
  if (!object) {
    return json({ error: 'Thumbnail not found.' }, { status: 404 });
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  // WEB-9/WEB-10: this is third-party-uploaded content served from the product's
  // own origin, so pin the declared type and forbid MIME sniffing.
  headers.set('Content-Type', 'image/png');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Content-Security-Policy', "default-src 'none'; sandbox");
  return new Response(includeBody ? object.body : null, { headers });
}

export const onRequestGet: PagesFunction<Env> = async (context) =>
  buildThumbnailResponse(context, true);

export const onRequestHead: PagesFunction<Env> = async (context) =>
  buildThumbnailResponse(context, false);

export const onRequestPut: PagesFunction<Env> = async (context) => {
  const shareId = context.params.id;
  if (!shareId || typeof shareId !== 'string') {
    return json({ error: 'Missing share id.' }, { status: 400 });
  }

  const share = await readShare(context.env, shareId);
  if (!share) {
    return json({ error: 'Design not found' }, { status: 404 });
  }

  const contentType = context.request.headers.get('Content-Type') || '';
  if (!contentType.includes('image/png')) {
    return json({ error: 'Expected image/png.' }, { status: 400 });
  }

  if (share.thumbnailKey || !share.thumbnailUploadTokenHash) {
    return json({ error: 'Thumbnail already exists for this share.' }, { status: 409 });
  }

  // A share with no stored upload-token hash already returned 409 above, so from here
  // `share.thumbnailUploadTokenHash` is a non-null string (TS narrows it).
  const token = getBearerToken(context.request);
  if (!token) {
    return json({ error: 'Missing thumbnail upload token.' }, { status: 401 });
  }

  const providedHash = await hashToken(token);
  // WEB-10: timing-safe compare, matching the sibling delete-token check in [id].ts — a plain !==
  // leaks token-prefix length through response timing. (Functionally identical to !==; the timing
  // property is a code-review guarantee, so the tests below cover the REJECTION path, not the timing.)
  if (!timingSafeEqual(providedHash, share.thumbnailUploadTokenHash)) {
    return json({ error: 'Invalid thumbnail upload token.' }, { status: 401 });
  }

  const contentLength = context.request.headers.get('Content-Length');
  if (contentLength) {
    const byteLength = Number(contentLength);
    if (!Number.isFinite(byteLength) || byteLength > MAX_THUMBNAIL_BYTES) {
      return json({ error: 'Thumbnail is too large.' }, { status: 413 });
    }
  }

  const arrayBuffer = await context.request.arrayBuffer();
  if (arrayBuffer.byteLength > MAX_THUMBNAIL_BYTES) {
    return json({ error: 'Thumbnail is too large.' }, { status: 413 });
  }
  if (!isPng(arrayBuffer)) {
    return json({ error: 'Thumbnail bytes are not a valid PNG.' }, { status: 400 });
  }

  const thumbnailKey = `thumbnails/${shareId}.png`;
  await context.env.SHARE_R2.put(thumbnailKey, arrayBuffer, {
    httpMetadata: {
      contentType: 'image/png',
      cacheControl: 'public, max-age=31536000, immutable',
    },
  });

  await writeShare(context.env, {
    ...share,
    thumbnailKey,
    thumbnailUploadTokenHash: null,
  });

  return json({
    thumbnailUrl: getThumbnailUrl(new URL(context.request.url).origin, shareId),
  });
};
