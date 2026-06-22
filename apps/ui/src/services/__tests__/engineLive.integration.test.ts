/** @jest-environment node */
import { describe, it, expect } from '@jest/globals';

/**
 * The first real LIVE-API integration test from the front-end suite. SCOPE (be honest): this makes
 * REAL HTTP calls to the running engine and asserts the REAL responses — it does NOT mount `App.tsx`,
 * click the UI or render React. It is NOT a browser/user-flow test; a
 * Playwright-style "describe → render → make it real" test is still missing. What it DOES do is guard
 * the API seams the rest of this suite only stubs — which is exactly how the §6.12 reopen bug shipped
 * GREEN (the unit test stubbed `/api/source`, the real endpoint 404'd). So a real-path break
 * (response-shape drift, a dropped field, a 404) is actually caught here.
 *
 * It is environment-gated: if the engine isn't reachable (e.g. CI), the cases are `it.skip` — they show
 * as SKIPPED, never as a false pass. To run it: start the engine
 * (`TINKERQUARRY_DEV_TOKEN=tq-dev-token .venv/Scripts/kimcad.exe web --port 8765`) and run jest.
 */

const BASE = process.env.TQ_ENGINE || 'http://127.0.0.1:8765';
const TOKEN = process.env.TINKERQUARRY_DEV_TOKEN || 'tq-dev-token';

async function getJson(path: string): Promise<{ ok: boolean; status: number; body: unknown }> {
  const r = await fetch(BASE + path);
  return { ok: r.ok, status: r.status, body: await r.json().catch(() => ({})) };
}

async function postJson(
  path: string,
  body: Record<string, unknown>
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const r = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-KimCad-Session': TOKEN },
    body: JSON.stringify(body),
  });
  return { ok: r.ok, status: r.status, body: await r.json().catch(() => ({})) };
}

function getRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}
function ridFromMeshUrl(u: unknown): number {
  return Number(String(u).split('?')[0].split('/').pop());
}

// Resolve reachability + seed a saved design at module load so the live test is clean-machine safe.
let engineUp = false;
let savedId: string | undefined;
try {
  engineUp = (await fetch(BASE + '/api/health')).ok;
  if (engineUp) {
    const d = await fetch(BASE + '/api/designs').then((r) => r.json());
    savedId = d?.designs?.[0]?.id;
    if (!savedId) {
      const designed = await postJson('/api/design', { prompt: 'a small test gear' });
      const rid = ridFromMeshUrl(getRecord(designed.body).mesh_url);
      if (designed.ok && Number.isFinite(rid)) {
        const saved = await postJson('/api/designs/save', {
          design_id: rid,
          name: 'Live integration seed',
        });
        const savedBody = getRecord(saved.body);
        if (saved.ok && typeof savedBody.id === 'string') {
          savedId = savedBody.id;
        }
      }
    }
  }
} catch {
  engineUp = false;
}
const live = engineUp && savedId ? it : it.skip;

describe('engine integration (LIVE) — anchors the manual "verified LIVE" FE claims', () => {
  live(
    'reopen → /api/source serves real SCAD (the §6.12 path the unit tests stub away)',
    async () => {
      const reopened = await getJson(`/api/designs/${savedId}`);
      expect(reopened.ok).toBe(true);
      const rid = ridFromMeshUrl(getRecord(reopened.body).mesh_url);
      expect(Number.isFinite(rid)).toBe(true);

      const src = await getJson(`/api/source/${rid}?inline=1`);
      // This was a real 404 before the reopen fix — and it shipped green because the FE stubbed it.
      expect(src.ok).toBe(true);
      const sourceBody = getRecord(src.body);
      expect(typeof sourceBody.scad).toBe('string');
      expect((sourceBody.scad as string).length).toBeGreaterThan(10);
    },
    30000
  );

  live(
    'slice with a NON-default printer returns real G-code for THAT printer (the §6.9 picker)',
    async () => {
      // Prusa MK4 (a non-default profile that actually slices). NOTE: this test was first written
      // against elegoo_neptune_4_max — and it CAUGHT that that profile fails to slice (OrcaSlicer
      // exit -51, an upstream relative-extruder/G92-E0 profile bug), exposing an over-claim that a
      // manual click had missed. 11/12 sampled printers slice; elegoo_neptune_4_max is the exception.
      const reopened = await getJson(`/api/designs/${savedId}`);
      const rid = ridFromMeshUrl(getRecord(reopened.body).mesh_url);

      const r = await fetch(`${BASE}/api/slice/${rid}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-KimCad-Session': TOKEN },
        body: JSON.stringify({ printer: 'prusa_mk4', material: 'pla' }),
      });
      const body = await r.json();
      expect(r.ok).toBe(true);
      expect(body.sliced).toBe(true); // real OrcaSlicer slice succeeded
      expect(String(body.estimate || '')).toMatch(/layer/i); // a real estimate, not an empty stub
      // The chosen non-default printer was honoured (not silently the default Bambu).
      expect(String(body.printer)).toMatch(/prusa/i);
    },
    90000
  );
});
