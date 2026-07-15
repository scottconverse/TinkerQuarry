import {
  useCallback,
  useEffect,
  useRef,
  type MutableRefObject,
} from "react";
import { useAnalytics } from "../localAnalytics";
import {
  getPlatform,
  eventBus,
  type ExportFormat,
  type FileOpenResult,
} from "../platform";
import { getDockviewApi } from "../stores/layoutStore";
import { DEFAULT_TAB_NAME } from "../stores/workspaceFactories";
import { useWorkspaceStore } from "../stores/workspaceStore";
import type { WorkspaceTab } from "../stores/workspaceTypes";
import { getProjectStore, getRenderTargetContent } from "../stores/projectStore";
import { requestRender } from "../stores/renderRequestStore";
import { loadSettings } from "../stores/settingsStore";
import { formatOpenScadCode } from "../utils/formatter";
import { addRecentFile } from "../utils/recentFiles";
import { getRelativeProjectPath } from "../utils/projectFilePaths";
import { notifyError, notifySuccess } from "../utils/notifications";
import { exportProjectZip } from "../utils/projectZip";
import { exportModelWithContext } from "../services/exportService";
import { isExportValidationError } from "../services/exportErrors";
import { resolveFolderImport } from "../utils/folderImport";
import { OPENSCAD_FILE_FILTERS } from "../utils/fileFilters";
import { isOpenScadProjectFilePath } from "../../../../packages/shared/src/openscadProjectFiles";

/** Prompt the user to pick a folder and return its project files, or null if cancelled.
 * (Moved verbatim from App.tsx — its only caller lives in this hook's menu:file:open_project
 * listener.) */
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

interface PersistenceOperationsTargets {
  /** Current active tab / all tabs, kept live by App.tsx — also read outside this cluster,
   * so the refs themselves stay there and are handed in. */
  activeTabRef: MutableRefObject<WorkspaceTab>;
  tabsRef: MutableRefObject<WorkspaceTab[]>;
  createNewTab: (
    filePath?: string | null,
    content?: string,
    name?: string,
  ) => string;
  showWelcomeScreen: () => void;
  hideWelcomeScreen: () => void;
  openFileInCurrentWindow: (
    result: FileOpenResult,
    options?: { source?: "open" | "menu_open" | "recent" },
  ) => Promise<unknown>;
  openWorkspaceFolderInCurrentWindow: (
    dirPath: string,
    options?: { createIfEmpty?: boolean; source?: "recent" | "menu_open" },
  ) => Promise<unknown>;
}

/**
 * The file save/save-as/save-all + native-menu event bridge cluster, extracted whole from
 * App.tsx (v1.5 App.tsx extraction, phase 1c). Behavior is verbatim, including the
 * pre-existing checkUnsavedChangesRef indirection (a ref reassigned every render so the
 * menu-bridge effect below can always call the latest saveFile closure without listing it
 * as an effect dependency) and the asymmetry in that effect's dependency array (saveAllFiles
 * is listed, saveFile/checkUnsavedChangesRef are not) — deliberately NOT fixed in a refactor
 * diff. The hook subscribes to the same workspace-store singleton App uses for
 * markTabSaved/renameTab.
 */
export function usePersistenceOperations({
  activeTabRef,
  tabsRef,
  createNewTab,
  showWelcomeScreen,
  hideWelcomeScreen,
  openFileInCurrentWindow,
  openWorkspaceFolderInCurrentWindow,
}: PersistenceOperationsTargets): void {
  const analytics = useAnalytics();
  const markTabSaved = useWorkspaceStore((state) => state.markTabSaved);
  const renameTab = useWorkspaceStore((state) => state.renameTab);

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
  }, [markTabSaved, tabsRef]);

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
    [activeTabRef, analytics, markTabSaved, renameTab, saveProjectToDirectory],
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
  }, [markTabSaved, tabsRef]);

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
}
