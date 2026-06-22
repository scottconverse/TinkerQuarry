/**
 * Targeted dependency resolver for OpenSCAD working directory files.
 *
 * Instead of blindly scanning the entire working directory (which is disastrous
 * when a .scad file lives in ~/Documents), this module:
 * 1. Parses `include <…>` / `use <…>` from the source code
 * 2. Filters out paths already satisfied by library files (BOSL2 etc.)
 * 3. Reads only the referenced files from disk
 * 4. Recursively resolves transitive includes
 *
 * The result is a minimal `Record<relativePath, content>` of exactly the
 * working-directory files needed for rendering.
 */

import { parseIncludes, parseImports } from './includeParser';
import type { PlatformBridge } from '../platform/types';

/** Safety limits to prevent runaway resolution */
const MAX_FILES = 200;
const MAX_DEPTH = 10;

export interface ResolveOptions {
  /** Absolute path to the working directory (parent of the active file) */
  workingDir: string;
  /** Already-loaded library files (keys are relative paths like "BOSL2/std.scad") */
  libraryFiles: Record<string, string>;
  /** Platform bridge for file I/O */
  platform: PlatformBridge;
  /**
   * Optional project files from the projectStore.
   * Checked before hitting disk. On web (no disk), this is the only source.
   */
  projectFiles?: Record<string, string>;
  /**
   * Directory prefix of the render target relative to the project root
   * (e.g. "examples/keebcu" for render target "examples/keebcu/foo.scad").
   * When set, includes like `constants.scad` are also looked up as
   * `examples/keebcu/constants.scad` in projectFiles.
   */
  renderTargetDir?: string;
}

export interface ResolveWorkingDirDepsDetailedOptions extends ResolveOptions {
  /**
   * Dirty in-memory project files that should override disk reads.
   * Used by MCP so unsaved Studio edits are preserved while clean files refresh from disk.
   */
  dirtyProjectFiles?: Record<string, string>;
  /**
   * When true, try reading clean project files from disk before falling back to
   * projectFiles. Defaults to false to preserve the normal editor render path.
   */
  preferDiskForProjectFiles?: boolean;
  /**
   * When false, do not fall back to clean projectFiles after a disk miss.
   * Useful for MCP renders where stale in-memory clean files are exactly what we
   * want to avoid.
   */
  includeProjectFilesAsFallback?: boolean;
}

export interface ResolveWorkingDirDepsDetailedResult {
  files: Record<string, string>;
  missingPaths: string[];
  stats: {
    diskReads: number;
    dirtyProjectFileHits: number;
    projectFileFallbackHits: number;
  };
}

/**
 * Normalize a relative path by resolving `.` and `..` segments.
 * Does NOT touch the filesystem — pure string manipulation.
 *
 * Examples:
 *   "sub/../file.scad" → "file.scad"
 *   "./sub/file.scad" → "sub/file.scad"
 *   "a/b/../../c.scad" → "c.scad"
 */
export function normalizePath(p: string): string {
  const parts = p.split('/');
  const resolved: string[] = [];

  for (const part of parts) {
    if (part === '.' || part === '') continue;
    if (part === '..') {
      resolved.pop();
    } else {
      resolved.push(part);
    }
  }

  return resolved.join('/');
}

function lookupProjectFileCandidate(
  path: string,
  projectFiles: Record<string, string> | undefined,
  renderTargetDir: string | undefined
): [string, string] | null {
  if (!projectFiles) return null;
  if (path in projectFiles) return [path, projectFiles[path]];
  if (renderTargetDir) {
    const prefixed = renderTargetDir + '/' + path;
    if (prefixed in projectFiles) return [prefixed, projectFiles[prefixed]];
  }
  return null;
}

