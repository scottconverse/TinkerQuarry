/*
 * TinkerQuarry API client — the frontend's single door to the backend.
 *
 * Talks to KimCad's local HTTP API (KimCadClaude/docs/api.md). Point `baseUrl` at:
 *   - the mock server  (http://127.0.0.1:8766)  for offline dev/test, or
 *   - a real `kimcad web` server (http://127.0.0.1:8765) for live geometry.
 * The response shapes are identical, so the UI code is the same either way.
 *
 * Plain browser global (no bundler): `const api = new TinkerQuarryAPI();`
 */
(function (global) {
  // The real KimCad server injects a fresh per-boot CSRF token into the page shell it serves.
  // When present, the API is same-origin and every state-changing POST must carry the token.
  // The mock has no token (and ignores the header), so this is a no-op offline.
  function sessionToken() {
    if (typeof document === "undefined") return null;
    const el = document.querySelector('meta[name="kimcad-session-token"]');
    const v = el && el.getAttribute("content");
    return v && v.indexOf("__") !== 0 ? v : null; // ignore an un-substituted "__…__" placeholder
  }

  class TinkerQuarryAPI {
    constructor(baseUrl) {
      // Resolve the backend, most-specific first, so switching mock → real is one setting:
      //   explicit arg  >  ?api=<url> in the page URL  >  window.TINKERQUARRY_API_BASE  >  mock.
      // Point at the real engine with e.g. ?api=http://127.0.0.1:8765 (kimcad web).
      const fromQuery =
        (typeof location !== "undefined" && new URLSearchParams(location.search).get("api")) || null;
      const fromGlobal =
        (typeof window !== "undefined" && window.TINKERQUARRY_API_BASE) || null;
      // When the real KimCad server serves this page it injects a session-token meta; the API is
      // then same-origin (relative "") — no CORS — and we send that token on POSTs (see _req).
      this.baseUrl = (baseUrl || fromQuery || fromGlobal ||
        (sessionToken() ? "" : "http://127.0.0.1:8766")).replace(/\/$/, "");
    }

    async _req(method, path, body) {
      const headers = body ? { "Content-Type": "application/json" } : {};
      const tok = sessionToken();
      if (tok) headers["X-KimCad-Session"] = tok;  // real KimCad CSRF gate; the mock ignores it
      const res = await fetch(this.baseUrl + path, {
        method,
        headers: Object.keys(headers).length ? headers : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      return { status: res.status, mock: res.headers.get("X-TinkerQuarry-Mock") === "1", data };
    }

    // --- the core flow ---
    design(prompt, opts = {}) { return this._req("POST", "/api/design", { prompt, ...opts }); }
    render(rid, values) { return this._req("POST", `/api/render/${rid}`, { values }); }
    slice(rid, printer, material) { return this._req("POST", `/api/slice/${rid}`, { printer, material }); }
    send(rid, confirm, connector) { return this._req("POST", `/api/send/${rid}`, { confirm, connector }); }
    outcome(rid, outcome) { return this._req("POST", `/api/print-outcome/${rid}`, { outcome }); }

    // --- catalog / status ---
    health() { return this._req("GET", "/api/health"); }
    modelStatus() { return this._req("GET", "/api/model-status"); }
    options() { return this._req("GET", "/api/options"); }
    templates() { return this._req("GET", "/api/templates"); }
    connectors() { return this._req("GET", "/api/connectors"); }
    settings() { return this._req("GET", "/api/settings"); }
  }

  global.TinkerQuarryAPI = TinkerQuarryAPI;
})(typeof window !== "undefined" ? window : this);
