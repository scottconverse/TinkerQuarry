/** Severity of the welcome screen's local-AI status box. */
export type ModelStatusSeverity = "ready" | "error" | "setup" | "checking";

/**
 * UIUX-5 (Minor, GauntletGate 2026-07-19): "Local AI needs setup" — a benign, expected first-run
 * step — and "can't reach the engine at all" — a real failure — rendered with the identical amber
 * border, so the failure case was under-signalled relative to the routine one. One mapping, in one
 * place, so the two colours cannot drift back together.
 */
export function modelStatusBorderColor(severity: ModelStatusSeverity): string {
  switch (severity) {
    case "ready":
      return "var(--border-secondary)";
    case "error":
      return "var(--color-error)";
    case "setup":
    case "checking":
      return "var(--color-warning)";
  }
}