export async function resolveWorkingDirDepsDetailed(
  code: string,
  options: ResolveWorkingDirDepsDetailedOptions
): Promise<ResolveWorkingDirDepsDetailedResult> {
  const {
    workingDir,
    libraryFiles,
    platform,
    projectFiles,
    dirtyProjectFiles,
    renderTargetDir,
    preferDiskForProjectFiles = false,
    includeProjectFilesAsFallback = true,
  } = options;
  const result: Record<string, string> = {};
  const visited = new Set<string>();
  const missingPaths = new Set<string>();
  const stats = {
    diskReads: 0,
    dirtyProjectFileHits: 0,
    projectFileFallbackHits: 0,
  };

  async function resolveFromDisk(path: string): Promise<[string, string] | null> {
    const absolutePath = workingDir + '/' + path;
    stats.diskReads += 1;
    const content = await platform.readTextFile(absolutePath);
    if (content !== null) return [path, content];

    if (renderTargetDir) {
      const prefixed = renderTargetDir + '/' + path;
      const prefixedAbsolute = workingDir + '/' + prefixed;
      stats.diskReads += 1;
      const prefixedContent = await platform.readTextFile(prefixedAbsolute);
      if (prefixedContent !== null) return [prefixed, prefixedContent];
    }

    return null;
  }

  async function resolveFile(normalizedPath: string): Promise<[string, string] | null> {
    const dirtyMatch = lookupProjectFileCandidate(
      normalizedPath,
      dirtyProjectFiles,
      renderTargetDir
    );
    if (dirtyMatch) {
      stats.dirtyProjectFileHits += 1;
      return dirtyMatch;
    }

    if (preferDiskForProjectFiles) {
      const diskMatch = await resolveFromDisk(normalizedPath);
      if (diskMatch) return diskMatch;

      if (includeProjectFilesAsFallback) {
        const cleanFallback = lookupProjectFileCandidate(
          normalizedPath,
          projectFiles,
          renderTargetDir
        );
        if (cleanFallback) {
          stats.projectFileFallbackHits += 1;
          return cleanFallback;
        }
      }

      return null;
    }

    const projectMatch = lookupProjectFileCandidate(normalizedPath, projectFiles, renderTargetDir);
    if (projectMatch) {
      stats.projectFileFallbackHits += 1;
      return projectMatch;
    }

    return resolveFromDisk(normalizedPath);
  }

  async function resolve(sourceCode: string, currentFileDir: string, depth: number): Promise<void> {
    if (depth > MAX_DEPTH) {
      console.warn('[resolveWorkingDirDeps] Max recursion depth reached');
      return;
    }

    const directives = parseIncludes(sourceCode);

    for (const directive of directives) {
      const joinedPath = currentFileDir ? currentFileDir + '/' + directive.path : directive.path;
      const normalizedPath = normalizePath(joinedPath);

      if (visited.has(normalizedPath)) continue;
      visited.add(normalizedPath);
      if (normalizedPath in libraryFiles) continue;
      if (Object.keys(result).length >= MAX_FILES) {
        console.warn('[resolveWorkingDirDeps] Max file limit reached');
        return;
      }

      const resolved = await resolveFile(normalizedPath);
      if (!resolved) {
        missingPaths.add(normalizedPath);
        continue;
      }

      const [matchedKey, content] = resolved;
      result[matchedKey] = content;

      const lastSlash = matchedKey.lastIndexOf('/');
      const childDir = lastSlash > 0 ? matchedKey.substring(0, lastSlash) : '';
      await resolve(content, childDir, depth + 1);
    }

    const imports = parseImports(sourceCode);

    for (const imp of imports) {
      const joinedPath = currentFileDir ? currentFileDir + '/' + imp.path : imp.path;
      const normalizedPath = normalizePath(joinedPath);

      if (visited.has(normalizedPath)) continue;
      visited.add(normalizedPath);
      if (Object.keys(result).length >= MAX_FILES) {
        console.warn('[resolveWorkingDirDeps] Max file limit reached');
        return;
      }

      const resolved = await resolveFile(normalizedPath);
      if (!resolved) {
        missingPaths.add(normalizedPath);
        continue;
      }

      const [matchedKey, content] = resolved;
      result[matchedKey] = content;
    }
  }

  await resolve(code, renderTargetDir ?? '', 0);

  return {
    files: result,
    missingPaths: [...missingPaths].sort((a, b) => a.localeCompare(b)),
    stats,
  };
}

/**
 * Resolve working-directory dependencies for the given OpenSCAD source code.
 *
 * Returns a map of `{ relativePath: fileContent }` containing only the files
 * that the code (and its transitive includes) actually reference from the
 * working directory.
 */
export async function resolveWorkingDirDeps(
  code: string,
  options: ResolveOptions
): Promise<Record<string, string>> {
  const resolved = await resolveWorkingDirDepsDetailed(code, options);
  return resolved.files;
}
