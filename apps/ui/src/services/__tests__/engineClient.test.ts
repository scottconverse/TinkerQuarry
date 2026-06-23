/**
 * @jest-environment jsdom
 */
import { jest } from "@jest/globals";
import { EngineClient } from "../engineClient";

// Locks the security-relevant behavior of the engine client: state-changing POSTs carry the
// per-boot CSRF session token (read from the page shell's meta) and GETs don't need it. A
// regression here would either break the authenticated path or leak/mis-send the token.

describe("EngineClient — request shape + CSRF token (Phase 4)", () => {
  let calls: Array<{ url: string; init: RequestInit }>;

  beforeEach(() => {
    calls = [];
    // a stub fetch that records the call and returns an empty-json 200
    (globalThis as unknown as { fetch: typeof fetch }).fetch = ((
      url: string,
      init: RequestInit,
    ) => {
      calls.push({ url, init: init ?? {} });
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ ok: true }),
      } as Response);
    }) as typeof fetch;
    document.head.querySelector('meta[name="kimcad-session-token"]')?.remove();
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  });

  function setToken(value: string) {
    const m = document.createElement("meta");
    m.setAttribute("name", "kimcad-session-token");
    m.setAttribute("content", value);
    document.head.appendChild(m);
  }

  function header(init: RequestInit, name: string): string | undefined {
    return (init.headers as Record<string, string> | undefined)?.[name];
  }

  it("GET reads hit the right path and send no token", async () => {
    await new EngineClient().health();
    expect(calls[0].url).toBe("/api/health");
    expect(calls[0].init.method).toBe("GET");
    expect(header(calls[0].init, "X-KimCad-Session")).toBeUndefined();
  });

  it("slice sends the chosen printer + material in the body (§6.9 picker)", async () => {
    await new EngineClient().slice(5, "elegoo_neptune_4_max", "petg");
    expect(calls[0].url).toBe("/api/slice/5");
    expect(calls[0].init.method).toBe("POST");
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      printer: "elegoo_neptune_4_max",
      material: "petg",
    });
  });

  it("manual orientation sends the chosen axis and step (§6.8 override)", async () => {
    await new EngineClient().orient(5, "x", 90);
    expect(calls[0].url).toBe("/api/orient/5");
    expect(calls[0].init.method).toBe("POST");
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      axis: "x",
      degrees: 90,
    });
  });

  it("deleteDesign hits the right path with POST (§6.12 manage)", async () => {
    await new EngineClient().deleteDesign("abc123");
    expect(calls[0].url).toBe("/api/designs/abc123/delete");
    expect(calls[0].init.method).toBe("POST");
  });

  it("lists connectors, sends sliced G-code, and records real print outcomes (§6.10)", async () => {
    const c = new EngineClient();
    await c.connectors();
    expect(calls[0].url).toBe("/api/connectors");
    expect(calls[0].init.method).toBe("GET");

    await c.send(5, "mock");
    expect(calls[1].url).toBe("/api/send/5");
    expect(calls[1].init.method).toBe("POST");
    expect(JSON.parse(calls[1].init.body as string)).toEqual({
      connector: "mock",
    });

    await c.outcome(5, "issues");
    expect(calls[2].url).toBe("/api/print-outcome/5");
    expect(calls[2].init.method).toBe("POST");
    expect(JSON.parse(calls[2].init.body as string)).toEqual({
      outcome: "issues",
    });
  });

  it("POST design sends the JSON body and, when present, the session token", async () => {
    setToken("real-token-123");
    await new EngineClient().design("a box", { experimental: true });
    const { url, init } = calls[0];
    expect(url).toBe("/api/design");
    expect(init.method).toBe("POST");
    expect(header(init, "Content-Type")).toBe("application/json");
    expect(header(init, "X-KimCad-Session")).toBe("real-token-123");
    expect(JSON.parse(init.body as string)).toEqual({
      prompt: "a box",
      experimental: true,
    });
  });

  it("in packaged Tauri starts the native engine and targets its loopback API", async () => {
    const invoke = jest.fn(async () => ({
      apiBaseUrl: "http://127.0.0.1:34567/api",
      sessionToken: "desktop-token-123",
    }));
    jest.unstable_mockModule("@tauri-apps/api/core", () => ({ invoke }));
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });

    await new EngineClient().design("a desktop box");
    expect(invoke).toHaveBeenCalledWith("ensure_engine");
    expect(calls[0].url).toBe("http://127.0.0.1:34567/api/design");
    expect(header(calls[0].init, "X-KimCad-Session")).toBe("desktop-token-123");
  });

  it('ignores an un-substituted "__…__" token placeholder (no header sent)', async () => {
    setToken("__KIMCAD_SESSION_TOKEN__");
    await new EngineClient().render(7, { width: 10 });
    expect(calls[0].url).toBe("/api/render/7");
    expect(header(calls[0].init, "X-KimCad-Session")).toBeUndefined();
  });

  it("targets the saved-designs endpoints (§6.12 version history)", async () => {
    const c = new EngineClient();
    await c.saveDesign(4, "My Box");
    expect(calls[0].url).toBe("/api/designs/save");
    expect(calls[0].init.method).toBe("POST");
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      design_id: 4,
      name: "My Box",
    });
    await c.listDesigns();
    expect(calls[1].url).toBe("/api/designs");
    expect(calls[1].init.method).toBe("GET");
    await c.reopenDesign("abc 1");
    expect(calls[2].url).toBe("/api/designs/abc%201"); // id is URL-encoded
  });

  it("posts labeled visual-review images for the advisory VCL", async () => {
    await new EngineClient().visualReview(9, [
      { label: "top", image: "data:image/png;base64,YQ==" },
    ]);
    expect(calls[0].url).toBe("/api/visual-review/9");
    expect(calls[0].init.method).toBe("POST");
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      images: [{ label: "top", image: "data:image/png;base64,YQ==" }],
    });
  });

  it("returns a typed failure (not a throw) when the engine is unreachable", async () => {
    (globalThis as unknown as { fetch: typeof fetch }).fetch = (() =>
      Promise.reject(new TypeError("Failed to fetch"))) as typeof fetch;
    const res = await new EngineClient().design("a box");
    expect(res.ok).toBe(false);
    expect(res.status).toBe(0);
    expect(String(res.data.error)).toMatch(/reach the local engine/i);
  });
});
