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
  | "completed"
  | "gate_failed"
  | "render_failed"
  | "plan_failed"
  | "clarification_needed"
  | "model_unavailable"
  | "needs_experimental";

export interface HealthResult {
  version: string;
  openscad: boolean;
  orcaslicer: boolean;
  cadquery: boolean;
  external_binaries?: string[];
}

export interface ModelStatusResult {
  model: string;
  backend: "local" | "cloud";
  running: boolean;
  model_present: boolean;
  vision_model?: string;
  vision_present?: boolean;
  model_loading?: boolean;
  error?: string;
}

export interface ModelPullRow {
  status?: string; // queued | pulling | done | error
  completed?: number;
  total?: number;
  error?: string;
}

// The REAL shape the engine serves (pull_job.snapshot()): per-row progress keyed by row name
// ("AI engine" for the runtime fetch, then one row per model). Gate 2026-07-09 (W-1/T4): the UI
// previously read flat percent/phase/detail fields the server never sends, so multi-minute
// setup downloads rendered as a silent "Setting up...".
export interface ModelPullProgressResult {
  status?: string; // POST response ("ok" | "not_local")
  error?: string;
  running?: boolean;
  models?: Record<string, ModelPullRow>;
}

/** The single line the welcome status shows while local-AI setup runs: the active row's name
 * plus real progress ("AI engine 42%" / "qwen2.5:7b 310 of 4700 MB"), an error row's message,
 * or null when there is nothing to say. */
export function describeModelPull(
  snapshot: ModelPullProgressResult | null | undefined,
): string | null {
  const rows = snapshot?.models;
  if (!rows) return null;
  const entries = Object.entries(rows);
  if (!entries.length) return null;
  const failed = entries.find(([, r]) => r.status === "error");
  if (failed) {
    return failed[1].error || `${failed[0]}: setup failed`;
  }
  const active =
    entries.find(([, r]) => r.status === "pulling") ||
    entries.find(([, r]) => r.status === "queued");
  if (!active) {
    return entries.every(([, r]) => r.status === "done") ? "Finishing up..." : null;
  }
  const [name, row] = active;
  const completed = row.completed ?? 0;
  const total = row.total ?? 0;
  if (total > 0) {
    if (total > 10_000_000) {
      const mb = (n: number) => Math.round(n / 1_000_000);
      return `${name}: ${mb(completed)} of ${mb(total)} MB`;
    }
    return `${name}: ${Math.round((completed / total) * 100)}%`;
  }
  return row.status === "queued" ? `${name}: waiting...` : `${name}: downloading...`;
}

/** True when a pull snapshot says the job has finished (successfully or not). */
export function modelPullFinished(
  snapshot: ModelPullProgressResult | null | undefined,
): boolean {
  if (!snapshot) return false;
  if (snapshot.running) return false;
  const rows = snapshot.models ? Object.values(snapshot.models) : [];
  return rows.length > 0 && rows.every((r) => r.status === "done" || r.status === "error");
}

export interface GateFinding {
  key?: string;
  label?: string;
  level?: string;
  code?: string;
  message?: string;
  ok?: boolean;
  warn?: boolean;
  detail?: string;
}

export interface DesignDimensionCheck {
  axis?: string;
  target?: number;
  actual?: number;
  ok?: boolean;
}

export interface DesignReport {
  gate_status?: "pass" | "warn" | "fail";
  headline?: string;
  backend?: string;
  dims?: DesignDimensionCheck[];
  findings?: GateFinding[];
  watertight?: boolean;
  volume_mm3?: number;
  surface_area_mm2?: number;
  center_of_mass_mm?: number[] | null;
  orientation?: string;
  readiness?: {
    score?: number;
    verdict?: string;
    tone?: string;
    confidence?: string;
    risks?: Array<{ title?: string; detail?: string; tone?: string }>;
    recommendations?: string[];
    comparison?: string | null;
    attribution?: string | null;
  } | null;
}

