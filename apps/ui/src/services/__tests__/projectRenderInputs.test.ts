import { jest } from '@jest/globals';
import { buildProjectRenderInputs, loadConfiguredLibraryAssets } from '../projectRenderInputs';
import type { ProjectStoreState } from '../../stores/projectTypes';

function createState(overrides: Partial<ProjectStoreState> = {}): ProjectStoreState {
  return {
    projectRoot: null,
    renderTargetPath: 'main.scad',
    contentVersion: 0,
    emptyFolders: [],
    files: {
      'main.scad': {
        content: 'use <lib/utils.scad>\ncube(size);',
        savedContent: 'use <lib/utils.scad>\ncube(size);',
        isDirty: false,
        isVirtual: true,
        customizerBaseContent: 'use <lib/utils.scad>\ncube(size);',
      },
      'lib/utils.scad': {
        content: 'size = 10;',
        savedContent: 'size = 10;',
        isDirty: false,
        isVirtual: true,
        customizerBaseContent: 'size = 10;',
      },
    },
    ...overrides,
  };
}

describe('projectRenderInputs', () => {
  it('builds web render inputs for multi-file projects from the render target snapshot', async () => {
    const result = await buildProjectRenderInputs({
      state: createState(),
    });

    expect(result.code).toBe('use <lib/utils.scad>\ncube(size);');
    expect(result.workingDirDependencyFiles).toEqual({});
    expect(result.renderOptions).toEqual({
      auxiliaryFiles: {
        'lib/utils.scad': 'size = 10;',
      },
      inputPath: 'main.scad',
      libraryFiles: undefined,
      libraryPaths: undefined,
      workingDir: undefined,
    });
  });

  it('merges working-directory dependencies through the shared builder', async () => {
    const resolveWorkingDirDepsImpl = jest.fn(async () => ({
      'deps/constants.scad': 'size = 24;',
    }));

    const result = await buildProjectRenderInputs({
      state: createState({
        projectRoot: '/project',
        renderTargetPath: 'models/main.scad',
        files: {
          'models/main.scad': {
            content: 'include <deps/constants.scad>\ncube(size);',
            savedContent: 'include <deps/constants.scad>\ncube(size);',
            isDirty: false,
            isVirtual: false,
            customizerBaseContent: 'include <deps/constants.scad>\ncube(size);',
          },
        },
      }),
      workingDir: '/project',
      libraryFiles: {
        'BOSL2/std.scad': 'module x() {}',
      },
      libraryPaths: ['/lib/system'],
      platform: {
        readTextFile: jest.fn(async () => null),
      } as never,
      resolveWorkingDirDepsImpl,
    });

    expect(resolveWorkingDirDepsImpl).toHaveBeenCalledWith(
      'include <deps/constants.scad>\ncube(size);',
      expect.objectContaining({
        workingDir: '/project',
        renderTargetDir: 'models',
      })
    );
    expect(result.workingDirDependencyFiles).toEqual({
      'deps/constants.scad': 'size = 24;',
    });
    expect(result.renderOptions).toEqual({
      auxiliaryFiles: {
        'BOSL2/std.scad': 'module x() {}',
        'deps/constants.scad': 'size = 24;',
      },
      inputPath: 'models/main.scad',
      libraryFiles: {
        'BOSL2/std.scad': 'module x() {}',
      },
      libraryPaths: ['/lib/system'],
      workingDir: '/project',
    });
  });

  it('loads configured library files and paths in one place', async () => {
    const result = await loadConfiguredLibraryAssets(
      {
        autoDiscoverSystem: true,
        customPaths: ['/lib/custom'],
      },
      {
        getLibraryPaths: jest.fn(async () => ['/lib/system']),
        readDirectoryFiles: jest
          .fn()
          .mockResolvedValueOnce({ 'system.scad': 'module system() {}' })
          .mockResolvedValueOnce({ 'custom.scad': 'module custom() {}' }),
      }
    );

    expect(result).toEqual({
      libraryFiles: {
        'custom.scad': 'module custom() {}',
        'system.scad': 'module system() {}',
      },
      libraryPaths: ['/lib/system', '/lib/custom'],
    });
  });
});
