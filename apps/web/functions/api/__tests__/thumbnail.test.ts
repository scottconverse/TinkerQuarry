import { onRequestPut } from '../share/[id]/thumbnail';
import { hashToken } from '../../_lib/share';
import { createMockEnv, createPagesContext } from '../../__tests__/test-utils';

describe('PUT /api/share/:id/thumbnail', () => {
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
});
