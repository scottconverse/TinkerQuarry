/** @jest-environment jsdom */

import { act } from "@testing-library/react";
import { jest } from "@jest/globals";
import { createHookHarness } from "./test-utils";
import { createWorkspaceTab } from "@/stores/workspaceFactories";
import type { WorkspaceTab } from "@/stores/workspaceTypes";
import type { DesignResult } from "@/services/engineClient";
import type { EngineLifecycleTargets } from "../useEngineLifecycle";

type EngineResponse<T> = { ok: boolean; data: T; status?: number };

function ok<T>(data: T): EngineResponse<T> {
  return { ok: true, data, status: 200 };
}

const mockDescribeIntoStudio =
  jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockReopenIntoStudio =
  jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockReverseImportIntoStudio =
  jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockSetEngineDocument = jest.fn();
const mockPureTuneValues = jest.fn(() => null);
const mockEngineGateSummary = jest.fn(() => "Looks printable (90/100)");

const mockSlice = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockOrient = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockSend = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockOutcome = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockOptions = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockConnectors = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockModelStatus = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockRender = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.unstable_mockModule("@/services/engineDocument", () => ({
  describeIntoStudio: (...args: unknown[]) => mockDescribeIntoStudio(...args),
  reopenIntoStudio: (...args: unknown[]) => mockReopenIntoStudio(...args),
  reverseImportIntoStudio: (...args: unknown[]) =>
    mockReverseImportIntoStudio(...args),
  setEngineDocument: (...args: unknown[]) => mockSetEngineDocument(...args),
  pureTuneValues: (...args: unknown[]) => mockPureTuneValues(...args),
}));

jest.unstable_mockModule("@/services/engineClient", () => ({
  engine: {
    slice: (...args: unknown[]) => mockSlice(...args),
    orient: (...args: unknown[]) => mockOrient(...args),
    send: (...args: unknown[]) => mockSend(...args),
    outcome: (...args: unknown[]) => mockOutcome(...args),
    options: (...args: unknown[]) => mockOptions(...args),
    connectors: (...args: unknown[]) => mockConnectors(...args),
    modelStatus: (...args: unknown[]) => mockModelStatus(...args),
    render: (...args: unknown[]) => mockRender(...args),
  },
}));

jest.unstable_mockModule("@/services/engineDesign", () => ({
  engineGateSummary: (...args: unknown[]) => mockEngineGateSummary(...args),
}));

let useEngineLifecycle: typeof import("../useEngineLifecycle").useEngineLifecycle;

const PREVIEW_SCENE_STYLE = {
  backgroundColor: "#000",
  gridColor: "#111",
  gridSectionColor: "#222",
  modelColor: "#fff",
  svgModelColor: "#fff",
  environmentPreset: "city",
  material: { metalness: 0, roughness: 1, envMapIntensity: 1 },
  axis: {
    xColor: "#f00",
    yColor: "#0f0",
    zColor: "#00f",
    tickColor: "#888",
    labelColor: "#888",
  },
  ambientLight: { color: "#fff", intensity: 1 },
  directionalLight: {
    color: "#fff",
    intensity: 1,
    position: [1, 1, 1] as [number, number, number],
    shadowMapSize: [1024, 1024] as [number, number],
  },
} as unknown as EngineLifecycleTargets["previewSceneStyle"];

// Kept equal to renderTargetContent below throughout most tests, so handleMakeItReal's
// edited-since-described check (comparing the two) never trips — that guard is exercised
// implicitly (a mismatch is what "edited" detects), not the target of these tests.
const RENDER_TARGET_CONTENT = "cube(1);";

