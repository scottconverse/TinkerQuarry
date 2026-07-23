// TinkerQuarry Phase 4 — describe → engine → preview glue.
//
// Maps a KimCad engine design (engineClient) onto the fields Studio's workspace render store expects,
// so the existing 3D viewer renders the ENGINE's mesh instead of Studio's OpenSCAD-WASM output. This
// is the focused, side-effect-free adapter; the component (AI/describe panel) calls it, then commits
// the result via the workspace store (beginTabRender → commitTabRenderResult), filling Studio-specific
// fields (dimensionMode, lastRenderedContent) from its own context.

import { engine, type DesignResult } from './engineClient';

export interface EnginePreview {
  /** URL the viewer loads the mesh from (engine `/api/mesh/<id>`, via the dev proxy). */
  previewSrc: string;
  previewKind: 'mesh';
}

/** A completed engine design with a mesh → the viewer's preview fields. Null when there's no mesh
 *  (e.g. gate_failed / clarification_needed / model_unavailable) — the caller shows the status instead. */
export function engineDesignPreview(d: DesignResult): EnginePreview | null {
  if (!d.has_mesh || !d.mesh_url) return null;
  return { previewSrc: d.mesh_url, previewKind: 'mesh' };
}

/** Last-resort plain-English copy per non-completed status. Only used when the engine sent no
 *  `clarification` and no `error` of its own — a raw DesignStatus enum is never user-facing copy
 *  (WALK-1, gate 2026-07-19: users were shown the literal text "model_unavailable"). */
const STATUS_FALLBACK_MESSAGE: Record<string, string> = {
  gate_failed: "That design didn't pass the printability check.",
  render_failed: "The engine couldn't turn that design into geometry.",
  plan_failed: "The engine couldn't work out a plan for that part.",
  clarification_needed:
    'The engine needs a bit more detail before it can build that — try adding a size in mm.',
  // WALK-2: names the real recovery step. NEVER "restart it from Settings" — Settings has no
  // such control, and a message that points at a control the user cannot find is worse than none.
  // Kept in step with packages/engine/src/kimcad/pipeline.py's MODEL_UNAVAILABLE_MESSAGE and
  // WelcomeScreen.tsx's native-app copy.
  model_unavailable:
    "The local AI isn't available right now. It starts up with TinkerQuarry, so wait a few seconds and try again; if it keeps failing, close and reopen TinkerQuarry.",
  needs_experimental:
    'That part needs an experimental feature that is currently switched off.',
};

const GENERIC_FAILURE_MESSAGE = "The engine couldn't produce a printable design.";

/** The engine's OWN words for a design that produced no report: its clarifying question first
 *  (clarification_needed), then its error sentence (model_unavailable and friends), then plain-English
 *  fallback copy. Never the raw status enum. */
export function engineStatusMessage(d: DesignResult): string {
  const clarification = typeof d.clarification === 'string' ? d.clarification.trim() : '';
  if (clarification) return clarification;
  const error = typeof d.error === 'string' ? d.error.trim() : '';
  if (error) return error;
  const status = d.status ? String(d.status) : '';
  if (!status || status === 'completed') return '';
  return STATUS_FALLBACK_MESSAGE[status] ?? GENERIC_FAILURE_MESSAGE;
}

/** Plain-English gate summary for the readiness surface (verdict + score + the failing/warning checks). */
export function engineGateSummary(d: DesignResult): string {
  const r = d.report;
  // No report = a non-completed outcome (clarification_needed / model_unavailable / …). The engine
  // already wrote the right sentence; show THAT, never String(d.status) — see engineStatusMessage.
  if (!r) return engineStatusMessage(d);
  const score = r.readiness?.score;
  const verdict = r.readiness?.verdict ?? r.headline ?? r.gate_status ?? '';
  const head = score != null ? `${verdict} (${score}/100)` : String(verdict);
  const issues = (r.findings ?? [])
    .filter((f) => f.ok === false || f.warn)
    .map((f) => `• ${f.label ?? f.key}${f.detail ? `: ${f.detail}` : ''}`);
  return issues.length ? `${head}\n${issues.join('\n')}` : head;
}

export interface EngineDesignOutcome {
  result: DesignResult;
  preview: EnginePreview | null;
  /** True only for a completed design with a real mesh (ready to show + slice). */
  ok: boolean;
}

/** Describe → engine design. The single call the AI/describe surface uses instead of Studio's
 *  cloud-AI + WASM render path. */
export async function runEngineDesign(
  prompt: string,
  opts: Record<string, unknown> = {}
): Promise<EngineDesignOutcome> {
  const { data } = await engine.design(prompt, opts);
  const preview = engineDesignPreview(data);
  return { result: data, preview, ok: data.status === 'completed' && preview != null };
}
