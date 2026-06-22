// TinkerQuarry engine client — the single typed door from the (forked Studio) front end to the
// KimCad manufacturing engine (Recovery Plan v2 Phase 4).
//
// Talks to the engine's local JSON API (packages/engine/docs/api.md). In dev, vite proxies
// `/api/*` → http://127.0.0.1:8765 (see vite.config.ts), so the base path is relative ('/api').
// State-changing POSTs carry the per-boot session token: read from the page shell's
// `<meta name="kimcad-session-token">` when the engine serves the built SPA, or from a dev token
// the vite proxy injects. GET reads need no token.
//
// This replaces Studio's cloud-AI + WASM render path with KimCad's describe→plan→geometry→gate→
// slice pipeline. Wiring of individual surfaces (AI panel, viewer, customizer, manufacturing rail)
// builds on this module.

export type DesignStatus =
  | 'completed'
  | 'gate_failed'
  | 'render_failed'
  | 'plan_failed'
  | 'clarification_needed'
  | 'model_unavailable'
  | 'needs_experimental';

export interface HealthResult {
  version: string;
  openscad: boolean;
  orcaslicer: boolean;
  cadquery: boolean;
  external_binaries?: string[];
}

export interface ModelStatusResult {
  model: string;
  backend: 'local' | 'cloud';
  running: boolean;
  model_present: boolean;
  vision_model?: string;
  vision_present?: boolean;
  model_loading?: boolean;
}

export interface GateFinding {
  key?: string;
  label?: string;
  ok?: boolean;
  warn?: boolean;
  detail?: string;
}

export interface DesignReport {
  gate_status?: 'pass' | 'warn' | 'fail';
  headline?: string;
  backend?: string;
  dims?: number[];
  findings?: GateFinding[];
  readiness?: { score?: number; verdict?: string; tone?: string };
}

export interface VisualProbeResult {
  id: string;
  question: string;
  answer: string;
  pass: boolean | null;
  evidence?: string;
}

export interface VisualReviewResult {
  status?: 'unavailable' | 'ok' | 'issues' | 'error';
  mode?: string;
  advisory?: boolean;
  provider?: string;
  model?: string;
  summary?: string;
  findings?: string[];
  probes?: VisualProbeResult[];
  geometry_facts?: Record<string, unknown>;
  correction_prompt?: string | null;
  error?: string;
}

export interface DesignResult {
  rid: number;
  status: DesignStatus | string;
  has_mesh?: boolean;
  mesh_url?: string | null;
  template?: string | null;
  params?: unknown[];
  plan?: unknown;
  report?: DesignReport;
  clarification?: string | null;
  error?: string | null;
}

export interface SliceResult {
  sliced?: boolean;
  printer?: string;
  material?: string;
  gcode_lines?: number;
  /** Plain-English summary, e.g. "~11m 1s, 100 layers, 3.12 cm3 filament". */
  estimate?: string;
  estimate_detail?: {
    time?: string;
    layers?: number;
    layer_height_mm?: number | null;
    filament_g?: number;
    filament_cm3?: number;
  };
  profiles?: { machine?: string; process?: string; filament?: string };
  gcode_url?: string | null;
  gcode_filename?: string;
  error?: string;
  reason?: string;
}

export interface OrientResult {
  oriented?: boolean;
  axis?: 'x' | 'y' | 'z';
  degrees?: -180 | -90 | 90 | 180;
  extents_mm?: number[];
  mesh_url?: string;
  error?: string;
}

export interface ConnectorInfo {
  name: string;
  simulated?: boolean;
  configured?: boolean;
}

export interface ConnectorsResult {
  connectors?: ConnectorInfo[];
  default?: string | null;
}

export interface SendResult {
  sent?: boolean;
  connector?: string;
  simulated?: boolean;
  job_id?: string;
  state?: string;
  printer_state?: string;
  printer_detail?: string | null;
  reason?: string;
  note?: string;
  error?: string;
}

export interface ApiResponse<T> {
  status: number;
  ok: boolean;
  data: T;
}

interface DesktopEngineInfo {
  apiBaseUrl: string;
  sessionToken: string;
}

const DEFAULT_API_BASE = '/api';
let desktopEnginePromise: Promise<DesktopEngineInfo | null> | null = null;

/** The per-boot CSRF token the engine injects when it serves the page shell (or a dev token). */
function sessionToken(): string | null {
  if (typeof document === 'undefined') return null;
  const el = document.querySelector('meta[name="kimcad-session-token"]');
  const v = el?.getAttribute('content') ?? '';
  return v && !v.startsWith('__') ? v : null; // ignore an un-substituted "__…__" placeholder
}

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

async function desktopEngineInfo(): Promise<DesktopEngineInfo | null> {
  if (!isTauriRuntime()) return null;
  desktopEnginePromise ??= import('@tauri-apps/api/core')
    .then(({ invoke }) => invoke<DesktopEngineInfo>('ensure_engine'))
    .then((info) =>
      info?.apiBaseUrl && info?.sessionToken
        ? info
        : Promise.reject(new Error('Tauri returned an incomplete engine configuration.'))
    )
    .catch(() => {
      desktopEnginePromise = null;
      return null;
    });
  return desktopEnginePromise;
}

export interface SavedDesignEntry {
  id: string;
  name: string;
  object_type?: string;
  thumb_url?: string;
  created_at?: string;
  readiness_score?: number | null;
}

