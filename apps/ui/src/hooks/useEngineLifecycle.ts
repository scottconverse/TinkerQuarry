import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  type MutableRefObject,
} from "react";
import {
  describeIntoStudio,
  reopenIntoStudio,
  reverseImportIntoStudio,
  setEngineDocument,
  pureTuneValues,
  type EngineTurn,
  type EngineDocOutcome,
} from "../services/engineDocument";
import {
  engine,
  type ConnectorInfo,
  type DesignResult,
  type ModelStatusResult,
  type VisualReviewResult,
} from "../services/engineClient";
import { engineGateSummary } from "../services/engineDesign";
import { getDockviewApi } from "../stores/layoutStore";
import {
  createSourceHash,
  getRenderArtifactState,
} from "../stores/renderArtifactStore";
import type {
  WorkspaceTab,
  TabRenderState,
  WorkspaceStoreActions,
  WorkspaceRenderKind,
} from "../stores/workspaceTypes";
import type { PreviewSceneStyle } from "../services/previewSceneConfig";
import {
  captureCurrentPreview,
  captureVisualReviewImages,
  MAIN_PREVIEW_VIEWER_ID,
} from "../utils/capturePreview";
import {
  MAX_VISUAL_CORRECTION_ROUNDS,
  canApplyVisualCorrection,
  visualCorrectionApplyingSummary,
} from "../utils/visualCorrection";
import {
  analyzePreviewDifference,
  estimatePreviewDifferencePercent,
  formatVisualDifference,
  type VisualDiffAnalysis,
} from "../utils/visualDiff";
import { notifyError, notifySuccess } from "../utils/notifications";

/**
 * The "Make it real" engine-lifecycle cluster, extracted whole from App.tsx (v1.5 App.tsx
 * extraction, phase 1d): describe/refine into the local engine, the autonomous visual
 * correction loop, slice ("Make it real"), manual orient, send-to-printer + outcome
 * recording, save/reopen/undo/restore/branch of designs, the iteration log, and the
 * printer/material/connector profile-loading effects. Behavior is verbatim, including the
 * pre-existing asymmetry between commitEngineOutcome's dependency array and its
 * currentDesignResult read (not fixed in this refactor). The hook owns its own local state
 * (useState/useRef) for this cluster; the render pipeline, active tab/workspace, settings,
 * and AI-draft plumbing it reads/writes are still owned by App.tsx and threaded in via
 * `targets`, mirroring usePersistenceOperations (phase 1c).
 */
export function formatLayerHeight(mm: unknown): string {
  if (typeof mm !== "number" || !Number.isFinite(mm) || mm <= 0) return "";
  return `${mm.toFixed(2).replace(/\.?0+$/, "")} mm layers`;
}

export function readinessScore(text: string | null | undefined): number {
  if (!text) return 0;
  const score = text.match(/\((\d{1,3})\/100\)/)?.[1];
  if (score) return Number(score);
  const lower = text.toLowerCase();
  if (lower.includes("fail")) return 0;
  if (lower.includes("warn")) return 50;
  if (lower.includes("pass") || lower.includes("printable")) return 75;
  return 25;
}

interface IterationLogEntry {
  id: string;
  createdAt: number;
  kind: "design" | "visual" | "orient" | "slice" | "send" | "outcome";
  title: string;
  detail?: string | null;
  rid?: number | null;
  scad?: string | null;
  gate?: string | null;
  stepUrl?: string | null;
  parentId?: string | null;
  branchId?: string | null;
  branchName?: string | null;
  visualDiff?: VisualDiffAnalysis | null;
}

interface VisualDiffEvidence {
  before: string;
  after: string;
  summary: string;
  analysis?: VisualDiffAnalysis | null;
}

const ITERATION_LOG_KEY = "tq-iteration-log";

export interface EngineLifecycleTargets {
  /** Render the given SCAD immediately (useRenderOrchestrator's renderCode, bound to the
   * render-target tab) — called fire-and-forget throughout this cluster. */
  renderCodeDirect: (code: string) => unknown;
  activePreviewKind: WorkspaceRenderKind;
  activePreviewSrc: string;
  renderTargetContent: string;
  renderTargetTab: WorkspaceTab | undefined;
  renderTargetRender: TabRenderState | undefined;
  renderTargetPath: string | null;
  projectRoot: string | null;
  commitTabRenderResult: WorkspaceStoreActions["commitTabRenderResult"];
  hideWelcomeScreen: () => void;
  showWelcomeScreen: () => void;
  ready: boolean;
  previewSceneStyle: PreviewSceneStyle;
  showModelColors: boolean;
  /** Current active tab, kept live by App.tsx — read as a manual-orient render-target
   * fallback, so the ref itself (not a snapshot) is handed in. */
  activeTabRef: MutableRefObject<WorkspaceTab>;
  draftText: string;
  setDraftText: (text: string) => void;
}

