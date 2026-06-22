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

/** Plain-English gate summary for the readiness surface (verdict + score + the failing/warning checks). */
export function engineGateSummary(d: DesignResult): string {
  const r = d.report;
  if (!r) return d.status ? String(d.status) : '';
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