export class EngineClient {
  constructor(private readonly base: string = DEFAULT_API_BASE) {}

  private async req<T>(method: string, path: string, body?: unknown): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    let base = this.base;
    let tok = sessionToken();
    if (base === DEFAULT_API_BASE) {
      const desktop = await desktopEngineInfo();
      if (desktop) {
        base = desktop.apiBaseUrl;
        tok ??= desktop.sessionToken;
      }
    }
    if (tok) headers['X-KimCad-Session'] = tok; // engine CSRF gate (no-op for GETs / when absent)
    let res: Response;
    try {
      res = await fetch(base + path, {
        method,
        headers: Object.keys(headers).length ? headers : undefined,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch {
      // Engine unreachable (not running / network error). Return a typed failure instead of throwing,
      // so callers (describe, slice, …) surface a clear message rather than a silent rejection.
      return {
        status: 0,
        ok: false,
        data: { error: 'Could not reach the local engine. Is it running?' } as T,
      };
    }
    const data = (await res.json().catch(() => ({}))) as T;
    // A healthy engine always returns a JSON `{error}` on failure. So a non-OK response with NO error
    // body means we couldn't really reach it — the dev proxy answers ECONNREFUSED with a 500/502 and a
    // non-JSON body (the `catch` above doesn't fire because the proxy, not fetch, failed). Give that a
    // clear message instead of a confusing generic one.
    if (!res.ok && !(data as { error?: unknown })?.error) {
      (data as { error?: string }).error = 'Could not reach the local engine. Is it running?';
    }
    return { status: res.status, ok: res.ok, data };
  }

  // --- the core flow ---
  design(prompt: string, opts: Record<string, unknown> = {}) {
    return this.req<DesignResult>('POST', '/design', { prompt, ...opts });
  }
  render(rid: number, values: Record<string, unknown>) {
    return this.req<DesignResult>('POST', `/render/${rid}`, { values });
  }
  slice(rid: number, printer?: string, material?: string) {
    return this.req<SliceResult>('POST', `/slice/${rid}`, { printer, material });
  }
  orient(rid: number, axis: 'x' | 'y' | 'z', degrees: -180 | -90 | 90 | 180) {
    return this.req<OrientResult>('POST', `/orient/${rid}`, { axis, degrees });
  }
  send(rid: number, confirm: boolean, connector?: string) {
    return this.req<SendResult>('POST', `/send/${rid}`, { confirm, connector });
  }
  outcome(rid: number, outcome: string) {
    return this.req<Record<string, unknown>>('POST', `/print-outcome/${rid}`, { outcome });
  }
  connectors() {
    return this.req<ConnectorsResult>('GET', '/connectors');
  }
  /** Phase 5: the generated OpenSCAD source behind a design (read-only) — for the code drawer.
   *  `inline` resolves library `use/include` into self-contained SCAD so a renderer without the
   *  engine's library/ on disk (Studio's WASM) can render it. */
  source(rid: number, inline = false) {
    const q = inline ? '?inline=1' : '';
    return this.req<{ rid: number; scad: string; inlined?: boolean }>('GET', `/source/${rid}${q}`);
  }
  /** Advisory local visual critique. The caller supplies rendered preview images. */
  visualReview(rid: number, images: string[], model?: string) {
    return this.req<VisualReviewResult>('POST', `/visual-review/${rid}`, { images, model });
  }

  // --- saved designs (§6.12 version history) ---
  /** Persist the current design (engine rid) to the local "My Designs" store. */
  saveDesign(rid: number, name: string, thumbnail?: string) {
    return this.req<{ id: string; name: string; saved: boolean }>('POST', '/designs/save', {
      design_id: rid,
      name,
      thumbnail,
    });
  }
  /** List saved designs (id, name, object_type, thumb_url, …). */
  listDesigns() {
    return this.req<{ designs: SavedDesignEntry[] }>('GET', '/designs');
  }
  /** Reopen a saved design — re-registers it live and returns a fresh design payload (mesh, params). */
  reopenDesign(id: string) {
    return this.req<DesignResult & { saved_id?: string }>('GET', `/designs/${encodeURIComponent(id)}`);
  }
  /** Permanently delete a saved design from the local "My Designs" store. */
  deleteDesign(id: string) {
    return this.req<{ ok?: boolean }>('POST', `/designs/${encodeURIComponent(id)}/delete`);
  }
  /** Rename a saved design in the local "My Designs" store. */
  renameDesign(id: string, name: string) {
    return this.req<{ ok?: boolean }>('POST', `/designs/${encodeURIComponent(id)}/rename`, {
      name,
    });
  }
  /** Duplicate a saved design and return the new saved-design id. */
  duplicateDesign(id: string) {
    return this.req<{ ok?: boolean; id?: string | null }>(
      'POST',
      `/designs/${encodeURIComponent(id)}/duplicate`
    );
  }

  // --- catalog / status (no token needed) ---
  health() {
    return this.req<HealthResult>('GET', '/health');
  }
  modelStatus() {
    return this.req<ModelStatusResult>('GET', '/model-status');
  }
  options() {
    return this.req<Record<string, unknown>>('GET', '/options');
  }
  templates() {
    return this.req<Record<string, unknown>>('GET', '/templates');
  }
  settings() {
    return this.req<Record<string, unknown>>('GET', '/settings');
  }
}

/** Shared singleton — the app talks to one local engine. */
export const engine = new EngineClient();
