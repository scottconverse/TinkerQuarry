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
  class TinkerQuarryAPI {
    constructor(baseUrl) {
      // Resolve the backend, most-specific first, so switching mock → real is one setting:
      //   explicit arg  >  ?api=<url> in the page URL  >  window.TINKERQUARRY_API_BASE  >  mock.
      // Point at the real engine with e.g. ?api=http://127.0.0.1:8765 (kimcad web).
      const fromQuery =
        (typeof location !== "undefined" && new URLSearchParams(location.search).get("api")) || null;
      const fromGlobal =
        (typeof window !== "undefined" && window.TINKERQUARRY_API_BASE) || null;
      this.baseUrl = (baseUrl || fromQuery || fromGlobal || "http://127.0.0.1:8766").replace(/\/$/, "");
    }

    async _req(method, path, body) {
      const res = await fetch(this.baseUrl + path, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
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
