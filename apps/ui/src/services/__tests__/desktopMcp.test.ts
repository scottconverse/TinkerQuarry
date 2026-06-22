/** @jest-environment jsdom */

import { jest } from '@jest/globals';

const mockInvoke = jest.fn();
const mockRequestRender = jest.fn();
const mockCaptureOffscreen = jest.fn();
const mockFileRead = jest.fn(async () => ({ content: 'cube(10);' }));
const mockReadTextFile = jest.fn(async (absolutePath: string) => {
  const projectRoot = mockProjectState.projectRoot;
  if (!projectRoot) return null;
  const prefix = `${projectRoot}/`;
  const relativePath = absolutePath.startsWith(prefix) ? absolutePath.slice(prefix.length) : null;
  if (!relativePath) return null;
  const file = mockProjectState.files[relativePath];
  return file ? file.content : null;
});
const mockGetRenderTargetContent = jest.fn();
const mockListProjectFiles = jest.fn(() => ['main.scad']);
const mockExportModel = jest.fn();
const mockResolveWorkingDirDepsDetailed = jest.fn(async () => ({
  files: {},
  missingPaths: [],
  stats: {
    diskReads: 0,
    dirtyProjectFileHits: 0,
    projectFileFallbackHits: 0,
  },
}));

type MockProjectFile = {
  content: string;
  savedContent: string;
  isDirty: boolean;
  isVirtual: boolean;
  customizerBaseContent: string;
};

let mockProjectState: {
  projectRoot: string | null;
  renderTargetPath: string | null;
  files: Record<string, MockProjectFile>;
};

const renderServiceModule = new URL('../renderService.ts', import.meta.url).pathname;
const offscreenRendererModule = new URL('../offscreenRenderer.ts', import.meta.url).pathname;
const studioToolingModule = new URL('../studioTooling.ts', import.meta.url).pathname;
const projectStoreModule = new URL('../../stores/projectStore.ts', import.meta.url).pathname;
const settingsStoreModule = new URL('../../stores/settingsStore.ts', import.meta.url).pathname;
const workspaceStoreModule = new URL('../../stores/workspaceStore.ts', import.meta.url).pathname;
const platformModule = new URL('../../platform/index.ts', import.meta.url).pathname;
const renderRequestStoreModule = new URL('../../stores/renderRequestStore.ts', import.meta.url)
  .pathname;
const projectFilePathsModule = new URL('../../utils/projectFilePaths.ts', import.meta.url).pathname;
const resolveWorkingDirDepsModule = new URL('../../utils/resolveWorkingDirDeps.ts', import.meta.url)
  .pathname;
const desktopMcpModule = new URL('../desktopMcp.ts', import.meta.url).pathname;

