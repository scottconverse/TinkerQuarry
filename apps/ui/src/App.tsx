import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
  type ReactNode,
} from "react";
import { DockviewReact } from "dockview";
import type { DockviewReadyEvent } from "dockview";
import "dockview/dist/styles/dockview.css";
import { ExportDialog } from "./components/ExportDialog";
import { ShareDialog } from "./components/ShareDialog";
import { ShareBanner } from "./components/ShareBanner";
import type { AiPromptPanelRef } from "./components/AiPromptPanel";
import {
  SettingsDialog,
  type SettingsSection,
} from "./components/SettingsDialog";
import { WelcomeScreen } from "./components/WelcomeScreen";
import {
  HeaderWorkspaceControls,
  type HeaderLayoutPreset,
} from "./components/HeaderWorkspaceControls";
import { WebMenuBar } from "./components/WebMenuBar";
import { FileTreePanel } from "./components/FileTree";
import {
  Button,
  IconButton,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./components/ui";
import {
  panelComponents,
  tabComponents,
  WorkspaceTab,
} from "./components/panels/PanelComponents";
import { useTheme } from "./contexts/ThemeContext";
import { WorkspaceProvider } from "./contexts/WorkspaceContext";
import type { WorkspaceState } from "./contexts/WorkspaceContext";
import { useAnalytics, type LayoutSelectionSource } from "./localAnalytics";
import {
  setDockviewApi,
  getDockviewApi,
  addPresetPanels,
  applyWorkspacePreset,
  saveLayout,
  clearSavedLayout,
  MOBILE_LAYOUT_MEDIA_QUERY,
  openPanel,
} from "./stores/layoutStore";
import { useRenderOrchestrator } from "./hooks/useRenderOrchestrator";
import { useAiAgent } from "./hooks/useAiAgent";
import { useGlobalErrorReporting } from "./hooks/useGlobalErrorReporting";
import { useGlobalKeyboardShortcuts } from "./hooks/useGlobalKeyboardShortcuts";
import { useFileTreeOperations } from "./hooks/useFileTreeOperations";
import { revokeBlobUrl } from "./utils/blobUrls";
import {
  describeIntoStudio,
  reopenIntoStudio,
  reverseImportIntoStudio,
  setEngineDocument,
  pureTuneValues,
  type EngineTurn,
  type EngineDocOutcome,
} from "./services/engineDocument";
import {
  engine,
  type ConnectorInfo,
  connectorLabel,
  type DesignResult,
  type ModelStatusResult,
  type VisualReviewResult,
} from "./services/engineClient";
import { engineGateSummary } from "./services/engineDesign";
import { FirstRealPrintDialog } from "./components/FirstRealPrintDialog";
import { useHistory } from "./hooks/useHistory";
import { useMobileLayout } from "./hooks/useMobileLayout";
import { getPlatform, eventBus, type ExportFormat } from "./platform";
import { isExportValidationError } from "./services/exportErrors";
import {
  notifyDesktopMcpRenderStarted,
  notifyDesktopMcpRenderSettled,
  syncDesktopMcpConfig,
  syncDesktopMcpWindowContext,
} from "./services/desktopMcp";
import { exportModelWithContext } from "./services/exportService";
import { getPreviewSceneStyle } from "./services/previewSceneConfig";
import { isShareEnabled } from "./services/shareService";
import {
  openFileInWindow,
  openWorkspaceFolderInWindow,
} from "./services/windowOpenService";
import {
  useSettings,
  loadSettings,
  updateSetting,
} from "./stores/settingsStore";
import { getApiKey, getOpenAiCompatibleConfig } from "./stores/apiKeyStore";
import {
  selectActiveRender,
  selectActiveTab,
  selectActiveTabId,
  selectShowWelcome,
  selectTabs,
} from "./stores/workspaceSelectors";
import { useWorkspaceStore, getWorkspaceState } from "./stores/workspaceStore";
import {
  getProjectStore,
  useProjectStore,
  getRenderTargetContent,
} from "./stores/projectStore";
import { requestRender } from "./stores/renderRequestStore";
import {
  createSourceHash,
  getRenderArtifactState,
  useRenderArtifactStore,
} from "./stores/renderArtifactStore";
import { DEFAULT_TAB_NAME } from "./stores/workspaceFactories";
import { formatOpenScadCode } from "./utils/formatter";
import { addRecentFile, removeRecentFile } from "./utils/recentFiles";
import {
  captureCurrentPreview,
  captureVisualReviewImages,
  MAIN_PREVIEW_VIEWER_ID,
} from "./utils/capturePreview";
import {
  MAX_VISUAL_CORRECTION_ROUNDS,
  canApplyVisualCorrection,
  visualCorrectionApplyingSummary,
} from "./utils/visualCorrection";
import {
  analyzePreviewDifference,
  estimatePreviewDifferencePercent,
  formatVisualDifference,
  type VisualDiffAnalysis,
} from "./utils/visualDiff";
import { getManufacturingWorkflowState } from "./utils/manufacturingWorkflow";
import {
  normalizeAppError,
  notifyError,
  notifySuccess,
} from "./utils/notifications";
import { exportProjectZip } from "./utils/projectZip";
import {
  getInitialMacDownloadArch,
  getMacDownloadUrl,
  resolveMacDownloadArch,
  type MacArch,
} from "./utils/macDownload";
import { getRelativeProjectPath } from "./utils/projectFilePaths";
import { generateRandomProjectName } from "./utils/projectNaming";
import { resolveFolderImport } from "./utils/folderImport";
import { useShareEntry } from "./hooks/useShareEntry";
import {
  TbBrandGithub,
  TbSettings,
  TbDownload,
  TbShare3,
} from "react-icons/tb";
import { Toaster } from "sonner";
import type { AiDraft } from "./types/aiChat";
import type { WorkspaceTab as WorkspaceDocumentTab } from "./stores/workspaceTypes";
import {
  OPENSCAD_PROJECT_FILE_EXTENSIONS,
  isOpenScadProjectFilePath,
} from "../../../packages/shared/src/openscadProjectFiles";

const REPOSITORY_URL = import.meta.env.VITE_TQ_REPOSITORY_URL || "";
const MAC_RELEASE_BASE = import.meta.env.VITE_TQ_MAC_RELEASE_BASE || "";
const HEADER_WORKSPACE_SWITCHER_MEDIA_QUERY = "(max-width: 900px)";

const OPENSCAD_FILE_FILTERS = [
  { name: "OpenSCAD Files", extensions: [...OPENSCAD_PROJECT_FILE_EXTENSIONS] },
];
/** Prompt the user to pick a folder and return its project files, or null if cancelled. */
function pickFolder(): Promise<{
  files: Record<string, string>;
  renderTargetPath: string;
} | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.setAttribute("webkitdirectory", "");
    input.onchange = async () => {
      const fileList = input.files;
      if (!fileList || fileList.length === 0) {
        resolve(null);
        return;
      }

      const files: Record<string, string> = {};
      let workspaceName: string | null = null;
      for (const file of Array.from(fileList)) {
        // webkitRelativePath gives "folderName/path/to/file.scad"
        const relativePath = file.webkitRelativePath;
        if (!isOpenScadProjectFilePath(relativePath)) continue;
        // Strip the top-level folder name
        const parts = relativePath.split("/");
        workspaceName ??= parts[0] || null;
        const pathWithoutRoot = parts.slice(1).join("/");
        if (pathWithoutRoot) {
          files[pathWithoutRoot] = await file.text();
        }
      }

      resolve(
        resolveFolderImport(files, {
          workspaceName,
          createIfEmpty: true,
        }),
      );
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}

function formatLayerHeight(mm: unknown): string {
  if (typeof mm !== "number" || !Number.isFinite(mm) || mm <= 0) return "";
  return `${mm.toFixed(2).replace(/\.?0+$/, "")} mm layers`;
}

function readinessScore(text: string | null | undefined): number {
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

function useMacDownloadUrl() {
  const [arch, setArch] = useState<MacArch>(() => getInitialMacDownloadArch());

  useEffect(() => {
    let isCancelled = false;

    void resolveMacDownloadArch().then((resolvedArch) => {
      if (!isCancelled) {
        setArch(resolvedArch);
      }
    });

    return () => {
      isCancelled = true;
    };
  }, []);

  return getMacDownloadUrl(arch, MAC_RELEASE_BASE);
}

interface HeaderIconLinkProps {
  href: string;
  title: string;
  ariaLabel: string;
  children: ReactNode;
  openInNewTab?: boolean;
}

function HeaderIconLink({
  href,
  title,
  ariaLabel,
  children,
  openInNewTab = false,
}: HeaderIconLinkProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <a
          href={href}
          aria-label={ariaLabel}
          title={title}
          target={openInNewTab ? "_blank" : undefined}
          rel={openInNewTab ? "noreferrer" : undefined}
          className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-transparent bg-transparent text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]"
        >
          {children}
        </a>
      </TooltipTrigger>
      <TooltipContent side="bottom">{title}</TooltipContent>
    </Tooltip>
  );
}

