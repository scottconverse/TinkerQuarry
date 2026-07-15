/** @jest-environment jsdom */

import { act } from '@testing-library/react';
import { jest } from '@jest/globals';
import { Blob as NodeBlob } from 'node:buffer';
import { createAnalyticsSpy, createHookHarness } from './test-utils';
import type { WorkspaceTab } from '@/stores/workspaceTypes';

// jsdom's Blob doesn't implement arrayBuffer(); menu:file:save_project needs the real one
// (exportProjectZip's output is read back via blob.arrayBuffer()).
globalThis.Blob = NodeBlob as unknown as typeof Blob;

const analytics = createAnalyticsSpy();
const mockAsk = jest.fn<() => Promise<boolean>>();
const mockConfirm = jest.fn<() => Promise<boolean>>();
const mockFileSave = jest.fn<(...args: unknown[]) => Promise<string | null>>();
const mockFileSaveAs = jest.fn<(...args: unknown[]) => Promise<string | null>>();
const mockPickDirectory = jest.fn<() => Promise<string | null>>();
const mockWriteTextFile = jest.fn<(...args: unknown[]) => Promise<void>>();
const mockFileOpen = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockFileExport = jest.fn<(...args: unknown[]) => Promise<void>>();
let onCloseRequestedCallback: (() => Promise<boolean>) | null = null;
const mockOnCloseRequested = jest.fn((cb: () => Promise<boolean>) => {
  onCloseRequestedCallback = cb;
  return () => {
    onCloseRequestedCallback = null;
  };
});

const platform = {
  capabilities: { hasFileSystem: true },
  ask: (...args: unknown[]) => mockAsk(...(args as [])),
  confirm: (...args: unknown[]) => mockConfirm(...(args as [])),
  fileSave: (...args: unknown[]) => mockFileSave(...args),
  fileSaveAs: (...args: unknown[]) => mockFileSaveAs(...args),
  pickDirectory: (...args: unknown[]) => mockPickDirectory(...args),
  writeTextFile: (...args: unknown[]) => mockWriteTextFile(...args),
  fileOpen: (...args: unknown[]) => mockFileOpen(...args),
  fileExport: (...args: unknown[]) => mockFileExport(...args),
  onCloseRequested: (cb: () => Promise<boolean>) => mockOnCloseRequested(cb),
};

// Minimal fake pub-sub matching the real EventBus's on()/emit() shape (moved-hook only
// calls .on()); emit() awaits every handler so tests can `await` a dispatch.
function createFakeEventBus() {
  const listeners = new Map<string, Set<(...args: unknown[]) => unknown>>();
  return {
    on(event: string, cb: (...args: unknown[]) => unknown) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(cb);
      return () => listeners.get(event)?.delete(cb);
    },
    async emit(event: string, ...args: unknown[]) {
      const cbs = listeners.get(event);
      if (!cbs) return;
      await Promise.all([...cbs].map((cb) => cb(...args)));
    },
  };
}
const fakeEventBus = createFakeEventBus();

const mockExportModelWithContext = jest.fn<(...args: unknown[]) => Promise<Uint8Array>>(
  async () => new Uint8Array([1, 2, 3]),
);

jest.unstable_mockModule('@/platform', () => ({
  getPlatform: () => platform,
  eventBus: fakeEventBus,
}));
// utils/formatter's real parser/printer use web-tree-sitter (WASM) and are heavy to load
// in a unit test; stub the whole module to a passthrough (same behavior as an unparsed file).
jest.unstable_mockModule('@/utils/formatter', () => ({
  formatOpenScadCode: jest.fn(async (code: string) => code),
}));
jest.unstable_mockModule('@/services/exportService', () => ({
  exportModelWithContext: (...args: unknown[]) => mockExportModelWithContext(...args),
}));
jest.unstable_mockModule('@/services/exportErrors', () => ({
  isExportValidationError: () => false,
}));
// The full value-export surface of localAnalytics: transitive imports (utils/notifications)
// pull the other functions, and an ESM mock must provide every named export it's asked for.
jest.unstable_mockModule('@/localAnalytics', () => ({
  useAnalytics: () => analytics,
  trackAnalyticsEvent: jest.fn(),
  trackAnalyticsError: jest.fn(),
  setAnalyticsEnabled: jest.fn(),
  inferErrorDomain: () => 'unknown',
  bucketCount: () => '0',
}));

let usePersistenceOperations: typeof import('../usePersistenceOperations').usePersistenceOperations;
let resetWorkspaceStore: typeof import('@/stores/workspaceStore').resetWorkspaceStore;
let getWorkspaceState: typeof import('@/stores/workspaceStore').getWorkspaceState;
let getProjectStore: typeof import('@/stores/projectStore').getProjectStore;
let DEFAULT_TAB_NAME: typeof import('@/stores/workspaceFactories').DEFAULT_TAB_NAME;

