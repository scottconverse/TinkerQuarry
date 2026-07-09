import { useState, useEffect, useMemo } from "react";
import type { ModelSelectionSurface } from "../localAnalytics";
import { Button, IconButton, Text } from "./ui";
import { AiComposer } from "./AiComposer";
import { ModelSelector } from "./ModelSelector";
import {
  TbCopy,
  TbFileText,
  TbFolder,
  TbFolderOpen,
  TbDownload,
  TbPencil,
  TbUpload,
} from "react-icons/tb";
import { getPlatform } from "../platform";
import { type AiProvider } from "../stores/apiKeyStore";
import type { AiDraft, AttachmentStore } from "../types/aiChat";
import {
  loadRecentFiles,
  removeRecentFile,
  saveRecentFiles,
  type RecentFile,
} from "../utils/recentFiles";
import {
  describeModelPull,
  engine,
  modelPullFinished,
  type ModelPullProgressResult,
  type ModelStatusResult,
  type SavedDesignEntry,
} from "../services/engineClient";
import { isOpenScadProjectFilePath } from "../../../../packages/shared/src/openscadProjectFiles";

export type RecentFileOpenResult = "opened" | "removed" | "cancelled";

interface WelcomeScreenProps {
  draft: AiDraft;
  attachments: AttachmentStore;
  draftErrors: string[];
  draftVisionBlockMessage?: string | null;
  draftVisionWarningMessage?: string | null;
  canSubmitDraft: boolean;
  isProcessingAttachments: boolean;
  onDraftTextChange: (text: string) => void;
  onDraftFilesSelected: (
    files: File[],
    sourceSurface?: ModelSelectionSurface,
  ) => void;
  onDraftRemoveAttachment: (
    attachmentId: string,
    sourceSurface?: ModelSelectionSurface,
  ) => void;
  onStartWithDraft: (draftOverride?: AiDraft) => void;
  onStartManually: () => void;
  /** Reopen a saved engine design (§6.12 "My Designs"). */
  onReopenDesign?: (id: string) => void;
  onOpenRecent: (
    path: string,
    type?: "file" | "folder",
  ) => Promise<RecentFileOpenResult>;
  onOpenFile?: () => void;
  onOpenFolder?: () => void;
  onOpenSettings?: () => void;
  showRecentFiles?: boolean;
  currentProvider?: AiProvider;
  currentModel?: string;
  availableProviders?: AiProvider[];
  onModelChange?: (
    model: string,
    sourceSurface?: ModelSelectionSurface,
    provider?: AiProvider,
  ) => void;
  /** Resolved default project directory path (null on web → hidden) */
  projectDirectory?: string | null;
  /** Called when user clicks "Change" to pick a different default project directory */
  onChangeProjectDirectory?: () => void;
  /** Whether the user has explicitly configured a custom project directory */
  hasCustomProjectDirectory?: boolean;
}

const EXAMPLE_PROMPTS = [
  "Create a 3D printable mini lamp",
  "Design a parametric phone stand",
  "Make a custom gear with 20 teeth",
  "Create a simple mounting bracket",
  "Design a pencil holder with holes",
];

const SOURCE_ENGINE_STEPS = [
  "cd packages\\engine",
  "py -3.13 -m venv .venv",
  ".venv\\Scripts\\python.exe -m pip install -r requirements.lock",
  ".venv\\Scripts\\python.exe -m pip install -e .",
  "$env:TINKERQUARRY_DEV_TOKEN = \"tq-dev-token\"",
  ".venv\\Scripts\\kimcad.exe web --port 8765 --demo",
];

