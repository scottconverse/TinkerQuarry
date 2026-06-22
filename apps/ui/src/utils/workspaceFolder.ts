import type { PlatformBridge } from '../platform';
import { DEFAULT_OPENSCAD_CODE, DEFAULT_TAB_NAME } from '../stores/workspaceFactories';
import { pickOpenScadRenderTarget } from '../../../../packages/shared/src/openscadProjectFiles';

export interface WorkspaceFolderLoadOptions {
  createIfEmpty?: boolean;
}

export interface WorkspaceFolderLoadResult {
  files: Record<string, string>;
  renderTargetPath: string;
  emptyFolders: string[];
  createdDefaultFile: boolean;
}

type WorkspaceFolderPlatform = Pick<
  PlatformBridge,
  'createDirectory' | 'readDirectoryFiles' | 'readSubdirectories' | 'writeTextFile'
>;

/**
 * Given all subdirectory paths and all file paths in a project,
 * return the directories that have no file descendants (empty folders).
 */
export function findEmptyFolders(allDirs: string[], filePaths: string[]): string[] {
  return allDirs.filter((dir) => {
    const prefix = dir + '/';
    return !filePaths.some((filePath) => filePath.startsWith(prefix));
  });
}

function getWorkspaceName(dirPath: string): string | null {
  const normalizedPath = dirPath.replace(/\\/g, '/').replace(/\/+$/, '');
  const lastSlash = normalizedPath.lastIndexOf('/');
  const folderName = lastSlash >= 0 ? normalizedPath.slice(lastSlash + 1) : normalizedPath;
  return folderName || null;
}

export async function loadWorkspaceFolder(
  platform: WorkspaceFolderPlatform,
  dirPath: string,
  options: WorkspaceFolderLoadOptions = {}
): Promise<WorkspaceFolderLoadResult> {
  let files = await platform.readDirectoryFiles(dirPath, ['scad'], true);
  let filePaths = Object.keys(files);
  let createdDefaultFile = false;

  if (filePaths.length === 0) {
    if (!options.createIfEmpty) {
      throw new Error('No .scad files found in the selected folder');
    }

    createdDefaultFile = true;
    await platform.createDirectory(dirPath);
    await platform.writeTextFile(`${dirPath}/${DEFAULT_TAB_NAME}`, DEFAULT_OPENSCAD_CODE);
    files = { [DEFAULT_TAB_NAME]: DEFAULT_OPENSCAD_CODE };
    filePaths = [DEFAULT_TAB_NAME];
  }

  const renderTargetPath = pickOpenScadRenderTarget(filePaths, null, getWorkspaceName(dirPath));
  if (!renderTargetPath) {
    throw new Error('Could not determine a render target for the workspace');
  }

  let emptyFolders: string[] = [];
  try {
    const allDirs = await platform.readSubdirectories(dirPath);
    emptyFolders = findEmptyFolders(allDirs, filePaths);
  } catch {
    emptyFolders = [];
  }

  return {
    files,
    renderTargetPath,
    emptyFolders,
    createdDefaultFile,
  };
}
