/** @jest-environment jsdom */

// TQ-N3. GET /api/health?recheck=1 is implemented, cross-site-guarded and maintained in
// packages/engine/src/kimcad/webapp.py, and before the Settings CAD-export card was restored it
// had ZERO callers anywhere in the shipped UI. HealthResult.cadquery was in the same state:
// declared on the type, never read. This pins the real request the client now issues — URL
// included, since the `?recheck=1` query IS the whole feature (drop it and the engine answers
// from its cache, which silently defeats the "check again" button).

import { jest } from '@jest/globals';
import { EngineClient, type HealthResult } from '../../../services/engineClient';

describe('TQ-N3: engineClient re-connects the CadQuery health surfaces', () => {
  let fetchMock: ReturnType<typeof jest.fn>;

  beforeEach(() => {
    fetchMock = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        version: '0.9.4',
        openscad: true,
        orcaslicer: true,
        cadquery: true,
        external_binaries: [],
      }),
    }));
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: fetchMock });
  });

  it('healthRecheck() requests /health?recheck=1 (the re-probe), health() does not', async () => {
    const client = new EngineClient('http://engine.test/api');

    await client.health();
    expect(fetchMock).toHaveBeenLastCalledWith(
      'http://engine.test/api/health',
      expect.objectContaining({ method: 'GET' })
    );

    await client.healthRecheck();
    expect(fetchMock).toHaveBeenLastCalledWith(
      'http://engine.test/api/health?recheck=1',
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('surfaces the cadquery field the card reads', async () => {
    const client = new EngineClient('http://engine.test/api');
    const r = await client.healthRecheck();
    expect(r.ok).toBe(true);
    const data: HealthResult = r.data;
    expect(data.cadquery).toBe(true);
  });
});
