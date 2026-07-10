import { useCallback, useRef, useState } from "react";
import { useAnalytics } from "../localAnalytics";
import { getPlatform } from "../platform";
import { openPanel } from "../stores/layoutStore";
import { DEFAULT_TAB_NAME } from "../stores/workspaceFactories";
import {
  getWorkspaceState,
  useWorkspaceStore,
} from "../stores/workspaceStore";
import { selectActiveTabId, selectTabs } from "../stores/workspaceSelectors";
import type { WorkspaceTab } from "../stores/workspaceTypes";
import { getProjectStore } from "../stores/projectStore";
import { isValidDrop } from "../utils/isValidDrop";
import { revokeBlobUrl } from "../utils/blobUrls";
import { notifyError } from "../utils/notifications";

/**
 * Returns a path that does not conflict with any path in `existing`.
 * Appends _1, _2, … to the filename stem until a free slot is found.
 * (Moved verbatim from App.tsx — its only callers live in this hook.)
 */
function resolvePathConflict(
  candidatePath: string,
  existing: Set<string>,
): string {
  if (!existing.has(candidatePath)) return candidatePath;
  const lastSlash = candidatePath.lastIndexOf("/");
  const lastDot = candidatePath.lastIndexOf(".");
  const hasExt = lastDot > lastSlash + 1;
  const stem = hasExt ? candidatePath.slice(0, lastDot) : candidatePath;
  const ext = hasExt ? candidatePath.slice(lastDot) : "";
  let i = 1;
  while (existing.has(`${stem}_${i}${ext}`)) i++;
  return `${stem}_${i}${ext}`;
}

/**
 * The file-tree & tab/project-file CRUD cluster, extracted whole from App.tsx
 * (v1.5 App.tsx extraction, phase 1b). Behavior is verbatim; the hook subscribes to the
 * same workspace-store singleton App uses, so both see identical state. The handlers
 * reference each other (handleFileTreeClick → switchTab/createNewTab, deletes →
 * closeTabLocal + reset-to-untitled), which is why the cluster moves as one unit.
 */