export interface DesignFeature {
  type?: string;
  description?: string;
  diameter_mm?: number | null;
  width_mm?: number | null;
  depth_mm?: number | null;
  count?: number | null;
  spacing_mm?: number | null;
  position?: number[] | null;
  notes?: string | null;
}

export interface DesignPlan {
  object_type?: string;
  summary?: string;
  dimensions?: Record<string, number>;
  target_bbox_mm?: number[] | null;
  features?: DesignFeature[];
  tolerances?: { clearance_mm?: number; notes?: string | null } | null;
  printer?: string | null;
  material?: string | null;
  assumptions?: string[];
  open_questions?: string[];
}

export interface VisualProbeResult {
  id: string;
  question: string;
  answer: string;
  pass: boolean | null;
  evidence?: string;
}

export type VisualReviewImageInput =
  | string
  | {
      label: string;
      image: string;
    };

export interface VisualReviewResult {
  status?: "unavailable" | "ok" | "issues" | "needs_review" | "error";
  mode?: string;
  advisory?: boolean;
  provider?: string;
  model?: string;
  models?: string[];
  summary?: string;
  findings?: string[];
  probes?: VisualProbeResult[];
  model_reviews?: Array<{
    status?: string;
    model?: string;
    summary?: string;
    findings?: string[];
    probes?: VisualProbeResult[];
  }>;
  round_id?: number;
  review_log?: Array<{
    round?: number;
    created_at?: string;
    status?: string;
    mode?: string;
    models?: string[];
    summary?: string;
    findings?: string[];
    probes?: VisualProbeResult[];
  }>;
  geometry_facts?: Record<string, unknown>;
  correction_prompt?: string | null;
  error?: string;
}

export interface DesignResult {
  rid: number;
  status: DesignStatus | string;
  has_mesh?: boolean;
  mesh_url?: string | null;
  step_url?: string | null;
  step_offer?: string | null;
  template?: string | null;
  params?: unknown[];
  plan?: DesignPlan | null;
  report?: DesignReport;
  reverse_import?: {
    source_filename?: string;
    matched_family?: string;
    confidence?: number;
    measured_bbox_mm?: number[];
    matched_bbox_mm?: number[];
  };
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
  axis?: "x" | "y" | "z";
  degrees?: -180 | -90 | 90 | 180;
  extents_mm?: number[];
  mesh_url?: string;
  error?: string;
}

export interface ConnectorInfo {
  name: string;
  simulated?: boolean;
  configured?: boolean;
  /** v1.5 honesty label: whether this connector TYPE is certified against a physical
   * printer. Every current type is protocol simulator-tested only; absence of the field
   * (an older engine) must read as NOT certified. */
  hardware_validated?: boolean;
}

/** The one honest display label for a connector (v1.5): a loopback says "(simulated)", an
 * unconfigured real connection says "(setup)", and a real, ready connection whose TYPE has
 * never driven a physical printer says "(simulator-tested)" — only a hardware-certified type
 * earns the bare name. Single source for every picker so the label can't drift. */
