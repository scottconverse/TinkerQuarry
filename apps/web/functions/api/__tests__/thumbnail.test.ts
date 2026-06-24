import { onRequestPut } from '../share/[id]/thumbnail';
import { hashToken } from '../../_lib/share';
import { createMockEnv, createPagesContext } from '../../__tests__/test-utils';

describe('PUT /api/share/:id/thumbnail', () => {
  const tinyPng = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

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

  it('accepts PNG bytes with a valid signature', async () => {
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
          body: tinyPng,
        }),
        env: env as never,
        params: { id: 'abc12345' },
      }) as never
    );

    expect(response.status).toBe(200);
    expect(put).toHaveBeenCalled();
  });
});
