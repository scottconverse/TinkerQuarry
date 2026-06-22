/**
 * @jest-environment jsdom
 */
import { EngineClient } from '../engineClient';

// Locks the security-relevant behavior of the engine client: state-changing POSTs carry the
// per-boot CSRF session token (read from the page shell's meta) and GETs don't need it. A
// regression here would either break the authenticated path or leak/mis-send the token.

describe('EngineClient — request shape + CSRF token (Phase 4)', () => {
  let calls: Array<{ url: string; init: RequestInit }>;

  beforeEach(() => {
    calls = [];
    // a stub fetch that records the call and returns an empty-json 200
    (globalThis as unknown as { fetch: typeof fetch }).fetch = ((url: string, init: RequestInit) => {
      calls.push({ url, init: init ?? {} });
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ ok: true }),
      } as Response);
    }) as typeof fetch;
    document.head.querySelector('meta[name="kimcad-session-token"]')?.remove();
  });

  function setToken(value: string) {
    const m = document.createElement('meta');
    m.setAttribute('name', 'kimcad-session-token');
    m.setAttribute('content', value);
    document.head.appendChild(m);
  }

  function header(init: RequestInit, name: string): string | undefined {
    return (init.headers as Record<string, string> | undefined)?.[name];
  }

  it('GET reads hit the right path and send no token', async () => {
    await new EngineClient().health();
    expect(calls[0].url).toBe('/api/health');
    expect(calls[0].init.method).toBe('GET');
    expect(header(calls[0].init, 'X-KimCad-Session')).toBeUndefined();
  });

  it('POST design sends the JSON body and, when present, the session token', async () => {
    setToken('real-token-123');
    await new EngineClient().design('a box', { experimental: true });
    const { url, init } = calls[0];
    expect(url).toBe('/api/design');
    expect(init.method).toBe('POST');
    expect(header(init, 'Content-Type')).toBe('application/json');
    expect(header(init, 'X-KimCad-Session')).toBe('real-token-123');
    expect(JSON.parse(init.body as string)).toEqual({ prompt: 'a box', experimental: true });
  });

  it('ignores an un-substituted "__…__" token placeholder (no header sent)', async () => {
    setToken('__KIMCAD_SESSION_TOKEN__');
    await new EngineClient().render(7, { width: 10 });
    expect(calls[0].url).toBe('/api/render/7');
    expect(header(calls[0].init, 'X-KimCad-Session')).toBeUndefined();
  });
});
