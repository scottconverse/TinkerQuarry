import { useCallback, useEffect, useState } from "react";
import { getPlatform, type FileOpenResult } from "../platform";
import { useAnalytics } from "../localAnalytics";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { selectTabs } from "../stores/workspaceSelectors";
import {
  openFileInWindow,
  openWorkspaceFolderInWindow,
  type OpenFileInWindowResult,
  type OpenWorkspaceFolderResult,
} from "../services/windowOpenService";
import type { EngineDocOutcome } from "../services/engineDocument";
import { generateRandomProjectName } from "../utils/projectNaming";
import { removeRecentFile } from "../utils/recentFiles";
import { normalizeAppError, notifyError } from "../utils/notifications";
import { OPENSCAD_FILE_FILTERS } from "../utils/fileFilters";
import { isOpenScadProjectFilePath } from "../../../../packages/shared/src/openscadProjectFiles";
import type { AiDraft } from "../types/aiChat";

export interface ProjectOnboardingTargets {
  /** Settings-configured default project directory ("" if unset) — App.tsx reads it via
   * useSettings() and threads it in so both sides observe the same value. */
  defaultProjectDirectory: string;
  hideWelcomeScreen: () => void;
  /** From useFileTreeOperations — switches the active tab, used when a recent file is
   * already open in another tab. */
  switchTab: (id: string) => Promise<void>;
  /** From useAiAgent — the current draft prompt text, and the setter/submit used when the
   * welcome screen's "start" action needs to fall back to the conversational agent. */
  draftText: string;
  setDraft: (draft: AiDraft) => void;
  submitDraft: (draftOverride?: AiDraft) => Promise<void>;
  /** From useEngineLifecycle — the local-engine describe call the welcome screen's "start
   * with a prompt" action prefers over the conversational agent (PRD §6.1 local-first). */
  handleEngineDescribe: (prompt: string) => Promise<EngineDocOutcome>;
}

/**
 * The project-directory onboarding + open-file/open-folder cluster, extracted whole from
 * App.tsx (v1.5 App.tsx extraction, phase 1e): resolving the effective default project
 * directory, picking/creating it on disk, the welcome screen's "start with a prompt" /
 * "start manually" actions, and opening a file or folder into the current window (from the
 * Open dialog, the recent-files list, or — via the returned wrapper functions — the
 * native-menu event bridge in usePersistenceOperations). Behavior is verbatim. The hook owns
 * its own local state (useState) for this cluster; the workspace/AI-draft/engine plumbing it
 * reads or calls is still owned by App.tsx and threaded in via `targets`, mirroring
 * usePersistenceOperations (phase 1c) and useEngineLifecycle (phase 1d).
 */
export function useProjectOnboarding({
  defaultProjectDirectory,
  hideWelcomeScreen,
  switchTab,
  draftText,
  setDraft,
  submitDraft,
  handleEngineDescribe,
}: ProjectOnboardingTargets) {
  const analytics = useAnalytics();
  const { capabilities } = getPlatform();
  const tabs = useWorkspaceStore(selectTabs);

  const [isProjectLoading, setIsProjectLoading] = useState(false);
  const [resolvedProjectDir, setResolvedProjectDir] = useState<string | null>(
    null,
  );
  /** Pre-generated project name shown on welcome screen (not yet created on disk) */
  const [pendingProjectName, setPendingProjectName] = useState<string>(() =>
    generateRandomProjectName(),
  );

  // Resolve the effective default project directory from settings or platform default
  useEffect(() => {
    if (!capabilities.hasFileSystem) return;
    const configured = defaultProjectDirectory;
    if (configured) {
      setResolvedProjectDir(configured);
    } else {
      void getPlatform()
        .getDefaultProjectsDirectory()
        .then((dir) => {
          if (dir) setResolvedProjectDir(dir);
        });
    }
  }, [capabilities.hasFileSystem, defaultProjectDirectory]);

  // Track whether the user explicitly chose a directory (persisted setting
  // or ephemeral welcome-screen pick). When true, we use the directory
  // directly instead of creating a random-named subdirectory.
  const [hasEphemeralProjectDir, setHasEphemeralProjectDir] = useState(false);
  const hasCustomProjectDir = !!defaultProjectDirectory || hasEphemeralProjectDir;
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
      const prompt = (draftOverride?.text ?? draftText ?? "").trim();
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
      draftText,
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
    ): Promise<OpenWorkspaceFolderResult> => {
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
      result: FileOpenResult,
      options: {
        source?: "open" | "menu_open" | "recent";
      } = {},
    ): Promise<OpenFileInWindowResult> => {
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

  return {
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
  };
}
