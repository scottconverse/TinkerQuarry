import { initParser } from "../../formatter/parser";
import { parseCustomizerParams } from "../parser";

/**
 * E2E-A. The engine serves its SCAD with `library/` modules INLINED, so a `module snap_box(...)`
 * declaration sits AHEAD of the annotated parameter block. The Customizer parser stopped scanning
 * at the first module declaration — the OpenSCAD convention — and therefore found zero parameters
 * for every part the product itself generates. Observed live: `customizer-empty-state`, zero
 * `input[type=range]`.
 *
 * That is not a cosmetic gap. templates.py's docstring says deterministic emit exists precisely so
 * that "named live sliders re-render instantly"; the sliders are the payoff the whole template
 * engine is built for, and they never appeared.
 *
 * The fix is a fallback second pass, so the first test below is the one that guards against
 * over-correcting: a hand-written file must keep the convention, or module-internal constants
 * start showing up as user-facing parameters.
 */

const HAND_WRITTEN = `
// A conventional file: parameters first, then modules.
width = 40; // [10:1:100]
height = 20; // [5:1:60]

module bracket(w, h) {
  internal_fudge = 3; // [1:1:9]
  cube([w, h, internal_fudge]);
}

bracket(width, height);
`;

const ENGINE_INLINED = `
// What the engine actually serves: the library is inlined ABOVE the parameters.
module rounded_box(w, d, h, r) {
  eps = 0.01;
  minkowski() { cube([w - 2 * r, d - 2 * r, h - eps]); sphere(r); }
}

module snap_lid(w, d) {
  lip = 1.2;
  cube([w, d, lip]);
}

/* [Dimensions] */
width = 80; // [10:1:170]
depth = 60; // [10:1:170]
height = 40; // [10:1:170]
wall = 2; // [1:0.2:6]

rounded_box(width, depth, height, 3);
`;

describe("E2E-A: Customizer parameters survive an inlined library", () => {
  beforeAll(async () => {
    await initParser();
  });

  const names = (code: string) =>
    parseCustomizerParams(code)
      .flatMap((t) => t.params)
      .map((p) => p.name);

  it("keeps the convention for a hand-written file (module internals stay hidden)", () => {
    const found = names(HAND_WRITTEN);
    expect(found).toEqual(["width", "height"]);
    // The load-bearing negative: a constant declared INSIDE a module is not a user parameter.
    expect(found).not.toContain("internal_fudge");
  });

  it("finds the engine's parameters even though modules come first", () => {
    const found = names(ENGINE_INLINED);
    expect(found).toEqual(["width", "depth", "height", "wall"]);
    // Module-internal constants must still not leak in.
    expect(found).not.toContain("eps");
    expect(found).not.toContain("lip");
  });

  it("gives the engine's parameters real slider ranges, not bare values", () => {
    const params = parseCustomizerParams(ENGINE_INLINED).flatMap(
      (t) => t.params,
    );
    const width = params.find((p) => p.name === "width");
    expect(width).toBeDefined();
    expect(width?.type).toBe("slider");
    expect(width?.min).toBe(10);
    expect(width?.max).toBe(170);
  });

  it("honours the tab comment that precedes the engine's parameter block", () => {
    const tabs = parseCustomizerParams(ENGINE_INLINED);
    expect(tabs.map((t) => t.name)).toContain("Dimensions");
  });
});
