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

/** Describe a part → engine designs it → its SCAD becomes Studio's active document (renders + editable).
 *  Returns ok=false (with the gate summary) when the engine couldn't produce printable geometry
 *  (gate_failed / clarification_needed / model_unavailable) — the caller shows that instead. */
export async function describeIntoStudio(prompt: string): Promise<EngineDocOutcome> {
  const { result, ok } = await runEngineDesign(prompt);
  const gate = engineGateSummary(result);
  const rid = ridFromResult(result);
  if (!ok || rid == null) {
    return { ok: false, gate, rid, error: result.error ?? String(result.status ?? 'no design') };
  }

  // Inlined = self-contained SCAD (library use/include resolved), so Studio's WASM viewer renders
  // template parts too (LLM-codegen parts are already self-contained).
  const { ok: srcOk, data } = await engine.source(rid, true);
  if (!srcOk || !data?.scad) {
    return { ok: false, gate, rid, error: 'engine returned no source' };
  }

  const store = getProjectStore();
  const state = store.getState();
  const path = state.renderTargetPath ?? listProjectFiles(state)[0];
  if (path && state.files[path]) {
    state.updateFileContent(path, data.scad);
    return { ok: true, gate, rid, path };
  }
  // Empty workspace (no document yet): create one and make it the render target.
  state.addFile(NEW_DESIGN_PATH, data.scad);
  store.getState().setRenderTarget(NEW_DESIGN_PATH);
  return { ok: true, gate, rid, path: NEW_DESIGN_PATH };
}