export function WelcomeScreen({
  draft,
  attachments,
  draftErrors,
  draftVisionBlockMessage,
  draftVisionWarningMessage,
  isProcessingAttachments,
  onDraftTextChange,
  onDraftFilesSelected,
  onDraftRemoveAttachment,
  onStartWithDraft,
  onStartManually,
  onReopenDesign,
  onOpenRecent,
  onOpenFile,
  onOpenFolder,
  onOpenSettings,
  showRecentFiles = true,
  currentProvider,
  currentModel = "claude-sonnet-4-5",
  availableProviders = [],
  onModelChange,
  projectDirectory,
  onChangeProjectDirectory,
  hasCustomProjectDirectory,
}: WelcomeScreenProps) {
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>([]);
  const [recentFilesReady, setRecentFilesReady] = useState(!showRecentFiles);
  const [modelStatus, setModelStatus] = useState<ModelStatusResult | null>(
    null,
  );
  const [modelStatusError, setModelStatusError] = useState<string | null>(null);
  const [modelPull, setModelPull] = useState<ModelPullProgressResult | null>(
    null,
  );
  const [modelPulling, setModelPulling] = useState(false);
  // W-2: the native (Tauri) app bundles + auto-starts its engine; the source-checkout
  // recovery steps only make sense in a browser dev session.
  const isNativeApp = getPlatform().capabilities.hasNativeMenu;
  const [portableImportError, setPortableImportError] = useState<string | null>(
    null,
  );
  // §6.12 "My Designs": the engine's saved designs, the "recent surface on entry".
  const [savedDesigns, setSavedDesigns] = useState<SavedDesignEntry[]>([]);
  const refreshSavedDesigns = async () => {
    const r = await engine.listDesigns();
    if (r.ok && Array.isArray(r.data.designs)) setSavedDesigns(r.data.designs);
  };
  useEffect(() => {
    if (!onReopenDesign) return;
    let cancelled = false;
    void engine.listDesigns().then((r) => {
      if (!cancelled && r.ok && Array.isArray(r.data.designs))
        setSavedDesigns(r.data.designs);
    });
    return () => {
      cancelled = true;
    };
  }, [onReopenDesign]);
  // §6.12 manage: a two-step delete (the × arms an inline Delete/Cancel) so a saved design isn't
  // lost to a stray click. On success the entry is dropped from the list in place.
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const handleDeleteDesign = async (id: string) => {
    const r = await engine.deleteDesign(id);
    setConfirmDeleteId(null);
    if (r.ok) setSavedDesigns((s) => s.filter((x) => x.id !== id));
  };
  const handleRenameDesign = async (design: SavedDesignEntry) => {
    const nextName = window.prompt("Rename design", design.name)?.trim();
    if (!nextName || nextName === design.name) return;
    const r = await engine.renameDesign(design.id, nextName);
    if (r.ok) {
      setSavedDesigns((s) =>
        s.map((x) => (x.id === design.id ? { ...x, name: nextName } : x)),
      );
    }
  };
  const handleDuplicateDesign = async (design: SavedDesignEntry) => {
    const r = await engine.duplicateDesign(design.id);
    if (!r.ok || !r.data.id) return;
    setSavedDesigns((s) => [
      {
        ...design,
        id: r.data.id!,
        name: `${design.name} (copy)`,
        created_at: new Date().toISOString(),
      },
      ...s,
    ]);
  };
  const handleExportPortableDesign = async (design: SavedDesignEntry) => {
    const r = await engine.exportDesign(design.id);
    if (!r.ok || !(r.data instanceof Uint8Array)) return;
    const safeName =
      design.name
        .trim()
        .split("")
        .map((char) => {
          const code = char.charCodeAt(0);
          return code < 32 || '<>:"/\\|?*'.includes(char) ? "-" : char;
        })
        .join("")
        .replace(/\.+$/g, "")
        .slice(0, 80) || "tinkerquarry-design";
    await getPlatform().fileExport(r.data, `${safeName}.kimcad`, [
      { name: "TinkerQuarry Design", extensions: ["kimcad"] },
    ]);
  };
  const handleImportPortableDesign = async () => {
    setPortableImportError(null);
    const file = await getPlatform().fileOpenBinary([
      { name: "TinkerQuarry Design", extensions: ["kimcad"] },
    ]);
    if (!file) return;
    const r = await engine.importDesign(file.content);
    if (!r.ok || !r.data.id) {
      setPortableImportError(
        r.data.error ||
          "Start the local engine, then try importing this TinkerQuarry design again.",
      );
      return;
    }
    await refreshSavedDesigns();
    onReopenDesign?.(r.data.id);
  };
  // TinkerQuarry (PRD §6.1, local-first): the bundled local engine is always the brain, so the
  // describe surface is always available — there is no "configure a provider" wall.
  const hasApiKey: boolean = true;
  const canSubmitLocalDraft =
    draft.text.trim().length > 0 && draftErrors.length === 0;
  const showModelSelector = availableProviders.length > 0;
  const modelReady =
    modelStatus?.backend === "cloud" ||
    Boolean(
      modelStatus?.running &&
      modelStatus.model_present &&
      modelStatus.vision_present !== false,
    );
  const modelNeedsSetup =
    modelStatus != null &&
    modelStatus.backend === "local" &&
    (!modelStatus.running ||
      !modelStatus.model_present ||
      modelStatus.vision_present === false);
  const canBuildLocalDraft = canSubmitLocalDraft && modelReady;

  const refreshModelStatus = async () => {
    const r = await engine.modelStatus();
    if (r.ok) {
      setModelStatus(r.data);
      setModelStatusError(null);
    } else {
      setModelStatus(null);
      setModelStatusError(r.data.error || "Could not reach the local engine.");
    }
  };

  useEffect(() => {
    let cancelled = false;
    void engine.modelStatus().then((r) => {
      if (cancelled) return;
      if (r.ok) {
        setModelStatus(r.data);
        setModelStatusError(null);
      } else {
        setModelStatus(null);
        setModelStatusError(
          r.data.error || "Could not reach the local engine.",
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSetupModels = async () => {
    setModelPulling(true);
    const start = await engine.modelPull();
    setModelPull(start.data);
    if (!start.ok) {
      setModelStatusError(
        start.data.error || "Could not start local model setup.",
      );
      setModelPulling(false);
      return;
    }
    const poll = window.setInterval(() => {
      void engine.modelPullProgress().then((r) => {
        if (!r.ok) {
          setModelStatusError(
            r.data.error || "Could not read model setup progress.",
          );
          window.clearInterval(poll);
          setModelPulling(false);
          return;
        }
        setModelPull(r.data);
        // Gate 2026-07-09 (W-1/T4): completion lives in the per-row snapshot (running flag +
        // every row done/error) — the flat done/status fields this used to read never exist,
        // so the interval previously never cleared.
        if (modelPullFinished(r.data)) {
          window.clearInterval(poll);
          setModelPulling(false);
          const failed = Object.values(r.data.models ?? {}).find(
            (row) => row.status === "error",
          );
          if (failed) {
            setModelStatusError(
              failed.error || "Local AI setup failed. Try again.",
            );
          }
          void refreshModelStatus();
        }
      });
    }, 1000);
  };

  // Shorten home directory to ~/ for display
  const displayPath = useMemo(() => {
    if (!projectDirectory) return null;
    try {
      // Match /Users/<username>/ or /home/<username>/
      return projectDirectory.replace(/^\/(?:Users|home)\/[^/]+/, "~");
    } catch {
      return projectDirectory;
    }
  }, [projectDirectory]);

  useEffect(() => {
    if (!showRecentFiles) {
      setRecentFiles([]);
      setRecentFilesReady(true);
      return;
    }

    let cancelled = false;

    const loadAndValidateRecentFiles = async () => {
      const stored = loadRecentFiles();
      const platform = getPlatform();

      if (!platform.capabilities.hasFileSystem) {
        if (!cancelled) {
          setRecentFiles(stored);
          setRecentFilesReady(true);
        }
        return;
      }

      const validity = await Promise.all(
        stored.map(async (file) => ({
          file,
          exists: await platform.fileExists(file.path),
        })),
      );

      if (cancelled) return;

      const validFiles = validity
        .filter((entry) => entry.exists)
        .map((entry) => entry.file);
      if (validFiles.length !== stored.length) {
        saveRecentFiles(validFiles);
      }

      setRecentFiles(validFiles);
      setRecentFilesReady(true);
    };

    void loadAndValidateRecentFiles();

    return () => {
      cancelled = true;
    };
  }, [showRecentFiles]);

  const handleOpenRecent = async (file: RecentFile) => {
    const result = await onOpenRecent(file.path, file.type);
    if (result === "removed") {
      setRecentFiles(removeRecentFile(file.path));
    }
  };

  return (
    <div
      data-testid="welcome-screen"
      role="main"
      className="h-full flex flex-col items-center justify-center px-8"
      style={{ backgroundColor: "var(--bg-primary)" }}
    >
      <div className="w-full max-w-3xl space-y-8">
        <div className="space-y-2 text-center">
          <Text variant="page-heading">TinkerQuarry</Text>
          <Text variant="body" color="secondary">
            Describe a printable part, turn it into local CAD, then slice it for
            the printer you choose.
          </Text>
        </div>

        {hasApiKey ? (
          <div
            data-testid="welcome-ai-entry"
            className="space-y-6 ph-no-capture"
          >
            <div>
              <AiComposer
                draft={draft}
                attachments={attachments}
                isProcessingAttachments={isProcessingAttachments}
                canSubmit={canBuildLocalDraft}
                blockedMessage={draftVisionBlockMessage}
                warningMessage={draftVisionWarningMessage}
                errors={draftErrors}
                placeholder="Describe what you want to build..."
                rows={3}
                variant="welcome"
                submitLabel="Build"
                submitTitle="Build"
                trailingControls={
                  showModelSelector ? (
                    <ModelSelector
                      currentModel={currentModel}
                      currentProvider={currentProvider}
                      availableProviders={availableProviders}
                      onChange={(model, provider) =>
                        onModelChange?.(model, "welcome", provider)
                      }
                      compact
                    />
                  ) : null
                }
                onTextChange={onDraftTextChange}
                onFilesSelected={onDraftFilesSelected}
                onRemoveAttachment={onDraftRemoveAttachment}
                onSubmit={onStartWithDraft}
              />
              <div
                role={modelReady ? "status" : "alert"}
                data-testid="welcome-model-status"
                className="mt-3 rounded-md border px-3 py-2 text-xs"
                style={{
                  backgroundColor: "var(--bg-secondary)",
                  borderColor: modelReady
                    ? "var(--border-secondary)"
                    : "var(--color-warning)",
                  color: "var(--text-secondary)",
                }}
              >
                {modelReady ? (
                  <span>
                    Local AI ready: {modelStatus?.model}
                    {modelStatus?.vision_model
                      ? ` + ${modelStatus.vision_model}`
                      : ""}
                  </span>
                ) : modelStatusError ? (
                  <div className="space-y-2">
                    <div style={{ color: "var(--text-primary)" }}>
                      {modelStatusError}
                    </div>
                    {isNativeApp ? (
                      // Gate 2026-07-09 (W-2): the installed app bundles and auto-starts its
                      // engine — venv/pip developer steps are meaningless (and alarming) here.
                      <div>
                        The engine starts with the app. Wait a few seconds and
                        click Check again; if it keeps failing, restart
                        TinkerQuarry.
                      </div>
                    ) : (
                      <>
                        <div>
                          In a source checkout, run these PowerShell commands
                          once to start the engine:
                        </div>
                        <ol className="list-decimal space-y-1 pl-5">
                          {SOURCE_ENGINE_STEPS.map((step) => (
                            <li key={step}>
                              <code>{step}</code>
                            </li>
                          ))}
                        </ol>
                      </>
                    )}
                  </div>
                ) : modelNeedsSetup ? (
                  <span>
                    Local AI setup needed for {modelStatus.model}
                    {modelStatus.vision_model
                      ? ` + ${modelStatus.vision_model}`
                      : ""}
                    .
                  </span>
                ) : (
                  <span>Checking local AI...</span>
                )}
                {modelStatusError ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="ml-3"
                    onClick={() => {
                      void refreshModelStatus();
                    }}
                  >
                    Check again
                  </Button>
                ) : modelNeedsSetup ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="ml-3"
                    disabled={modelPulling}
                    onClick={() => {
                      void handleSetupModels();
                    }}
                  >
                    {modelPulling ? "Setting up..." : "Set up local AI"}
                  </Button>
                ) : null}
                {modelPull && !modelReady && describeModelPull(modelPull) && (
                  <span
                    className="ml-3"
                    data-testid="welcome-model-pull-progress"
                  >
                    {describeModelPull(modelPull)}
                  </span>
                )}
              </div>
              {displayPath && (
                <div
                  className="flex items-center gap-2 mt-2"
                  data-testid="welcome-project-directory"
                >
                  <TbFolderOpen
                    size={14}
                    style={{ color: "var(--text-tertiary)", flexShrink: 0 }}
                  />
                  <Text
                    variant="caption"
                    color="tertiary"
                    className="truncate"
                    title={projectDirectory!}
                  >
                    {displayPath}
                  </Text>
                  {onChangeProjectDirectory && (
                    <a
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        onChangeProjectDirectory();
                      }}
                      className="text-xs shrink-0 underline hover:no-underline"
                      style={{ color: "var(--accent-primary)" }}
                    >
                      Change
                    </a>
                  )}
                </div>
              )}
            </div>
            <div className="space-y-3">
              <Text variant="section-heading" weight="medium" color="secondary">
                Try an example:
              </Text>
              <div className="flex flex-wrap gap-2">
                {EXAMPLE_PROMPTS.map((example) => (
                  <Button
                    key={example}
                    variant="secondary"
                    onClick={() => {
                      if (!hasApiKey || !modelReady) return;
                      onStartWithDraft({ text: example, attachmentIds: [] });
                    }}
                    disabled={!hasApiKey || !modelReady}
                    title={
                      !hasApiKey
                        ? "Configure an AI provider in Settings to use AI"
                        : !modelReady
                          ? "Set up local AI before starting an example"
                          : example
                    }
                  >
                    {example}
                  </Button>
                ))}
              </div>
              {!modelReady && (
                <Text variant="caption" color="tertiary">
                  Examples need the local engine. You can still import a saved
                  design, open a file, or start from code.
                </Text>
              )}
            </div>
          </div>
        ) : hasApiKey === false ? (
          <div
            className="rounded-lg p-4 text-center"
            style={{
              backgroundColor: "var(--bg-secondary)",
              border: "1px solid var(--border-secondary)",
            }}
          >
            <Text variant="body" className="mb-2">
              Configure an AI provider to use the AI assistant
            </Text>
            <Text variant="caption" color="tertiary">
              <a
                href="#"
                onClick={(event) => {
                  event.preventDefault();
                  onOpenSettings?.();
                }}
                className="underline hover:no-underline"
                style={{ color: "var(--accent-primary)" }}
              >
                Open Settings
              </a>{" "}
              to configure (⌘,)
            </Text>
          </div>
        ) : null}

        {onReopenDesign && (
          <div className="space-y-3 -mt-2" data-testid="welcome-my-designs">
            <div className="flex items-center justify-between gap-3">
              <Text variant="section-heading" weight="medium" color="secondary">
                My Designs:
              </Text>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void handleImportPortableDesign()}
                data-testid="import-kimcad-design"
                className="gap-1.5"
              >
                <TbUpload size={14} aria-hidden="true" />
                Import .kimcad
              </Button>
            </div>
            {savedDesigns.length === 0 ? (
              <Text variant="caption" color="tertiary">
                Built parts you save or import will appear here.
              </Text>
            ) : (
              <div className="flex flex-wrap gap-2">
                {savedDesigns.slice(0, 12).map((d) =>
                  confirmDeleteId === d.id ? (
                    <div
                      key={d.id}
                      className="inline-flex items-center gap-2 px-3 rounded-md border text-xs"
                      style={{ borderColor: "var(--border-primary)" }}
                    >
                      <span style={{ color: "var(--text-secondary)" }}>
                        Delete &ldquo;{d.name}&rdquo;?
                      </span>
                      <Button
                        variant="danger"
                        size="sm"
                        data-testid={`confirm-delete-${d.id}`}
                        onClick={() => void handleDeleteDesign(d.id)}
                        className="font-medium"
                      >
                        Delete
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setConfirmDeleteId(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <div key={d.id} className="inline-flex items-stretch">
                      <Button
                        variant="secondary"
                        onClick={() => onReopenDesign(d.id)}
                        title={`Reopen "${d.name}"${d.object_type ? ` · ${d.object_type}` : ""}`}
                        className="rounded-r-none"
                      >
                        {d.name}
                      </Button>
                      <IconButton
                        size="sm"
                        variant="toolbar"
                        data-testid={`rename-design-${d.id}`}
                        onClick={() => void handleRenameDesign(d)}
                        aria-label={`Rename ${d.name}`}
                        title={`Rename "${d.name}"`}
                        className="rounded-none border-l-0"
                      >
                        <TbPencil size={14} aria-hidden="true" />
                      </IconButton>
                      <IconButton
                        size="sm"
                        variant="toolbar"
                        data-testid={`duplicate-design-${d.id}`}
                        onClick={() => void handleDuplicateDesign(d)}
                        aria-label={`Duplicate ${d.name}`}
                        title={`Duplicate "${d.name}"`}
                        className="rounded-none border-l-0"
                      >
                        <TbCopy size={14} aria-hidden="true" />
                      </IconButton>
                      <IconButton
                        size="sm"
                        variant="toolbar"
                        data-testid={`export-design-${d.id}`}
                        onClick={() => void handleExportPortableDesign(d)}
                        aria-label={`Export ${d.name}`}
                        title={`Export "${d.name}" as .kimcad`}
                        className="rounded-none border-l-0"
                      >
                        <TbDownload size={14} aria-hidden="true" />
                      </IconButton>
                      <IconButton
                        size="sm"
                        variant="toolbar"
                        data-testid={`delete-design-${d.id}`}
                        onClick={() => setConfirmDeleteId(d.id)}
                        aria-label={`Delete ${d.name}`}
                        title={`Delete "${d.name}"`}
                        className="rounded-l-none border-l-0"
                      >
                        ×
                      </IconButton>
                    </div>
                  ),
                )}
              </div>
            )}
            {portableImportError && (
              <div
                role="alert"
                className="rounded-md border px-3 py-2 text-xs"
                style={{
                  borderColor: "var(--color-error)",
                  color: "var(--color-error)",
                  backgroundColor: "var(--bg-secondary)",
                }}
              >
                {portableImportError}
              </div>
            )}
          </div>
        )}

        {showRecentFiles && recentFilesReady && recentFiles.length > 0 && (
          <div className="space-y-3 -mt-2">
            <Text variant="section-heading" weight="medium" color="secondary">
              Recent:
            </Text>
            <div className="space-y-2">
              {/* eslint-disable no-restricted-syntax -- recent file rows are card-like list items with internal layout (icon + text + chevron); <Button> doesn't support full-width card layouts with multiple child columns */}
              {recentFiles.map((file) => (
                <button
                  key={file.path}
                  onClick={() => {
                    void handleOpenRecent(file);
                  }}
                  className="w-full text-left px-4 py-3 rounded-lg transition-colors border flex items-center justify-between group"
                  style={{
                    backgroundColor: "var(--bg-secondary)",
                    borderColor: "var(--border-primary)",
                  }}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div
                      className="flex items-center justify-center shrink-0"
                      style={{ color: "var(--text-tertiary)" }}
                      aria-hidden="true"
                    >
                      {file.type === "folder" ||
                      !isOpenScadProjectFilePath(file.path) ? (
                        <TbFolder size={22} />
                      ) : (
                        <TbFileText size={22} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div
                        className="text-sm font-medium"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {file.name}
                      </div>
                      <div
                        className="text-xs truncate"
                        style={{ color: "var(--text-tertiary)" }}
                        title={file.path}
                      >
                        {file.path}
                      </div>
                    </div>
                  </div>
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    style={{ color: "var(--text-tertiary)" }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </button>
              ))}
              {/* eslint-enable no-restricted-syntax */}
            </div>
          </div>
        )}

        <div className="flex justify-center gap-4">
          {onOpenFile && (
            <Button
              variant="secondary"
              onClick={onOpenFile}
              className="text-sm gap-1.5"
              data-testid="welcome-open-file"
            >
              <TbFileText className="size-4" />
              Open File
            </Button>
          )}
          {onOpenFolder && (
            <Button
              variant="secondary"
              onClick={onOpenFolder}
              className="text-sm gap-1.5"
              data-testid="welcome-open-folder"
            >
              <TbFolder className="size-4" />
              Open Folder
            </Button>
          )}
          <Button
            variant="ghost"
            onClick={onStartManually}
            className="text-sm"
            data-testid="welcome-start-empty-project"
          >
            {hasCustomProjectDirectory
              ? "Start in folder →"
              : "Start from code →"}
          </Button>
        </div>
      </div>
    </div>
  );
}
