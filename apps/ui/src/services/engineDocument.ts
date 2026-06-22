// TinkerQuarry Phase 4 (B core) — describe → engine → Studio document.
//
// The production seam, grounded in the PRD (local-first; engine = brain, Studio = IDE) and the
// live-verified mechanism (the engine's generated SCAD renders in Studio's viewer): describe →
// `/api/design` (qwen plan → SCAD → readiness gate) → pull the engine's SCAD → set it as Studio's
// active document, so Studio's existing editor + WASM viewer render it with NO render-store surgery.
// The engine's gate/readiness comes back as a plain-English summary for the caller to surface.

import { engine } from './engineClient';
import { runEngineDesign, engineGateSummary } from './engineDesign';
import type { DesignResult } from './engineClient';
import { getProjectStore, listProjectFiles } from '../stores/projectStore';

export interface EngineDocOutcome {
  ok: boolean;
  /** Plain-English readiness/gate summary (verdict + score + any failing/warning checks). */
  gate: string;
  rid?: number;
  /** The document path the engine's source was loaded into (when ok). */
  path?: string;
  /** The self-contained SCAD set as the document — the caller renders this directly (no state-timing). */
  scad?: string;
  error?: string;
}

/** The engine returns its id via the mesh URL (`/api/mesh/<rid>`); fall back to a top-level rid. */
export function ridFromResult(r: DesignResult): number | undefined {
  if (typeof r.rid === 'number') return r.rid;
  const u = r.mesh_url;
  if (typeof u === 'string') {
    const n = Number.parseInt(u.split('?')[0].split('/').pop() ?? '', 10);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

const NEW_DESIGN_PATH = 'design.scad';

/** Top-level Customizer slider values in a SCAD doc — the `name = value; // [...]` lines emit_scad
 *  produces for a template part. */
export function parseCustomizerValues(scad: string): Record<string, number> {
  const re = /^([A-Za-z_]\w*)\s*=\s*(-?[\d.]+)\s*;\s*\/\/\s*\[/gm;
  const out: Record<string, number> = {};
  let m: RegExpExecArray | null;
  while ((m = re.exec(scad)) !== null) out[m[1]] = Number.parseFloat(m[2]);
  return out;
}

/** If `current` differs from `original` ONLY in Customizer slider VALUES (a pure tune), return the
 *  tuned values; otherwise null (a structural code edit, or no change). Safe by construction: a
 *  structural edit can't normalize back to `original`, so it's never mistaken for a tune — the worst
 *  case is a tune misread as an edit (caller falls back to warning, never slices the wrong geometry). */
export function pureTuneValues(current: string, original: string): Record<string, number> | null {
  const orig = parseCustomizerValues(original);
  if (Object.keys(orig).length === 0) return null;
  let normalized = current;
  for (const name of Object.keys(orig)) {
    normalized = normalized.replace(
      new RegExp(`^(${name}\\s*=\\s*)-?[\\d.]+(\\s*;)`, 'm'),
      `$1${orig[name]}$2`
    );
  }
  if (normalized !== original) return null; // structural change — a real edit, not a tune
  const cur = parseCustomizerValues(current);
  return JSON.stringify(cur) === JSON.stringify(orig) ? null : cur; // null if nothing actually moved
}

/** Describe a part → engine designs it → its SCAD becomes Studio's active document (renders + editable).
 *  Returns ok=false (with the gate summary) when the engine couldn't produce printable geometry
 *  (gate_failed / clarification_needed / model_unavailable) — the caller shows that instead. */
export interface EngineTurn {
  role: 'user' | 'assistant';
  content: string;
}

/** Injectable engine calls (default to the real ones) — lets the orchestration be unit-tested without
 *  module mocking. */
export interface DescribeDeps {
  run?: typeof runEngineDesign;
  source?: (rid: number, inline: boolean) => ReturnType<typeof engine.source>;
}

export async function describeIntoStudio(
  prompt: string,
  history?: EngineTurn[],
  deps: DescribeDeps = {}
): Promise<EngineDocOutcome> {
  const run = deps.run ?? runEngineDesign;
  const source = deps.source ?? ((rid, inline) => engine.source(rid, inline));
  // `history` (prior turns) makes this a REFINE in context ("make it 10mm taller") — the engine's
  // /api/design accepts it (webapp.py). Omitted = a fresh describe.
  const opts = history && history.length ? { history } : {};
  const { result, ok } = await run(prompt, opts);
  const gate = engineGateSummary(result);
  const rid = ridFromResult(result);
  if (!ok || rid == null) {
    return { ok: false, gate, rid, error: result.error ?? String(result.status ?? 'no design') };
  }

  // Inlined = self-contained SCAD (library use/include resolved), so Studio's WASM viewer renders
  // template parts too (LLM-codegen parts are already self-contained).
  const { ok: srcOk, data } = await source(rid, true);
  if (!srcOk || !data?.scad) {
    return { ok: false, gate, rid, error: 'engine returned no source' };
  }

  return { ok: true, gate, rid, path: setEngineDocument(data.scad), scad: data.scad };
}

/** Set `scad` as the workspace's active document: replace the render-target file's content, or create
 *  one in an empty workspace. Returns the document path. Shared by describe and reopen. */
function setEngineDocument(scad: string): string {
  const store = getProjectStore();
  const state = store.getState();
  const path = state.renderTargetPath ?? listProjectFiles(state)[0];
  if (path && state.files[path]) {
    state.updateFileContent(path, scad);
    return path;
  }
  state.addFile(NEW_DESIGN_PATH, scad);
  store.getState().setRenderTarget(NEW_DESIGN_PATH);
  return NEW_DESIGN_PATH;
}

/** Reopen a saved design (§6.12) into the workspace: re-register it on the engine, pull its
 *  self-contained SCAD, and make it the active document — the same end state as a fresh describe, so the
 *  viewer renders it and the Customizer sliders work. */
export async function reopenIntoStudio(id: string): Promise<EngineDocOutcome> {
  const { ok, data } = await engine.reopenDesign(id);
  if (!ok || data.status !== 'completed') {
    return { ok: false, gate: '', error: data.error ?? 'Could not reopen that design.' };
  }
  const rid = ridFromResult(data);
  if (rid == null) return { ok: false, gate: '', error: 'Reopened design has no id.' };
  const src = await engine.source(rid, true);
  if (!src.ok || !src.data?.scad) return { ok: false, gate: '', rid, error: 'Reopened design has no source.' };
  return { ok: true, gate: engineGateSummary(data), rid, path: setEngineDocument(src.data.scad), scad: src.data.scad };
}