function App() {
  const { isMobile } = useMobileLayout();
  const [isHeaderWorkspaceSwitcherHidden, setIsHeaderWorkspaceSwitcherHidden] =
    useState(
      () =>
        typeof window !== "undefined" &&
        window.matchMedia(HEADER_WORKSPACE_SWITCHER_MEDIA_QUERY).matches,
    );
  const tabs = useWorkspaceStore(selectTabs);
  const activeTabId = useWorkspaceStore(selectActiveTabId) ?? "";
  const showWelcome = useWorkspaceStore(selectShowWelcome);
  const activeTab = useWorkspaceStore(selectActiveTab) ?? tabs[0];
  const activeRender =
    useWorkspaceStore(selectActiveRender) ?? activeTab?.render;
  // The render target tab holds the preview — use its render state regardless of
  // which tab is currently active in the editor.
  const renderTargetPath = useProjectStore((s) => s.renderTargetPath);
  const projectRoot = useProjectStore((s) => s.projectRoot);
  const renderTargetTab = tabs.find((t) => t.projectPath === renderTargetPath);
  const renderTargetRender = renderTargetTab?.render ?? activeRender;
  const activeRenderArtifact = useRenderArtifactStore((state) =>
    renderTargetPath
      ? (state.artifactsByTarget[renderTargetPath] ?? null)
      : null,
  );
  // createTab/setActiveTab/closeTabLocal/reorderTabs subscriptions moved into
  // useFileTreeOperations (v1.5 phase 1b); markTabSaved/renameTab remain — the
  // persistence/menu cluster still uses them here.
  const markTabSaved = useWorkspaceStore((state) => state.markTabSaved);
  const renameTab = useWorkspaceStore((state) => state.renameTab);
  const openSharedDocument = useWorkspaceStore(
    (state) => state.openSharedDocument,
  );
  const beginTabRender = useWorkspaceStore((state) => state.beginTabRender);
  const commitTabRenderResult = useWorkspaceStore(
    (state) => state.commitTabRenderResult,
  );
  const commitTabRenderError = useWorkspaceStore(
    (state) => state.commitTabRenderError,
  );
  const showWelcomeScreen = useWorkspaceStore(
    (state) => state.showWelcomeScreen,
  );
  const hideWelcomeScreen = useWorkspaceStore(
    (state) => state.hideWelcomeScreen,
  );

  if (!activeTab) {
    throw new Error("Workspace store must always provide an active tab");
  }

  const activeTabRef = useRef<WorkspaceDocumentTab>(activeTab);
  const tabsRef = useRef<WorkspaceDocumentTab[]>(tabs);

  const [showExportDialog, setShowExportDialog] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [isProjectLoading, setIsProjectLoading] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<
    SettingsSection | undefined
  >(undefined);
  const [settings] = useSettings();
  const { theme } = useTheme();
  const previewSceneStyle = useMemo(() => getPreviewSceneStyle(theme), [theme]);
  const { capabilities } = getPlatform();
  const macDownloadUrl = useMacDownloadUrl();
  const { undo, redo } = useHistory();
  const [resolvedProjectDir, setResolvedProjectDir] = useState<string | null>(
    null,
  );
  /** Pre-generated project name shown on welcome screen (not yet created on disk) */
  const [pendingProjectName, setPendingProjectName] = useState<string>(() =>
    generateRandomProjectName(),
  );
  const initialShareContext = useMemo(
    () =>
      typeof window === "undefined" ? null : (window.__SHARE_CONTEXT ?? null),
    [],
  );

  // Resolve the effective default project directory from settings or platform default
  useEffect(() => {
    if (!capabilities.hasFileSystem) return;
    const configured = settings.project.defaultProjectDirectory;
    if (configured) {
      setResolvedProjectDir(configured);
    } else {
      void getPlatform()
        .getDefaultProjectsDirectory()
        .then((dir) => {
          if (dir) setResolvedProjectDir(dir);
        });
    }
  }, [capabilities.hasFileSystem, settings.project.defaultProjectDirectory]);

  useEffect(() => {
    if (!capabilities.hasFileSystem) return;

    let disposed = false;
    void syncDesktopMcpConfig({
      enabled: settings.mcp.enabled,
      port: settings.mcp.port,
    }).catch((error) => {
      if (!disposed) {
        console.error("[App] Failed to sync MCP config:", error);
      }
    });

    return () => {
      disposed = true;
    };
  }, [capabilities.hasFileSystem, settings.mcp.enabled, settings.mcp.port]);

  useEffect(() => {
    const mq = window.matchMedia(HEADER_WORKSPACE_SWITCHER_MEDIA_QUERY);
    const handleChange = (event: MediaQueryListEvent) => {
      setIsHeaderWorkspaceSwitcherHidden(event.matches);
    };

    setIsHeaderWorkspaceSwitcherHidden(mq.matches);
    mq.addEventListener("change", handleChange);
    return () => mq.removeEventListener("change", handleChange);
  }, []);

  const renderTargetContent = useProjectStore((s) =>
    s.renderTargetPath ? (s.files[s.renderTargetPath]?.content ?? "") : "",
  );
  const contentVersion = useProjectStore((s) => s.contentVersion);
  const hasMultipleFiles = useProjectStore(
    (s) => Object.keys(s.files).length > 1,
  );

  const {
    previewKind,
    diagnostics,
    isRendering,
    error,
    ready,
    manualRender,
    renderCode: renderCodeDirect,
  } = useRenderOrchestrator({
    source: renderTargetContent,
    contentVersion,
    suppressInitialRender: Boolean(initialShareContext) || showWelcome,
    workingDir: projectRoot,
    autoRenderOnIdle: settings.editor.autoRenderOnIdle,
    autoRenderDelayMs: settings.editor.autoRenderDelayMs,
    library: settings.library,
    createRenderOwner: () => {
      // Always render into the render target tab, not the active editor tab
      const rtPath = getProjectStore().getState().renderTargetPath;
      const rtTab = rtPath
        ? getWorkspaceState().tabs.find((t) => t.projectPath === rtPath)
        : null;
      const tabId = rtTab?.id ?? activeTabRef.current?.id;
      if (!tabId) {
        return null;
      }

      const tab = rtTab ?? activeTabRef.current;
      const requestId = beginTabRender(tabId, {
        preferredDimension: tab?.render.dimensionMode,
      });
      const targetPath =
        rtPath ?? tab?.projectPath ?? activeTabRef.current.projectPath;
      const currentProjectRoot = getProjectStore().getState().projectRoot;

      getRenderArtifactState().setActiveRenderTarget(
        targetPath,
        currentProjectRoot,
      );
      notifyDesktopMcpRenderStarted({
        renderTargetPath: targetPath,
        requestId,
      });

      return {
        tabId,
        requestId,
      };
    },
    onRenderSettled: ({ owner, code, snapshot }) => {
      const settledRenderTargetPath =
        getProjectStore().getState().renderTargetPath ??
        (owner
          ? (getWorkspaceState().tabs.find((tab) => tab.id === owner.tabId)
              ?.projectPath ?? null)
          : null);
      if (owner && settledRenderTargetPath) {
        getRenderArtifactState().publishSettledArtifact({
          requestId: owner.requestId,
          renderTargetPath: settledRenderTargetPath,
          workspaceRoot: getProjectStore().getState().projectRoot,
          sourceHash: createSourceHash(code),
          previewKind: snapshot.previewKind,
          previewSrc: snapshot.previewSrc,
          diagnostics: snapshot.diagnostics,
          error: snapshot.error,
          dimensionMode: snapshot.dimensionMode,
          sceneStyle: previewSceneStyle,
          useModelColors: settings.viewer.showModelColors,
          createdAt: Date.now(),
        });
      }
      notifyDesktopMcpRenderSettled(owner?.requestId ?? null);

      if (!owner) {
        return;
      }

      const currentTab = getWorkspaceState().tabs.find(
        (tab) => tab.id === owner.tabId,
      );
      const previousPreviewSrc = currentTab?.render.previewSrc ?? "";

      if (snapshot.error) {
        commitTabRenderError(owner.tabId, {
          requestId: owner.requestId,
          error: snapshot.error,
          diagnostics: snapshot.diagnostics,
          lastRenderedContent: code,
        });
        return;
      }

      if (previousPreviewSrc && previousPreviewSrc !== snapshot.previewSrc) {
        revokeBlobUrl(previousPreviewSrc);
      }

      commitTabRenderResult(owner.tabId, {
        requestId: owner.requestId,
        previewSrc: snapshot.previewSrc,
        previewKind: snapshot.previewKind,
        diagnostics: snapshot.diagnostics,
        dimensionMode: snapshot.dimensionMode,
        lastRenderedContent: code,
      });
    },
  });
  const activePreviewSrc =
    activeRenderArtifact?.previewSrc ?? renderTargetRender?.previewSrc ?? "";
  const activePreviewKind =
    activeRenderArtifact?.previewKind ??
    renderTargetRender?.previewKind ??
    previewKind;
  const activeDiagnostics =
    activeRenderArtifact?.diagnostics ??
    renderTargetRender?.diagnostics ??
    diagnostics;
  const activeError =
    activeRenderArtifact?.error ?? renderTargetRender?.error ?? error;

  const handleOpenFallbackEditor = useCallback(() => {
    hideWelcomeScreen();
    window.history.replaceState({}, document.title, "/");

    if (!renderTargetRender?.lastRenderedContent && ready) {
      requestRender("initial", { immediate: true });
    }
  }, [renderTargetRender?.lastRenderedContent, hideWelcomeScreen, ready]);

  useEffect(() => {
    getRenderArtifactState().setActiveRenderTarget(
      renderTargetPath ?? null,
      projectRoot,
    );
  }, [projectRoot, renderTargetPath]);

  const initializeProject = useCallback(
    async (filePath: string | null, fileName: string, content: string) => {
      if (!filePath) {
        const name = fileName || DEFAULT_TAB_NAME;
        getProjectStore()
          .getState()
          .openProject(null, { [name]: content }, name);
        return;
      }

      await openFileInWindow(
        {
          path: filePath,
          name: fileName || DEFAULT_TAB_NAME,
          content,
        },
        {
          trackRecent: true,
        },
      );
    },
    [],
  );

  const handleOpenSharedDocument = useCallback(
    (share: {
      title: string;
      code: string;
      files?: Record<string, string>;
      renderTarget?: string;
    }) => {
      if (share.files && share.renderTarget) {
        const store = getProjectStore();
        store.getState().openProject(null, share.files, share.renderTarget);
        return openSharedDocument({
          name: share.title,
          projectPath: share.renderTarget,
        });
      }
      void initializeProject(null, share.title, share.code);
      return openSharedDocument({
        name: share.title,
        projectPath: share.title,
      });
    },
    [initializeProject, openSharedDocument],
  );

  const handleRenderSharedDocument = useCallback(
    ({ code }: { tabId: string; code: string }) => {
      // projectStore is already populated by handleOpenSharedDocument — just render.
      // Returns RenderSnapshot for the share entry loading flow.
      return renderCodeDirect(code, "file_open");
    },
    [renderCodeDirect],
  );

  const {
    context: shareContext,
    origin: shareOrigin,
    error: shareLoadError,
    phase: sharePhase,
    shouldBlockUi: shouldBlockShareUi,
    shouldShowError: shouldShowShareError,
    isActive: isShareEntry,
    retry: retryShareLoad,
    skip: skipShareEntry,
    dismissBanner: dismissShareBanner,
    markVisualReady: markSharePreviewReady,
    isBannerDismissed: isShareBannerDismissed,
  } = useShareEntry({
    renderReady: ready,
    openSharedDocument: handleOpenSharedDocument,
    renderSharedDocument: handleRenderSharedDocument,
    openFallbackEditor: handleOpenFallbackEditor,
  });

  const handleUndo = useCallback(async () => {
    const checkpoint = await undo();
    if (checkpoint) {
      const store = getProjectStore().getState();
      const projectPath = activeTab.projectPath;
      store.updateFileContent(projectPath, checkpoint.code);
      store.setCustomizerBase(projectPath, checkpoint.code);
      requestRender("history_restore", {
        immediate: true,
        code: checkpoint.code,
      });
    }
  }, [activeTab.projectPath, undo]);

  const handleRedo = useCallback(async () => {
    const checkpoint = await redo();
    if (checkpoint) {
      const store = getProjectStore().getState();
      const projectPath = activeTab.projectPath;
      store.updateFileContent(projectPath, checkpoint.code);
      store.setCustomizerBase(projectPath, checkpoint.code);
      requestRender("history_restore", {
        immediate: true,
        code: checkpoint.code,
      });
    }
  }, [activeTab.projectPath, redo]);

  const aiPromptPanelRef = useRef<AiPromptPanelRef>(null);
  const analytics = useAnalytics();

  // AI Agent state
  const {
    isStreaming,
    streamingResponse,
    proposedDiff,
    error: aiError,
    errorObject: aiErrorObject,
    isApplyingDiff,
    messages,
    draft,
    attachments,
    draftErrors,
    draftVisionBlockMessage,
    draftVisionWarningMessage,
    canSubmitDraft,
    isProcessingAttachments,
    currentToolCalls,
    currentProvider,
    currentModel,
    currentModelVisionSupport,
    availableProviders,
    submitDraft,
    setDraft,
    setDraftText,
    addDraftFiles,
    removeDraftAttachment,
    cancelStream,
    acceptDiff,
    rejectDiff,
    clearError: clearAiError,
    newConversation,
    setCurrentModel,
    handleRestoreCheckpoint,
    updateCapturePreview,
    update3dPreviewUrl,
    updatePreviewSceneStyle,
    updateUseModelColors,
    loadModelAndProviders,
  } = useAiAgent();

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
  const printOutcomeCleanRef = useRef<HTMLButtonElement | null>(null);
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
            useModelColors: settings.viewer.showModelColors,
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
      commitTabRenderResult,
      projectRoot,
      renderTargetContent,
      renderTargetPath,
      renderTargetRender?.diagnostics,
      renderTargetTab,
      previewSceneStyle,
      settings.viewer.showModelColors,
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
          notifySuccess("Importing CAD...", { toastId: "reverse-import-started" });
          const bytes = new Uint8Array(await file.arrayBuffer());
          const result = await reverseImportIntoStudio(bytes, file.name);
          if (!result.ok) {
            const message =
              result.error ?? result.gate ?? "Could not import that mesh file.";
            setReverseImportStatus({ state: "error", filename: file.name, message });
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
          const message = error instanceof Error ? error.message : String(error);
          setReverseImportStatus({ state: "error", filename: file.name, message });
          notifyError({ operation: "Reverse import failed", error });
        }
      })();
    };
    input.click();
  }, [commitEngineOutcome, hideWelcomeScreen, ready, reverseImportStatus.state]);

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
    const text = (draft.text ?? "").trim();
    if (!text) return;
    setDraftText("");
    void handleEngineDescribe(text, { refine: true });
  }, [draft.text, setDraftText, handleEngineDescribe]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
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

  // Tab management functions
  // The file-tree & tab/project-file CRUD cluster — extracted whole (v1.5 phase 1b) to
  // hooks/useFileTreeOperations.ts; the hook subscribes to the same store singletons.
  const {
    createNewTab,
    focusEditorPanel,
    editorFocusRequestKey,
    switchTab,
    closeTab,
    reorderTabs,
    handleFileTreeClick,
    handleCreateFile,
    handleCreateFolder,
    handleRenameFile,
    handleDeleteFile,
    handleDeleteFolder,
    handleSetRenderTarget,
    handleMoveItem,
    handleAddExternalFiles,
  } = useFileTreeOperations();

  // Editor onChange: single write to projectStore. The render pipeline reacts
  // automatically via the source prop (render target content) and contentVersion.
  const handleEditorChange = useCallback((content: string) => {
    const projectPath = activeTabRef.current.projectPath;
    getProjectStore().getState().updateFileContent(projectPath, content);
  }, []);

  const handleToggleFileTree = useCallback(() => {
    updateSetting("ui", { fileTreeVisible: !settings.ui.fileTreeVisible });
  }, [settings.ui.fileTreeVisible]);

  // Note: Tree-sitter formatter is initialized in main.tsx for optimal performance

  // Initialize project store with the default untitled file on mount
  useEffect(() => {
    const state = getProjectStore().getState();
    // Only initialize if the project store is empty (no files loaded yet)
    if (Object.keys(state.files).length === 0) {
      const tab = activeTabRef.current;
      const defaultContent =
        "// Type your OpenSCAD code here\ncube([10, 10, 10]);";
      // Seed the untitled web project without hydrating workspace state.
      // Explicit file/folder opens should transition out of welcome, but the
      // initial empty project should stay behind the welcome screen.
      state.openProject(null, { [tab.name]: defaultContent }, tab.name);
    }
  }, []);

  // Keep refs in sync with state
  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);

  useEffect(() => {
    update3dPreviewUrl(
      activePreviewKind === "mesh" && activePreviewSrc
        ? activePreviewSrc
        : null,
    );
  }, [activePreviewKind, activePreviewSrc, update3dPreviewUrl]);
  useEffect(() => {
    updateCapturePreview(() =>
      captureCurrentPreview({
        viewerId: MAIN_PREVIEW_VIEWER_ID,
        svgSourceUrl: activePreviewKind === "svg" ? activePreviewSrc : null,
        targetWidth: 1200,
        targetHeight: 630,
      }),
    );
    return () => updateCapturePreview(null);
  }, [activePreviewKind, activePreviewSrc, updateCapturePreview]);

  useEffect(() => {
    updatePreviewSceneStyle(previewSceneStyle);
  }, [previewSceneStyle, updatePreviewSceneStyle]);

  useEffect(() => {
    updateUseModelColors(settings.viewer.showModelColors);
  }, [settings.viewer.showModelColors, updateUseModelColors]);

  // Tab switches no longer trigger renders — the render pipeline only renders
  // the pinned render target. Editing any file that the render target includes
  // will trigger a re-render via the project store dependency chain.

  // Source-to-tab and project store sync is handled by handleEditorChange.
  // No separate sync effects needed.

  // Helper function to save file to current path or prompt for new path
  const saveProjectToDirectory = useCallback(async (): Promise<boolean> => {
    try {
      const platform = getPlatform();
      const dirPath = await platform.pickDirectory();
      if (!dirPath) return false;

      const store = getProjectStore().getState();
      const currentSettings = loadSettings();

      // Write all files to the selected directory
      for (const [relativePath, file] of Object.entries(store.files)) {
        let content = file.content;

        if (currentSettings.editor.formatOnSave) {
          try {
            content = await formatOpenScadCode(content, {
              indentSize: currentSettings.editor.indentSize,
              useTabs: currentSettings.editor.useTabs,
            });
            if (content !== file.content) {
              getProjectStore()
                .getState()
                .updateFileContent(relativePath, content);
              getProjectStore()
                .getState()
                .setCustomizerBase(relativePath, content);
            }
          } catch {
            // Continue with unformatted content
          }
        }

        const absolutePath = `${dirPath}/${relativePath}`;
        await platform.writeTextFile(absolutePath, content);
      }

      // Transition project from virtual to disk-backed
      const updatedStore = getProjectStore().getState();
      updatedStore.openProject(
        dirPath,
        Object.fromEntries(
          Object.entries(updatedStore.files).map(([path, file]) => [
            path,
            file.content,
          ]),
        ),
        updatedStore.renderTargetPath ?? DEFAULT_TAB_NAME,
      );

      // Update workspace tabs with their new disk paths
      for (const tab of tabsRef.current) {
        const absolutePath = `${dirPath}/${tab.projectPath}`;
        markTabSaved(tab.id, { filePath: absolutePath, name: tab.name });
      }

      requestRender("save", { immediate: true });

      notifySuccess("Project saved to folder", {
        toastId: "save-project-dir-success",
      });
      return true;
    } catch (err) {
      notifyError({
        operation: "save-project-to-directory",
        error: err,
        fallbackMessage: "Failed to save project to folder",
        toastId: "save-project-dir-error",
        logLabel: "Save project to directory failed",
      });
      return false;
    }
  }, [markTabSaved]);

  const saveFile = useCallback(
    async (promptForPath: boolean = false): Promise<boolean> => {
      try {
        const currentTab = activeTabRef.current;
        const platform = getPlatform();
        const filters = OPENSCAD_FILE_FILTERS;

        const store = getProjectStore().getState();

        // Virtual multi-file project on desktop: redirect to folder save
        if (
          !promptForPath &&
          store.projectRoot === null &&
          Object.keys(store.files).length > 1 &&
          platform.capabilities.hasFileSystem
        ) {
          return saveProjectToDirectory();
        }

        let currentSource = store.files[currentTab.projectPath]?.content ?? "";

        const currentSettings = loadSettings();
        if (currentSettings.editor.formatOnSave) {
          try {
            const formatted = await formatOpenScadCode(currentSource, {
              indentSize: currentSettings.editor.indentSize,
              useTabs: currentSettings.editor.useTabs,
            });
            if (formatted !== currentSource) {
              currentSource = formatted;
              store.updateFileContent(currentTab.projectPath, formatted);
              store.setCustomizerBase(currentTab.projectPath, formatted);
            }
          } catch (err) {
            console.error("[saveFile] Failed to format code:", err);
          }
        }

        let savePath: string | null;
        const suggestedName = currentTab.name || "untitled";
        if (promptForPath) {
          savePath = await platform.fileSaveAs(
            currentSource,
            filters,
            suggestedName,
          );
        } else {
          savePath = await platform.fileSave(
            currentSource,
            currentTab.filePath,
            filters,
            suggestedName,
          );
        }

        if (!savePath) return false;

        const shouldNotifySaveSuccess = promptForPath || !currentTab.filePath;
        const projectRoot = getProjectStore().getState().projectRoot;
        const relativePath = getRelativeProjectPath(projectRoot, savePath);
        const fileName = relativePath || savePath.split("/").pop() || savePath;

        // If the file was renamed (e.g., "Untitled" → "lamp.scad"), update projectStore
        if (fileName !== currentTab.projectPath) {
          getProjectStore()
            .getState()
            .renameFile(currentTab.projectPath, fileName);
          renameTab(currentTab.id, fileName, fileName);
        }

        markTabSaved(currentTab.id, {
          filePath: savePath,
          name: fileName,
        });
        getProjectStore().getState().markFileSaved(fileName, currentSource);

        const dockPanel = getDockviewApi()?.getPanel(currentTab.id);
        if (dockPanel) {
          dockPanel.api.setTitle(savePath.split("/").pop() || fileName);
        }

        addRecentFile(savePath);

        requestRender("save", { immediate: true });

        analytics.track("file saved", {
          source: promptForPath ? "save_as" : "save",
          had_existing_path: Boolean(currentTab.filePath),
          format_on_save: currentSettings.editor.formatOnSave,
          render_after_save: true,
        });

        if (shouldNotifySaveSuccess) {
          notifySuccess("File saved successfully", {
            toastId: "save-success",
          });
        }

        return true;
      } catch (err) {
        notifyError({
          operation: "save-file",
          error: err,
          fallbackMessage: "Failed to save file",
          toastId: "save-file-error",
          logLabel: "[saveFile] Save failed",
        });
        return false;
      }
    },
    [analytics, markTabSaved, renameTab, saveProjectToDirectory],
  );

  const saveAllFiles = useCallback(async () => {
    const store = getProjectStore().getState();
    const platform = getPlatform();
    const currentSettings = loadSettings();
    const filters = OPENSCAD_FILE_FILTERS;
    let savedCount = 0;

    for (const [relativePath, file] of Object.entries(store.files)) {
      if (!file.isDirty) continue;

      let content = file.content;

      // Auto-format on save if enabled
      if (currentSettings.editor.formatOnSave) {
        try {
          const formatted = await formatOpenScadCode(content, {
            indentSize: currentSettings.editor.indentSize,
            useTabs: currentSettings.editor.useTabs,
          });
          if (formatted !== content) {
            content = formatted;
            getProjectStore()
              .getState()
              .updateFileContent(relativePath, formatted);
            getProjectStore()
              .getState()
              .setCustomizerBase(relativePath, formatted);
          }
        } catch {
          // Continue with unformatted content
        }
      }

      // Build absolute path for desktop projects
      const absolutePath = store.projectRoot
        ? `${store.projectRoot}/${relativePath}`
        : null;

      const savePath = await platform.fileSave(
        content,
        absolutePath,
        filters,
        relativePath,
      );
      if (savePath) {
        getProjectStore().getState().markFileSaved(relativePath, content);

        // Update matching workspace tab if one exists
        const tab = tabsRef.current.find((t) => t.projectPath === relativePath);
        if (tab) {
          markTabSaved(tab.id, { filePath: savePath, name: tab.name });
        }
        savedCount++;
      }
    }

    if (savedCount > 0) {
      requestRender("save", { immediate: true });
      notifySuccess(`Saved ${savedCount} file${savedCount > 1 ? "s" : ""}`, {
        toastId: "save-all-success",
      });
    }
  }, [markTabSaved]);

  // Track whether the user explicitly chose a directory (persisted setting
  // or ephemeral welcome-screen pick). When true, we use the directory
  // directly instead of creating a random-named subdirectory.
  const [hasEphemeralProjectDir, setHasEphemeralProjectDir] = useState(false);
  const hasCustomProjectDir =
    !!settings.project.defaultProjectDirectory || hasEphemeralProjectDir;
  const displayProjectDir = resolvedProjectDir
    ? hasCustomProjectDir
      ? resolvedProjectDir
      : `${resolvedProjectDir}/${pendingProjectName}`
    : null;

  /**
   * On desktop, create a project directory on disk and transition the project
   * from virtual to disk-backed. Returns the created directory path, or null
   * if on web or if directory creation failed.
   */
  const initProjectDirectory = useCallback(async (): Promise<string | null> => {
    if (!capabilities.hasFileSystem || !resolvedProjectDir) return null;

    const platform = getPlatform();
    let dirPath: string | null;

    if (hasCustomProjectDir) {
      dirPath = resolvedProjectDir;
    } else {
      // Default base dir — create a random-named subdirectory
      dirPath = await platform.createProjectDirectory(
        resolvedProjectDir,
        pendingProjectName,
      );
      // Generate a fresh name for the next project
      setPendingProjectName(generateRandomProjectName());

      if (!dirPath) return null;
    }
    if (!dirPath) return null;

    await openWorkspaceFolderInWindow(dirPath, {
      createIfEmpty: true,
    });

    return dirPath;
  }, [
    capabilities.hasFileSystem,
    resolvedProjectDir,
    pendingProjectName,
    hasCustomProjectDir,
  ]);

  const handleStartWithDraft = useCallback(
    (draftOverride?: AiDraft) => {
      if (draftOverride) {
        setDraft(draftOverride);
      }

      // TinkerQuarry (PRD §6.1 local-first; decision C): the initial describe goes to the LOCAL
      // ENGINE (describe → geometry + readiness), not a cloud chat agent. The conversational agent is
      // the optional refine/explain layer. Fall back to the agent only when there's no prompt text.
      const prompt = (draftOverride?.text ?? draft.text ?? "").trim();
      if (prompt) {
        void handleEngineDescribe(prompt).then((result) => {
          if (result.ok) hideWelcomeScreen();
        });
      } else {
        void initProjectDirectory().then(() => {
          hideWelcomeScreen();
          void submitDraft(draftOverride);
        });
      }
    },
    [
      hideWelcomeScreen,
      setDraft,
      submitDraft,
      initProjectDirectory,
      handleEngineDescribe,
      draft.text,
    ],
  );

  const handleStartManually = useCallback(() => {
    hideWelcomeScreen();
    void initProjectDirectory();
  }, [hideWelcomeScreen, initProjectDirectory]);

  const handleChangeProjectDirectory = useCallback(async () => {
    const platform = getPlatform();
    const picked = await platform.pickDirectory();
    if (picked) {
      setResolvedProjectDir(picked);
      setHasEphemeralProjectDir(true);
    }
  }, []);

  const openWorkspaceFolderInCurrentWindow = useCallback(
    async (
      dirPath: string,
      options: {
        createIfEmpty?: boolean;
        source?: "recent" | "menu_open";
      } = {},
    ) => {
      setIsProjectLoading(true);
      try {
        const result = await openWorkspaceFolderInWindow(dirPath, {
          createIfEmpty: options.createIfEmpty,
        });

        if (options.source) {
          analytics.track("folder opened", {
            source: options.source,
            file_count: result.fileCount,
            created_default_file: result.createdDefaultFile,
          });
        }

        return result;
      } finally {
        setIsProjectLoading(false);
      }
    },
    [analytics],
  );

  const openFileInCurrentWindow = useCallback(
    async (
      result: { path: string | null; name: string; content: string },
      options: {
        source?: "open" | "menu_open" | "recent";
      } = {},
    ) => {
      setIsProjectLoading(true);
      try {
        const openResult = await openFileInWindow(result);

        if (options.source) {
          analytics.track("file opened", {
            source: options.source,
            has_disk_path: Boolean(result.path),
            reused_existing_tab: openResult.reusedExistingTab,
            replaced_welcome_tab: !openResult.reusedExistingTab,
          });
        }

        return openResult;
      } finally {
        setIsProjectLoading(false);
      }
    },
    [analytics],
  );

  const handleHeaderLayoutSelect = useCallback(
    (preset: HeaderLayoutPreset) => {
      const changed = settings.ui.defaultLayoutPreset !== preset;

      updateSetting("ui", {
        hasCompletedNux: true,
        defaultLayoutPreset: preset,
      });

      if (changed) {
        analytics.track("workspace layout selected", {
          layout: preset,
          source: "header" satisfies LayoutSelectionSource,
          is_first_run: false,
        });
      }

      applyWorkspacePreset(preset);
    },
    [analytics, settings.ui.defaultLayoutPreset],
  );

  const handleOpenCustomizerAiRefine = useCallback(() => {
    openPanel("ai-chat", "ai-chat", "AI");
    window.setTimeout(() => {
      aiPromptPanelRef.current?.focusPrompt();
    }, 0);
  }, []);

  const hasCurrentModelApiKey =
    currentProvider === "openai-compatible"
      ? Boolean(getOpenAiCompatibleConfig().baseUrl && currentModel.trim())
      : Boolean(getApiKey(currentProvider));
  const canAttachViewerAnnotation = !isStreaming && !isProcessingAttachments;

  const attachViewerAnnotationFile = useCallback<
    WorkspaceState["attachViewerAnnotationFile"]
  >(
    async (file) => {
      openPanel("ai-chat", "ai-chat", "AI");

      if (!hasCurrentModelApiKey) {
        setSettingsInitialTab("ai");
        setShowSettingsDialog(true);
        return { status: "missing-api-key" };
      }

      if (!canAttachViewerAnnotation) {
        return { status: "busy" };
      }

      const result = await addDraftFiles([file], "viewer_annotation");
      if (!result || result.readyCount < 1) {
        return {
          status: "failed",
          errors: result?.errors ?? ["Failed to add the annotation image."],
        };
      }

      window.setTimeout(() => {
        aiPromptPanelRef.current?.focusPrompt();
      }, 0);

      return { status: "attached" };
    },
    [addDraftFiles, canAttachViewerAnnotation, hasCurrentModelApiKey],
  );

  const handleOpenEditorPanel = useCallback(() => {
    focusEditorPanel();
  }, [focusEditorPanel]);

  const handleOpenExportDialog = useCallback(() => {
    setShowExportDialog(true);
  }, []);

  const handleOpenShareDialog = useCallback(() => {
    if (!isShareEnabled()) {
      return;
    }
    setShowShareDialog(true);
  }, []);

  const handleOpenRecent = useCallback(
    async (path: string, type?: "file" | "folder") => {
      try {
        // Handle recent folders by opening the directory
        // Also detect legacy entries without type field by checking extension
        if (type === "folder" || !isOpenScadProjectFilePath(path)) {
          const platform = getPlatform();
          if (!platform.capabilities.hasFileSystem) return "cancelled" as const;
          await openWorkspaceFolderInCurrentWindow(path, { source: "recent" });
          return "opened" as const;
        }

        const existingTab = tabs.find((t) => t.filePath === path);
        if (existingTab) {
          await switchTab(existingTab.id);
          hideWelcomeScreen();
          analytics.track("file opened", {
            source: "recent",
            has_disk_path: true,
            reused_existing_tab: true,
            replaced_welcome_tab: false,
          });
          return "opened" as const;
        }

        // On web, recent files won't have real paths — this is a Tauri-only feature
        // but we keep the interface for compatibility
        const platform = getPlatform();
        if (!platform.capabilities.hasFileSystem) {
          notifyError({
            operation: "open-recent-file",
            fallbackMessage: "Cannot open recent files in web mode",
            toastId: "open-recent-file-error",
          });
          return "cancelled" as const;
        }

        const result = await platform.fileRead(path);
        if (!result) return "cancelled" as const;

        await openFileInCurrentWindow(result, { source: "recent" });
        return "opened" as const;
      } catch (err) {
        removeRecentFile(path);
        const normalized = normalizeAppError(err, "Failed to open file");
        const isMissingFile =
          normalized.message.toLowerCase().includes("no such file") ||
          normalized.message.toLowerCase().includes("not found");

        notifyError({
          operation: "open-recent-file",
          error: err,
          fallbackMessage: isMissingFile
            ? "File no longer exists. Removed from Recent Files."
            : "Failed to open file",
          toastId: "open-recent-file-error",
          logLabel: "Failed to open recent file",
        });
        return "removed" as const;
      }
    },
    [
      analytics,
      hideWelcomeScreen,
      openWorkspaceFolderInCurrentWindow,
      openFileInCurrentWindow,
      switchTab,
      tabs,
    ],
  );

  const handleOpenFile = useCallback(async () => {
    try {
      const result = await getPlatform().fileOpen(OPENSCAD_FILE_FILTERS);
      if (!result) return;
      await openFileInCurrentWindow(result, { source: "open" });
    } catch (err) {
      notifyError({
        operation: "open-file",
        error: err,
        fallbackMessage: "Failed to open file",
        toastId: "open-file-error",
        logLabel: "Failed to open file",
      });
    }
  }, [openFileInCurrentWindow]);

  // Helper function to check for unsaved changes before destructive operations
  // Returns: true if ok to proceed, false if user wants to cancel
  const checkUnsavedChangesRef = useRef<() => Promise<boolean>>();

  checkUnsavedChangesRef.current = async (): Promise<boolean> => {
    const file =
      getProjectStore().getState().files[activeTabRef.current.projectPath];
    // Compare content directly rather than relying on isDirty — virtual files
    // (web) keep isDirty false to suppress UI indicators, but we still want to
    // warn before discarding in-memory edits.
    const hasUnsavedEdits = file ? file.content !== file.savedContent : false;
    if (!hasUnsavedEdits) return true;

    const platform = getPlatform();

    const wantsToSave = await platform.ask(
      "Do you want to save the changes you made?",
      {
        title: "Unsaved Changes",
        kind: "warning",
        okLabel: "Save",
        cancelLabel: "Don't Save",
      },
    );

    if (wantsToSave) {
      return await saveFile(false);
    } else {
      const confirmDiscard = await platform.confirm(
        "Are you sure you want to discard your changes?",
        {
          title: "Discard Changes",
          kind: "warning",
          okLabel: "Discard",
          cancelLabel: "Cancel",
        },
      );
      return confirmDiscard;
    }
  };

  useEffect(() => {
    const unlistenFns: Array<() => void> = [];

    unlistenFns.push(
      eventBus.on("menu:file:new", async () => {
        const canProceed = checkUnsavedChangesRef.current
          ? await checkUnsavedChangesRef.current()
          : true;
        if (!canProceed) return;

        getProjectStore().getState().resetToUntitledProject();
        createNewTab();
        showWelcomeScreen();
      }),
    );

    unlistenFns.push(
      eventBus.on("menu:file:open", async () => {
        try {
          const result = await getPlatform().fileOpen(OPENSCAD_FILE_FILTERS);
          if (!result) return;
          await openFileInCurrentWindow(result, { source: "menu_open" });
        } catch (err) {
          notifyError({
            operation: "open-file",
            error: err,
            fallbackMessage: "Failed to open file",
            toastId: "open-file-error",
            logLabel: "Open failed",
          });
        }
      }),
    );

    unlistenFns.push(
      eventBus.on("menu:file:open_folder", async () => {
        try {
          const canProceed = checkUnsavedChangesRef.current
            ? await checkUnsavedChangesRef.current()
            : true;
          if (!canProceed) return;

          const platform = getPlatform();
          const dirPath = await platform.pickDirectory();
          if (!dirPath) return;
          await openWorkspaceFolderInCurrentWindow(dirPath, {
            source: "menu_open",
          });
        } catch (err) {
          notifyError({
            operation: "open-folder",
            error: err,
            fallbackMessage: "Failed to open folder",
            toastId: "open-folder-error",
            logLabel: "Open folder failed",
          });
        }
      }),
    );

    unlistenFns.push(
      eventBus.on("menu:file:save", async () => {
        await saveFile(false);
      }),
    );

    unlistenFns.push(
      eventBus.on("menu:file:save_as", async () => {
        await saveFile(true);
      }),
    );

    unlistenFns.push(
      eventBus.on("menu:file:save_all", async () => {
        await saveAllFiles();
      }),
    );

    unlistenFns.push(
      eventBus.on("menu:file:export", async (format: ExportFormat) => {
        try {
          const formatLabels: Record<
            ExportFormat,
            { label: string; ext: string }
          > = {
            stl: { label: "STL (3D Model)", ext: "stl" },
            obj: { label: "OBJ (3D Model)", ext: "obj" },
            amf: { label: "AMF (3D Model)", ext: "amf" },
            "3mf": { label: "3MF (3D Model)", ext: "3mf" },
            png: { label: "PNG (Image)", ext: "png" },
            svg: { label: "SVG (2D Vector)", ext: "svg" },
            dxf: { label: "DXF (2D CAD)", ext: "dxf" },
          };
          const formatInfo = formatLabels[format];
          const rtContent =
            getRenderTargetContent(getProjectStore().getState()) ?? "";
          const exportBytes = await exportModelWithContext({
            format,
            source: rtContent,
            library: loadSettings().library,
          });
          await getPlatform().fileExport(
            exportBytes,
            `export.${formatInfo.ext}`,
            [{ name: formatInfo.label, extensions: [formatInfo.ext] }],
          );
          analytics.track("file exported", {
            format,
          });
          notifySuccess("Exported successfully", { toastId: "export-success" });
        } catch (err) {
          notifyError({
            operation: "export-file",
            error: err,
            capture: !isExportValidationError(err),
            fallbackMessage: "Export failed",
            toastId: "export-error",
            logLabel: "Export failed",
          });
        }
      }),
    );

    unlistenFns.push(
      eventBus.on("menu:file:save_project", async () => {
        try {
          const state = getProjectStore().getState();
          if (!state.renderTargetPath) return;
          const files: Record<string, string> = {};
          for (const [path, file] of Object.entries(state.files)) {
            files[path] = file.content;
          }
          const blob = exportProjectZip({
            files,
            renderTargetPath: state.renderTargetPath,
          });
          const data = new Uint8Array(await blob.arrayBuffer());
          await getPlatform().fileExport(data, "project.zip", [
            { name: "ZIP Archive", extensions: ["zip"] },
          ]);
          analytics.track("project exported", {
            file_count: Object.keys(files).length,
          });
          notifySuccess("Project saved", { toastId: "save-project-success" });
        } catch (err) {
          notifyError({
            operation: "save-project",
            error: err,
            fallbackMessage: "Failed to save project",
            toastId: "save-project-error",
            logLabel: "Save project failed",
          });
        }
      }),
    );

    unlistenFns.push(
      eventBus.on("menu:file:open_project", async () => {
        try {
          const canProceed = checkUnsavedChangesRef.current
            ? await checkUnsavedChangesRef.current()
            : true;
          if (!canProceed) return;

          const result = await pickFolder();
          if (!result) return;

          getProjectStore()
            .getState()
            .openProject(null, result.files, result.renderTargetPath);
          createNewTab(
            null,
            result.files[result.renderTargetPath],
            result.renderTargetPath,
          );
          hideWelcomeScreen();
          analytics.track("project imported", {
            file_count: Object.keys(result.files).length,
          });
          notifySuccess(
            `Opened project with ${Object.keys(result.files).length} files`,
            {
              toastId: "open-project-success",
            },
          );

          requestRender("file_open", { immediate: true });
        } catch (err) {
          notifyError({
            operation: "open-project",
            error: err,
            fallbackMessage: "Failed to open project",
            toastId: "open-project-error",
            logLabel: "Open project failed",
          });
        }
      }),
    );

    return () => {
      unlistenFns.forEach((fn) => fn());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    analytics,
    createNewTab,
    hideWelcomeScreen,
    openFileInCurrentWindow,
    openWorkspaceFolderInCurrentWindow,
    saveAllFiles,
    showWelcomeScreen,
  ]);

  useEffect(() => {
    const platform = getPlatform();
    const unlisten = platform.onCloseRequested(async () => {
      const projectFiles = getProjectStore().getState().files;
      const anyDirty = Object.values(projectFiles).some((f) => f.isDirty);
      if (!anyDirty) return true;
      return checkUnsavedChangesRef.current
        ? await checkUnsavedChangesRef.current()
        : true;
    });

    return () => {
      unlisten();
    };
  }, []);

  const activeFileDirty = useProjectStore(
    (s) => s.files[activeTab.projectPath]?.isDirty ?? false,
  );
  const anyFileDirty = useProjectStore((s) =>
    Object.values(s.files).some((f) => f.isDirty),
  );

  useEffect(() => {
    const workspaceName = projectRoot
      ? (projectRoot.split("/").filter(Boolean).pop() ?? activeTab.name)
      : activeTab.filePath
        ? activeTab.name
        : "Untitled Project";
    const dirtyIndicator = activeFileDirty ? "\u2022 " : "";
    const title = `${dirtyIndicator}${workspaceName} - TinkerQuarry`;
    getPlatform().setWindowTitle(title);

    if (capabilities.hasFileSystem) {
      void syncDesktopMcpWindowContext({
        title,
        workspaceRoot: projectRoot,
        renderTargetPath,
        showWelcome,
        mode: showWelcome ? "welcome" : "ready",
      }).catch((error) => {
        console.error("[App] Failed to sync MCP window context:", error);
      });
    }
  }, [
    activeFileDirty,
    activeTab.filePath,
    activeTab.name,
    capabilities.hasFileSystem,
    projectRoot,
    renderTargetPath,
    showWelcome,
  ]);

  useEffect(() => {
    const platform = getPlatform();
    if ("setDirtyState" in platform) {
      (platform as { setDirtyState: (d: boolean) => void }).setDirtyState(
        anyFileDirty,
      );
    }
  }, [anyFileDirty]);

  // Watch project directory for external file changes (desktop only)
  useEffect(() => {
    if (!projectRoot) return;
    const platform = getPlatform();
    if (!platform.capabilities.hasFileSystem) return;

    let unwatchFn: (() => void) | null = null;

    platform
      .watchDirectory(projectRoot, (relativePath, content) => {
        const store = getProjectStore().getState();
        if (content === null) {
          // File was deleted externally — only remove if it exists and isn't dirty
          if (
            relativePath in store.files &&
            !store.files[relativePath].isDirty
          ) {
            store.removeFile(relativePath);
          }
          return;
        }
        // File was created or modified externally
        if (relativePath in store.files) {
          // Only update if the file isn't dirty (don't overwrite unsaved user edits)
          if (
            !store.files[relativePath].isDirty &&
            store.files[relativePath].content !== content
          ) {
            store.updateFileContent(relativePath, content);
            store.markFileSaved(relativePath, content);
          }
        } else {
          store.addFile(relativePath, content);
          store.markFileSaved(relativePath, content);
        }
      })
      .then((fn) => {
        unwatchFn = fn;
      });

    return () => {
      unwatchFn?.();
    };
  }, [projectRoot]);

  useEffect(() => {
    const unlisten = eventBus.on("render-requested", ({ source }) => {
      requestRender(source === "ai" ? "ai_edit" : "manual", {
        immediate: true,
      });
    });
    return unlisten;
  }, []);

  useEffect(() => {
    const unlisten = eventBus.on(
      "code-updated",
      ({ code, source: eventSource }) => {
        const store = getProjectStore().getState();
        // Customizer changes target the render target file, not the active editor
        // tab — the user may be viewing a different file while the customizer
        // operates on the render target.
        const projectPath =
          eventSource === "customizer"
            ? (store.renderTargetPath ?? activeTabRef.current.projectPath)
            : activeTabRef.current.projectPath;
        store.updateFileContent(projectPath, code);
        if (eventSource !== "customizer") {
          store.setCustomizerBase(projectPath, code);
        }
        requestRender(
          eventSource === "history"
            ? "history_restore"
            : eventSource === "ai"
              ? "ai_edit"
              : "code_update",
          { immediate: true },
        );
      },
    );
    return unlisten;
  }, []);

  const previousSettingsDialogRef = useRef(false);
  useEffect(() => {
    if (showSettingsDialog && !previousSettingsDialogRef.current) {
      analytics.track("settings opened", {
        section: settingsInitialTab ?? "appearance",
      });
    }
    previousSettingsDialogRef.current = showSettingsDialog;
  }, [analytics, settingsInitialTab, showSettingsDialog]);

  useEffect(() => {
    if (printOutcome != null) {
      window.requestAnimationFrame(() => printOutcomeCleanRef.current?.focus());
    }
  }, [printOutcome]);

  // Global keyboard shortcuts + window error reporting — extracted (v1.5 phase 1a) to
  // hooks/useGlobalKeyboardShortcuts.ts and hooks/useGlobalErrorReporting.ts.
  const openSettingsShortcut = useCallback(() => setShowSettingsDialog(true), []);
  useGlobalKeyboardShortcuts({
    aiPromptPanelRef,
    openSettings: openSettingsShortcut,
    createNewTab,
    closeTab,
    activeTabId,
  });
  useGlobalErrorReporting();

  useEffect(() => {
    if (aiError) {
      notifyError({
        operation: "ai-stream",
        error: aiErrorObject ?? aiError,
        displayMessage: aiError,
        fallbackMessage: "AI request failed",
        toastId: "ai-stream-error",
      });
      clearAiError();
    }
  }, [aiError, aiErrorObject, clearAiError]);

  const onDockviewReady = useCallback(
    (event: DockviewReadyEvent) => {
      const { api } = event;
      setDockviewApi(api);

      const savedPreset = loadSettings().ui.defaultLayoutPreset;
      const layoutMode =
        typeof window !== "undefined" &&
        window.matchMedia(MOBILE_LAYOUT_MEDIA_QUERY).matches
          ? "mobile"
          : "desktop";
      const sharePreset =
        isShareEntry && shareContext ? shareContext.mode : null;

      if (!sharePreset) {
        clearSavedLayout();
      }

      addPresetPanels(api, sharePreset ?? savedPreset, layoutMode);

      let timer: ReturnType<typeof setTimeout> | null = null;
      if (!sharePreset) {
        api.onDidLayoutChange(() => {
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => {
            saveLayout();
          }, 300);
        });
      }
    },
    [isShareEntry, shareContext],
  );

  const workspaceState: WorkspaceState = useMemo(
    () => ({
      source: renderTargetContent,
      updateSource: handleEditorChange,
      diagnostics: activeDiagnostics,
      onManualRender: manualRender,
      settings,
      editorFocusRequestKey,
      tabs,
      activeTabId,
      onTabClick: switchTab,
      onTabClose: closeTab,
      onNewTab: () => createNewTab(),
      onReorderTabs: reorderTabs,
      previewSrc: activePreviewSrc,
      previewKind: activePreviewKind,
      isRendering: isRendering || isProjectLoading,
      error: activeError,
      renderReady: ready,
      onPreviewVisualReady: isShareEntry ? markSharePreviewReady : undefined,
      isStreaming,
      streamingResponse,
      proposedDiff,
      aiError,
      isApplyingDiff,
      messages,
      draft,
      attachments,
      draftErrors,
      draftVisionBlockMessage,
      draftVisionWarningMessage,
      canSubmitDraft,
      isProcessingAttachments,
      currentToolCalls,
      currentProvider,
      currentModel,
      currentModelVisionSupport,
      availableProviders,
      submitDraft,
      setDraftText,
      addDraftFiles,
      removeDraftAttachment,
      hasCurrentModelApiKey,
      canAttachViewerAnnotation,
      attachViewerAnnotationFile,
      cancelStream,
      acceptDiff,
      rejectDiff,
      clearAiError,
      newConversation,
      setCurrentModel,
      handleRestoreCheckpoint,
      aiPromptPanelRef,
      onAcceptDiff: acceptDiff,
      onRejectDiff: rejectDiff,
      onOpenAiSettings: () => {
        setSettingsInitialTab("ai");
        setShowSettingsDialog(true);
      },
      onOpenCustomizerAiRefine: handleOpenCustomizerAiRefine,
      onOpenEditorPanel: handleOpenEditorPanel,
      onOpenExportDialog: handleOpenExportDialog,
      onReverseImportCad: handleReverseImportCad,
      onAiSubmit: handleAiPanelSubmit,
      currentDesignResult,
      currentDesignHeadline,
      currentRid: lastEngineRidRef.current,
      liveReadiness,
      currentStepUrl,
      selectedPrinterName:
        enginePrinters.find((printer) => printer.key === printerKey)?.name ??
        null,
      selectedMaterial: material || null,
      selectedConnector:
        engineConnectors.find((connector) => connector.name === connectorName) ??
        null,
      workspaceModelStatus,
      visualReviewSummary,
      visualReviewResult,
      visualReviewImages,
      visualReviewLog,
      visualCorrectionRounds,
      visualDiffEvidence,
      iterationLog,
    }),
    [
      renderTargetContent,
      handleEditorChange,
      activeDiagnostics,
      manualRender,
      settings,
      editorFocusRequestKey,
      tabs,
      activeTabId,
      switchTab,
      closeTab,
      createNewTab,
      reorderTabs,
      activePreviewSrc,
      activePreviewKind,
      isRendering,
      isProjectLoading,
      activeError,
      ready,
      isShareEntry,
      markSharePreviewReady,
      isStreaming,
      streamingResponse,
      proposedDiff,
      aiError,
      isApplyingDiff,
      messages,
      draft,
      attachments,
      draftErrors,
      draftVisionBlockMessage,
      draftVisionWarningMessage,
      canSubmitDraft,
      isProcessingAttachments,
      currentToolCalls,
      currentProvider,
      currentModel,
      currentModelVisionSupport,
      availableProviders,
      submitDraft,
      setDraftText,
      addDraftFiles,
      removeDraftAttachment,
      hasCurrentModelApiKey,
      canAttachViewerAnnotation,
      attachViewerAnnotationFile,
      cancelStream,
      acceptDiff,
      rejectDiff,
      clearAiError,
      newConversation,
      setCurrentModel,
      handleRestoreCheckpoint,
      handleOpenCustomizerAiRefine,
      handleOpenEditorPanel,
      handleOpenExportDialog,
      handleReverseImportCad,
      handleAiPanelSubmit,
      currentDesignResult,
      currentDesignHeadline,
      liveReadiness,
      currentStepUrl,
      enginePrinters,
      printerKey,
      material,
      engineConnectors,
      connectorName,
      workspaceModelStatus,
      visualReviewSummary,
      visualReviewResult,
      visualReviewImages,
      visualReviewLog,
      visualCorrectionRounds,
      visualDiffEvidence,
      iterationLog,
    ],
  );

  const shouldShowWelcome = showWelcome && !isShareEntry;
  const canUseShare = !capabilities.hasNativeMenu && isShareEnabled();
  const shouldShowShareBanner = Boolean(
    shareOrigin && sharePhase === "ready" && !isShareBannerDismissed,
  );

  const shareBlockingOverlay = shouldBlockShareUi ? (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center"
      data-testid="share-loading-screen"
      style={{
        backgroundColor: "var(--bg-primary)",
        color: "var(--text-primary)",
      }}
    >
      <div
        className="flex w-full max-w-md flex-col items-center text-center rounded-2xl"
        style={{
          backgroundColor: "var(--bg-secondary)",
          border: "1px solid var(--border-primary)",
          gap: "var(--space-helper-gap)",
          padding: `var(--space-dialog-padding-y) var(--space-dialog-padding-x)`,
        }}
      >
        <div
          className="h-8 w-8 animate-spin rounded-full border-2"
          style={{
            borderColor: "var(--border-primary)",
            borderTopColor: "var(--accent-primary)",
          }}
        />
        <div className="text-lg font-semibold">Opening shared design...</div>
        <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Loading the shared model, preview, and layout.
        </div>
      </div>
    </div>
  ) : null;

  const selectedEnginePrinter = enginePrinters.find(
    (p) => p.key === printerKey,
  );
  const selectedLayerHeight = formatLayerHeight(
    selectedEnginePrinter?.layer_height_mm,
  );
  const selectedPrinterBlocked = selectedEnginePrinter?.sliceable === false;
  const selectedPrinterNote = selectedEnginePrinter?.slice_note ?? null;
  const manufacturingWorkflowState = getManufacturingWorkflowState({
    hasEngineDesign,
    currentRid: lastEngineRidRef.current,
    lastSlicedRid,
    sliceProfileStatus,
    printerKey,
    material,
    connectorName,
  });
  const { sliceProfileReady, canSendCurrentSlice } = manufacturingWorkflowState;
  const makeItRealDisabled =
    isRendering ||
    !hasEngineDesign ||
    selectedPrinterBlocked ||
    !sliceProfileReady;
  const selectedConnector = engineConnectors.find(
    (c) => c.name === connectorName,
  );
  const manufacturingSliceState = manufacturingWorkflowState.sliceState;
  const manufacturingSendState = manufacturingWorkflowState.sendState;
  const readinessHeadline =
    liveReadiness?.split("\n").find(Boolean) ?? "No readiness check yet";
  const explainGateChecks = [
    hasEngineDesign ? "Design generated" : "Waiting for design",
    readinessHeadline,
    visualReviewSummary ?? "Visual review advisory has not run yet",
    hasEngineDesign &&
    lastSlicedRid != null &&
    lastSlicedRid === lastEngineRidRef.current
      ? "Successful slice proved this candidate"
      : sliceProfileReady
        ? "Slice is required before Ready to print"
        : "Choose a printable slice profile",
  ];
  const explainActionState = canSendCurrentSlice
    ? connectorName
      ? `Send is enabled for ${connectorName}`
      : "Choose a printer connection to send"
    : hasEngineDesign
      ? "Send stays disabled until this candidate is sliced"
      : "Build a design before slicing or sending";
  const explainAgentSteps = [
    "Plan: prompt and prior turns are sent to the local engine",
    hasEngineDesign
      ? "Generate: SCAD source and mesh were produced"
      : "Generate: waiting for a completed design",
    liveReadiness
      ? "Gate: readiness checks are visible before slicing"
      : "Gate: waiting for readiness evidence",
    visualReviewSummary
      ? `Look: ${visualReviewSummary}`
      : "Look: visual correction will inspect rendered views when available",
    lastSlicedRid === lastEngineRidRef.current && lastSlicedRid != null
      ? "Prove: current candidate has a fresh slice"
      : "Prove: slice proof is still required",
  ];
  const explainEvidenceSources = [
    currentDesignHeadline
      ? `Design: ${currentDesignHeadline}`
      : "Design: none yet",
    liveReadiness
      ? `Readiness: ${readinessHeadline}`
      : "Readiness: not available",
    selectedEnginePrinter
      ? `Profile: ${selectedEnginePrinter.name} / ${material.toUpperCase()}${selectedLayerHeight ? ` / ${selectedLayerHeight}` : ""}`
      : "Profile: not selected",
    selectedConnector
      ? `Connector: ${selectedConnector.name}${selectedConnector.simulated ? " (simulated)" : ""}`
      : "Connector: not selected",
  ];
  const currentBranchEntries = iterationLog.filter(
    (entry) => (entry.branchId ?? "main") === activeIterationBranch.id,
  );

  const content = shouldShowShareError ? (
    <div
      className="flex h-screen items-center justify-center"
      data-testid="share-error-screen"
      style={{
        backgroundColor: "var(--bg-primary)",
        color: "var(--text-primary)",
      }}
    >
      <div
        className="flex w-full max-w-md flex-col rounded-2xl"
        style={{
          backgroundColor: "var(--bg-secondary)",
          border: "1px solid var(--border-primary)",
          gap: "var(--space-section-gap)",
          padding: `var(--space-dialog-padding-y) var(--space-dialog-padding-x)`,
        }}
      >
        <div className="text-lg font-semibold">
          Couldn&apos;t open this shared design
        </div>
        <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
          {shareLoadError}
        </div>
        <div
          className="flex items-center justify-end"
          style={{ gap: "var(--space-dialog-footer-gap)" }}
        >
          <Button variant="secondary" onClick={skipShareEntry}>
            Go to Editor
          </Button>
          <Button variant="primary" onClick={retryShareLoad}>
            Retry
          </Button>
        </div>
      </div>
    </div>
  ) : shouldShowWelcome ? (
    <div
      className="h-screen"
      data-testid="welcome-container"
      style={{ backgroundColor: "var(--bg-primary)" }}
    >
      <WelcomeScreen
        draft={draft}
        attachments={attachments}
        draftErrors={draftErrors}
        draftVisionBlockMessage={draftVisionBlockMessage}
        draftVisionWarningMessage={draftVisionWarningMessage}
        canSubmitDraft={canSubmitDraft}
        isProcessingAttachments={isProcessingAttachments}
        onDraftTextChange={setDraftText}
        onDraftFilesSelected={(files) => {
          void addDraftFiles(files);
        }}
        onDraftRemoveAttachment={removeDraftAttachment}
        onStartWithDraft={handleStartWithDraft}
        onStartManually={handleStartManually}
        onReopenDesign={handleReopenDesign}
        onOpenRecent={handleOpenRecent}
        onOpenFile={handleOpenFile}
        onOpenFolder={() => {
          eventBus.emit(
            capabilities.hasFileSystem
              ? "menu:file:open_folder"
              : "menu:file:open_project",
          );
        }}
        showRecentFiles={capabilities.hasFileSystem}
        currentProvider={currentProvider}
        currentModel={currentModel}
        availableProviders={availableProviders}
        onModelChange={setCurrentModel}
        onOpenSettings={() => {
          setSettingsInitialTab("ai");
          setShowSettingsDialog(true);
        }}
        projectDirectory={displayProjectDir}
        onChangeProjectDirectory={handleChangeProjectDirectory}
        hasCustomProjectDirectory={hasCustomProjectDir}
      />
      <SettingsDialog
        isOpen={showSettingsDialog}
        onClose={() => {
          setShowSettingsDialog(false);
          setSettingsInitialTab(undefined);
          loadModelAndProviders();
        }}
        initialTab={settingsInitialTab}
      />
    </div>
  ) : (
    <div
      className="h-screen flex flex-col"
      data-testid="app-container"
      style={{
        backgroundColor: "var(--bg-primary)",
        color: "var(--text-primary)",
      }}
    >
      <header
        className="relative flex items-center gap-1.5 shrink-0 overflow-x-auto py-1"
        style={{
          backgroundColor: "var(--bg-secondary)",
          borderBottom: "1px solid var(--border-subtle)",
        }}
      >
        {!capabilities.hasNativeMenu && (
          <WebMenuBar
            onExport={() => setShowExportDialog(true)}
            onShare={canUseShare ? handleOpenShareDialog : undefined}
            onSettings={() => setShowSettingsDialog(true)}
            onUndo={handleUndo}
            onRedo={handleRedo}
            hasMultipleFiles={hasMultipleFiles}
          />
        )}

        <div className="flex-1" />

        {!isMobile && !isHeaderWorkspaceSwitcherHidden && (
          <div className="hidden lg:flex shrink-0 items-center justify-center px-2">
            <HeaderWorkspaceControls
              layoutPreset={settings.ui.defaultLayoutPreset}
              onLayoutPresetChange={handleHeaderLayoutSelect}
            />
          </div>
        )}

        <div className="flex items-center gap-1.5 px-3 py-1 shrink-0">
          {(isRendering || isProjectLoading) && (
            <div
              data-testid="render-spinner"
              className="flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full"
              style={{
                backgroundColor: "var(--bg-tertiary)",
                color: "var(--text-secondary)",
              }}
            >
              <div
                className="animate-spin h-2.5 w-2.5 border-2 rounded-full"
                style={{
                  borderColor: "var(--border-primary)",
                  borderTopColor: "var(--accent-primary)",
                }}
              />
              <span>Rendering</span>
            </div>
          )}

          {!isMobile && (
            <>
              <Button
                data-testid="render-button"
                variant="primary"
                onClick={manualRender}
                disabled={isRendering || !ready}
                size="sm"
                className="text-xs px-2 py-1"
              >
                Render (⌘↵)
              </Button>
            </>
          )}

          {engineUndoStack.length > 0 && (
            <Button
              data-testid="undo-design-button"
              variant="ghost"
              onClick={handleUndoEngine}
              size="sm"
              className="text-xs px-2 py-1"
              title="Revert to the previous design (undo the last describe/refine)"
            >
              Undo
            </Button>
          )}

          <Button
            data-testid="reverse-import-button"
            variant="secondary"
            onClick={handleReverseImportCad}
            size="sm"
            disabled={isRendering || reverseImportStatus.state === "running" || !ready}
            className="text-xs px-2 py-1"
            title="Import STL, 3MF, or OBJ into the trusted parametric CAD lane"
          >
            {reverseImportStatus.state === "running" ? "Importing" : "Import CAD"}
          </Button>

          {reverseImportStatus.state === "error" && (
            // Gate 2026-07-09 (UX-2): this block was `hidden ... sm:inline-flex`, so below a
            // 640 px window the ONLY error/Retry surface for a failed import disappeared
            // (the toast self-dismisses). It must stay visible at every window width.
            <div
              data-testid="reverse-import-status"
              className="inline-flex max-w-[16rem] items-center gap-1 truncate text-xs"
              style={{ color: "var(--color-error)" }}
              title={reverseImportStatus.message}
            >
              <span className="truncate">
                {reverseImportStatus.filename
                  ? `${reverseImportStatus.filename}: ${reverseImportStatus.message}`
                  : reverseImportStatus.message}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="px-1 py-0 underline"
                onClick={handleReverseImportCad}
              >
                Retry
              </Button>
            </div>
          )}

          <Button
            data-testid="save-design-button"
            variant="secondary"
            onClick={() => {
              void handleSaveDesign();
            }}
            size="sm"
            disabled={!hasEngineDesign}
            className="text-xs px-2 py-1"
            title={
              hasEngineDesign
                ? "Save this design to My Designs"
                : "Describe a part first"
            }
          >
            Save
          </Button>

          {hasEngineDesign && enginePrinters.length > 0 && (
            <div
              data-testid="slice-profile"
              className="hidden sm:inline-flex items-center gap-1 px-1 text-xs"
              title="The printer + material 'Make it real' will slice for"
            >
              <select
                data-testid="printer-select"
                aria-label="Printer"
                value={printerKey}
                onChange={(e) => {
                  const k = e.target.value;
                  setPrinterKey(k);
                  localStorage.setItem("tq-printer", k);
                  const p = enginePrinters.find((x) => x.key === k);
                  if (p && !p.materials?.includes(material)) {
                    const m = p.materials?.[0] ?? "";
                    setMaterial(m);
                    localStorage.setItem("tq-material", m);
                  }
                }}
                className="border rounded px-1 py-0.5 cursor-pointer"
                style={{
                  backgroundColor: "var(--bg-secondary)",
                  color: "var(--text-secondary)",
                  borderColor: "var(--border-primary)",
                }}
              >
                {enginePrinters.map((p) => (
                  <option
                    key={p.key}
                    value={p.key}
                    disabled={p.sliceable === false}
                  >
                    {p.name}
                    {p.sliceable === false ? " (profile blocked)" : ""}
                  </option>
                ))}
              </select>
              <span style={{ color: "var(--text-tertiary)" }}>·</span>
              <select
                data-testid="material-select"
                aria-label="Material"
                value={material}
                onChange={(e) => {
                  setMaterial(e.target.value);
                  localStorage.setItem("tq-material", e.target.value);
                }}
                className="border rounded px-1 py-0.5 cursor-pointer"
                style={{
                  backgroundColor: "var(--bg-secondary)",
                  color: "var(--text-secondary)",
                  borderColor: "var(--border-primary)",
                }}
              >
                {(
                  enginePrinters.find((p) => p.key === printerKey)?.materials ??
                  []
                ).map((m) => (
                  <option key={m} value={m}>
                    {m.toUpperCase()}
                  </option>
                ))}
              </select>
              {selectedLayerHeight && (
                <>
                  <span style={{ color: "var(--text-tertiary)" }}>·</span>
                  <span
                    data-testid="slice-layer-height"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {selectedLayerHeight}
                  </span>
                </>
              )}
              {selectedPrinterBlocked && selectedPrinterNote && (
                <>
                  <span style={{ color: "var(--text-tertiary)" }}>·</span>
                  <span
                    data-testid="slice-profile-note"
                    style={{ color: "var(--status-warning)" }}
                  >
                    Profile blocked
                  </span>
                </>
              )}
            </div>
          )}

          {hasEngineDesign && (
            <div
              data-testid="manual-orient"
              className="hidden lg:inline-flex items-center gap-1 px-1 text-xs"
              title="Manual build-plate orientation"
            >
              {(["x", "y", "z"] as const).flatMap((axis) =>
                ([-90, 90] as const).map((degrees) => (
                  <Button
                    key={`${axis}${degrees}`}
                    data-testid={`orient-${axis}-${degrees}`}
                    variant="ghost"
                    onClick={() => {
                      void handleManualOrient(axis, degrees);
                    }}
                    size="sm"
                    disabled={isRendering || isOrienting}
                    className="text-xs px-1.5 py-1"
                    aria-label={`Rotate ${axis.toUpperCase()} ${degrees > 0 ? "plus" : "minus"} 90 degrees`}
                    title={`Rotate ${axis.toUpperCase()} ${degrees > 0 ? "+90" : "-90"} degrees`}
                  >
                    {axis.toUpperCase()}
                    {degrees > 0 ? "+90" : "-90"}
                  </Button>
                )),
              )}
            </div>
          )}

          {visualCorrectionPrompt && (
            <Button
              data-testid="apply-visual-correction-button"
              variant="secondary"
              onClick={() => {
                void handleApplyVisualCorrection();
              }}
              size="sm"
              disabled={
                isRendering ||
                !canApplyVisualCorrection(
                  visualCorrectionPrompt,
                  visualCorrectionRounds,
                  isApplyingVisualCorrection,
                )
              }
              className="text-xs px-2 py-1"
              title={
                visualCorrectionRounds >= MAX_VISUAL_CORRECTION_ROUNDS
                  ? `Visual correction stopped after ${MAX_VISUAL_CORRECTION_ROUNDS} rounds`
                  : visualCorrectionPrompt
              }
            >
              {isApplyingVisualCorrection ? "Fixing" : "Fix visual issue"}
            </Button>
          )}

          <Button
            data-testid="make-it-real-button"
            variant="primary"
            onClick={() => {
              // §6.10: the first time the user commits to a real printable file, pause for a
              // quick caution; every time after, slice straight through.
              if (!localStorage.getItem("tq-printed-real")) {
                setShowFirstRealDialog(true);
                return;
              }
              void handleMakeItReal();
            }}
            size="sm"
            disabled={makeItRealDisabled}
            className="text-xs px-2 py-1"
            title={
              hasEngineDesign
                ? readinessWithVisual
                  ? `${readinessWithVisual}\n— slice to make it real`
                  : "Slice the current design into printable G-code"
                : "Describe a part first"
            }
          >
            Make it real
          </Button>

          {hasEngineDesign && engineConnectors.length > 0 && (
            <div
              data-testid="send-profile"
              className="hidden xl:inline-flex items-center gap-1 px-1 text-xs"
              title="Send the proven G-code to a configured printer connection"
            >
              <select
                data-testid="connector-select"
                aria-label="Printer connection"
                value={connectorName}
                onChange={(e) => {
                  const name = e.target.value;
                  setConnectorName(name);
                  localStorage.setItem("tq-connector", name);
                }}
                className="border rounded px-1 py-0.5 cursor-pointer"
                style={{
                  backgroundColor: "var(--bg-secondary)",
                  color: "var(--text-secondary)",
                  borderColor: "var(--border-primary)",
                }}
              >
                {engineConnectors.map((c) => (
                  <option key={c.name} value={c.name}>
                    {connectorLabel(c)}
                  </option>
                ))}
              </select>
              <Button
                data-testid="send-to-printer-button"
                variant="secondary"
                onClick={() => {
                  void handleSendToPrinter();
                }}
                size="sm"
                disabled={!canSendCurrentSlice || !connectorName}
                className="text-xs px-2 py-1"
                title={
                  canSendCurrentSlice
                    ? selectedConnector?.simulated
                      ? "Send to the simulated printer connection"
                      : selectedConnector?.hardware_validated
                        ? "Send this sliced G-code to the selected printer"
                        : "Send this sliced G-code to the selected printer (this connection type is simulator-tested; not yet certified on physical hardware)"
                    : "Make it real first"
                }
              >
                Send
              </Button>
            </div>
          )}

          <Button
            data-testid="export-button"
            variant="secondary"
            onClick={() => setShowExportDialog(true)}
            size="sm"
            disabled={isRendering || !ready}
            className="text-xs px-2 py-1"
          >
            <span className="inline-flex items-center gap-1.5">
              <TbDownload size={14} />
              <span>Export</span>
            </span>
          </Button>
          {canUseShare && (
            <Button
              data-testid="share-button"
              variant="secondary"
              onClick={handleOpenShareDialog}
              size="sm"
              disabled={isRendering || !ready}
              className="text-xs px-2 py-1"
            >
              <span className="inline-flex items-center gap-1.5">
                <TbShare3 size={14} />
                <span>Share</span>
              </span>
            </Button>
          )}

          <div
            style={{
              width: "1px",
              height: "16px",
              backgroundColor: "var(--border-secondary)",
            }}
          />

          {!capabilities.hasNativeMenu &&
            !isMobile &&
            (REPOSITORY_URL || macDownloadUrl) && (
              <>
                {REPOSITORY_URL && (
                  <HeaderIconLink
                    href={REPOSITORY_URL}
                    title="View GitHub Repository"
                    ariaLabel="View GitHub Repository"
                    openInNewTab
                  >
                    <TbBrandGithub size={15} />
                  </HeaderIconLink>
                )}
                {macDownloadUrl && (
                  <HeaderIconLink
                    href={macDownloadUrl}
                    title="Download for Mac"
                    ariaLabel="Download for Mac"
                  >
                    <TbDownload size={15} />
                  </HeaderIconLink>
                )}
              </>
            )}

          <IconButton
            data-testid="settings-button"
            onClick={() => setShowSettingsDialog(true)}
            size="sm"
            title="Settings (⌘,)"
            aria-label="Settings"
          >
            <TbSettings size={16} />
          </IconButton>
        </div>
      </header>

      {shouldShowShareBanner && shareOrigin && (
        <ShareBanner
          origin={shareOrigin}
          onShareRemix={handleOpenShareDialog}
          onDismiss={dismissShareBanner}
        />
      )}

      {(visualReviewSummary ||
        visualDiffSummary ||
        visualReviewLog.length > 0 ||
        visualCorrectionRounds > 0) && (
        <div
          data-testid="visual-evidence-rail"
          role="region"
          aria-label="Visual correction evidence"
          className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs"
          style={{
            backgroundColor: "var(--bg-secondary)",
            borderBottom: "1px solid var(--border-primary)",
            color: "var(--text-secondary)",
          }}
        >
          {visualReviewSummary && (
            <span data-testid="visual-review-state">{visualReviewSummary}</span>
          )}
          {visualDiffSummary && (
            <span
              data-testid="visual-diff-state"
              style={{ color: "var(--text-tertiary)" }}
            >
              {visualDiffSummary}
            </span>
          )}
          {visualDiffEvidence && (
            <div
              data-testid="visual-diff-panel"
              className="flex items-center gap-2 rounded-md border px-2 py-1"
              style={{
                borderColor: "var(--border-primary)",
                backgroundColor: "var(--bg-primary)",
              }}
            >
              <span
                className="font-medium"
                style={{ color: "var(--text-primary)" }}
              >
                Before/after
              </span>
              <img
                data-testid="visual-diff-before"
                src={visualDiffEvidence.before}
                alt="Before visual correction"
                className="h-10 w-14 rounded object-cover"
              />
              <img
                data-testid="visual-diff-after"
                src={visualDiffEvidence.after}
                alt="After visual correction"
                className="h-10 w-14 rounded object-cover"
              />
              <span style={{ color: "var(--text-tertiary)" }}>
                {visualDiffEvidence.summary}
              </span>
              {visualDiffEvidence.analysis?.hotspots?.length ? (
                <span
                  data-testid="visual-diff-hotspots"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  {visualDiffEvidence.analysis.hotspots
                    .map(
                      (hotspot) =>
                        `${hotspot.region} ${hotspot.changedPercent.toFixed(1)}%`,
                    )
                    .join(" · ")}
                </span>
              ) : null}
            </div>
          )}
          {visualCorrectionRounds > 0 && (
            <span
              data-testid="visual-correction-rounds"
              style={{ color: "var(--text-tertiary)" }}
            >
              Correction rounds: {visualCorrectionRounds}/
              {MAX_VISUAL_CORRECTION_ROUNDS}
            </span>
          )}
          {visualReviewLog.length > 0 && (
            <span
              data-testid="visual-review-log"
              title={visualReviewLog.join("\n")}
              style={{ color: "var(--text-tertiary)" }}
            >
              Latest: {visualReviewLog[0]}
            </span>
          )}
        </div>
      )}

      {hasEngineDesign && (
        <div
          data-testid="manufacturing-workflow-rail"
          role="region"
          aria-label="Manufacturing workflow"
          className="hidden md:flex items-stretch gap-2 px-3 py-2 text-xs"
          style={{
            backgroundColor: "var(--bg-primary)",
            borderBottom: "1px solid var(--border-secondary)",
            color: "var(--text-secondary)",
          }}
        >
          <div
            data-testid="workflow-customize"
            className="flex min-w-0 flex-1 flex-col gap-0.5"
          >
            <span style={{ color: "var(--text-tertiary)" }}>Customize</span>
            <span className="truncate">
              {liveReadiness ? "Readiness visible" : "Awaiting readiness"}
            </span>
          </div>
          <div
            data-testid="workflow-orient"
            className="flex min-w-0 flex-1 flex-col gap-0.5"
          >
            <span style={{ color: "var(--text-tertiary)" }}>Orient</span>
            <span className="truncate">
              {isOrienting ? "Updating pose" : "Manual controls ready"}
            </span>
          </div>
          <div
            data-testid="workflow-slice"
            className="flex min-w-0 flex-1 flex-col gap-0.5"
          >
            <span style={{ color: "var(--text-tertiary)" }}>Slice</span>
            <span className="truncate">{manufacturingSliceState}</span>
          </div>
          <div
            data-testid="workflow-send"
            className="flex min-w-0 flex-1 flex-col gap-0.5"
          >
            <span style={{ color: "var(--text-tertiary)" }}>Send</span>
            <span className="truncate">{manufacturingSendState}</span>
          </div>
        </div>
      )}

      {hasEngineDesign && (
        <div
          data-testid="mobile-make-it-real-panel"
          className="lg:hidden space-y-2 px-3 py-2 text-xs"
          style={{
            backgroundColor: "var(--bg-primary)",
            borderBottom: "1px solid var(--border-secondary)",
            color: "var(--text-secondary)",
          }}
        >
          <div className="grid grid-cols-2 gap-2">
            {enginePrinters.length > 0 && (
              <>
                <select
                  data-testid="mobile-printer-select"
                  aria-label="Mobile printer"
                  value={printerKey}
                  onChange={(e) => {
                    const k = e.target.value;
                    setPrinterKey(k);
                    localStorage.setItem("tq-printer", k);
                    const p = enginePrinters.find((x) => x.key === k);
                    if (p && !p.materials?.includes(material)) {
                      const m = p.materials?.[0] ?? "";
                      setMaterial(m);
                      localStorage.setItem("tq-material", m);
                    }
                  }}
                  className="min-w-0 rounded border px-2 py-1"
                  style={{
                    backgroundColor: "var(--bg-secondary)",
                    color: "var(--text-primary)",
                    borderColor: "var(--border-primary)",
                  }}
                >
                  {enginePrinters.map((p) => (
                    <option
                      key={p.key}
                      value={p.key}
                      disabled={p.sliceable === false}
                    >
                      {p.name}
                    </option>
                  ))}
                </select>
                <select
                  data-testid="mobile-material-select"
                  aria-label="Mobile material"
                  value={material}
                  onChange={(e) => {
                    setMaterial(e.target.value);
                    localStorage.setItem("tq-material", e.target.value);
                  }}
                  className="min-w-0 rounded border px-2 py-1"
                  style={{
                    backgroundColor: "var(--bg-secondary)",
                    color: "var(--text-primary)",
                    borderColor: "var(--border-primary)",
                  }}
                >
                  {(
                    enginePrinters.find((p) => p.key === printerKey)
                      ?.materials ?? []
                  ).map((m) => (
                    <option key={m} value={m}>
                      {m.toUpperCase()}
                    </option>
                  ))}
                </select>
              </>
            )}
          </div>
          <div className="grid grid-cols-3 gap-1">
            {(["x", "y", "z"] as const).map((axis) => (
              <Button
                key={axis}
                data-testid={`mobile-orient-${axis}`}
                variant="ghost"
                size="sm"
                disabled={isRendering || isOrienting}
                onClick={() => void handleManualOrient(axis, 90)}
                title={`Rotate ${axis.toUpperCase()} +90 degrees`}
              >
                {axis.toUpperCase()}+90
              </Button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {engineConnectors.length > 0 && (
              <select
                data-testid="mobile-connector-select"
                aria-label="Mobile printer connection"
                value={connectorName}
                onChange={(e) => {
                  const name = e.target.value;
                  setConnectorName(name);
                  localStorage.setItem("tq-connector", name);
                }}
                className="min-w-0 rounded border px-2 py-1"
                style={{
                  backgroundColor: "var(--bg-secondary)",
                  color: "var(--text-primary)",
                  borderColor: "var(--border-primary)",
                }}
              >
                {engineConnectors.map((c) => (
                  <option key={c.name} value={c.name}>
                    {connectorLabel(c)}
                  </option>
                ))}
              </select>
            )}
            <div
              data-testid="mobile-layer-height"
              className="flex items-center rounded border px-2 py-1"
              style={{
                borderColor: "var(--border-primary)",
                color: "var(--text-secondary)",
              }}
            >
              {selectedLayerHeight ?? "Layer pending"}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button
              data-testid="mobile-make-it-real-button"
              variant="primary"
              size="sm"
              disabled={makeItRealDisabled}
              onClick={() => {
                if (!localStorage.getItem("tq-printed-real")) {
                  setShowFirstRealDialog(true);
                  return;
                }
                void handleMakeItReal();
              }}
            >
              Slice
            </Button>
            <Button
              data-testid="mobile-send-to-printer-button"
              variant="secondary"
              size="sm"
              disabled={!canSendCurrentSlice || !connectorName}
              onClick={() => void handleSendToPrinter()}
            >
              Send
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div data-testid="mobile-workflow-slice">
              Slice: {manufacturingSliceState}
            </div>
            <div data-testid="mobile-workflow-send">
              Send: {manufacturingSendState}
            </div>
          </div>
        </div>
      )}

      <main
        data-testid="workspace-main"
        className="flex-1 overflow-hidden flex"
      >
        <h1 className="sr-only">TinkerQuarry workspace</h1>
        {!isMobile && (
          <FileTreePanel
            activeFilePath={activeTab.projectPath}
            onFileClick={handleFileTreeClick}
            onRenameFile={handleRenameFile}
            onDeleteFile={handleDeleteFile}
            onDeleteFolder={handleDeleteFolder}
            onSetRenderTarget={handleSetRenderTarget}
            onCreateFile={handleCreateFile}
            onCreateFolder={handleCreateFolder}
            onMoveItem={handleMoveItem}
            onAddExternalFiles={handleAddExternalFiles}
            collapsed={!settings.ui.fileTreeVisible}
            onToggleCollapse={handleToggleFileTree}
            width={settings.ui.fileTreeWidth}
          />
        )}
        <div className="flex-1 overflow-hidden">
          <WorkspaceProvider value={workspaceState}>
            <DockviewReact
              components={panelComponents}
              tabComponents={tabComponents}
              defaultTabComponent={WorkspaceTab}
              onReady={onDockviewReady}
              className="dockview-theme-openscad"
              disableFloatingGroups={true}
            />
          </WorkspaceProvider>
        </div>
        <div
          data-testid="make-it-real-panel"
          role="region"
          aria-label="Customize and make it real"
          className="hidden xl:flex w-80 shrink-0 flex-col gap-4 overflow-y-auto px-4 py-3"
          style={{
            borderLeft: "1px solid var(--border-subtle)",
            backgroundColor: "var(--bg-secondary)",
          }}
        >
          <section data-testid="customize-section" className="space-y-3">
            <div>
              <div
                className="text-[11px] font-semibold uppercase tracking-wide"
                style={{ color: "var(--text-tertiary)" }}
              >
                Customize
              </div>
              <div
                className="mt-1 text-sm"
                style={{ color: "var(--text-primary)" }}
              >
                {liveReadiness
                  ? liveReadiness.split("\n")[0]
                  : "No engine design yet"}
              </div>
            </div>
            <div
              data-testid="visual-loop-mode"
              className="rounded-md border px-3 py-2 text-xs"
              style={{
                borderColor: "var(--border-primary)",
                color: "var(--text-secondary)",
                backgroundColor: "var(--bg-primary)",
              }}
            >
              {visualLoopModeLabel}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={!hasEngineDesign}
                onClick={() => handleHeaderLayoutSelect("customizer-first")}
              >
                Customize
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={engineUndoStack.length === 0}
                onClick={handleUndoEngine}
              >
                Undo design
              </Button>
            </div>
          </section>

          <section data-testid="explain-trust-panel" className="space-y-3">
            <div
              className="text-[11px] font-semibold uppercase tracking-wide"
              style={{ color: "var(--text-tertiary)" }}
            >
              Explain
            </div>
            <div
              className="rounded-md border px-3 py-2 text-xs"
              style={{
                borderColor: "var(--border-primary)",
                color: "var(--text-secondary)",
                backgroundColor: "var(--bg-primary)",
              }}
            >
              <div
                data-testid="explain-design-summary"
                className="font-medium"
                style={{ color: "var(--text-primary)" }}
              >
                {currentDesignHeadline ?? "No generated design yet"}
              </div>
              <ul
                data-testid="explain-gate-checks"
                className="mt-2 space-y-1"
                style={{ paddingLeft: "1rem" }}
              >
                {explainGateChecks.map((check) => (
                  <li key={check}>{check}</li>
                ))}
              </ul>
              <div
                data-testid="explain-action-state"
                className="mt-2"
                style={{ color: "var(--text-tertiary)" }}
              >
                {explainActionState}
              </div>
              <div
                className="mt-3 border-t pt-2"
                style={{ borderColor: "var(--border-primary)" }}
              >
                <div
                  className="font-medium"
                  style={{ color: "var(--text-primary)" }}
                >
                  Agent loop
                </div>
                <ol
                  data-testid="explain-agent-loop"
                  className="mt-1 space-y-1"
                  style={{ paddingLeft: "1rem" }}
                >
                  {explainAgentSteps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              </div>
              <div
                className="mt-3 border-t pt-2"
                style={{ borderColor: "var(--border-primary)" }}
              >
                <div
                  className="font-medium"
                  style={{ color: "var(--text-primary)" }}
                >
                  Evidence used
                </div>
                <ul
                  data-testid="explain-evidence-sources"
                  className="mt-1 space-y-1"
                  style={{ paddingLeft: "1rem" }}
                >
                  {explainEvidenceSources.map((source) => (
                    <li key={source}>{source}</li>
                  ))}
                </ul>
              </div>
            </div>
          </section>

          <section data-testid="make-it-real-section" className="space-y-3">
            <div
              className="text-[11px] font-semibold uppercase tracking-wide"
              style={{ color: "var(--text-tertiary)" }}
            >
              Make it real
            </div>
            {hasEngineDesign && (
              <div className="grid grid-cols-3 gap-1">
                {(["x", "y", "z"] as const).map((axis) => (
                  <Button
                    key={axis}
                    variant="ghost"
                    size="sm"
                    disabled={isRendering || isOrienting}
                    onClick={() => void handleManualOrient(axis, 90)}
                    title={`Rotate ${axis.toUpperCase()} +90 degrees`}
                  >
                    {axis.toUpperCase()}+90
                  </Button>
                ))}
              </div>
            )}
            {hasEngineDesign && enginePrinters.length > 0 && (
              <div className="grid grid-cols-2 gap-2">
                <select
                  aria-label="Rail printer"
                  value={printerKey}
                  onChange={(e) => {
                    const k = e.target.value;
                    setPrinterKey(k);
                    localStorage.setItem("tq-printer", k);
                    const p = enginePrinters.find((x) => x.key === k);
                    if (p && !p.materials?.includes(material)) {
                      const m = p.materials?.[0] ?? "";
                      setMaterial(m);
                      localStorage.setItem("tq-material", m);
                    }
                  }}
                  className="border rounded px-2 py-1 text-xs"
                  style={{
                    backgroundColor: "var(--bg-primary)",
                    color: "var(--text-primary)",
                    borderColor: "var(--border-primary)",
                  }}
                >
                  {enginePrinters.map((p) => (
                    <option
                      key={p.key}
                      value={p.key}
                      disabled={p.sliceable === false}
                    >
                      {p.name}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Rail material"
                  value={material}
                  onChange={(e) => {
                    setMaterial(e.target.value);
                    localStorage.setItem("tq-material", e.target.value);
                  }}
                  className="border rounded px-2 py-1 text-xs"
                  style={{
                    backgroundColor: "var(--bg-primary)",
                    color: "var(--text-primary)",
                    borderColor: "var(--border-primary)",
                  }}
                >
                  {(
                    enginePrinters.find((p) => p.key === printerKey)
                      ?.materials ?? []
                  ).map((m) => (
                    <option key={m} value={m}>
                      {m.toUpperCase()}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {selectedLayerHeight && (
              <div
                className="text-xs"
                style={{ color: "var(--text-secondary)" }}
              >
                Layer height: {selectedLayerHeight}
              </div>
            )}
            <div className="flex gap-2">
              <Button
                data-testid="rail-make-it-real-button"
                variant="primary"
                size="sm"
                disabled={makeItRealDisabled}
                onClick={() => {
                  if (!localStorage.getItem("tq-printed-real")) {
                    setShowFirstRealDialog(true);
                    return;
                  }
                  void handleMakeItReal();
                }}
              >
                Slice
              </Button>
              <Button
                data-testid="rail-send-to-printer-button"
                variant="secondary"
                size="sm"
                disabled={!canSendCurrentSlice || !connectorName}
                onClick={() => void handleSendToPrinter()}
              >
                Send
              </Button>
            </div>
          </section>

          <section data-testid="iteration-log" className="space-y-2">
            <div
              className="text-[11px] font-semibold uppercase tracking-wide"
              style={{ color: "var(--text-tertiary)" }}
            >
              Iteration log
            </div>
            <div
              data-testid="iteration-branch-summary"
              className="rounded-md border px-3 py-2 text-xs"
              style={{
                borderColor: "var(--border-primary)",
                backgroundColor: "var(--bg-primary)",
                color: "var(--text-secondary)",
              }}
            >
              Branch: {activeIterationBranch.name} ·{" "}
              {currentBranchEntries.length} entries
            </div>
            {iterationLog.length === 0 ? (
              <div
                className="text-xs"
                style={{ color: "var(--text-tertiary)" }}
              >
                No iterations yet.
              </div>
            ) : (
              iterationLog.slice(0, 8).map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-md border px-3 py-2 text-xs"
                  style={{
                    borderColor: "var(--border-primary)",
                    backgroundColor: "var(--bg-primary)",
                  }}
                >
                  <div
                    className="font-medium"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {entry.title}
                  </div>
                  {entry.detail && (
                    <div
                      className="mt-1 line-clamp-2"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {entry.detail}
                    </div>
                  )}
                  <div
                    data-testid="iteration-branch"
                    className="mt-1"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    {entry.branchName ?? "Main"}
                    {entry.parentId ? " · has parent" : " · root"}
                  </div>
                  {entry.visualDiff?.hotspots?.length ? (
                    <div
                      data-testid="iteration-visual-hotspots"
                      className="mt-1"
                      style={{ color: "var(--text-tertiary)" }}
                    >
                      Hotspots:{" "}
                      {entry.visualDiff.hotspots
                        .map(
                          (hotspot) =>
                            `${hotspot.region} ${hotspot.changedPercent.toFixed(1)}%`,
                        )
                        .join(", ")}
                    </div>
                  ) : null}
                  {entry.scad && entry.rid != null && (
                    <div className="mt-2 flex gap-2">
                      <Button
                        data-testid="restore-iteration-button"
                        variant="ghost"
                        size="sm"
                        className="text-xs px-0 py-0"
                        onClick={() => handleRestoreIteration(entry)}
                      >
                        Restore
                      </Button>
                      <Button
                        data-testid="branch-iteration-button"
                        variant="ghost"
                        size="sm"
                        className="text-xs px-0 py-0"
                        onClick={() => handleBranchIteration(entry)}
                      >
                        Branch
                      </Button>
                    </div>
                  )}
                </div>
              ))
            )}
          </section>
        </div>
      </main>

      <ExportDialog
        isOpen={showExportDialog}
        onClose={() => setShowExportDialog(false)}
        source={renderTargetContent}
        workingDir={projectRoot}
        previewKind={activePreviewKind}
        stepUrl={currentStepUrl}
        capturePreview={() =>
          captureCurrentPreview({
            viewerId: MAIN_PREVIEW_VIEWER_ID,
            svgSourceUrl: activePreviewKind === "svg" ? activePreviewSrc : null,
            targetWidth: 1280,
            targetHeight: 960,
          })
        }
        downloadStep={async () => {
          if (!currentStepUrl) return null;
          const r = await engine.downloadApiAsset(currentStepUrl);
          return r.ok && r.data instanceof Uint8Array ? r.data : null;
        }}
      />
      {showFirstRealDialog && (
        <FirstRealPrintDialog
          onConfirm={() => {
            setShowFirstRealDialog(false);
            void handleMakeItReal();
          }}
          onClose={() => setShowFirstRealDialog(false)}
        />
      )}
      {printOutcome != null && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            backdropFilter: "blur(4px)",
          }}
          onClick={() => {
            void handlePrintOutcome("skip");
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              void handlePrintOutcome("skip");
            }
          }}
        >
          <div
            data-testid="print-outcome-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="print-outcome-title"
            className="rounded-xl shadow-2xl w-full max-w-md mx-4 flex flex-col overflow-hidden"
            style={{
              backgroundColor: "var(--bg-secondary)",
              border: "1px solid var(--border-primary)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              id="print-outcome-title"
              className="px-6 py-4 text-sm font-medium"
              style={{ borderBottom: "1px solid var(--border-primary)" }}
            >
              {printOutcome.simulated
                ? "How did the simulated send turn out?"
                : "How did the print turn out?"}
            </div>
            <div
              className="px-6 py-5 text-sm"
              style={{ color: "var(--text-secondary)" }}
            >
              {printOutcome.simulated
                ? "Recording this simulated outcome keeps the safe beta send flow tested without treating it as hardware feedback."
                : "Recording the print result helps TinkerQuarry learn which checks predicted reality."}
            </div>
            <div
              className="flex flex-wrap justify-end gap-2 px-6 py-4"
              style={{ borderTop: "1px solid var(--border-primary)" }}
            >
              <Button
                variant="ghost"
                onClick={() => void handlePrintOutcome("skip")}
              >
                Skip
              </Button>
              <Button
                variant="secondary"
                onClick={() => void handlePrintOutcome("failed")}
              >
                Failed
              </Button>
              <Button
                variant="secondary"
                onClick={() => void handlePrintOutcome("issues")}
              >
                Issues
              </Button>
              <Button
                ref={printOutcomeCleanRef}
                variant="primary"
                onClick={() => void handlePrintOutcome("clean")}
              >
                Clean
              </Button>
            </div>
          </div>
        </div>
      )}
      <ShareDialog
        isOpen={showShareDialog}
        onClose={() => setShowShareDialog(false)}
        source={renderTargetContent}
        tabName={activeTab.name}
        forkedFrom={shareOrigin?.shareId ?? null}
        capturePreview={() =>
          captureCurrentPreview({
            viewerId: MAIN_PREVIEW_VIEWER_ID,
            svgSourceUrl: activePreviewKind === "svg" ? activePreviewSrc : null,
            targetWidth: 1200,
            targetHeight: 630,
          })
        }
        preview3dUrl={activePreviewKind === "mesh" ? activePreviewSrc : null}
        previewKind={activePreviewKind}
        useModelColors={settings.viewer.showModelColors}
      />

      <SettingsDialog
        isOpen={showSettingsDialog}
        onClose={() => {
          setShowSettingsDialog(false);
          setSettingsInitialTab(undefined);
          loadModelAndProviders();
        }}
        initialTab={settingsInitialTab}
      />
    </div>
  );

  return (
    <TooltipProvider>
      {content}
      {shareBlockingOverlay}
      <Toaster
        richColors
        position="bottom-right"
        toastOptions={{
          style: {
            background: "var(--bg-elevated)",
            color: "var(--text-primary)",
            border: "1px solid var(--border-primary)",
          },
        }}
      />
    </TooltipProvider>
  );
}

export default App;
