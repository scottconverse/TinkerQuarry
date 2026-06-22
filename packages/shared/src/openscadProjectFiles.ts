export const OPENSCAD_PROJECT_FILE_EXTENSIONS = ['scad', 'h'] as const;
export const OPENSCAD_RENDERABLE_FILE_EXTENSIONS = ['scad'] as const;

function normalizePath(path: string): string {
  return path.trim().toLowerCase();
}

export function hasAllowedExtension(path: string, extensions: readonly string[]): boolean {
  const normalizedPath = normalizePath(path);
  return extensions.some((ext) => normalizedPath.endsWith(`.${ext.toLowerCase()}`));
}

export function isOpenScadProjectFilePath(path: string): boolean {
  return hasAllowedExtension(path, OPENSCAD_PROJECT_FILE_EXTENSIONS);
}

export function isRenderableOpenScadFilePath(path: string): boolean {
  return hasAllowedExtension(path, OPENSCAD_RENDERABLE_FILE_EXTENSIONS);
}

function getPathDepth(path: string): number {
  return path.split('/').filter(Boolean).length;
}

function getRenderableBaseName(path: string): string {
  const normalizedPath = path.replace(/\\/g, '/');
  const lastSlash = normalizedPath.lastIndexOf('/');
  const fileName = lastSlash >= 0 ? normalizedPath.slice(lastSlash + 1) : normalizedPath;
  return fileName.replace(/\.scad$/i, '');
}

export function pickOpenScadRenderTarget(
  filePaths: Iterable<string>,
  preferredPath?: string | null,
  workspaceName?: string | null
): string | null {
  const renderableFiles = [...filePaths]
    .filter(isRenderableOpenScadFilePath)
    .sort((a, b) => a.localeCompare(b));

  if (renderableFiles.length === 0) {
    return null;
  }

  if (preferredPath && renderableFiles.includes(preferredPath)) {
    return preferredPath;
  }

  const mainTarget = renderableFiles.find((path) => path === 'main.scad');
  if (mainTarget) {
    return mainTarget;
  }

  const normalizedWorkspaceName = workspaceName?.trim().toLowerCase() ?? '';
  if (normalizedWorkspaceName) {
    const matchingFiles = renderableFiles
      .filter((path) => getRenderableBaseName(path).toLowerCase() === normalizedWorkspaceName)
      .sort((a, b) => getPathDepth(a) - getPathDepth(b) || a.localeCompare(b));

    if (matchingFiles.length > 0) {
      return matchingFiles[0];
    }
  }

  return renderableFiles[0];
}
