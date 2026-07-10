/** @jest-environment node */
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * Real LIVE-API integration from the front-end suite. This makes real HTTP calls to the engine
 * and asserts real responses; it does not mount React. The test starts a deterministic demo engine
 * when TQ_ENGINE is not supplied, so release runs execute the cases instead of reporting skips.
 */

let base = process.env.TQ_ENGINE || '';
const TOKEN = process.env.TINKERQUARRY_DEV_TOKEN || 'tq-dev-token';
let savedId: string | undefined;
let engineProcess: ChildProcessWithoutNullStreams | undefined;

function engineRoot(): string {
  return path.resolve(process.cwd(), '..', '..', 'packages', 'engine');
}

function localEngineCommand(root: string, port: number, outDir: string): { command: string; args: string[] } {
  const commonArgs = ['web', '--host', '127.0.0.1', '--port', String(port), '--demo', '--out', outDir];
  const configuredPython = process.env.TINKERQUARRY_ENGINE_PYTHON;
  if (configuredPython) {
    return { command: configuredPython, args: ['-m', 'kimcad.cli', ...commonArgs] };
  }

  const venvPython = path.join(root, '.venv', 'Scripts', 'python.exe');
  if (existsSync(venvPython)) {
    return { command: venvPython, args: ['-m', 'kimcad.cli', ...commonArgs] };
  }

  const stagedPython = path.join(root, 'dist', 'staging', 'python', 'python.exe');
  const stagedLauncher = path.join(root, 'dist', 'staging', 'kimcad_launcher.py');
  if (existsSync(stagedPython) && existsSync(stagedLauncher)) {
    return { command: stagedPython, args: [stagedLauncher, ...commonArgs] };
  }

  return { command: venvPython, args: ['-m', 'kimcad.cli', ...commonArgs] };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHealth(url: string, timeoutMs = 45_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(url + '/api/health');
      if (r.ok) return;
      lastError = new Error(`health returned ${r.status}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(250);
  }
  throw lastError instanceof Error ? lastError : new Error('engine did not become healthy');
}

async function getJson(pathname: string): Promise<{ ok: boolean; status: number; body: unknown }> {
  const r = await fetch(base + pathname);
  return { ok: r.ok, status: r.status, body: await r.json().catch(() => ({})) };
}

async function postJson(
  pathname: string,
  body: Record<string, unknown>
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const r = await fetch(base + pathname, {
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

async function seedSavedDesign(): Promise<string> {
  const existing = await getJson('/api/designs');
  const existingBody = getRecord(existing.body);
  const designs = Array.isArray(existingBody.designs) ? existingBody.designs : [];
  const firstId = getRecord(designs[0]).id;
  if (typeof firstId === 'string') return firstId;

  const designed = await postJson('/api/design', { prompt: 'a small test gear' });
  expect(designed.ok).toBe(true);
  const rid = ridFromMeshUrl(getRecord(designed.body).mesh_url);
  expect(Number.isFinite(rid)).toBe(true);

  const saved = await postJson('/api/designs/save', {
    design_id: rid,
    name: 'Live integration seed',
  });
  expect(saved.ok).toBe(true);
  const savedBody = getRecord(saved.body);
  expect(typeof savedBody.id).toBe('string');
  return savedBody.id as string;
}

beforeAll(async () => {
  if (!base) {
    const port = 8765 + Number(process.env.JEST_WORKER_ID || '1');
    base = `http://127.0.0.1:${port}`;
    const root = engineRoot();
    const outDir = mkdtempSync(path.join(tmpdir(), 'tq-engine-live-'));
    const { command, args } = localEngineCommand(root, port, outDir);
    engineProcess = spawn(command, args, {
      cwd: root,
      env: {
        ...process.env,
        PYTHONPATH: path.join(root, 'src'),
        TINKERQUARRY_DEV_TOKEN: TOKEN,
        USERPROFILE: outDir,
        HOME: outDir,
      },
    });
  }
  await waitForHealth(base);
  savedId = await seedSavedDesign();
}, 120_000);

afterAll(() => {
  engineProcess?.kill();
});

describe('engine integration (LIVE) - anchors the manual "verified LIVE" FE claims', () => {
  it(
    'reopen -> /api/source serves real SCAD (the section 6.12 path the unit tests stub away)',
    async () => {
      const reopened = await getJson(`/api/designs/${savedId}`);
      expect(reopened.ok).toBe(true);
      const rid = ridFromMeshUrl(getRecord(reopened.body).mesh_url);
      expect(Number.isFinite(rid)).toBe(true);

      const src = await getJson(`/api/source/${rid}?inline=1`);
      expect(src.ok).toBe(true);
      const sourceBody = getRecord(src.body);
      expect(typeof sourceBody.scad).toBe('string');
      expect((sourceBody.scad as string).length).toBeGreaterThan(10);
    },
    30_000
  );

  it(
    'slice with a non-default printer returns real G-code for that printer',
    async () => {
      const reopened = await getJson(`/api/designs/${savedId}`);
      const rid = ridFromMeshUrl(getRecord(reopened.body).mesh_url);

      const r = await fetch(`${base}/api/slice/${rid}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-KimCad-Session': TOKEN },
        body: JSON.stringify({ printer: 'prusa_mk4', material: 'pla' }),
      });
      const body = await r.json();
      expect(r.ok).toBe(true);
      expect(body.sliced).toBe(true);
      expect(String(body.estimate || '')).toMatch(/layer/i);
      expect(String(body.printer)).toMatch(/prusa/i);
    },
    90_000
  );
});
