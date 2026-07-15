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
import { usePersistenceOperations } from "./hooks/usePersistenceOperations";
import {
  useEngineLifecycle,
  formatLayerHeight,
} from "./hooks/useEngineLifecycle";
import { revokeBlobUrl } from "./utils/blobUrls";
import { engine, connectorLabel } from "./services/engineClient";
import { FirstRealPrintDialog } from "./components/FirstRealPrintDialog";
import { useHistory } from "./hooks/useHistory";
import { useMobileLayout } from "./hooks/useMobileLayout";
import { getPlatform, eventBus } from "./platform";
import {
  notifyDesktopMcpRenderStarted,
  notifyDesktopMcpRenderSettled,
  syncDesktopMcpConfig,
  syncDesktopMcpWindowContext,
} from "./services/desktopMcp";
import { getPreviewSceneStyle } from "./services/previewSceneConfig";
import { isShareEnabled } from "./services/shareService";
import { openFileInWindow } from "./services/windowOpenService";
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
import { getProjectStore, useProjectStore } from "./stores/projectStore";
import { requestRender } from "./stores/renderRequestStore";
import {
  createSourceHash,
  getRenderArtifactState,
  useRenderArtifactStore,
} from "./stores/renderArtifactStore";
import { DEFAULT_TAB_NAME } from "./stores/workspaceFactories";
import {
  captureCurrentPreview,
  MAIN_PREVIEW_VIEWER_ID,
} from "./utils/capturePreview";
import {
  MAX_VISUAL_CORRECTION_ROUNDS,
  canApplyVisualCorrection,
} from "./utils/visualCorrection";
import { getManufacturingWorkflowState } from "./utils/manufacturingWorkflow";
import { notifyError } from "./utils/notifications";
import {
  getInitialMacDownloadArch,
  getMacDownloadUrl,
  resolveMacDownloadArch,
  type MacArch,
} from "./utils/macDownload";
import { useShareEntry } from "./hooks/useShareEntry";
import { useProjectOnboarding } from "./hooks/useProjectOnboarding";
import {
  TbBrandGithub,
  TbSettings,
  TbDownload,
  TbShare3,
} from "react-icons/tb";
import { Toaster } from "sonner";
import type { WorkspaceTab as WorkspaceDocumentTab } from "./stores/workspaceTypes";

const REPOSITORY_URL = import.meta.env.VITE_TQ_REPOSITORY_URL || "";
const MAC_RELEASE_BASE = import.meta.env.VITE_TQ_MAC_RELEASE_BASE || "";
const HEADER_WORKSPACE_SWITCHER_MEDIA_QUERY = "(max-width: 900px)";

// formatLayerHeight, readinessScore, IterationLogEntry, VisualDiffEvidence, and
// ITERATION_LOG_KEY moved to hooks/useEngineLifecycle.ts (v1.5 phase 1d) — formatLayerHeight
// is re-imported above since App.tsx's JSX also formats a layer height directly.

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
  // useFileTreeOperations (v1.5 phase 1b); markTabSaved/renameTab moved into
  // usePersistenceOperations (v1.5 phase 1c) — both now self-subscribe.
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
  const [settingsInitialTab, setSettingsInitialTab] = useState<
    SettingsSection | undefined
  >(undefined);
  const [settings] = useSettings();
  const { theme } = useTheme();
  const previewSceneStyle = useMemo(() => getPreviewSceneStyle(theme), [theme]);
  const { capabilities } = getPlatform();
  const macDownloadUrl = useMacDownloadUrl();
  const { undo, redo } = useHistory();
  const initialShareContext = useMemo(
    () =>
      typeof window === "undefined" ? null : (window.__SHARE_CONTEXT ?? null),
    [],
  );

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

  // The "Make it real" engine-lifecycle cluster — describe/refine into the local engine, the
  // autonomous visual-review/correction loop, slice, manual orient, send-to-printer + outcome,
  // save/reopen/undo/restore/branch of designs, the iteration log, and the
  // printer/material/connector profile-loading effects — extracted whole (v1.5 phase 1d) to
  // hooks/useEngineLifecycle.ts.
  const {
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
  } = useEngineLifecycle({
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
    showModelColors: settings.viewer.showModelColors,
    activeTabRef,
    draftText: draft.text,
    setDraftText,
  });

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

  // The project-directory onboarding + open-file/open-folder cluster — resolving the
  // default project directory, the welcome screen's start actions, and opening a file or
  // folder into the current window — extracted whole (v1.5 phase 1e) to
  // hooks/useProjectOnboarding.ts. openFileInCurrentWindow/openWorkspaceFolderInCurrentWindow
  // it returns are wired into usePersistenceOperations below.
  const {
    isProjectLoading,
    hasCustomProjectDir,
    displayProjectDir,
    handleStartWithDraft,
    handleStartManually,
    handleChangeProjectDirectory,
    openWorkspaceFolderInCurrentWindow,
    openFileInCurrentWindow,
    handleOpenRecent,
    handleOpenFile,
  } = useProjectOnboarding({
    defaultProjectDirectory: settings.project.defaultProjectDirectory,
    hideWelcomeScreen,
    switchTab,
    draftText: draft.text,
    setDraft,
    submitDraft,
    handleEngineDescribe,
  });

  // Save/save-as/save-all + checkUnsavedChanges + the native-menu event bridge cluster —
  // extracted whole (v1.5 phase 1c) to hooks/usePersistenceOperations.ts; the hook
  // subscribes to the same workspace-store singleton App uses. Wired below.

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

  // Save/save-as/save-all, checkUnsavedChanges, the native-menu event bridge (menu:file:*),
  // and the close-requested guard — extracted whole (v1.5 phase 1c) to
  // hooks/usePersistenceOperations.ts.
  usePersistenceOperations({
    activeTabRef,
    tabsRef,
    createNewTab,
    showWelcomeScreen,
    hideWelcomeScreen,
    openFileInCurrentWindow,
    openWorkspaceFolderInCurrentWindow,
  });

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

  // Focused on print-outcome dialog open — a plain DOM-focus concern for the button rendered
  // below, so the ref stays here rather than moving into useEngineLifecycle with the rest of
  // the print-outcome state.
  const printOutcomeCleanRef = useRef<HTMLButtonElement | null>(null);
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
      // lastEngineRidRef comes from useEngineLifecycle (v1.5 phase 1d), not a local useRef()
      // call, so eslint-plugin-react-hooks can no longer infer it's a stable ref — its
      // identity never changes, so listing it here is a no-op, silencing the warning.
      lastEngineRidRef,
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
