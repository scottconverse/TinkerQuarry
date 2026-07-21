import { onRequestGet, onRequestPut } from '../share/[id]/thumbnail';
import { hashToken } from '../../_lib/share';
import { createMockEnv, createPagesContext } from '../../__tests__/test-utils';

/** A genuine 1x1 RGBA PNG produced by a real encoder. */
const REAL_PNG = new Uint8Array(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  )
);

/** Independent CRC-32 (PNG polynomial) used only to forge test fixtures. */
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

function chunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new Uint8Array(
    [...type].map((character) => character.charCodeAt(0))
  );
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(typeBytes, 4);
  out.set(data, 8);
  const body = new Uint8Array(4 + data.length);
  body.set(typeBytes, 0);
  body.set(data, 4);
  view.setUint32(8 + data.length, crc32(body));
  return out;
}

function ihdrData(width: number, height: number): Uint8Array {
  const data = new Uint8Array(13);
  const view = new DataView(data.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  data[8] = 8; // bit depth
  data[9] = 6; // colour type: RGBA
  data[10] = 0; // compression
  data[11] = 0; // filter
  data[12] = 0; // interlace
  return data;
}

function buildPng(parts: Uint8Array[]): Uint8Array {
  const signature = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const total = parts.reduce((sum, part) => sum + part.length, signature.length);
  const out = new Uint8Array(total);
  out.set(signature, 0);
  let offset = signature.length;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

describe('PUT /api/share/:id/thumbnail', () => {
  // WEB-10: the endpoint used to accept ANY blob starting with these 8 bytes.
  // This fixture (magic + one arbitrary byte) is not a PNG and must be rejected.
  const magicOnly = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

  it('rejects oversized content-length before reading the body', async () => {
    const token = 'thumbnail-token';
    const { env } = createMockEnv({
      'share:abc12345': JSON.stringify({
        id: 'abc12345',
        code: 'compressed',
        title: 'Bracket',
        createdAt: '2026-03-29T18:00:00.000Z',
        forkedFrom: null,
        thumbnailKey: null,
        thumbnailUploadTokenHash: await hashToken(token),
        codeSize: 11,
      }),
    });
    const arrayBuffer = jest.fn(async () => {
      throw new Error('body should not be read');
    });

    const response = await onRequestPut(
      createPagesContext({
        request: {
          url: 'https://studio.test/api/share/abc12345/thumbnail',
          headers: new Headers({
            Authorization: `Bearer ${token}`,
            'Content-Type': 'image/png',
            'Content-Length': String(512 * 1024 + 1),
          }),
          arrayBuffer,
        } as unknown as Request,
        env: env as never,
        params: { id: 'abc12345' },
      }) as never
    );

    expect(response.status).toBe(413);
    expect(arrayBuffer).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({ error: 'Thumbnail is too large.' });
  });

  it('rejects image/png uploads whose bytes are not a PNG', async () => {
    const token = 'thumbnail-token';
    const { env } = createMockEnv({
      'share:abc12345': JSON.stringify({
        id: 'abc12345',
        code: 'compressed',
        title: 'Bracket',
        createdAt: '2026-03-29T18:00:00.000Z',
        forkedFrom: null,
        thumbnailKey: null,
        thumbnailUploadTokenHash: await hashToken(token),
        codeSize: 11,
      }),
    });

    const response = await onRequestPut(
      createPagesContext({
        request: new Request('https://studio.test/api/share/abc12345/thumbnail', {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'image/png',
          },
          body: 'not a png',
        }),
        env: env as never,
        params: { id: 'abc12345' },
      }) as never
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'Thumbnail bytes are not a valid PNG.',
    });
  });

  async function uploadBytes(body: Uint8Array) {
    const token = 'thumbnail-token';
    const { env } = createMockEnv({
      'share:abc12345': JSON.stringify({
        id: 'abc12345',
        code: 'compressed',
        title: 'Bracket',
        createdAt: '2026-03-29T18:00:00.000Z',
        forkedFrom: null,
        thumbnailKey: null,
        thumbnailUploadTokenHash: await hashToken(token),
        codeSize: 11,
      }),
    });
    const put = jest.fn(async () => undefined);
    (env as { SHARE_R2: { put: typeof put } }).SHARE_R2 = { put };

    const response = await onRequestPut(
      createPagesContext({
        request: new Request('https://studio.test/api/share/abc12345/thumbnail', {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'image/png',
          },
          body,
        }),
        env: env as never,
        params: { id: 'abc12345' },
      }) as never
    );

    return { response, put };
  }

  it('accepts a real PNG', async () => {
    const { response, put } = await uploadBytes(REAL_PNG);

    expect(response.status).toBe(200);
    expect(put).toHaveBeenCalled();
  });

  // WEB-10: an 8-byte magic check made this a 512 KB arbitrary-file host on the
  // project's own origin. Any blob prefixed with the PNG signature was stored
  // and served back forever as image/png.
  it('rejects a blob that is only the PNG signature plus arbitrary bytes', async () => {
    const { response, put } = await uploadBytes(magicOnly);

    expect(response.status).toBe(400);
    expect(put).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      error: 'Thumbnail bytes are not a valid PNG.',
    });
  });

  it('rejects an arbitrary payload wearing the PNG signature', async () => {
    const payload = new Uint8Array(64 * 1024);
    payload.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
    payload.fill(0x41, 8); // "AAAA..." — an arbitrary file, not an image

    const { response, put } = await uploadBytes(payload);

    expect(response.status).toBe(400);
    expect(put).not.toHaveBeenCalled();
  });

  it('rejects a PNG whose IHDR chunk is corrupt', async () => {
    const good = buildPng([
      chunk('IHDR', ihdrData(1, 1)),
      chunk('IDAT', new Uint8Array([0x78, 0x9c, 0x63, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01])),
      chunk('IEND', new Uint8Array(0)),
    ]);
    // Flip a byte inside IHDR's data so its CRC no longer matches.
    const corrupt = new Uint8Array(good);
    corrupt[20] ^= 0xff;

    const { response, put } = await uploadBytes(corrupt);

    expect(response.status).toBe(400);
    expect(put).not.toHaveBeenCalled();
  });

  it('rejects absurd declared dimensions', async () => {
    const huge = buildPng([
      chunk('IHDR', ihdrData(100_000, 100_000)),
      chunk('IDAT', new Uint8Array([0x78, 0x9c, 0x63, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01])),
      chunk('IEND', new Uint8Array(0)),
    ]);

    const { response, put } = await uploadBytes(huge);

    expect(response.status).toBe(400);
    expect(put).not.toHaveBeenCalled();
  });

  it('rejects trailing bytes appended after IEND', async () => {
    const valid = buildPng([
      chunk('IHDR', ihdrData(1, 1)),
      chunk('IDAT', new Uint8Array([0x78, 0x9c, 0x63, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01])),
      chunk('IEND', new Uint8Array(0)),
    ]);
    const smuggled = new Uint8Array(valid.length + 32);
    smuggled.set(valid, 0);
    smuggled.fill(0x42, valid.length);

    const { response, put } = await uploadBytes(smuggled);

    expect(response.status).toBe(400);
    expect(put).not.toHaveBeenCalled();
  });

  it('accepts a well-formed synthetic PNG', async () => {
    const valid = buildPng([
      chunk('IHDR', ihdrData(2, 2)),
      chunk('IDAT', new Uint8Array([0x78, 0x9c, 0x63, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01])),
      chunk('IEND', new Uint8Array(0)),
    ]);

    const { response, put } = await uploadBytes(valid);

    expect(response.status).toBe(200);
    expect(put).toHaveBeenCalled();
  });

  // WEB-10 / WEB-9: served back as image/png, cached immutable for a year, with
  // no nosniff — so a mis-typed blob could still be sniffed into something else.
  it('serves thumbnails with X-Content-Type-Options: nosniff', async () => {
    const { env, r2Store, kvStore } = createMockEnv();
    kvStore.set(
      'share:abc12345',
      JSON.stringify({
        id: 'abc12345',
        code: 'compressed',
        title: 'Bracket',
        createdAt: '2026-03-29T18:00:00.000Z',
        forkedFrom: null,
        thumbnailKey: 'thumbnails/abc12345.png',
        thumbnailUploadTokenHash: null,
        codeSize: 11,
      })
    );
    r2Store.set('thumbnails/abc12345.png', REAL_PNG.buffer as ArrayBuffer);
    (env as { SHARE_R2: unknown }).SHARE_R2 = {
      get: async () => ({
        body: null,
        httpEtag: '"etag"',
        writeHttpMetadata: (headers: Headers) => {
          headers.set('Content-Type', 'image/png');
        },
      }),
    };

    const response = await onRequestGet(
      createPagesContext({
        request: new Request('https://studio.test/api/share/abc12345/thumbnail'),
        env: env as never,
        params: { id: 'abc12345' },
      }) as never
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });
});