export function useFileTreeOperations() {
  const analytics = useAnalytics();
  const { capabilities } = getPlatform();
  const tabs = useWorkspaceStore(selectTabs);
  const activeTabId = useWorkspaceStore(selectActiveTabId) ?? "";
  const createTab = useWorkspaceStore((state) => state.createTab);
  const setActiveTab = useWorkspaceStore((state) => state.setActiveTab);
  const markTabSaved = useWorkspaceStore((state) => state.markTabSaved);
  const renameTab = useWorkspaceStore((state) => state.renameTab);
  const closeTabLocal = useWorkspaceStore((state) => state.closeTabLocal);
  const reorderWorkspaceTabs = useWorkspaceStore((state) => state.reorderTabs);

  const createNewTab = useCallback(
    (filePath?: string | null, content?: string, name?: string): string => {
      const projectPath = name ?? DEFAULT_TAB_NAME;
      const defaultContent =
        "// Type your OpenSCAD code here\ncube([10, 10, 10]);";

      // Ensure the file exists in projectStore
      const store = getProjectStore().getState();
      if (!store.files[projectPath]) {
        store.addFile(projectPath, content ?? defaultContent);
      }

      const newId = createTab({
        filePath: filePath || null,
        name,
        projectPath,
      });
      return newId;
    },
    [createTab],
  );

  const switchingRef = useRef(false);
  const [editorFocusRequestKey, setEditorFocusRequestKey] = useState(0);

  const focusEditorPanel = useCallback(() => {
    openPanel("editor", "editor", "Editor");
    setEditorFocusRequestKey((current) => current + 1);
  }, []);

  const switchTab = useCallback(
    async (id: string) => {
      if (id === activeTabId || switchingRef.current) return;
      switchingRef.current = true;

      setActiveTab(id);
      // Editor handles model switching via multi-model; no need to updateSource.
      // source only tracks the render target content for the render pipeline.

      switchingRef.current = false;
    },
    [activeTabId, setActiveTab],
  );

  const closeTab = useCallback(
    async (id: string) => {
      const tab = tabs.find((t) => t.id === id);
      if (!tab) return;

      const isDirty =
        getProjectStore().getState().files[tab.projectPath]?.isDirty ?? false;
      if (isDirty && capabilities.hasFileSystem) {
        const platform = getPlatform();
        const wantsToSave = await platform.ask(`Save changes to ${tab.name}?`, {
          title: "Unsaved Changes",
          kind: "warning",
          okLabel: "Save",
          cancelLabel: "Don't Save",
        });

        if (wantsToSave) {
          return;
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
          if (!confirmDiscard) return;
        }

        // Revert file content to saved state so the file tree dirty indicator clears
        getProjectStore().getState().revertFile(tab.projectPath);
      }

      revokeBlobUrl(tab.render.previewSrc);
      closeTabLocal(id);
      analytics.track("tab closed", { had_unsaved_changes: isDirty });

      // If closing this tab caused workspace to reset to welcome, also reset project
      const wsState = getWorkspaceState();
      if (
        wsState.showWelcome &&
        wsState.tabs.length === 1 &&
        !wsState.tabs[0].filePath
      ) {
        getProjectStore().getState().resetToUntitledProject();
      }
    },
    [analytics, closeTabLocal, tabs, capabilities.hasFileSystem],
  );

  const reorderTabs = useCallback(
    (newTabs: WorkspaceTab[]) => {
      reorderWorkspaceTabs(newTabs.map((tab) => tab.id));
    },
    [reorderWorkspaceTabs],
  );

  // File tree handlers
  const handleFileTreeClick = useCallback(
    (filePath: string) => {
      focusEditorPanel();

      // Find existing tab for this file (by projectPath)
      const existingTab = tabs.find((t) => t.projectPath === filePath);
      if (existingTab) {
        switchTab(existingTab.id);
        return;
      }

      // Open the file in a new tab — content lives in projectStore
      const store = getProjectStore().getState();
      const projectFile = store.files[filePath];
      if (projectFile) {
        // Resolve absolute disk path so Cmd+S can save without a dialog
        const absolutePath = store.projectRoot
          ? `${store.projectRoot}/${filePath}`
          : null;
        createNewTab(absolutePath, undefined, filePath);
      }
    },
    [tabs, switchTab, createNewTab, focusEditorPanel],
  );

  const handleCreateFile = useCallback(
    async (parentDir: string): Promise<string> => {
      let baseName = "new_file.scad";
      const store = getProjectStore().getState();
      const prefix = parentDir ? `${parentDir}/` : "";

      // Find a unique name
      let counter = 1;
      let path = `${prefix}${baseName}`;
      while (path in store.files) {
        baseName = `new_file_${counter}.scad`;
        path = `${prefix}${baseName}`;
        counter++;
      }

      const content = "";
      store.addFile(path, content, { isVirtual: store.projectRoot === null });

      // Write to disk on desktop
      if (store.projectRoot) {
        const platform = getPlatform();
        const absolutePath = `${store.projectRoot}/${path}`;
        await platform.writeTextFile(absolutePath, content);
        // Mark as saved since we just wrote it
        store.markFileSaved(path, content);
      }

      // Open in a new tab
      const absolutePath = store.projectRoot
        ? `${store.projectRoot}/${path}`
        : null;
      createNewTab(absolutePath, content, path);
      analytics.track("file created", { in_subfolder: parentDir !== "" });

      return path;
    },
    [analytics, createNewTab],
  );

  const handleCreateFolder = useCallback(
    async (parentDir: string, folderName: string): Promise<void> => {
      const store = getProjectStore().getState();
      const folderPath = parentDir ? `${parentDir}/${folderName}` : folderName;
      if (store.projectRoot) {
        await getPlatform().createDirectory(
          `${store.projectRoot}/${folderPath}`,
        );
      }
      store.addFolder(folderPath);
      analytics.track("folder created", { in_subfolder: parentDir !== "" });
    },
    [analytics],
  );

  const handleRenameFile = useCallback(
    async (oldPath: string, newName: string) => {
      const store = getProjectStore().getState();
      const parentDir = oldPath.includes("/")
        ? oldPath.substring(0, oldPath.lastIndexOf("/"))
        : "";
      const newPath = parentDir ? `${parentDir}/${newName}` : newName;

      if (newPath === oldPath) return;
      if (newPath in store.files) return; // Name already taken

      store.renameFile(oldPath, newPath);

      // Rename on disk
      if (store.projectRoot) {
        const platform = getPlatform();
        await platform.renameFile(
          `${store.projectRoot}/${oldPath}`,
          `${store.projectRoot}/${newPath}`,
        );
      }

      // Update any open tab that references this file
      const tab = tabs.find((t) => t.projectPath === oldPath);
      if (tab) {
        const absolutePath = store.projectRoot
          ? `${store.projectRoot}/${newPath}`
          : null;
        markTabSaved(tab.id, { filePath: absolutePath, name: newName });
        renameTab(tab.id, newName, newPath);
      }
      analytics.track("file renamed");
    },
    [analytics, tabs, markTabSaved, renameTab],
  );

  const handleDeleteFile = useCallback(
    async (filePath: string) => {
      const platform = getPlatform();
      const fileName = filePath.split("/").pop() || filePath;

      const confirmed = await platform.confirm(
        `Are you sure you want to delete "${fileName}"?`,
        {
          title: "Delete File",
          kind: "warning",
          okLabel: "Delete",
          cancelLabel: "Cancel",
        },
      );
      if (!confirmed) return;

      const store = getProjectStore().getState();

      // Delete from disk first
      if (store.projectRoot) {
        await platform.deleteFile(`${store.projectRoot}/${filePath}`);
      }

      // Close any open tab for this file
      const tab = tabs.find((t) => t.projectPath === filePath);
      if (tab) {
        revokeBlobUrl(tab.render.previewSrc);
        closeTabLocal(tab.id);
      }

      store.removeFile(filePath);
      analytics.track("file deleted", { had_open_tab: Boolean(tab) });

      // If we deleted everything, reset to a fresh untitled project
      const remaining = Object.keys(store.files);
      if (remaining.length === 0) {
        store.resetToUntitledProject();
        createNewTab(null, undefined, DEFAULT_TAB_NAME);
      }
    },
    [analytics, tabs, closeTabLocal, createNewTab],
  );

  const handleDeleteFolder = useCallback(
    async (folderPath: string) => {
      const platform = getPlatform();
      const store = getProjectStore().getState();
      const prefix = folderPath + "/";
      const affected = Object.keys(store.files).filter((p) =>
        p.startsWith(prefix),
      );
      const folderName = folderPath.split("/").pop() || folderPath;

      const message =
        affected.length > 0
          ? `Delete "${folderName}" and its ${affected.length} file${affected.length === 1 ? "" : "s"}?`
          : `Delete empty folder "${folderName}"?`;

      const confirmed = await platform.confirm(message, {
        title: "Delete Folder",
        kind: "warning",
        okLabel: "Delete",
        cancelLabel: "Cancel",
      });
      if (!confirmed) return;

      // Disk delete first (atomic recursive remove)
      if (store.projectRoot) {
        try {
          await platform.removeDirectory(`${store.projectRoot}/${folderPath}`);
        } catch (error) {
          notifyError({ operation: "delete-folder", error });
          return;
        }
      }

      // Close tabs for affected files
      for (const fp of affected) {
        const tab = tabs.find((t) => t.projectPath === fp);
        if (tab) {
          revokeBlobUrl(tab.render.previewSrc);
          closeTabLocal(tab.id);
        }
      }

      store.removeFolder(folderPath);
      analytics.track("folder deleted", { file_count: affected.length });

      // If we deleted everything, reset to a fresh untitled project
      if (Object.keys(store.files).length === 0) {
        store.resetToUntitledProject();
        createNewTab(null, undefined, DEFAULT_TAB_NAME);
      }
    },
    [analytics, tabs, closeTabLocal, createNewTab],
  );

  const handleSetRenderTarget = useCallback(
    (filePath: string) => {
      getProjectStore().getState().setRenderTarget(filePath);
      analytics.track("render target changed");
    },
    [analytics],
  );

  const handleMoveItem = useCallback(
    async (sourcePath: string, destFolderPath: string, isFolder: boolean) => {
      const store = getProjectStore().getState();
      if (!isValidDrop(sourcePath, isFolder, destFolderPath)) return;
      try {
        const platform = getPlatform();
        if (isFolder) {
          const folderName = sourcePath.split("/").pop()!;
          const newFolderPath = destFolderPath
            ? `${destFolderPath}/${folderName}`
            : folderName;
          if (store.projectRoot) {
            const affected = Object.keys(store.files).filter(
              (p) => p.startsWith(sourcePath + "/") || p === sourcePath,
            );
            // Ensure destination parent directories exist before moving
            const destDirs = new Set(
              affected
                .map((p) => {
                  const newRel = newFolderPath + p.slice(sourcePath.length);
                  const parent = newRel.includes("/")
                    ? newRel.substring(0, newRel.lastIndexOf("/"))
                    : "";
                  return parent ? `${store.projectRoot}/${parent}` : null;
                })
                .filter((d): d is string => d !== null),
            );
            for (const dir of destDirs) {
              await platform.createDirectory(dir);
            }
            for (const oldRel of affected) {
              const newRel = newFolderPath + oldRel.slice(sourcePath.length);
              await platform.renameFile(
                `${store.projectRoot}/${oldRel}`,
                `${store.projectRoot}/${newRel}`,
              );
            }
          }
          store.moveFolder(sourcePath, newFolderPath);
          // Update any open tabs whose paths were under the moved folder
          for (const tab of tabs) {
            if (!tab.projectPath) continue;
            if (
              tab.projectPath.startsWith(sourcePath + "/") ||
              tab.projectPath === sourcePath
            ) {
              const newRel =
                newFolderPath + tab.projectPath.slice(sourcePath.length);
              const absPath = store.projectRoot
                ? `${store.projectRoot}/${newRel}`
                : null;
              markTabSaved(tab.id, {
                filePath: absPath,
                name: newRel.split("/").pop()!,
              });
              renameTab(tab.id, newRel.split("/").pop()!, newRel);
            }
          }
        } else {
          const fileName = sourcePath.split("/").pop()!;
          const rawDest = destFolderPath
            ? `${destFolderPath}/${fileName}`
            : fileName;
          const existingPaths = new Set(Object.keys(store.files));
          existingPaths.delete(sourcePath);
          const newPath = resolvePathConflict(rawDest, existingPaths);
          if (store.projectRoot) {
            const parentDir = newPath.includes("/")
              ? newPath.substring(0, newPath.lastIndexOf("/"))
              : "";
            if (parentDir)
              await platform.createDirectory(
                `${store.projectRoot}/${parentDir}`,
              );
            await platform.renameFile(
              `${store.projectRoot}/${sourcePath}`,
              `${store.projectRoot}/${newPath}`,
            );
          }
          store.renameFile(sourcePath, newPath);
          const tab = tabs.find((t) => t.projectPath === sourcePath);
          if (tab) {
            const absPath = store.projectRoot
              ? `${store.projectRoot}/${newPath}`
              : null;
            markTabSaved(tab.id, {
              filePath: absPath,
              name: newPath.split("/").pop()!,
            });
            renameTab(tab.id, newPath.split("/").pop()!, newPath);
          }
        }
        analytics.track("item moved", { kind: isFolder ? "folder" : "file" });
      } catch (err) {
        notifyError({ operation: "Move failed", error: err });
      }
    },
    [analytics, tabs, markTabSaved, renameTab],
  );

  const handleAddExternalFiles = useCallback(
    async (files: Record<string, string>, targetFolderPath: string) => {
      const store = getProjectStore().getState();
      const existing = new Set(Object.keys(store.files));
      try {
        const platform = getPlatform();
        for (const [relName, content] of Object.entries(files)) {
          const rawPath = targetFolderPath
            ? `${targetFolderPath}/${relName}`
            : relName;
          const finalPath = resolvePathConflict(rawPath, existing);
          existing.add(finalPath);
          store.addFile(finalPath, content, {
            isVirtual: store.projectRoot === null,
          });
          if (store.projectRoot) {
            const parentDir = finalPath.includes("/")
              ? finalPath.substring(0, finalPath.lastIndexOf("/"))
              : "";
            if (parentDir)
              await platform.createDirectory(
                `${store.projectRoot}/${parentDir}`,
              );
            await platform.writeTextFile(
              `${store.projectRoot}/${finalPath}`,
              content,
            );
            store.markFileSaved(finalPath, content);
          }
        }
      } catch (err) {
        notifyError({ operation: "Add external files", error: err });
      }
    },
    [],
  );

  return {
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
  };
}