jest.unstable_mockModule('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

jest.unstable_mockModule('@tauri-apps/api/path', () => ({
  join: async (...parts: string[]) => parts.join('/'),
}));

jest.unstable_mockModule(renderServiceModule, () => ({
  getRenderService: () => ({
    exportModel: (...args: unknown[]) => mockExportModel(...args),
  }),
}));

jest.unstable_mockModule(offscreenRendererModule, () => ({
  captureOffscreen: (...args: unknown[]) => mockCaptureOffscreen(...args),
}));

jest.unstable_mockModule(studioToolingModule, () => ({
  buildProjectContextSummary: jest.fn(() => 'project summary'),
}));

jest.unstable_mockModule(projectStoreModule, () => ({
  getAuxiliaryFilesForRender: jest.fn(() => ({})),
  getProjectState: () => mockProjectState,
  getProjectWorkingDirectory: jest.fn(() => mockProjectState.projectRoot),
  getProjectStore: () => ({
    getState: () => ({
      addFile: jest.fn((relativePath: string, content: string) => {
        mockProjectState.files[relativePath] = createMockProjectFile(content);
      }),
      markFileSaved: jest.fn((relativePath: string, savedContent?: string) => {
        const file = mockProjectState.files[relativePath];
        if (!file) return;
        const nextContent = savedContent ?? file.content;
        mockProjectState.files[relativePath] = {
          ...file,
          content: nextContent,
          savedContent: nextContent,
          customizerBaseContent: nextContent,
          isDirty: false,
        };
      }),
      setRenderTarget: jest.fn((relativePath: string) => {
        mockProjectState.renderTargetPath = relativePath;
      }),
      updateFileContent: jest.fn((relativePath: string, content: string) => {
        const file = mockProjectState.files[relativePath];
        if (!file) return;
        mockProjectState.files[relativePath] = {
          ...file,
          content,
          isDirty: true,
        };
      }),
    }),
  }),
  getRenderTargetContent: (...args: unknown[]) => mockGetRenderTargetContent(...args),
  listProjectFiles: (...args: unknown[]) => mockListProjectFiles(...args),
}));

jest.unstable_mockModule(settingsStoreModule, () => ({
  loadSettings: () => ({
    library: {
      autoDiscoverSystem: false,
      customPaths: [],
    },
  }),
}));

jest.unstable_mockModule(workspaceStoreModule, () => ({
  getWorkspaceState: () => ({
    showWelcome: false,
  }),
}));

jest.unstable_mockModule(platformModule, () => ({
  getPlatform: () => ({
    fileRead: (...args: unknown[]) => mockFileRead(...args),
    getLibraryPaths: jest.fn(async () => []),
    readDirectoryFiles: jest.fn(async () => ({})),
    readTextFile: (...args: unknown[]) => mockReadTextFile(...args),
    capabilities: {
      hasFileSystem: true,
    },
  }),
}));

jest.unstable_mockModule(renderRequestStoreModule, () => ({
  requestRender: (...args: unknown[]) => mockRequestRender(...args),
}));

jest.unstable_mockModule(projectFilePathsModule, () => ({
  normalizeProjectRelativePath: (path: string) => path,
}));

jest.unstable_mockModule(resolveWorkingDirDepsModule, () => ({
  resolveWorkingDirDeps: jest.fn(async () => ({})),
  resolveWorkingDirDepsDetailed: (...args: unknown[]) => mockResolveWorkingDirDepsDetailed(...args),
}));

let executeToolRequestForTests: typeof import('../desktopMcp').__executeDesktopMcpToolRequestForTests;
let notifyDesktopMcpRenderStarted: typeof import('../desktopMcp').notifyDesktopMcpRenderStarted;
let notifyDesktopMcpRenderSettled: typeof import('../desktopMcp').notifyDesktopMcpRenderSettled;
let resetDesktopMcpStateForTests: typeof import('../desktopMcp').__resetDesktopMcpStateForTests;
let getRenderArtifactState: typeof import('../../stores/renderArtifactStore').getRenderArtifactState;
let resetRenderArtifactStoreForTests: typeof import('../../stores/renderArtifactStore').__resetRenderArtifactStoreForTests;

type ToolResponse = {
  content: Array<
    { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }
  >;
  isError?: boolean;
};

function getText(response: ToolResponse): string {
  return response.content
    .filter(
      (entry): entry is Extract<ToolResponse['content'][number], { type: 'text' }> =>
        entry.type === 'text'
    )
    .map((entry) => entry.text)
    .join('\n');
}

function setProjectState(
  overrides: Partial<{
    projectRoot: string | null;
    renderTargetPath: string | null;
    files: Record<string, MockProjectFile>;
  }> = {}
) {
  mockProjectState = {
    projectRoot: '/workspace/poly555',
    renderTargetPath: 'main.scad',
    files: {
      'main.scad': createMockProjectFile('cube(10);'),
    },
    ...overrides,
  };
}

function createMockProjectFile(
  content: string,
  overrides: Partial<MockProjectFile> = {}
): MockProjectFile {
  return {
    content,
    savedContent: content,
    isDirty: false,
    isVirtual: false,
    customizerBaseContent: content,
    ...overrides,
  };
}

const DEFAULT_SCENE_STYLE = {
  background: 'system',
  lighting: 'studio',
  grid: true,
} as const;

let nextRequestId = 1;
let lastStartedRequestId = 0;

async function settleRender(snapshot: {
  previewSrc: string;
  previewKind: 'mesh' | 'svg';
  diagnostics: Array<{ severity: 'error' | 'warning' | 'info'; line?: number; message: string }>;
  error: string;
}) {
  await new Promise((resolve) => setTimeout(resolve, 0));
  const renderTargetPath = mockProjectState.renderTargetPath ?? 'main.scad';
  getRenderArtifactState().publishSettledArtifact({
    requestId: lastStartedRequestId,
    renderTargetPath,
    workspaceRoot: mockProjectState.projectRoot,
    sourceHash: 'test-hash',
    previewKind: snapshot.previewKind,
    previewSrc: snapshot.previewSrc,
    diagnostics: snapshot.diagnostics,
    error: snapshot.error,
    dimensionMode: snapshot.previewKind === 'svg' ? '2d' : '3d',
    sceneStyle: DEFAULT_SCENE_STYLE as never,
    useModelColors: true,
    createdAt: Date.now(),
  });
  notifyDesktopMcpRenderSettled(lastStartedRequestId);
}

describe('desktopMcp', () => {
  beforeAll(async () => {
    ({
      __executeDesktopMcpToolRequestForTests: executeToolRequestForTests,
      notifyDesktopMcpRenderStarted,
      notifyDesktopMcpRenderSettled,
      __resetDesktopMcpStateForTests: resetDesktopMcpStateForTests,
    } = await import(desktopMcpModule));
    ({
      getRenderArtifactState,
      __resetRenderArtifactStoreForTests: resetRenderArtifactStoreForTests,
    } = await import('../../stores/renderArtifactStore'));
  });

  beforeEach(() => {
    jest.clearAllMocks();
    setProjectState();
    nextRequestId = 1;
    lastStartedRequestId = 0;
    mockRequestRender.mockReset();
    mockRequestRender.mockImplementation(() => {
      const requestId = nextRequestId++;
      lastStartedRequestId = requestId;
      notifyDesktopMcpRenderStarted({
        renderTargetPath: mockProjectState.renderTargetPath ?? 'main.scad',
        requestId,
      });
    });
    mockGetRenderTargetContent.mockImplementation((state: typeof mockProjectState) => {
      const renderTargetPath = state.renderTargetPath;
      return renderTargetPath ? (state.files[renderTargetPath]?.content ?? null) : null;
    });
    mockCaptureOffscreen.mockReset();
    mockCaptureOffscreen.mockResolvedValue('data:image/png;base64,ZmFrZS1wbmc=');
    mockExportModel.mockReset();
    mockReadTextFile.mockClear();
    mockResolveWorkingDirDepsDetailed.mockClear();
    mockResolveWorkingDirDepsDetailed.mockResolvedValue({
      files: {},
      missingPaths: [],
      stats: {
        diskReads: 0,
        dirtyProjectFileHits: 0,
        projectFileFallbackHits: 0,
      },
    });
    resetDesktopMcpStateForTests();
    resetRenderArtifactStoreForTests();
    getRenderArtifactState().setActiveRenderTarget('main.scad', mockProjectState.projectRoot);
    getRenderArtifactState().publishSettledArtifact({
      requestId: 0,
      renderTargetPath: 'main.scad',
      workspaceRoot: mockProjectState.projectRoot,
      sourceHash: 'initial-hash',
      previewKind: 'mesh',
      previewSrc: 'blob:preview',
      diagnostics: [],
      error: '',
      dimensionMode: '3d',
      sceneStyle: DEFAULT_SCENE_STYLE as never,
      useModelColors: true,
      createdAt: Date.now(),
    });
  });

  it('returns success for a clean trigger_render', async () => {
    const pending = executeToolRequestForTests({
      requestId: 'req-1',
      toolName: 'trigger_render',
    });

    await settleRender({
      previewSrc: 'blob:preview',
      previewKind: 'mesh',
      diagnostics: [],
      error: '',
    });

    const response = (await pending) as ToolResponse;

    expect(mockRequestRender).toHaveBeenCalledWith('manual', {
      immediate: true,
      code: 'cube(10);',
    });
    expect(response.isError).not.toBe(true);
    expect(getText(response)).toContain('✅ Render completed for main.scad.');
  });

  it('returns success for warnings-only trigger_render results', async () => {
    const pending = executeToolRequestForTests({
      requestId: 'req-2',
      toolName: 'trigger_render',
    });

    await settleRender({
      previewSrc: 'blob:preview',
      previewKind: 'mesh',
      diagnostics: [{ severity: 'warning', message: 'Object may be non-manifold' }],
      error: '',
    });

    const response = (await pending) as ToolResponse;

    expect(response.isError).not.toBe(true);
    expect(getText(response)).toContain('[Warning]');
  });

  it('uses the newly settled preview for screenshots immediately after trigger_render', async () => {
    setProjectState({
      renderTargetPath: 'openscad/poly555.scad',
      files: {
        'openscad/poly555.scad': createMockProjectFile('cube(10);'),
      },
    });
    getRenderArtifactState().publishSettledArtifact({
      requestId: 99,
      renderTargetPath: 'bos_test.scad',
      workspaceRoot: mockProjectState.projectRoot,
      sourceHash: 'bos-hash',
      previewKind: 'mesh',
      previewSrc: 'blob:bos-preview',
      diagnostics: [],
      error: '',
      dimensionMode: '3d',
      sceneStyle: DEFAULT_SCENE_STYLE as never,
      useModelColors: true,
      createdAt: Date.now(),
    });
    mockRequestRender.mockImplementation(() => {
      const requestId = nextRequestId++;
      lastStartedRequestId = requestId;
      notifyDesktopMcpRenderStarted({
        renderTargetPath: 'openscad/poly555.scad',
        requestId,
      });
      getRenderArtifactState().publishSettledArtifact({
        requestId,
        renderTargetPath: 'openscad/poly555.scad',
        workspaceRoot: mockProjectState.projectRoot,
        sourceHash: 'poly555-hash',
        previewSrc: 'blob:poly555-preview',
        previewKind: 'mesh',
        diagnostics: [],
        error: '',
        dimensionMode: '3d',
        sceneStyle: DEFAULT_SCENE_STYLE as never,
        useModelColors: true,
        createdAt: Date.now(),
      });
      notifyDesktopMcpRenderSettled(requestId);
    });
    mockCaptureOffscreen.mockImplementation(
      async (previewUrl: string) => `data:image/png;base64,${previewUrl}`
    );

    const renderResponse = (await executeToolRequestForTests({
      requestId: 'req-race-render',
      toolName: 'trigger_render',
    })) as ToolResponse;
    expect(renderResponse.isError).not.toBe(true);

    await executeToolRequestForTests({
      requestId: 'req-race-screenshot',
      toolName: 'get_preview_screenshot',
      arguments: { view: 'isometric' },
    });

    expect(mockCaptureOffscreen).toHaveBeenLastCalledWith(
      'blob:poly555-preview',
      expect.objectContaining({ view: 'isometric' })
    );
  });

  it('returns an MCP error when trigger_render reports a render error', async () => {
    const pending = executeToolRequestForTests({
      requestId: 'req-3',
      toolName: 'trigger_render',
    });

    await settleRender({
      previewSrc: '',
      previewKind: 'mesh',
      diagnostics: [],
      error: 'Parser error: syntax error in file main.scad',
    });

    const response = (await pending) as ToolResponse;
    const text = getText(response);

    expect(response.isError).toBe(true);
    expect(text).toContain('❌ Render failed for main.scad.');
    expect(text).toContain('Parser error: syntax error in file main.scad');
    expect(text).toContain('`get_diagnostics`');
    expect(text).toContain('`set_render_target`');
  });

  it('returns an MCP error when trigger_render reports diagnostic errors', async () => {
    const pending = executeToolRequestForTests({
      requestId: 'req-4',
      toolName: 'trigger_render',
    });

    await settleRender({
      previewSrc: '',
      previewKind: 'mesh',
      diagnostics: [{ severity: 'error', line: 12, message: 'Undefined variable foo' }],
      error: '',
    });

    const response = (await pending) as ToolResponse;

    expect(response.isError).toBe(true);
    expect(getText(response)).toContain('Undefined variable foo');
  });

  it('refreshes clean dependency files from disk before an MCP render', async () => {
    setProjectState({
      renderTargetPath: 'openscad/poly555.scad',
      files: {
        'openscad/poly555.scad': createMockProjectFile('include <config.scad>;'),
        'openscad/config.scad': createMockProjectFile('SHOW_ENCLOSURE_BOTTOM = true;'),
      },
    });
    mockResolveWorkingDirDepsDetailed.mockResolvedValue({
      files: {
        'openscad/config.scad': 'SHOW_ENCLOSURE_BOTTOM = false;',
      },
      missingPaths: [],
      stats: {
        diskReads: 2,
        dirtyProjectFileHits: 0,
        projectFileFallbackHits: 0,
      },
    });

    const pending = executeToolRequestForTests({
      requestId: 'req-refresh',
      toolName: 'trigger_render',
    });

    await settleRender({
      previewSrc: 'blob:preview',
      previewKind: 'mesh',
      diagnostics: [],
      error: '',
    });

    const response = (await pending) as ToolResponse;

    expect(mockRequestRender).toHaveBeenCalledWith('manual', {
      immediate: true,
      code: 'include <config.scad>;',
    });
    expect(mockProjectState.files['openscad/config.scad']?.content).toBe(
      'SHOW_ENCLOSURE_BOTTOM = false;'
    );
    expect(response.isError).not.toBe(true);
  });

  it('uses the refreshed render-target source as the immediate render code override', async () => {
    setProjectState({
      renderTargetPath: 'openscad/poly555.scad',
      files: {
        'openscad/poly555.scad': createMockProjectFile('old_source();'),
      },
    });
    mockReadTextFile.mockImplementation(async (absolutePath: string) => {
      if (absolutePath.endsWith('/openscad/poly555.scad')) {
        return 'updated_source();';
      }
      return null;
    });

    const pending = executeToolRequestForTests({
      requestId: 'req-source-override',
      toolName: 'trigger_render',
    });

    await settleRender({
      previewSrc: 'blob:preview',
      previewKind: 'mesh',
      diagnostics: [],
      error: '',
    });

    const response = (await pending) as ToolResponse;

    expect(mockRequestRender).toHaveBeenCalledWith('manual', {
      immediate: true,
      code: 'updated_source();',
    });
    expect(response.isError).not.toBe(true);
  });

  it('fails before rendering when the MCP snapshot refresh cannot resolve a dependency', async () => {
    setProjectState({
      renderTargetPath: 'openscad/poly555.scad',
      files: {
        'openscad/poly555.scad': createMockProjectFile('include <config.scad>;'),
      },
    });
    mockResolveWorkingDirDepsDetailed.mockResolvedValue({
      files: {},
      missingPaths: ['config.scad'],
      stats: {
        diskReads: 2,
        dirtyProjectFileHits: 0,
        projectFileFallbackHits: 0,
      },
    });

    const response = (await executeToolRequestForTests({
      requestId: 'req-missing',
      toolName: 'trigger_render',
    })) as ToolResponse;
    const text = getText(response);

    expect(response.isError).toBe(true);
    expect(text).toContain('Could not refresh the MCP render snapshot for openscad/poly555.scad');
    expect(text).toContain('Missing dependencies: config.scad');
    expect(mockRequestRender).not.toHaveBeenCalled();
  });

  it('requires an explicit screenshot view', async () => {
    setProjectState({ renderTargetPath: 'openscad/config.scad' });

    const response = (await executeToolRequestForTests({
      requestId: 'req-5',
      toolName: 'get_preview_screenshot',
      arguments: {},
    })) as ToolResponse;

    const text = getText(response);
    expect(response.isError).toBe(true);
    expect(text).toContain('requires an explicit `view` argument');
  });

  it('adds render-target guidance when explicit-view screenshots only have a 2D artifact', async () => {
    setProjectState({ renderTargetPath: 'layout/top_plate.scad' });
    getRenderArtifactState().publishSettledArtifact({
      requestId: 101,
      renderTargetPath: 'layout/top_plate.scad',
      workspaceRoot: mockProjectState.projectRoot,
      sourceHash: 'svg-hash',
      previewKind: 'svg',
      previewSrc: 'blob:svg-preview',
      diagnostics: [],
      error: '',
      dimensionMode: '2d',
      sceneStyle: DEFAULT_SCENE_STYLE as never,
      useModelColors: true,
      createdAt: Date.now(),
    });

    const response = (await executeToolRequestForTests({
      requestId: 'req-6',
      toolName: 'get_preview_screenshot',
      arguments: { view: 'isometric' },
    })) as ToolResponse;

    const text = getText(response);
    expect(response.isError).toBe(true);
    expect(text).toContain('Render target: layout/top_plate.scad');
    expect(text).toContain('A 3D preview is required');
    expect(text).toContain('2D SVG preview');
    expect(text).toContain('`get_diagnostics`');
  });

  it('adds the same corrective guidance when export_file is blocked by a failed render', async () => {
    setProjectState({
      renderTargetPath: 'parts/enclosure.scad',
      files: {
        'parts/enclosure.scad': createMockProjectFile('cube(20);'),
      },
    });
    mockReadTextFile.mockImplementation(async (absolutePath: string) => {
      if (absolutePath.endsWith('/parts/enclosure.scad')) {
        return 'cube(20);';
      }
      return null;
    });
    getRenderArtifactState().publishSettledArtifact({
      requestId: 202,
      renderTargetPath: 'parts/enclosure.scad',
      workspaceRoot: mockProjectState.projectRoot,
      sourceHash: 'failed-hash',
      previewKind: 'mesh',
      previewSrc: '',
      diagnostics: [{ severity: 'error', message: 'Parser error at line 9' }],
      error: '',
      dimensionMode: '3d',
      sceneStyle: DEFAULT_SCENE_STYLE as never,
      useModelColors: true,
      createdAt: Date.now(),
    });

    const response = (await executeToolRequestForTests({
      requestId: 'req-7',
      toolName: 'export_file',
      arguments: {
        format: 'stl',
        file_path: '/tmp/enclosure.stl',
      },
    })) as ToolResponse;

    const text = getText(response);
    expect(response.isError).toBe(true);
    expect(text).toContain('Cannot export STL because the latest render failed.');
    expect(text).toContain('Render target: parts/enclosure.scad');
    expect(text).toContain('Parser error at line 9');
    expect(text).toContain('`get_project_context`');
  });
});