const createNewTab = jest.fn(() => 'new-tab-id');
const showWelcomeScreen = jest.fn();
const hideWelcomeScreen = jest.fn();
const openFileInCurrentWindow = jest.fn<(...args: unknown[]) => Promise<unknown>>(
  async () => ({}),
);
const openWorkspaceFolderInCurrentWindow = jest.fn<(...args: unknown[]) => Promise<unknown>>(
  async () => ({}),
);

const activeTabRef: { current: WorkspaceTab } = { current: undefined as never };
const tabsRef: { current: WorkspaceTab[] } = { current: [] };

describe('usePersistenceOperations (extracted from App.tsx, phase 1c) — real stores, mock platform', () => {
  beforeAll(async () => {
    ({ usePersistenceOperations } = await import('../usePersistenceOperations'));
    ({ resetWorkspaceStore, getWorkspaceState } = await import('@/stores/workspaceStore'));
    ({ getProjectStore } = await import('@/stores/projectStore'));
    ({ DEFAULT_TAB_NAME } = await import('@/stores/workspaceFactories'));
  });

  beforeEach(() => {
    jest.clearAllMocks();
    onCloseRequestedCallback = null;
    act(() => {
      resetWorkspaceStore();
      getProjectStore().getState().resetToUntitledProject();
    });
    activeTabRef.current = getWorkspaceState().tabs[0];
    tabsRef.current = getWorkspaceState().tabs;
  });

  function mount() {
    return createHookHarness(() =>
      usePersistenceOperations({
        activeTabRef,
        tabsRef,
        createNewTab,
        showWelcomeScreen,
        hideWelcomeScreen,
        openFileInCurrentWindow,
        openWorkspaceFolderInCurrentWindow,
      }),
    );
  }

  it('menu:file:save saves the active tab to its existing path and clears dirty', async () => {
    const h = mount();
    act(() => {
      getProjectStore().getState().updateFileContent(DEFAULT_TAB_NAME, 'cube(2);');
    });
    mockFileSave.mockResolvedValue(`/disk/${DEFAULT_TAB_NAME}`);
    await act(async () => {
      await fakeEventBus.emit('menu:file:save');
    });
    expect(mockFileSave).toHaveBeenCalledWith(
      'cube(2);',
      null,
      expect.any(Array),
      DEFAULT_TAB_NAME,
    );
    expect(getProjectStore().getState().files[DEFAULT_TAB_NAME]?.isDirty).toBe(false);
    expect(analytics.track).toHaveBeenCalledWith(
      'file saved',
      expect.objectContaining({ source: 'save' }),
    );
    h.unmount();
  });

  it('menu:file:save_as always prompts for a path', async () => {
    const h = mount();
    mockFileSaveAs.mockResolvedValue(`/disk/${DEFAULT_TAB_NAME}`);
    await act(async () => {
      await fakeEventBus.emit('menu:file:save_as');
    });
    expect(mockFileSaveAs).toHaveBeenCalledTimes(1);
    expect(mockFileSave).not.toHaveBeenCalled();
    h.unmount();
  });

  it('menu:file:save_all saves only dirty files', async () => {
    const h = mount();
    act(() => {
      getProjectStore().getState().addFile('second.scad', 'sphere(1);'); // addFile seeds isDirty:true
    });
    mockFileSave.mockResolvedValue('/disk/second.scad');
    await act(async () => {
      await fakeEventBus.emit('menu:file:save_all');
    });
    expect(mockFileSave).toHaveBeenCalledTimes(1);
    expect(mockFileSave.mock.calls[0]?.[3]).toBe('second.scad');
    expect(getProjectStore().getState().files['second.scad']?.isDirty).toBe(false);
    h.unmount();
  });

  it('saveFile(false) on a virtual multi-file project redirects to a folder save', async () => {
    const h = mount();
    act(() => {
      getProjectStore().getState().addFile('second.scad', 'sphere(1);');
    });
    mockPickDirectory.mockResolvedValue('/picked/dir');
    await act(async () => {
      await fakeEventBus.emit('menu:file:save');
    });
    expect(mockPickDirectory).toHaveBeenCalledTimes(1);
    expect(mockFileSave).not.toHaveBeenCalled();
    expect(mockWriteTextFile).toHaveBeenCalledTimes(2);
    expect(getProjectStore().getState().projectRoot).toBe('/picked/dir');
    const tab = getWorkspaceState().tabs.find((t) => t.id === activeTabRef.current.id);
    expect(tab?.filePath).toBe(`/picked/dir/${DEFAULT_TAB_NAME}`);
    h.unmount();
  });

  it('menu:file:new resets the project and shows the welcome screen when nothing is dirty', async () => {
    const h = mount();
    await act(async () => {
      await fakeEventBus.emit('menu:file:new');
    });
    expect(mockAsk).not.toHaveBeenCalled();
    expect(Object.keys(getProjectStore().getState().files)).toEqual([DEFAULT_TAB_NAME]);
    expect(createNewTab).toHaveBeenCalledTimes(1);
    expect(showWelcomeScreen).toHaveBeenCalledTimes(1);
    h.unmount();
  });

  it('menu:file:new asks first, and cancels cleanly when the user declines to discard', async () => {
    const h = mount();
    act(() => {
      getProjectStore().getState().updateFileContent(DEFAULT_TAB_NAME, 'cube(9); // edited');
    });
    mockAsk.mockResolvedValue(false); // "Don't Save"
    mockConfirm.mockResolvedValue(false); // "Cancel" the discard
    await act(async () => {
      await fakeEventBus.emit('menu:file:new');
    });
    expect(mockAsk).toHaveBeenCalledTimes(1);
    expect(mockConfirm).toHaveBeenCalledTimes(1);
    expect(createNewTab).not.toHaveBeenCalled();
    expect(showWelcomeScreen).not.toHaveBeenCalled();
    expect(getProjectStore().getState().files[DEFAULT_TAB_NAME]?.content).toBe(
      'cube(9); // edited',
    );
    h.unmount();
  });

  it('menu:file:open reads a file and hands it to openFileInCurrentWindow', async () => {
    const h = mount();
    const result = { path: '/disk/x.scad', name: 'x.scad', content: 'cube(3);' };
    mockFileOpen.mockResolvedValue(result);
    await act(async () => {
      await fakeEventBus.emit('menu:file:open');
    });
    expect(openFileInCurrentWindow).toHaveBeenCalledWith(result, { source: 'menu_open' });
    h.unmount();
  });

  it('menu:file:open_folder checks for unsaved changes, then opens the picked folder', async () => {
    const h = mount();
    mockPickDirectory.mockResolvedValue('/picked/folder');
    await act(async () => {
      await fakeEventBus.emit('menu:file:open_folder');
    });
    expect(openWorkspaceFolderInCurrentWindow).toHaveBeenCalledWith('/picked/folder', {
      source: 'menu_open',
    });
    h.unmount();
  });

  it('menu:file:save_project exports the project as a zip via fileExport', async () => {
    const h = mount();
    await act(async () => {
      await fakeEventBus.emit('menu:file:save_project');
    });
    expect(mockFileExport).toHaveBeenCalledTimes(1);
    const [data, filename] = mockFileExport.mock.calls[0] as [Uint8Array, string, unknown];
    expect(filename).toBe('project.zip');
    expect(data).toBeInstanceOf(Uint8Array);
    h.unmount();
  });

  it('menu:file:export renders via exportModelWithContext and calls fileExport', async () => {
    const h = mount();
    await act(async () => {
      await fakeEventBus.emit('menu:file:export', 'stl');
    });
    expect(mockExportModelWithContext).toHaveBeenCalledWith(
      expect.objectContaining({ format: 'stl' }),
    );
    expect(mockFileExport).toHaveBeenCalledWith(expect.any(Uint8Array), 'export.stl', [
      { name: 'STL (3D Model)', extensions: ['stl'] },
    ]);
    expect(analytics.track).toHaveBeenCalledWith('file exported', { format: 'stl' });
    h.unmount();
  });

  it('onCloseRequested resolves true immediately when nothing is dirty', async () => {
    const h = mount();
    expect(onCloseRequestedCallback).not.toBeNull();
    const result = await onCloseRequestedCallback!();
    expect(result).toBe(true);
    expect(mockAsk).not.toHaveBeenCalled();
    h.unmount();
  });

  it('onCloseRequested defers to the unsaved-changes check when a file is dirty', async () => {
    const h = mount();
    act(() => {
      getProjectStore().getState().updateFileContent(DEFAULT_TAB_NAME, 'cube(4); // edited');
    });
    mockAsk.mockResolvedValue(false);
    mockConfirm.mockResolvedValue(true); // confirm discard
    const result = await onCloseRequestedCallback!();
    expect(result).toBe(true);
    expect(mockAsk).toHaveBeenCalledTimes(1);
    h.unmount();
  });

  it('unmount removes the menu-bridge listeners (no zombie save on a stale mount)', async () => {
    const h = mount();
    h.unmount();
    mockFileSave.mockResolvedValue(`/disk/${DEFAULT_TAB_NAME}`);
    await act(async () => {
      await fakeEventBus.emit('menu:file:save');
    });
    expect(mockFileSave).not.toHaveBeenCalled();
  });
});
