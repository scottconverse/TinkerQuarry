import type { PlatformBridge } from '../platform/types';
import {
  getAuxiliaryFilesForRender,
  getProjectWorkingDirectory,
  getRenderTargetContent,
} from '../stores/projectStore';
import type { ProjectStoreState } from '../stores/projectTypes';
import type { LibrarySettings } from '../stores/settingsStore';
import { normalizeProjectRelativePath } from '../utils/projectFilePaths';
import { resolveWorkingDirDeps } from '../utils/resolveWorkingDirDeps';
import type { RenderOptions } from './renderService';

export interface LoadedLibraryAssets {
  libraryFiles: Record<string, string>;
  libraryPaths: string[];
}

export async function loadConfiguredLibraryAssets(
  library: LibrarySettings | undefined,
  platform: Pick<PlatformBridge, 'getLibraryPaths' | 'readDirectoryFiles'>
): Promise<LoadedLibraryAssets> {
  if (!library) {
    return { libraryFiles: {}, libraryPaths: [] };
  }

  const systemPaths = library.autoDiscoverSystem ? await platform.getLibraryPaths() : [];
  const libraryPaths = [...systemPaths, ...library.customPaths];
  const libraryFiles: Record<string, string> = {};

  for (const libPath of libraryPaths) {
    try {
      const files = await platform.readDirectoryFiles(libPath);
      Object.assign(libraryFiles, files);
    } catch (err) {
      console.warn(`[projectRenderInputs] Failed to read library path ${libPath}:`, err);
    }
  }

  return { libraryFiles, libraryPaths };
}

export interface BuildProjectRenderInputsOptions {
  state: ProjectStoreState;
  code?: string | null;
  workingDir?: string | null;
  libraryFiles?: Record<string, string>;
  libraryPaths?: string[];
  platform?: PlatformBridge;
  resolveWorkingDirDepsImpl?: typeof resolveWorkingDirDeps;
}

export interface ProjectRenderInputs {
  code: string;
  renderTargetPath: string | null;
  renderTargetDir?: string;
  projectAuxiliaryFiles: Record<string, string>;
  workingDirDependencyFiles: Record<string, string>;
  renderOptions: RenderOptions;
}

export async function buildProjectRenderInputs(
  options: BuildProjectRenderInputsOptions
): Promise<ProjectRenderInputs> {
  const {
    state,
    workingDir = getProjectWorkingDirectory(state),
    libraryFiles = {},
    libraryPaths = [],
    platform,
    resolveWorkingDirDepsImpl = resolveWorkingDirDeps,
  } = options;

  const code = options.code ?? getRenderTargetContent(state) ?? '';
  const renderTargetPath = normalizeProjectRelativePath(state.renderTargetPath ?? '') ?? null;
  const renderTargetDir = renderTargetPath?.includes('/')
    ? renderTargetPath.slice(0, renderTargetPath.lastIndexOf('/'))
    : undefined;

  const projectFiles = getAuxiliaryFilesForRender(state);
  let projectAuxiliaryFiles: Record<string, string> = { ...projectFiles };
  let workingDirDependencyFiles: Record<string, string> = {};

  if (workingDir) {
    if (!platform) {
      throw new Error('A platform bridge is required to resolve working-directory dependencies.');
    }

    workingDirDependencyFiles = await resolveWorkingDirDepsImpl(code, {
      workingDir,
      libraryFiles,
      platform,
      projectFiles,
      renderTargetDir,
    });

    if (Object.keys(workingDirDependencyFiles).length > 0) {
      projectAuxiliaryFiles = {
        ...projectAuxiliaryFiles,
        ...workingDirDependencyFiles,
      };
    }
  }

  const mergedAuxiliaryFiles = { ...libraryFiles, ...projectAuxiliaryFiles };

  return {
    code,
    renderTargetPath,
    renderTargetDir,
    projectAuxiliaryFiles,
    workingDirDependencyFiles,
    renderOptions: {
      auxiliaryFiles:
        Object.keys(mergedAuxiliaryFiles).length > 0 ? mergedAuxiliaryFiles : undefined,
      libraryFiles: Object.keys(libraryFiles).length > 0 ? libraryFiles : undefined,
      libraryPaths: libraryPaths.length > 0 ? libraryPaths : undefined,
      inputPath: renderTargetPath ?? undefined,
      workingDir: workingDir ?? undefined,
    },
  };
}