export function useEngineLifecycle({
  renderCodeDirect,
  activePreviewKind,
  activePreviewSrc,
  renderTargetContent,
  renderTargetTab,
  renderTargetRender,
  renderTargetPath,
  projectRoot,
  commitTabRenderResult,
  hideWelcomeScreen,
  showWelcomeScreen,
  ready,
  previewSceneStyle,
  showModelColors,
  activeTabRef,
  draftText,
  setDraftText,
}: EngineLifecycleTargets) {
  // TinkerQuarry Phase 4 (B core): describe → engine → Studio document, then render the engine's
  // (self-contained) SCAD directly so the viewer updates immediately (no content-watch timing). This
  // is the handler the shipping describe UI calls; also exposed on window in dev for verification.
  // The engine rid of the last successful design is held so "Make it real" (slice) can act on it.
  const lastEngineRidRef = useRef<number | null>(null);
  // The exact SCAD the engine last set as the document — to detect manual edits before slicing
  // (slicing acts on the engine's rid server-side, so post-edit code isn't reflected yet).
  const lastEngineScadRef = useRef<string | null>(null);
  // The current design's readiness string, mirrored as a ref so the undo stack can capture it without
  // a stale closure when a new design overwrites the current one.
  const lastGateRef = useRef<string | null>(null);
  const lastStepUrlRef = useRef<string | null>(null);
  // §6.3 undo: a session stack of prior engine designs. Each describe/refine/reopen pushes the design
  // it replaces, so the user can step back instantly instead of re-describing (a 60–90s round-trip).
  const [engineUndoStack, setEngineUndoStack] = useState<
    {
      scad: string;
      rid: number;
      gate: string | null;
      stepUrl: string | null;
      result: DesignResult | null;
    }[]
  >([]);
  // Whether an engine design exists yet — drives the "Make it real" button's enabled state.
  const [hasEngineDesign, setHasEngineDesign] = useState(false);
  // The current manufacturing readiness (verdict + score + warnings), kept live as the user tunes
  // Customizer sliders so they see printability BEFORE committing to "Make it real" (§6.6/§6.7).
  const [liveReadiness, setLiveReadiness] = useState<string | null>(null);
  const [currentDesignHeadline, setCurrentDesignHeadline] = useState<
    string | null
  >(null);
  const [currentDesignResult, setCurrentDesignResult] =
    useState<DesignResult | null>(null);
  const [currentStepUrl, setCurrentStepUrl] = useState<string | null>(null);
  const [reverseImportStatus, setReverseImportStatus] = useState<{
    state: "idle" | "running" | "error";
    filename?: string;
    message?: string;
  }>({ state: "idle" });
  const [visualReviewSummary, setVisualReviewSummary] = useState<string | null>(
    null,
  );
  const [visualDiffSummary, setVisualDiffSummary] = useState<string | null>(
    null,
  );
  const [visualCorrectionPrompt, setVisualCorrectionPrompt] = useState<
    string | null
  >(null);
  const [visualReviewResult, setVisualReviewResult] =
    useState<VisualReviewResult | null>(null);
  const [visualReviewImages, setVisualReviewImages] = useState<
    { label: string; image: string }[]
  >([]);
  const [visualReviewLog, setVisualReviewLog] = useState<string[]>([]);
  const [visualDiffEvidence, setVisualDiffEvidence] =
    useState<VisualDiffEvidence | null>(null);
  const [visualCorrectionRounds, setVisualCorrectionRounds] = useState(0);
  const [isApplyingVisualCorrection, setIsApplyingVisualCorrection] =
    useState(false);
  const [workspaceModelStatus, setWorkspaceModelStatus] =
    useState<ModelStatusResult | null>(null);
  const [iterationLog, setIterationLog] = useState<IterationLogEntry[]>(() => {
    try {
      const parsed = JSON.parse(
        localStorage.getItem(ITERATION_LOG_KEY) || "[]",
      );
      return Array.isArray(parsed) ? parsed.slice(0, 40) : [];
    } catch {
      return [];
    }
  });
  const [activeIterationBranch, setActiveIterationBranch] = useState<{
    id: string;
    name: string;
  }>({ id: "main", name: "Main" });
  const visualDiffBeforeRef = useRef<string | null>(null);
  const visualLoopRunRef = useRef(0);
  const appendIterationLog = useCallback(
    (entry: Omit<IterationLogEntry, "id" | "createdAt">) => {
      setIterationLog((items) => {
        const parent = items[0] ?? null;
        const next = [
          {
            ...entry,
            id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            createdAt: Date.now(),
            parentId: entry.parentId ?? parent?.id ?? null,
            branchId: entry.branchId ?? activeIterationBranch.id,
            branchName: entry.branchName ?? activeIterationBranch.name,
          },
          ...items,
        ].slice(0, 40);
        localStorage.setItem(ITERATION_LOG_KEY, JSON.stringify(next));
        return next;
      });
    },
    [activeIterationBranch],
  );
  const addVisualReviewLog = useCallback(
    (entry: string) => {
      setVisualReviewLog((items) => [entry, ...items].slice(0, 5));
      appendIterationLog({
        kind: "visual",
        title: "Visual correction loop",
        detail: entry,
        rid: lastEngineRidRef.current,
        scad: lastEngineScadRef.current,
        gate: lastGateRef.current,
        stepUrl: lastStepUrlRef.current,
      });
    },
    [appendIterationLog],
  );
  const commitEngineOutcome = useCallback(
    (
      result: EngineDocOutcome,
      opts: { pushUndo?: boolean; clearVisual?: boolean } = {},
    ) => {
      if (!result.ok || !result.scad) return;
      renderCodeDirect(result.scad);
      if (
        opts.pushUndo !== false &&
        lastEngineRidRef.current != null &&
        lastEngineScadRef.current
      ) {
        const prev = {
          scad: lastEngineScadRef.current,
          rid: lastEngineRidRef.current,
          gate: lastGateRef.current,
          stepUrl: lastStepUrlRef.current,
          result: currentDesignResult,
        };
        setEngineUndoStack((s) => [...s, prev]);
      }
      lastEngineRidRef.current = result.rid ?? null;
      lastEngineScadRef.current = result.scad ?? null;
      lastGateRef.current = result.gate || null;
      lastStepUrlRef.current = result.result?.step_url ?? null;
      setCurrentStepUrl(result.result?.step_url ?? null);
      setCurrentDesignHeadline(result.headline ?? null);
      setCurrentDesignResult(result.result ?? currentDesignResult);
      setHasEngineDesign(true);
      setLiveReadiness(result.gate || null);
      appendIterationLog({
        kind: "design",
        title: result.headline || "Design candidate",
        detail: result.gate,
        rid: result.rid ?? null,
        scad: result.scad,
        gate: result.gate ?? null,
        stepUrl: result.result?.step_url ?? null,
      });
      if (opts.clearVisual !== false) {
        setVisualReviewSummary(null);
        setVisualDiffSummary(null);
        setVisualDiffEvidence(null);
        setVisualCorrectionPrompt(null);
        setVisualReviewResult(null);
        setVisualReviewImages([]);
        setVisualReviewLog([]);
      }
      setLastSlicedRid(null);
    },
    [appendIterationLog, currentDesignResult, renderCodeDirect],
  );
  const readinessWithVisual = useMemo(
    () =>
      [liveReadiness, visualReviewSummary, visualDiffSummary]
        .filter(Boolean)
        .join("\n"),
    [liveReadiness, visualReviewSummary, visualDiffSummary],
  );
  useEffect(() => {
    let cancelled = false;
    void engine.modelStatus().then((r) => {
      if (!cancelled && r.ok) setWorkspaceModelStatus(r.data);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const visualLoopModeLabel = useMemo(() => {
    if (isApplyingVisualCorrection)
      return "VCL: installing correction into the loop";
    if (visualReviewSummary) return `VCL: ${visualReviewSummary}`;
    if (!hasEngineDesign) return "VCL: off until a design exists";
    if (!workspaceModelStatus) return "VCL: model status unknown";
    if (workspaceModelStatus.model_loading)
      return "VCL: vision model installing";
    if (workspaceModelStatus.backend === "cloud")
      return "VCL: cloud vision available by chooser";
    if (!workspaceModelStatus.running || !workspaceModelStatus.model_present) {
      return "VCL: text model missing or offline";
    }
    if (workspaceModelStatus.vision_present === false)
      return "VCL: vision model missing";
    return "VCL: local probe advisory, used by correction loop";
  }, [
    hasEngineDesign,
    isApplyingVisualCorrection,
    visualReviewSummary,
    workspaceModelStatus,
  ]);
  // Slice profile (§6.9): the printer + material "Make it real" will slice for, shown AND choosable
  // before slicing so the user gets G-code for THEIR machine, not just the engine default. The
  // printer list comes from /api/options; the choice persists across sessions (localStorage).
  const [enginePrinters, setEnginePrinters] = useState<
    {
      key: string;
      name: string;
      materials?: string[];
      layer_height_mm?: number | null;
      sliceable?: boolean;
      slice_note?: string | null;
    }[]
  >([]);
  const [printerKey, setPrinterKey] = useState<string>("");
  const [material, setMaterial] = useState<string>("");
  const [sliceProfileStatus, setSliceProfileStatus] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const [sliceProfileError, setSliceProfileError] = useState<string | null>(
    null,
  );
  const [isOrienting, setIsOrienting] = useState(false);
  const [engineConnectors, setEngineConnectors] = useState<ConnectorInfo[]>([]);
  const [connectorName, setConnectorName] = useState("");
  const [lastSlicedRid, setLastSlicedRid] = useState<number | null>(null);
  const [printOutcome, setPrintOutcome] = useState<{
    rid: number;
    simulated: boolean;
  } | null>(null);
  // First-real-print caution (§6.10): the manufacturing-commit moment is heightened the first time.
  const [showFirstRealDialog, setShowFirstRealDialog] = useState(false);
  // Accumulated turns so a follow-up describe REFINES in context ("make it taller"). The engine's
  // /api/design takes this as `history`. A fresh design (new part) resets it.
  const engineHistoryRef = useRef<EngineTurn[]>([]);
  const runVisualReview = useCallback(
    async (rid: number): Promise<VisualReviewResult | null> => {
      setVisualReviewSummary("Visual review: running");
      addVisualReviewLog("Visual review started");
      await new Promise((resolve) => window.setTimeout(resolve, 400));
      if (lastEngineRidRef.current !== rid) return null;
      const images = await captureVisualReviewImages({
        viewerId: MAIN_PREVIEW_VIEWER_ID,
        svgSourceUrl: activePreviewKind === "svg" ? activePreviewSrc : null,
        targetWidth: 640,
        targetHeight: 480,
      });
      if (lastEngineRidRef.current !== rid) return null;
      if (images.length === 0) {
        const summary =
          "Visual review: unavailable - no rendered view captured";
        setVisualReviewSummary(summary);
        addVisualReviewLog(summary);
        setVisualDiffSummary(null);
        setVisualDiffEvidence(null);
        visualDiffBeforeRef.current = null;
        setVisualCorrectionPrompt(null);
        setVisualReviewResult(null);
        setVisualReviewImages([]);
        return null;
      }
      setVisualReviewImages(images);
      const beforeDiffImage = visualDiffBeforeRef.current;
      if (beforeDiffImage) {
        visualDiffBeforeRef.current = null;
        const diffAnalysis = await analyzePreviewDifference(
          beforeDiffImage,
          images[0].image,
        );
        const diff =
          diffAnalysis?.changedPercent ??
          (await estimatePreviewDifferencePercent(
            beforeDiffImage,
            images[0].image,
          ));
        if (lastEngineRidRef.current !== rid) return null;
        const diffSummary =
          diffAnalysis?.structuralSummary ?? formatVisualDifference(diff);
        setVisualDiffSummary(diffSummary);
        setVisualDiffEvidence({
          before: beforeDiffImage,
          after: images[0].image,
          summary: diffSummary ?? "Visual diff: unavailable",
          analysis: diffAnalysis,
        });
        if (diffSummary) {
          addVisualReviewLog(diffSummary);
          appendIterationLog({
            kind: "visual",
            title: "Feature-level visual diff",
            detail: diffSummary,
            rid,
            scad: lastEngineScadRef.current,
            gate: lastGateRef.current,
            stepUrl: lastStepUrlRef.current,
            visualDiff: diffAnalysis,
          });
        }
      }
      const { data } = await engine.visualReview(rid, images);
      if (lastEngineRidRef.current !== rid) return null;
      setVisualReviewResult(data);
      const round = data.round_id ? ` round ${data.round_id}` : "";
      if (data.status === "issues") {
        const first =
          data.findings?.[0] ?? data.summary ?? "likely visual issue found";
        const summary = `Visual review${round}: likely issue - ${first}`;
        setVisualReviewSummary(summary);
        addVisualReviewLog(summary);
        setVisualCorrectionPrompt(data.correction_prompt ?? null);
        notifyError({
          operation: "visual review",
          capture: false,
          displayMessage: first,
          toastId: "engine-visual-review",
        });
        return data;
      }
      if (data.status === "ok") {
        const summary = `Visual review${round}: no obvious issues found`;
        setVisualReviewSummary(summary);
        addVisualReviewLog(summary);
        setVisualCorrectionPrompt(null);
        notifySuccess("Visual review complete", {
          toastId: "engine-visual-review",
          description: data.summary ?? "No obvious visual issues found.",
        });
        return data;
      }
      if (data.status === "needs_review") {
        const first =
          data.findings?.[0] ??
          data.summary ??
          "local visual critics disagreed";
        const summary = `Visual review${round}: needs review - ${first}`;
        setVisualReviewSummary(summary);
        addVisualReviewLog(summary);
        setVisualCorrectionPrompt(null);
        notifySuccess("Visual review needs review", {
          toastId: "engine-visual-review",
          description: first,
        });
        return data;
      }
      const summary = `Visual review: unavailable - ${data.summary || data.error || "not run"}`;
      setVisualReviewSummary(summary);
      addVisualReviewLog(summary);
      setVisualCorrectionPrompt(null);
      return data;
    },
    [
      activePreviewKind,
      activePreviewSrc,
      addVisualReviewLog,
      appendIterationLog,
    ],
  );
  const runAutonomousVisualLoop = useCallback(
    async (initial: EngineDocOutcome) => {
      if (!initial.ok || initial.rid == null || !initial.scad) return;
      if (initial.template) {
        const summary =
          "Visual review: skipped - deterministic part family, math-gated";
        setVisualReviewSummary(summary);
        addVisualReviewLog(summary);
        return;
      }

      const runId = ++visualLoopRunRef.current;
      let best = {
        rid: initial.rid,
        scad: initial.scad,
        gate: initial.gate,
        score: readinessScore(initial.gate),
      };
      let active = best;

      for (let round = 0; round < MAX_VISUAL_CORRECTION_ROUNDS; round += 1) {
        if (visualLoopRunRef.current !== runId) return;
        const review = await runVisualReview(active.rid);
        if (visualLoopRunRef.current !== runId) return;
        const prompt = review?.correction_prompt?.trim();
        if (review?.status !== "issues" || !prompt) {
          break;
        }

        const before = await captureCurrentPreview({
          viewerId: MAIN_PREVIEW_VIEWER_ID,
          svgSourceUrl: activePreviewKind === "svg" ? activePreviewSrc : null,
          targetWidth: 320,
          targetHeight: 240,
        });
        visualDiffBeforeRef.current = before;
        setIsApplyingVisualCorrection(true);
        const summary = visualCorrectionApplyingSummary(round);
        setVisualReviewSummary(summary);
        addVisualReviewLog(summary);

        try {
          const corrected = await describeIntoStudio(
            prompt,
            engineHistoryRef.current,
          );
          if (!corrected.ok || corrected.rid == null || !corrected.scad) {
            addVisualReviewLog(
              "Visual review: correction failed, keeping best candidate",
            );
            break;
          }

          engineHistoryRef.current = [
            ...engineHistoryRef.current,
            { role: "user", content: prompt },
            { role: "assistant", content: corrected.gate },
          ];
          commitEngineOutcome(corrected, {
            pushUndo: true,
            clearVisual: false,
          });
          setVisualCorrectionRounds((rounds) => rounds + 1);

          const candidate = {
            rid: corrected.rid,
            scad: corrected.scad,
            gate: corrected.gate,
            score: readinessScore(corrected.gate),
          };
          active = candidate;
          if (candidate.score >= best.score) {
            best = candidate;
            addVisualReviewLog(
              `Visual review: kept round ${round + 1} candidate (${candidate.score}/100)`,
            );
          } else {
            addVisualReviewLog(
              `Visual review: round ${round + 1} regressed; restored best candidate`,
            );
            commitEngineOutcome(
              {
                ok: true,
                rid: best.rid,
                scad: best.scad,
                gate: best.gate,
              },
              { pushUndo: false, clearVisual: false },
            );
            setVisualReviewSummary(
              "Visual review: restored best candidate after a regression",
            );
            break;
          }
        } finally {
          setIsApplyingVisualCorrection(false);
        }
      }
    },
    [
      activePreviewKind,
      activePreviewSrc,
      addVisualReviewLog,
      commitEngineOutcome,
      runVisualReview,
    ],
  );
  const handleEngineDescribe = useCallback(
    async (
      prompt: string,
      opts?: { refine?: boolean; skipVisualLoop?: boolean },
    ) => {
      visualLoopRunRef.current += 1;
      if (!opts?.refine) {
        engineHistoryRef.current = [];
        setVisualCorrectionRounds(0);
        setVisualReviewLog([]);
      }
      // The local engine plans + renders + gates — seconds, not instant. Show progress so the
      // describe surface doesn't look frozen; the result toast replaces this (same toastId).
      notifySuccess(opts?.refine ? "Refining…" : "Designing…", {
        toastId: "engine-design",
        description:
          "The engine is working on it — plan, geometry, readiness check.",
      });
      const result = await describeIntoStudio(prompt, engineHistoryRef.current);
      if (result.ok && result.scad) {
        commitEngineOutcome(result);
        engineHistoryRef.current = [
          ...engineHistoryRef.current,
          { role: "user", content: prompt },
          { role: "assistant", content: result.gate },
        ];
        // Surface the engine's pre-slice checks. Per PRD §6.7/§6.9, final "Ready to print" is EARNED
        // by a successful slice ("Make it real"), not claimed at design time — so soften the engine's
        // gate verdict here and point at the slice; the slice toast is where "Ready to print" appears.
        const preSlice = result.gate.replace(
          /ready to print/gi,
          "Looks printable",
        );
        // Lightweight Explain (§6.3): lead with the engine's plain-English "what I made" line — the
        // dimensional outcome (e.g. "Dimensions match: 70.0 × 50.0 × 30.0 mm.") — so the user can
        // confirm the engine understood the request and built it to size, then the readiness + CTA.
        const explain = result.headline ? `${result.headline} ` : "";
        notifySuccess("Design ready", {
          toastId: "engine-design",
          description: `${explain}${preSlice} · Make it real to slice`,
        });
        if (result.rid != null && !opts?.skipVisualLoop) {
          void runAutonomousVisualLoop(result);
        }
      } else {
        setVisualReviewSummary(null);
        setVisualDiffSummary(null);
        setVisualDiffEvidence(null);
        setVisualCorrectionPrompt(null);
        setVisualReviewResult(null);
        setVisualReviewImages([]);
        setVisualReviewLog([]);
        // WALK-1 (gate 2026-07-19): clarification_needed carries the engine's actual QUESTION in
        // `clarification`. Publish it onto the current design result so the Intent panel can show
        // it — a toast that scrolls away is not an answerable question. Merge rather than replace,
        // so a clarifying question about a refine doesn't wipe the plan the user is looking at.
        const clarification = result.result?.clarification?.trim() || null;
        if (clarification) {
          setCurrentDesignResult((prev) =>
            prev
              ? { ...prev, clarification }
              : (result.result ?? {
                  rid: -1,
                  status: "clarification_needed",
                  clarification,
                }),
          );
        }
        // gate_failed / clarification_needed / model_unavailable — show the engine's plain-English
        // reason; this is a designed outcome, not a crash, so don't capture it as an error.
        notifyError({
          operation: "engine design",
          capture: false,
          displayMessage:
            result.gate ||
            result.error ||
            "Couldn't produce a printable design.",
          toastId: "engine-design",
        });
      }
      return result;
    },
    [commitEngineOutcome, runAutonomousVisualLoop],
  );
  const handleApplyVisualCorrection = useCallback(async () => {
    const prompt = visualCorrectionPrompt?.trim() ?? "";
    if (
      !canApplyVisualCorrection(
        prompt,
        visualCorrectionRounds,
        isApplyingVisualCorrection,
      )
    )
      return;
    setVisualDiffSummary(null);
    setVisualDiffEvidence(null);
    visualDiffBeforeRef.current = await captureCurrentPreview({
      viewerId: MAIN_PREVIEW_VIEWER_ID,
      svgSourceUrl: activePreviewKind === "svg" ? activePreviewSrc : null,
      targetWidth: 320,
      targetHeight: 240,
    });
    setIsApplyingVisualCorrection(true);
    const summary = visualCorrectionApplyingSummary(visualCorrectionRounds);
    setVisualReviewSummary(summary);
    addVisualReviewLog(summary);
    try {
      const result = await handleEngineDescribe(prompt, {
        refine: true,
        skipVisualLoop: true,
      });
      if (result.ok) {
        setVisualCorrectionRounds((rounds) => rounds + 1);
      }
    } finally {
      setIsApplyingVisualCorrection(false);
    }
  }, [
    handleEngineDescribe,
    addVisualReviewLog,
    isApplyingVisualCorrection,
    activePreviewKind,
    activePreviewSrc,
    visualCorrectionPrompt,
    visualCorrectionRounds,
  ]);

  // "Make it real": slice the current engine design into printable G-code, surfacing the real print
  // estimate (time / layers / filament). This is the manufacturing payoff and where "Ready to print"
  // is genuinely earned — only a successful slice proves the part is printable (PRD §6.7/§6.9).
  const handleMakeItReal = useCallback(
    async (ridOverride?: number) => {
      const rid = ridOverride ?? lastEngineRidRef.current;
      if (rid == null) {
        notifyError({
          operation: "make it real",
          capture: false,
          displayMessage: "Describe a part first, then make it real.",
          toastId: "engine-slice",
        });
        return null;
      }
      if (sliceProfileStatus !== "ready" || !printerKey || !material) {
        const detail =
          sliceProfileStatus === "loading"
            ? "Printer and material profiles are still loading."
            : sliceProfileError ||
              "No printable printer/material profile is selected.";
        notifyError({
          operation: "make it real",
          capture: false,
          displayMessage: `${detail} Choose a slice profile before making G-code.`,
          toastId: "engine-slice",
        });
        setLastSlicedRid(null);
        return null;
      }
      // If the user TUNED a template's Customizer sliders, push the tuned values to the engine first so
      // the slice is of the TUNED part, not the original. A structural code edit is not a pure tune
      // (pureTuneValues returns null) and falls through to the stale-edit warning below — never sliced
      // as if it were a tune.
      const tuned = lastEngineScadRef.current
        ? pureTuneValues(renderTargetContent, lastEngineScadRef.current)
        : null;
      if (tuned) {
        notifySuccess("Applying changes…", {
          toastId: "engine-slice",
          description: "Re-rendering at your tuned values",
        });
        const r = await engine.render(rid, tuned);
        if (r.ok && r.data.status === "completed") {
          lastEngineScadRef.current = renderTargetContent; // the engine now matches the tuned document
          setCurrentDesignResult(r.data);
          setCurrentDesignHeadline(r.data.report?.headline ?? null);
          setLiveReadiness(engineGateSummary(r.data));
        }
      }
      notifySuccess("Slicing…", {
        toastId: "engine-slice",
        description: "Preparing printable G-code",
      });
      const edited =
        lastEngineScadRef.current != null &&
        renderTargetContent.trim() !== lastEngineScadRef.current.trim();
      if (edited) {
        notifyError({
          operation: "make it real",
          capture: false,
          displayMessage:
            "Your code edits are not in the engine geometry yet. Re-render or re-describe before slicing.",
          toastId: "engine-slice",
        });
        setLastSlicedRid(null);
        return null;
      }
      const { ok, data } = await engine.slice(rid, printerKey, material);
      if (ok && data.sliced) {
        const layerHeight = formatLayerHeight(
          data.estimate_detail?.layer_height_mm,
        );
        if (layerHeight) {
          data.estimate = [data.estimate ?? "", layerHeight]
            .filter(Boolean)
            .join(" - ");
        }
        notifySuccess("Ready to print", {
          toastId: "engine-slice",
          description:
            `${data.estimate ?? ""}${data.printer ? ` · ${data.printer}` : ""}`.trim(),
        });
        // The payoff: hand the user the printable G-code (the engine serves it as a download). Triggered
        // by their explicit "Make it real" click — the expected output, like Export gives an STL.
        if (data.gcode_url) {
          const a = document.createElement("a");
          a.href = data.gcode_url;
          a.download = data.gcode_filename ?? "part.gcode.3mf";
          document.body.appendChild(a);
          a.click();
          a.remove();
        }
        setLastSlicedRid(rid);
        appendIterationLog({
          kind: "slice",
          title: "Ready to print",
          detail:
            `${data.estimate ?? ""}${data.printer ? ` - ${data.printer}` : ""}`.trim(),
          rid,
          scad: lastEngineScadRef.current,
          gate: lastGateRef.current,
          stepUrl: lastStepUrlRef.current,
        });
        localStorage.setItem("tq-printed-real", "1");
      } else {
        setLastSlicedRid(null);
        notifyError({
          operation: "make it real",
          capture: false,
          displayMessage:
            data.error ||
            "Slicing failed — the part may not be print-ready yet.",
          toastId: "engine-slice",
        });
      }
      return data;
    },
    [
      material,
      printerKey,
      renderTargetContent,
      sliceProfileError,
      sliceProfileStatus,
      appendIterationLog,
    ],
  );

  const handleManualOrient = useCallback(
    async (axis: "x" | "y" | "z", degrees: -90 | 90) => {
      const rid = lastEngineRidRef.current;
      if (rid == null) {
        notifyError({
          operation: "orient part",
          capture: false,
          displayMessage: "Describe a part first, then orient it.",
          toastId: "engine-orient",
        });
        return;
      }
      setIsOrienting(true);
      notifySuccess("Orienting…", {
        toastId: "engine-orient",
        description: `Rotating ${axis.toUpperCase()} ${degrees > 0 ? "+90" : "-90"}`,
      });
      try {
        const { ok, data } = await engine.orient(rid, axis, degrees);
        if (!ok || !data.mesh_url) {
          notifyError({
            operation: "orient part",
            capture: false,
            displayMessage: data.error || "Could not orient the part.",
            toastId: "engine-orient",
          });
          return;
        }
        const targetTab = renderTargetTab ?? activeTabRef.current;
        const requestId = Date.now();
        const diagnostics = renderTargetRender?.diagnostics ?? [];
        commitTabRenderResult(targetTab.id, {
          requestId,
          previewSrc: data.mesh_url,
          previewKind: "mesh",
          diagnostics,
          dimensionMode: "3d",
          lastRenderedContent: renderTargetContent,
        });
        if (renderTargetPath) {
          getRenderArtifactState().publishSettledArtifact({
            requestId,
            renderTargetPath,
            workspaceRoot: projectRoot,
            sourceHash: createSourceHash(renderTargetContent),
            previewKind: "mesh",
            previewSrc: data.mesh_url,
            diagnostics,
            error: "",
            dimensionMode: "3d",
            sceneStyle: previewSceneStyle,
            useModelColors: showModelColors,
            createdAt: Date.now(),
          });
        }
        notifySuccess("Orientation updated", {
          toastId: "engine-orient",
          description:
            "Cached slices were cleared; Make it real will use this pose.",
        });
        appendIterationLog({
          kind: "orient",
          title: "Manual orientation",
          detail: `Rotated ${axis.toUpperCase()} ${degrees > 0 ? "+90" : "-90"}`,
          rid,
          scad: lastEngineScadRef.current,
          gate: lastGateRef.current,
          stepUrl: lastStepUrlRef.current,
        });
        setLastSlicedRid(null);
        setVisualReviewSummary(null);
        setVisualDiffSummary(null);
        setVisualDiffEvidence(null);
        setVisualCorrectionPrompt(null);
        setVisualReviewLog([]);
      } finally {
        setIsOrienting(false);
      }
    },
    [
      activeTabRef,
      commitTabRenderResult,
      projectRoot,
      renderTargetContent,
      renderTargetPath,
      renderTargetRender?.diagnostics,
      renderTargetTab,
      previewSceneStyle,
      showModelColors,
      appendIterationLog,
    ],
  );

  const handleSendToPrinter = useCallback(async () => {
    const rid = lastEngineRidRef.current;
    if (rid == null || lastSlicedRid !== rid) {
      notifyError({
        operation: "send to printer",
        capture: false,
        displayMessage: "Make it real first, then send the proven G-code.",
        toastId: "engine-send",
      });
      return;
    }
    if (!connectorName) {
      notifyError({
        operation: "send to printer",
        capture: false,
        displayMessage: "Choose a printer connection first.",
        toastId: "engine-send",
      });
      return;
    }
    notifySuccess("Sending…", {
      toastId: "engine-send",
      description: connectorName,
    });
    const { ok, data } = await engine.send(rid, connectorName);
    if (ok && data.sent) {
      notifySuccess(
        data.simulated ? "Simulated send complete" : "Sent to printer",
        {
          toastId: "engine-send",
          description: data.job_id ? `Job ${data.job_id}` : data.printer_state,
        },
      );
      appendIterationLog({
        kind: "send",
        title: data.simulated ? "Simulated send complete" : "Sent to printer",
        detail: data.job_id ? `Job ${data.job_id}` : data.printer_state,
        rid,
        scad: lastEngineScadRef.current,
        gate: lastGateRef.current,
        stepUrl: lastStepUrlRef.current,
      });
      setPrintOutcome({ rid, simulated: Boolean(data.simulated) });
      return;
    }
    notifyError({
      operation: "send to printer",
      capture: false,
      displayMessage: data.note || data.error || "Could not send this print.",
      toastId: "engine-send",
    });
  }, [connectorName, lastSlicedRid, appendIterationLog]);

  const handlePrintOutcome = useCallback(
    async (outcome: "clean" | "issues" | "failed" | "skip") => {
      const currentOutcome = printOutcome;
      if (currentOutcome == null) return;
      const { rid, simulated: simulatedOutcome } = currentOutcome;
      const { ok, data } = await engine.outcome(rid, outcome);
      if (ok && (data as { recorded?: boolean }).recorded !== false) {
        appendIterationLog({
          kind: "outcome",
          title: "Print outcome recorded",
          detail: outcome,
          rid,
          scad: lastEngineScadRef.current,
          gate: lastGateRef.current,
          stepUrl: lastStepUrlRef.current,
        });
        notifySuccess(
          simulatedOutcome
            ? "Simulated outcome recorded"
            : "Print outcome recorded",
          { toastId: "engine-outcome" },
        );
      } else if (outcome !== "skip") {
        notifyError({
          operation: "record print outcome",
          capture: false,
          displayMessage:
            (data as { error?: string }).error ||
            "Could not record the print outcome.",
          toastId: "engine-outcome",
        });
      }
      setPrintOutcome(null);
    },
    [printOutcome, appendIterationLog],
  );

  // Save the current engine design to "My Designs" (§6.12). Empty name → the engine auto-names it by
  // the original prompt (QA-004), so no dialog is needed.
  const handleSaveDesign = useCallback(async () => {
    const rid = lastEngineRidRef.current;
    if (rid == null) {
      notifyError({
        operation: "save design",
        capture: false,
        displayMessage: "Describe a part first, then save it.",
        toastId: "engine-save",
      });
      return;
    }
    const { ok, data } = await engine.saveDesign(rid, "");
    if (ok && data.saved) {
      notifySuccess("Saved to My Designs", {
        toastId: "engine-save",
        description: data.name,
      });
    } else {
      notifyError({
        operation: "save design",
        capture: false,
        displayMessage: "Could not save right now — your work is still here.",
        toastId: "engine-save",
      });
    }
  }, []);

  // Reopen a saved design (§6.12): pull it back into the workspace as the active document, the same
  // end state as a fresh describe (viewer renders it, Customizer sliders work). Used by the
  // WelcomeScreen "My Designs" surface.
  const handleReverseImportCad = useCallback(() => {
    // Gate 2026-07-09 (UX-5): three surfaces call this (toolbar + empty-state panels); only
    // the toolbar button was disabled while an import ran. Guard re-entry HERE so no entry
    // point can start overlapping imports.
    if (reverseImportStatus.state === "running") {
      return;
    }
    if (!ready) {
      const message = "Start the local engine before importing CAD.";
      setReverseImportStatus({ state: "error", message });
      notifyError({
        operation: "Import CAD",
        capture: false,
        displayMessage: message,
        toastId: "reverse-import-engine",
      });
      return;
    }
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".stl,.3mf,.obj";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      void (async () => {
        setReverseImportStatus({ state: "running", filename: file.name });
        try {
          notifySuccess("Importing CAD...", {
            toastId: "reverse-import-started",
          });
          const bytes = new Uint8Array(await file.arrayBuffer());
          const result = await reverseImportIntoStudio(bytes, file.name);
          if (!result.ok) {
            const message =
              result.error ?? result.gate ?? "Could not import that mesh file.";
            setReverseImportStatus({
              state: "error",
              filename: file.name,
              message,
            });
            notifyError({
              operation: "Reverse import failed",
              error: message,
            });
            return;
          }
          commitEngineOutcome(result);
          hideWelcomeScreen();
          setReverseImportStatus({ state: "idle" });
          notifySuccess("Imported as an editable trusted-template design", {
            toastId: "reverse-import-ready",
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          setReverseImportStatus({
            state: "error",
            filename: file.name,
            message,
          });
          notifyError({ operation: "Reverse import failed", error });
        }
      })();
    };
    input.click();
  }, [
    commitEngineOutcome,
    hideWelcomeScreen,
    ready,
    reverseImportStatus.state,
  ]);

  const handleReopenDesign = useCallback(
    async (id: string) => {
      const result = await reopenIntoStudio(id);
      if (result.ok && result.scad) {
        hideWelcomeScreen();
        commitEngineOutcome(result);
        engineHistoryRef.current = [];
        notifySuccess("Reopened", {
          toastId: "engine-design",
          description: result.gate,
        });
        if (result.rid != null) {
          void runAutonomousVisualLoop(result);
        }
      } else {
        notifyError({
          operation: "reopen design",
          capture: false,
          displayMessage: result.error || "Could not reopen that design.",
          toastId: "engine-design",
        });
      }
    },
    [hideWelcomeScreen, commitEngineOutcome, runAutonomousVisualLoop],
  );

  // §6.3 undo: step back to the design that preceded the latest describe/refine/reopen. Restores the
  // document (so the viewer + editor + Customizer reflect it) and the engine rid (so "Make it real"
  // slices it), without a fresh engine round-trip.
  const handleUndoEngine = useCallback(() => {
    if (!engineUndoStack.length) return;
    const prev = engineUndoStack[engineUndoStack.length - 1];
    setEngineDocument(prev.scad);
    renderCodeDirect(prev.scad);
    lastEngineScadRef.current = prev.scad;
    lastEngineRidRef.current = prev.rid;
    lastGateRef.current = prev.gate;
    lastStepUrlRef.current = prev.stepUrl;
    setCurrentStepUrl(prev.stepUrl);
    setCurrentDesignResult(prev.result);
    setLiveReadiness(prev.gate);
    setVisualReviewSummary(null);
    setVisualDiffSummary(null);
    setVisualCorrectionPrompt(null);
    setVisualReviewResult(null);
    setVisualReviewImages([]);
    setVisualDiffEvidence(null);
    setVisualReviewLog([]);
    setHasEngineDesign(true);
    setLastSlicedRid(null);
    setEngineUndoStack((s) => s.slice(0, -1));
    notifySuccess("Reverted to the previous design", {
      toastId: "engine-design",
    });
  }, [engineUndoStack, renderCodeDirect]);

  const handleRestoreIteration = useCallback(
    (entry: IterationLogEntry) => {
      if (!entry.scad) return;
      setEngineDocument(entry.scad);
      renderCodeDirect(entry.scad);
      lastEngineScadRef.current = entry.scad;
      lastEngineRidRef.current = null;
      setCurrentDesignResult(null);
      lastGateRef.current = entry.gate ?? null;
      lastStepUrlRef.current = null;
      setCurrentStepUrl(null);
      setLiveReadiness(entry.gate ?? null);
      setVisualReviewSummary(null);
      setVisualDiffSummary(null);
      setVisualCorrectionPrompt(null);
      setVisualReviewLog([]);
      setHasEngineDesign(false);
      setLastSlicedRid(null);
      notifySuccess("Restored iteration", {
        toastId: "engine-design",
        description: `${entry.title} - re-render before Make it real`,
      });
    },
    [renderCodeDirect],
  );

  const handleBranchIteration = useCallback(
    (entry: IterationLogEntry) => {
      if (!entry.scad) return;
      const branch = {
        id: `branch-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name: `Branch from ${entry.title.slice(0, 24)}`,
      };
      setActiveIterationBranch(branch);
      setEngineDocument(entry.scad);
      renderCodeDirect(entry.scad);
      lastEngineScadRef.current = entry.scad;
      lastEngineRidRef.current = null;
      lastGateRef.current = entry.gate ?? null;
      lastStepUrlRef.current = null;
      setCurrentStepUrl(null);
      setLiveReadiness(entry.gate ?? null);
      setVisualReviewSummary(null);
      setVisualDiffSummary(null);
      setVisualCorrectionPrompt(null);
      setVisualReviewLog([]);
      setHasEngineDesign(false);
      setLastSlicedRid(null);
      appendIterationLog({
        kind: "design",
        title: `Branched: ${entry.title}`,
        detail:
          "Snapshot restored into a new branch; re-render before Make it real.",
        scad: entry.scad,
        gate: entry.gate ?? null,
        parentId: entry.id,
        branchId: branch.id,
        branchName: branch.name,
      });
      notifySuccess("Created design branch", {
        toastId: "engine-design",
        description: "Re-render this branch before slicing or sending.",
      });
    },
    [appendIterationLog, renderCodeDirect],
  );

  // The workspace AI panel's submit (decision C's refine layer): send the prompt to the LOCAL ENGINE
  // as a refine-in-context turn (the WelcomeScreen entry already routes the first describe to the
  // engine; this keeps follow-ups local-first too). Empty input is ignored.
  const handleAiPanelSubmit = useCallback(() => {
    const text = (draftText ?? "").trim();
    if (!text) return;
    setDraftText("");
    void handleEngineDescribe(text, { refine: true });
  }, [draftText, setDraftText, handleEngineDescribe]);

  useEffect(() => {
    // Optional chaining on `.env` (not just `.DEV`): unlike App.tsx's original inline effect,
    // this now mounts under Jest/Node too (useEngineLifecycle.test.tsx), where Vite's
    // build-time `import.meta.env` injection doesn't run — `import.meta.env` itself can be
    // undefined there. Every real target (dev server, production build, Tauri) always
    // provides it, so this is a test-safety fix, not a behavior change.
    if (!import.meta.env?.DEV) return;
    const w = window as unknown as {
      __TQ_DESCRIBE__?: typeof handleEngineDescribe;
      __TQ_MAKE_REAL__?: typeof handleMakeItReal;
      __TQ_SWITCH_PANEL__?: (id: string) => void;
      __TQ_SHOW_WELCOME__?: () => void;
      __TQ_REOPEN__?: typeof handleReopenDesign;
      __TQ_UNDO__?: typeof handleUndoEngine;
    };
    w.__TQ_DESCRIBE__ = handleEngineDescribe;
    w.__TQ_MAKE_REAL__ = handleMakeItReal;
    w.__TQ_SWITCH_PANEL__ = (id: string) =>
      getDockviewApi()?.getPanel(id)?.api.setActive();
    w.__TQ_SHOW_WELCOME__ = showWelcomeScreen;
    w.__TQ_REOPEN__ = handleReopenDesign;
    w.__TQ_UNDO__ = handleUndoEngine;
  }, [
    handleEngineDescribe,
    handleMakeItReal,
    showWelcomeScreen,
    handleReopenDesign,
    handleUndoEngine,
  ]);

  // Live readiness while tuning: when the document is a pure Customizer tune of the engine's design,
  // re-gate it on the engine (debounced) so the readiness reflects the tuned values — and keep the
  // engine's geometry in sync so "Make it real" slices exactly what's shown.
  useEffect(() => {
    const rid = lastEngineRidRef.current;
    const orig = lastEngineScadRef.current;
    if (rid == null || !orig) return;
    const tuned = pureTuneValues(renderTargetContent, orig);
    if (!tuned) return;
    const handle = setTimeout(() => {
      void engine.render(rid, tuned).then((r) => {
        if (r.ok && r.data.status === "completed") {
          lastEngineScadRef.current = renderTargetContent;
          // E2E-B: this effect used to publish ONLY the readiness. Everything else — the Intent
          // panel's dimensions, the Properties panel, explain-design-summary — reads
          // currentDesignResult, so after a tune they all kept showing the ORIGINAL size while
          // the part that would actually slice was the tuned one. A user tuning 80mm -> 120mm
          // was shown "Dimensions match: 80.0 x 60.0 x 40.0 mm" for a 120mm part, and that
          // survived into the slice.
          //
          // The slice path (handleMakeItReal, above) already does exactly this after its own
          // tuned re-render — the correct pattern existed in this file and this effect simply
          // did not follow it.
          setCurrentDesignResult(r.data);
          setCurrentDesignHeadline(r.data.report?.headline ?? null);
          setLiveReadiness(engineGateSummary(r.data));
          setVisualReviewSummary(null);
          setVisualDiffSummary(null);
          setVisualCorrectionPrompt(null);
          setVisualReviewLog([]);
          setLastSlicedRid(null);
        }
      });
    }, 700);
    return () => clearTimeout(handle);
  }, [renderTargetContent]);

  // Load the engine's printers + restore (or default) the user's slice-profile choice (§6.9).
  useEffect(() => {
    let cancelled = false;
    setSliceProfileStatus("loading");
    setSliceProfileError(null);
    void engine.options().then((r) => {
      if (cancelled) return;
      if (!r.ok) {
        setSliceProfileStatus("error");
        setSliceProfileError(
          "Could not load printer/material profiles from the local engine.",
        );
        return;
      }
      const printers = (
        r.data as {
          printers?: Array<{
            key?: string;
            name?: string;
            materials?: string[];
            layer_height_mm?: number | null;
            sliceable?: boolean;
            slice_note?: string | null;
          }>;
        }
      ).printers?.filter(
        (
          p,
        ): p is {
          key: string;
          name: string;
          materials?: string[];
          layer_height_mm?: number | null;
          sliceable?: boolean;
          slice_note?: string | null;
        } => Boolean(p.key && p.name),
      );
      if (!printers?.length) {
        setSliceProfileStatus("error");
        setSliceProfileError(
          "The local engine did not return any printer profiles.",
        );
        return;
      }
      setEnginePrinters(printers);
      const savedKey = localStorage.getItem("tq-printer");
      const chosen =
        printers.find((p) => p.key === savedKey && p.sliceable !== false) ??
        printers.find((p) => p.sliceable !== false) ??
        printers[0];
      setPrinterKey(chosen.key);
      const savedMat = localStorage.getItem("tq-material");
      const mat =
        savedMat && chosen.materials?.includes(savedMat)
          ? savedMat
          : (chosen.materials?.[0] ?? "");
      setMaterial(mat);
      setSliceProfileStatus("ready");
      setSliceProfileError(null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Load send connectors (§6.10). The built-in mock is labeled as simulated; real connectors may be
  // present but unconfigured, in which case the send endpoint returns a typed setup note.
  useEffect(() => {
    let cancelled = false;
    void engine.connectors().then((r) => {
      if (cancelled || !r.ok) return;
      const connectors = (r.data.connectors ?? []).filter(
        (c): c is ConnectorInfo =>
          typeof c.name === "string" && c.name.length > 0,
      );
      setEngineConnectors(connectors);
      const saved = localStorage.getItem("tq-connector") || "";
      const preferred =
        connectors.find((c) => c.name === saved)?.name ??
        connectors.find((c) => c.name === r.data.default)?.name ??
        connectors[0]?.name ??
        "";
      setConnectorName(preferred);
      if (preferred) localStorage.setItem("tq-connector", preferred);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return {
    engineUndoStack,
    hasEngineDesign,
    liveReadiness,
    currentDesignHeadline,
    currentDesignResult,
    currentStepUrl,
    reverseImportStatus,
    visualReviewSummary,
    visualDiffSummary,
    visualCorrectionPrompt,
    visualReviewResult,
    visualReviewImages,
    visualReviewLog,
    visualDiffEvidence,
    visualCorrectionRounds,
    isApplyingVisualCorrection,
    workspaceModelStatus,
    iterationLog,
    activeIterationBranch,
    enginePrinters,
    printerKey,
    setPrinterKey,
    material,
    setMaterial,
    sliceProfileStatus,
    sliceProfileError,
    isOrienting,
    engineConnectors,
    connectorName,
    setConnectorName,
    lastSlicedRid,
    printOutcome,
    showFirstRealDialog,
    setShowFirstRealDialog,
    readinessWithVisual,
    visualLoopModeLabel,
    lastEngineRidRef,
    handleEngineDescribe,
    handleApplyVisualCorrection,
    handleMakeItReal,
    handleManualOrient,
    handleSendToPrinter,
    handlePrintOutcome,
    handleSaveDesign,
    handleReverseImportCad,
    handleReopenDesign,
    handleUndoEngine,
    handleRestoreIteration,
    handleBranchIteration,
    handleAiPanelSubmit,
  };
}