export function connectorLabel(c: ConnectorInfo): string {
  if (c.simulated) return `${c.name} (simulated)`;
  if (c.configured === false) return `${c.name} (setup)`;
  if (!c.hardware_validated) return `${c.name} (simulator-tested)`;
  return c.name;
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

interface EngineErrorPayload {
  error?: string;
  reason?: string;
}

interface DesktopEngineInfo {
  apiBaseUrl: string;
  sessionToken: string;
}

const DEFAULT_API_BASE = "/api";
let desktopEnginePromise: Promise<DesktopEngineInfo | null> | null = null;
let desktopEngineStartupError: string | null = null;

/** The per-boot CSRF token the engine injects when it serves the page shell (or a dev token). */
function sessionToken(): string | null {
  if (typeof document === "undefined") return null;
  const el = document.querySelector('meta[name="kimcad-session-token"]');
  const v = el?.getAttribute("content") ?? "";
  return v && !v.startsWith("__") ? v : null; // ignore an un-substituted "__…__" placeholder
}

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function desktopEngineInfo(): Promise<DesktopEngineInfo | null> {
  if (!isTauriRuntime()) return null;
  desktopEnginePromise ??= import("@tauri-apps/api/core")
    .then(({ invoke }) => invoke<DesktopEngineInfo>("ensure_engine"))
    .then((info) =>
      info?.apiBaseUrl && info?.sessionToken
        ? ((desktopEngineStartupError = null), info)
        : Promise.reject(
            new Error("Tauri returned an incomplete engine configuration."),
          ),
    )
    .catch((error: unknown) => {
      desktopEngineStartupError =
        error instanceof Error
          ? error.message
          : typeof error === "string"
            ? error
            : "The bundled local engine could not start.";
      desktopEnginePromise = null;
      return null;
    });
  return desktopEnginePromise;
}

function localEngineUnavailableMessage(): string {
  if (desktopEngineStartupError) {
    return `The bundled local engine could not start: ${desktopEngineStartupError}`;
  }
  return "Could not reach the local engine.";
}

export interface SavedDesignEntry {
  id: string;
  name: string;
  object_type?: string;
  thumb_url?: string;
  created_at?: string;
  readiness_score?: number | null;
}

export interface ExternalLibraryEntry {
  name: string;
  slug: string;
  source_path?: string;
  sandbox_path?: string;
  include_prefix: string;
  file_count?: number;
  bytes?: number;
}

export interface LibrariesResult {
  bundled?: Array<{ name: string; file: string; include: string }>;
  external?: ExternalLibraryEntry[];
  error?: string;
}

export class EngineClient {
  constructor(private readonly base: string = DEFAULT_API_BASE) {}

  private async req<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers["Content-Type"] = "application/json";
    let base = this.base;
    let tok = sessionToken();
    if (base === DEFAULT_API_BASE) {
      const desktop = await desktopEngineInfo();
      if (desktop) {
        base = desktop.apiBaseUrl;
        tok ??= desktop.sessionToken;
      } else if (desktopEngineStartupError) {
        return {
          status: 0,
          ok: false,
          data: {
            error: localEngineUnavailableMessage(),
            reason: "engine-startup",
          } as T,
        };
      }
    }
    if (tok) headers["X-KimCad-Session"] = tok; // engine CSRF gate (no-op for GETs / when absent)
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
        data: {
          error: localEngineUnavailableMessage(),
          reason: desktopEngineStartupError ? "engine-startup" : "engine-unreachable",
        } as T,
      };
    }
    const data = (await res.json().catch(() => ({}))) as T;
    // A healthy engine always returns a JSON `{error}` on failure. So a non-OK response with NO error
    // body means we couldn't really reach it — the dev proxy answers ECONNREFUSED with a 500/502 and a
    // non-JSON body (the `catch` above doesn't fire because the proxy, not fetch, failed). Give that a
    // clear message instead of a confusing generic one.
    if (!res.ok && !(data as { error?: unknown })?.error) {
      (data as { error?: string }).error =
        localEngineUnavailableMessage();
      (data as { reason?: string }).reason = "engine-unreachable";
    }
    return { status: res.status, ok: res.ok, data };
  }

  private async rawReq(
    method: string,
    path: string,
    body?: Uint8Array,
    contentType?: string,
  ): Promise<ApiResponse<Uint8Array | EngineErrorPayload>> {
    const headers: Record<string, string> = {};
    if (contentType) headers["Content-Type"] = contentType;
    let base = this.base;
    let tok = sessionToken();
    if (base === DEFAULT_API_BASE) {
      const desktop = await desktopEngineInfo();
      if (desktop) {
        base = desktop.apiBaseUrl;
        tok ??= desktop.sessionToken;
      } else if (desktopEngineStartupError) {
        return {
          status: 0,
          ok: false,
          data: {
            error: localEngineUnavailableMessage(),
            reason: "engine-startup",
          },
        };
      }
    }
    if (tok) headers["X-KimCad-Session"] = tok;
    let res: Response;
    try {
      res = await fetch(base + path, {
        method,
        headers: Object.keys(headers).length ? headers : undefined,
        body,
      });
    } catch {
      return {
        status: 0,
        ok: false,
        data: {
          error: localEngineUnavailableMessage(),
          reason: desktopEngineStartupError ? "engine-startup" : "engine-unreachable",
        },
      };
    }
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!data.error) {
        data.error = localEngineUnavailableMessage();
      }
      return { status: res.status, ok: false, data };
    }
    return {
      status: res.status,
      ok: true,
      data: new Uint8Array(await res.arrayBuffer()),
    };
  }

  private async rawJsonReq<T>(
    method: string,
    path: string,
    body: Uint8Array,
    contentType: string,
    extraHeaders: Record<string, string> = {},
  ): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = { "Content-Type": contentType, ...extraHeaders };
    let base = this.base;
    let tok = sessionToken();
    if (base === DEFAULT_API_BASE) {
      const desktop = await desktopEngineInfo();
      if (desktop) {
        base = desktop.apiBaseUrl;
        tok ??= desktop.sessionToken;
      } else if (desktopEngineStartupError) {
        return {
          status: 0,
          ok: false,
          data: {
            error: localEngineUnavailableMessage(),
            reason: "engine-startup",
          } as T,
        };
      }
    }
    if (tok) headers["X-KimCad-Session"] = tok;
    let res: Response;
    try {
      res = await fetch(base + path, { method, headers, body });
    } catch {
      return {
        status: 0,
        ok: false,
        data: {
          error: localEngineUnavailableMessage(),
          reason: desktopEngineStartupError ? "engine-startup" : "engine-unreachable",
        } as T,
      };
    }
    const data = (await res.json().catch(() => ({}))) as T;
    if (!res.ok && !(data as { error?: unknown })?.error) {
      (data as { error?: string }).error =
        localEngineUnavailableMessage();
      (data as { reason?: string }).reason = "engine-unreachable";
    }
    return { status: res.status, ok: res.ok, data };
  }

  // --- the core flow ---
  design(prompt: string, opts: Record<string, unknown> = {}) {
    return this.req<DesignResult>("POST", "/design", { prompt, ...opts });
  }
  render(rid: number, values: Record<string, unknown>) {
    return this.req<DesignResult>("POST", `/render/${rid}`, { values });
  }
  slice(rid: number, printer?: string, material?: string) {
    return this.req<SliceResult>("POST", `/slice/${rid}`, {
      printer,
      material,
    });
  }
  orient(rid: number, axis: "x" | "y" | "z", degrees: -180 | -90 | 90 | 180) {
    return this.req<OrientResult>("POST", `/orient/${rid}`, { axis, degrees });
  }
  send(rid: number, connector?: string) {
    return this.req<SendResult>("POST", `/send/${rid}`, { connector });
  }
  outcome(rid: number, outcome: string) {
    return this.req<Record<string, unknown>>("POST", `/print-outcome/${rid}`, {
      outcome,
    });
  }
  connectors() {
    return this.req<ConnectorsResult>("GET", "/connectors");
  }
  /** Phase 5: the generated OpenSCAD source behind a design (read-only) — for the code drawer.
   *  `inline` resolves library `use/include` into self-contained SCAD so a renderer without the
   *  engine's library/ on disk (Studio's WASM) can render it. */
  source(rid: number, inline = false) {
    const q = inline ? "?inline=1" : "";
    return this.req<{ rid: number; scad: string; inlined?: boolean }>(
      "GET",
      `/source/${rid}${q}`,
    );
  }
  /** Advisory local visual critique. The caller supplies rendered preview images. */
  visualReview(
    rid: number,
    images: VisualReviewImageInput[],
    model?: string,
    models?: string[],
  ) {
    return this.req<VisualReviewResult>("POST", `/visual-review/${rid}`, {
      images,
      model,
      models,
    });
  }

  // --- saved designs (§6.12 version history) ---
  /** Persist the current design (engine rid) to the local "My Designs" store. */
  saveDesign(rid: number, name: string, thumbnail?: string) {
    return this.req<{ id: string; name: string; saved: boolean }>(
      "POST",
      "/designs/save",
      {
        design_id: rid,
        name,
        thumbnail,
      },
    );
  }
  /** List saved designs (id, name, object_type, thumb_url, …). */
  listDesigns() {
    return this.req<{ designs: SavedDesignEntry[] }>("GET", "/designs");
  }
  /** Reopen a saved design — re-registers it live and returns a fresh design payload (mesh, params). */
  reopenDesign(id: string) {
    return this.req<DesignResult & { saved_id?: string }>(
      "GET",
      `/designs/${encodeURIComponent(id)}`,
    );
  }
  /** Permanently delete a saved design from the local "My Designs" store. */
  deleteDesign(id: string) {
    return this.req<{ ok?: boolean }>(
      "POST",
      `/designs/${encodeURIComponent(id)}/delete`,
    );
  }
  /** Rename a saved design in the local "My Designs" store. */
  renameDesign(id: string, name: string) {
    return this.req<{ ok?: boolean }>(
      "POST",
      `/designs/${encodeURIComponent(id)}/rename`,
      {
        name,
      },
    );
  }
  /** Duplicate a saved design and return the new saved-design id. */
  duplicateDesign(id: string) {
    return this.req<{ ok?: boolean; id?: string | null }>(
      "POST",
      `/designs/${encodeURIComponent(id)}/duplicate`,
    );
  }
  /** Export a saved design as a portable .kimcad zip. */
  exportDesign(id: string) {
    return this.rawReq(
      "GET",
      `/designs/${encodeURIComponent(id)}/export`,
    );
  }
  /** Import a portable .kimcad zip and return the new saved-design id. */
  importDesign(bytes: Uint8Array) {
    return this.rawJsonReq<{ id?: string; error?: string }>(
      "POST",
      "/designs/import",
      bytes,
      "application/zip",
    );
  }
  /** Reverse-import an STL/3MF/OBJ mesh file into the closest trusted parametric family. */
  reverseImport(bytes: Uint8Array, filename: string) {
    return this.rawJsonReq<DesignResult>(
      "POST",
      "/reverse-import",
      bytes,
      "application/octet-stream",
      { "X-TinkerQuarry-Filename": filename },
    );
  }
  /** Download a binary engine asset URL such as /api/step/123 in web or Tauri runtime. */
  downloadApiAsset(url: string) {
    let path = url;
    try {
      const parsed = new URL(url, "http://engine.local");
      path = parsed.pathname + parsed.search;
    } catch {
      path = url;
    }
    if (path.startsWith("/api/")) path = path.slice("/api".length);
    if (!path.startsWith("/")) path = `/${path}`;
    return this.rawReq("GET", path);
  }

  // --- catalog / status (no token needed) ---
  health() {
    return this.req<HealthResult>("GET", "/health");
  }
  modelStatus() {
    return this.req<ModelStatusResult>("GET", "/model-status");
  }
  modelPull() {
    return this.req<ModelPullProgressResult>("POST", "/model-pull");
  }
  modelPullProgress() {
    return this.req<ModelPullProgressResult>("GET", "/model-pull/progress");
  }
  options() {
    return this.req<Record<string, unknown>>("GET", "/options");
  }
  templates() {
    return this.req<Record<string, unknown>>("GET", "/templates");
  }
  settings() {
    return this.req<Record<string, unknown>>("GET", "/settings");
  }
  libraries() {
    return this.req<LibrariesResult>("GET", "/libraries");
  }
  admitLibrary(path: string, name?: string) {
    return this.req<{ admitted?: boolean; library?: ExternalLibraryEntry; error?: string }>(
      "POST",
      "/libraries/admit",
      { path, name },
    );
  }
  removeLibrary(slug: string) {
    return this.req<{ removed?: boolean; error?: string }>(
      "POST",
      "/libraries/remove",
      { slug },
    );
  }
}

/** Shared singleton — the app talks to one local engine. */
export const engine = new EngineClient();
