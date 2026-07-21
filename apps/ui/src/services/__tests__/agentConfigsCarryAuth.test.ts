import {
  buildClaudeMcpCommand,
  buildCodexMcpCommand,
  buildCursorMcpConfig,
  buildOpenCodeMcpConfig,
} from "../desktopMcp";

/**
 * MCP-1b follow-up (pass-2 verifier finding): the External Agents card was fixed to SHOW the
 * per-boot bearer token, but all four copy-paste configs it hands the user still omitted the
 * `Authorization: Bearer <token>` header the server requires — so following the app's own
 * instructions produced a 401 every time. "The token is visible" and "the documented setup
 * works" are different claims, and only the second one matters to a user.
 *
 * These tests exist so that a builder gaining a new field, or a fifth agent being added, cannot
 * ship a config that cannot authenticate.
 */

const BUILDERS: ReadonlyArray<
  readonly [string, (port: number, token: string | null) => string]
> = [
  ["Claude Code", buildClaudeMcpCommand],
  ["Codex", buildCodexMcpCommand],
  ["Cursor", buildCursorMcpConfig],
  ["OpenCode", buildOpenCodeMcpConfig],
];

describe("agent setup configs", () => {
  it.each(BUILDERS)(
    "%s carries the bearer token the server requires",
    (_label, build) => {
      const out = build(32123, "tok-abc-123");
      expect(out).toContain("Authorization");
      expect(out).toContain("Bearer tok-abc-123");
    },
  );

  it.each(BUILDERS)("%s still points at the configured port", (_label, build) => {
    expect(build(41999, "t")).toContain("127.0.0.1:41999");
  });

  it.each(BUILDERS)(
    "%s shows a visible placeholder when the server is not running",
    (_label, build) => {
      // A header-less config would look plausible and fail with 401. A placeholder is
      // obviously incomplete, and names where to get the real value.
      const out = build(32123, null);
      expect(out).toContain("Authorization");
      expect(out).toContain("<paste-token-from-Settings>");
    },
  );

  it("emits the JSON configs as valid JSON", () => {
    for (const build of [buildCursorMcpConfig, buildOpenCodeMcpConfig]) {
      expect(() => JSON.parse(build(32123, "tok"))).not.toThrow();
    }
  });
});