describe("useEngineLifecycle (extracted from App.tsx, phase 1d) — mocked engine, real utils", () => {
  beforeAll(async () => {
    ({ useEngineLifecycle } = await import("../useEngineLifecycle"));
  });

  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    mockModelStatus.mockResolvedValue(
      ok({ model: "x", backend: "local", running: true, model_present: true }),
    );
    mockOptions.mockResolvedValue(
      ok({
        printers: [
          {
            key: "ender3",
            name: "Ender 3",
            materials: ["pla", "petg"],
            sliceable: true,
          },
        ],
      }),
    );
    mockConnectors.mockResolvedValue(
      ok({ connectors: [{ name: "mock" }], default: "mock" }),
    );
  });

  function mount(overrides: Partial<EngineLifecycleTargets> = {}) {
    const tab = createWorkspaceTab({ name: "main.scad" });
    const activeTabRef: { current: WorkspaceTab } = { current: tab };
    const renderCodeDirect = jest.fn();
    const commitTabRenderResult = jest.fn();
    const hideWelcomeScreen = jest.fn();
    const showWelcomeScreen = jest.fn();
    const setDraftText = jest.fn();
    const appendEngineTurn = jest.fn();

    const targets: EngineLifecycleTargets = {
      renderCodeDirect,
      activePreviewKind: "mesh",
      activePreviewSrc: "",
      renderTargetContent: RENDER_TARGET_CONTENT,
      renderTargetTab: tab,
      renderTargetRender: tab.render,
      renderTargetPath: tab.projectPath,
      projectRoot: null,
      commitTabRenderResult,
      hideWelcomeScreen,
      showWelcomeScreen,
      ready: true,
      previewSceneStyle: PREVIEW_SCENE_STYLE,
      showModelColors: false,
      activeTabRef,
      draftText: "",
      setDraftText,
      appendEngineTurn,
      ...overrides,
    };

    const harness = createHookHarness(() => useEngineLifecycle(targets));

    return {
      harness,
      // Exposed so a test can CHANGE an input after mount and re-render. Effects keyed on a
      // prop cannot be exercised otherwise: mounting with the final value means the dependency
      // never moves. (E2E-B needed this.)
      targets,
      tab,
      activeTabRef,
      renderCodeDirect,
      commitTabRenderResult,
      hideWelcomeScreen,
      showWelcomeScreen,
      setDraftText,
      appendEngineTurn,
    };
  }

  async function flush() {
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  const DESIGN_1 = {
    ok: true,
    gate: "Looks printable (95/100)",
    headline: "Dimensions match: 70.0 x 50.0 x 30.0 mm.",
    rid: 1,
    scad: RENDER_TARGET_CONTENT,
    result: { rid: 1, status: "completed" } as DesignResult,
  };

  it("printer/material/connector profiles load on mount from engine.options()/connectors()", async () => {
    const { harness } = mount();
    await flush();
    expect(harness.current().sliceProfileStatus).toBe("ready");
    expect(harness.current().printerKey).toBe("ender3");
    expect(harness.current().material).toBe("pla");
    expect(harness.current().connectorName).toBe("mock");
    harness.unmount();
  });

  it("falls back to an error status when engine.options() has no printers", async () => {
    mockOptions.mockResolvedValue(ok({ printers: [] }));
    const { harness } = mount();
    await flush();
    expect(harness.current().sliceProfileStatus).toBe("error");
    expect(harness.current().sliceProfileError).toMatch(
      /did not return any printer profiles/i,
    );
    harness.unmount();
  });

  it("handleEngineDescribe: a successful design commits the result and renders it", async () => {
    mockDescribeIntoStudio.mockResolvedValue(DESIGN_1);
    const { harness, renderCodeDirect } = mount();
    await flush();

    await act(async () => {
      await harness
        .current()
        .handleEngineDescribe("a snap box", { skipVisualLoop: true });
    });

    expect(mockDescribeIntoStudio).toHaveBeenCalledWith("a snap box", []);
    expect(renderCodeDirect).toHaveBeenCalledWith(RENDER_TARGET_CONTENT);
    expect(harness.current().hasEngineDesign).toBe(true);
    expect(harness.current().lastEngineRidRef.current).toBe(1);
    expect(harness.current().currentDesignHeadline).toBe(DESIGN_1.headline);
    harness.unmount();
  });

  // E2E-C: a local-engine describe/refine must be recorded on the AI panel's message surface — the
  // user's words AND the engine's plain-English outcome — so the local-first path isn't a blank panel.
  it("handleEngineDescribe: records the turn on the AI message surface (E2E-C)", async () => {
    mockDescribeIntoStudio.mockResolvedValue(DESIGN_1);
    const { harness, appendEngineTurn } = mount();
    await flush();

    await act(async () => {
      await harness
        .current()
        .handleEngineDescribe("a snap box", { skipVisualLoop: true });
    });

    expect(appendEngineTurn).toHaveBeenCalledTimes(1);
    const [userText, assistantText] = appendEngineTurn.mock.calls[0];
    expect(userText).toBe("a snap box");
    // the engine's own words reach the panel — headline + gate, not a raw status enum
    expect(assistantText).toContain(DESIGN_1.headline);
    expect(assistantText).toContain(DESIGN_1.gate);
    harness.unmount();
  });

  it("handleEngineDescribe: a failed design (gate_failed) leaves no design committed", async () => {
    mockDescribeIntoStudio.mockResolvedValue({
      ok: false,
      gate: "gate_failed: walls too thin",
    });
    const { harness, renderCodeDirect } = mount();
    await flush();

    await act(async () => {
      await harness
        .current()
        .handleEngineDescribe("an impossible part", { skipVisualLoop: true });
    });

    expect(renderCodeDirect).not.toHaveBeenCalled();
    expect(harness.current().hasEngineDesign).toBe(false);
    expect(harness.current().lastEngineRidRef.current).toBeNull();
    harness.unmount();
  });

  // E2E-D: a gate-failed design that DOES have a mesh is shown read-only — its SCAD renders (so it's
  // visible and Export works) — but it must NOT become sliceable: hasEngineDesign stays false (Make it
  // real / Save buttons disabled) and lastEngineRidRef stays null (handleMakeItReal's imperative guard).
  it("handleEngineDescribe: a gate-failed design WITH a mesh renders read-only but stays non-sliceable (E2E-D)", async () => {
    mockDescribeIntoStudio.mockResolvedValue({
      ok: false,
      showable: true,
      gate: "gate_failed: walls 0.6mm below the 0.8mm minimum",
      headline: "Walls too thin",
      rid: 8,
      scad: "thin_box();",
      result: { rid: 8, status: "gate_failed" } as DesignResult,
    });
    const { harness, renderCodeDirect } = mount();
    await flush();

    await act(async () => {
      await harness
        .current()
        .handleEngineDescribe("a thin-walled box", { skipVisualLoop: true });
    });

    expect(renderCodeDirect).toHaveBeenCalledWith("thin_box();"); // it IS shown + downloadable
    expect(harness.current().hasEngineDesign).toBe(false); // ...but NOT sliceable (button gate)
    expect(harness.current().lastEngineRidRef.current).toBeNull(); // ...and NOT sliceable (handler gate)
    harness.unmount();
  });

  // WALK-1 (Blocker, gate 2026-07-19): the engine's clarifying question rode home in
  // DesignResult.clarification and the hook dropped the whole failed result on the floor, so the
  // Intent panel had nothing to render. The question must reach currentDesignResult.
  it("handleEngineDescribe: a clarification_needed result publishes the engine question", async () => {
    mockDescribeIntoStudio.mockResolvedValue({
      ok: false,
      gate: "How tall should it be, in mm?",
      result: {
        rid: 9,
        status: "clarification_needed",
        clarification: "How tall should it be, in mm?",
      } as DesignResult,
    });
    const { harness } = mount();
    await flush();

    await act(async () => {
      await harness
        .current()
        .handleEngineDescribe("a bracket", { skipVisualLoop: true });
    });

    expect(harness.current().currentDesignResult?.clarification).toBe(
      "How tall should it be, in mm?",
    );
    expect(harness.current().hasEngineDesign).toBe(false);
    harness.unmount();
  });

  it("handleEngineDescribe: a clarification keeps the previously understood plan visible", async () => {
    mockDescribeIntoStudio.mockResolvedValue({
      ...DESIGN_1,
      result: {
        rid: 1,
        status: "completed",
        plan: { object_type: "Bracket", summary: "A flat bracket." },
      } as DesignResult,
    });
    const { harness } = mount();
    await flush();
    await act(async () => {
      await harness
        .current()
        .handleEngineDescribe("a bracket", { skipVisualLoop: true });
    });
    expect(harness.current().currentDesignResult?.plan?.object_type).toBe(
      "Bracket",
    );

    mockDescribeIntoStudio.mockResolvedValue({
      ok: false,
      gate: "What bore diameter?",
      result: {
        rid: 2,
        status: "clarification_needed",
        clarification: "What bore diameter?",
      } as DesignResult,
    });
    await act(async () => {
      await harness.current().handleEngineDescribe("add a hole", {
        refine: true,
        skipVisualLoop: true,
      });
    });

    expect(harness.current().currentDesignResult?.clarification).toBe(
      "What bore diameter?",
    );
    expect(harness.current().currentDesignResult?.plan?.object_type).toBe(
      "Bracket",
    );
    harness.unmount();
  });

  it("handleEngineDescribe: a non-clarification failure does not disturb the last design result", async () => {
    mockDescribeIntoStudio.mockResolvedValue({
      ...DESIGN_1,
      result: {
        rid: 1,
        status: "completed",
        plan: { object_type: "Coaster" },
      } as DesignResult,
    });
    const { harness } = mount();
    await flush();
    await act(async () => {
      await harness
        .current()
        .handleEngineDescribe("a coaster", { skipVisualLoop: true });
    });

    mockDescribeIntoStudio.mockResolvedValue({
      ok: false,
      gate: "That design didn't pass the printability check.",
      result: { rid: 3, status: "gate_failed" } as DesignResult,
    });
    await act(async () => {
      await harness.current().handleEngineDescribe("thinner", {
        refine: true,
        skipVisualLoop: true,
      });
    });

    expect(harness.current().currentDesignResult?.plan?.object_type).toBe(
      "Coaster",
    );
    expect(
      harness.current().currentDesignResult?.clarification ?? null,
    ).toBeNull();
    harness.unmount();
  });

  it("handleAiPanelSubmit: trims the draft, clears it, and forwards it as a refine turn", async () => {
    mockDescribeIntoStudio.mockResolvedValue(DESIGN_1);
    const { harness, setDraftText } = mount({
      draftText: "  make it taller  ",
    });
    await flush();

    await act(async () => {
      harness.current().handleAiPanelSubmit();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(setDraftText).toHaveBeenCalledWith("");
    expect(mockDescribeIntoStudio).toHaveBeenCalledWith("make it taller", []);
    harness.unmount();
  });

  it("handleAiPanelSubmit: ignores an empty (whitespace-only) draft", async () => {
    const { harness, setDraftText } = mount({ draftText: "   " });
    await flush();

    act(() => {
      harness.current().handleAiPanelSubmit();
    });

    expect(setDraftText).not.toHaveBeenCalled();
    expect(mockDescribeIntoStudio).not.toHaveBeenCalled();
    harness.unmount();
  });

  it("handleMakeItReal: does nothing without a described part yet", async () => {
    const { harness } = mount();
    await flush();
    let result: unknown;
    await act(async () => {
      result = await harness.current().handleMakeItReal();
    });
    expect(result).toBeNull();
    expect(mockSlice).not.toHaveBeenCalled();
    harness.unmount();
  });

  it("handleMakeItReal: slices with the selected printer/material once a design + profile exist", async () => {
    mockDescribeIntoStudio.mockResolvedValue(DESIGN_1);
    mockSlice.mockResolvedValue(
      ok({ sliced: true, estimate: "2h 30m", printer: "Ender 3" }),
    );
    const { harness } = mount();
    await flush(); // printer profile ready
    await act(async () => {
      await harness
        .current()
        .handleEngineDescribe("a snap box", { skipVisualLoop: true });
    });

    await act(async () => {
      await harness.current().handleMakeItReal();
    });

    expect(mockSlice).toHaveBeenCalledWith(1, "ender3", "pla");
    expect(harness.current().lastSlicedRid).toBe(1);
    expect(localStorage.getItem("tq-printed-real")).toBe("1");
    harness.unmount();
  });

  it("handleManualOrient: does nothing without a described part yet", async () => {
    const { harness } = mount();
    await flush();
    await act(async () => {
      await harness.current().handleManualOrient("x", 90);
    });
    expect(mockOrient).not.toHaveBeenCalled();
    harness.unmount();
  });

  it("handleManualOrient: publishes the oriented mesh as the new render, then clears isOrienting", async () => {
    mockDescribeIntoStudio.mockResolvedValue(DESIGN_1);
    mockOrient.mockResolvedValue(ok({ mesh_url: "/api/mesh/1?v=2" }));
    const { harness, commitTabRenderResult } = mount();
    await flush();
    await act(async () => {
      await harness
        .current()
        .handleEngineDescribe("a snap box", { skipVisualLoop: true });
    });

    await act(async () => {
      await harness.current().handleManualOrient("z", -90);
    });

    expect(mockOrient).toHaveBeenCalledWith(1, "z", -90);
    expect(commitTabRenderResult).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        previewSrc: "/api/mesh/1?v=2",
        previewKind: "mesh",
      }),
    );
    expect(harness.current().isOrienting).toBe(false);
    expect(harness.current().lastSlicedRid).toBeNull();
    harness.unmount();
  });

  it("handleSendToPrinter: refuses to send a design that has not been sliced", async () => {
    mockDescribeIntoStudio.mockResolvedValue(DESIGN_1);
    const { harness } = mount();
    await flush();
    await act(async () => {
      await harness
        .current()
        .handleEngineDescribe("a snap box", { skipVisualLoop: true });
    });

    await act(async () => {
      await harness.current().handleSendToPrinter();
    });

    expect(mockSend).not.toHaveBeenCalled();
    harness.unmount();
  });

  it("handleSendToPrinter + handlePrintOutcome: sends the sliced rid then records the outcome", async () => {
    mockDescribeIntoStudio.mockResolvedValue(DESIGN_1);
    mockSlice.mockResolvedValue(ok({ sliced: true, estimate: "1h" }));
    mockSend.mockResolvedValue(
      ok({ sent: true, simulated: true, job_id: "job-1" }),
    );
    mockOutcome.mockResolvedValue(ok({ recorded: true }));
    const { harness } = mount();
    await flush();
    await act(async () => {
      await harness
        .current()
        .handleEngineDescribe("a snap box", { skipVisualLoop: true });
    });
    await act(async () => {
      await harness.current().handleMakeItReal();
    });

    await act(async () => {
      await harness.current().handleSendToPrinter();
    });
    expect(mockSend).toHaveBeenCalledWith(1, "mock");
    expect(harness.current().printOutcome).toEqual({ rid: 1, simulated: true });

    await act(async () => {
      await harness.current().handlePrintOutcome("clean");
    });
    expect(mockOutcome).toHaveBeenCalledWith(1, "clean");
    expect(harness.current().printOutcome).toBeNull();
    harness.unmount();
  });

  it("handleUndoEngine: reverts to the design that preceded the latest describe", async () => {
    mockDescribeIntoStudio.mockResolvedValueOnce(DESIGN_1);
    const { harness, renderCodeDirect } = mount();
    await flush();
    await act(async () => {
      await harness
        .current()
        .handleEngineDescribe("first part", { skipVisualLoop: true });
    });

    mockDescribeIntoStudio.mockResolvedValueOnce({
      ok: true,
      gate: "Looks printable (80/100)",
      rid: 2,
      scad: "cube([10,10,10]);",
      result: { rid: 2, status: "completed" } as DesignResult,
    });
    await act(async () => {
      await harness.current().handleEngineDescribe("a bigger part", {
        refine: true,
        skipVisualLoop: true,
      });
    });
    expect(harness.current().lastEngineRidRef.current).toBe(2);
    expect(harness.current().engineUndoStack.length).toBe(1);

    renderCodeDirect.mockClear();
    act(() => {
      harness.current().handleUndoEngine();
    });

    expect(renderCodeDirect).toHaveBeenCalledWith(RENDER_TARGET_CONTENT);
    expect(harness.current().lastEngineRidRef.current).toBe(1);
    expect(harness.current().engineUndoStack.length).toBe(0);
    harness.unmount();
  });

  it("handleReverseImportCad: refuses to start when the engine is not ready", async () => {
    const { harness } = mount({ ready: false });
    await flush();

    act(() => {
      harness.current().handleReverseImportCad();
    });

    expect(harness.current().reverseImportStatus.state).toBe("error");
    expect(mockReverseImportIntoStudio).not.toHaveBeenCalled();
    harness.unmount();
  });

  it("a debounced live tune publishes the NEW dimensions, not the original ones (E2E-B)", async () => {
    // The live-tune effect used to call setLiveReadiness ONLY. Everything that shows a
    // dimension — the Intent panel, the Properties panel, explain-design-summary — reads
    // currentDesignResult/currentDesignHeadline, so after a tune they all kept displaying the
    // ORIGINAL size while the part that would slice was the tuned one. Confident, specific,
    // wrong numbers for the object about to be printed, and it survived into the slice.
    //
    // Nothing caught it because mockPureTuneValues returns null by default, so this effect never
    // ran in any existing test in this file.
    jest.useFakeTimers();
    try {
      mockDescribeIntoStudio.mockResolvedValue(DESIGN_1);
      const TUNED_CONTENT = `width = 120; // [10:1:170]
snap_box(width=width);
`;
      // The real sequence: describe FIRST (document = the engine's scad), then edit a slider so
      // renderTargetContent CHANGES. Mounting with the tuned text would fire the effect once at
      // mount, before any design existed, and never again — the dependency has to move.
      const { harness, targets } = mount();
      await act(async () => {
        await Promise.resolve();
      });

      await act(async () => {
        await harness
          .current()
          .handleEngineDescribe("a snap box", { skipVisualLoop: true });
      });
      expect(harness.current().currentDesignHeadline).toBe(DESIGN_1.headline);

      // Now the user drags a slider: the document becomes a pure Customizer tune.
      mockPureTuneValues.mockReturnValue(TUNED_CONTENT as never);
      targets.renderTargetContent = TUNED_CONTENT;
      await act(async () => {
        harness.rerender();
      });
      const TUNED_RESULT = {
        rid: 1,
        status: "completed",
        report: { headline: "Dimensions match: 120.0 x 50.0 x 30.0 mm." },
      } as unknown as DesignResult;
      mockRender.mockResolvedValue(ok(TUNED_RESULT));

      await act(async () => {
        jest.advanceTimersByTime(800); // past the 700ms debounce
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });

      // The load-bearing assertion: what the user is shown matches what the engine just built.
      expect(harness.current().currentDesignHeadline).toBe(
        "Dimensions match: 120.0 x 50.0 x 30.0 mm.",
      );
      expect(harness.current().currentDesignResult).toBe(TUNED_RESULT);
      harness.unmount();
    } finally {
      jest.useRealTimers();
      mockPureTuneValues.mockReturnValue(null as never);
    }
  });
});
