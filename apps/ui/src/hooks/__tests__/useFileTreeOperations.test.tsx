/** @jest-environment jsdom */

import { act } from '@testing-library/react';
import { jest } from '@jest/globals';
import { createAnalyticsSpy, createHookHarness } from './test-utils';

const analytics = createAnalyticsSpy();
const mockAsk = jest.fn<() => Promise<boolean>>();
const mockConfirm = jest.fn<() => Promise<boolean>>();
const platform = {
  capabilities: { hasFileSystem: true },
  ask: (...args: unknown[]) => mockAsk(...(args as [])),
  confirm: (...args: unknown[]) => mockConfirm(...(args as [])),
  writeTextFile: jest.fn(),
  renameFile: jest.fn(),
  deleteFile: jest.fn(),
  createDirectory: jest.fn(),
  removeDirectory: jest.fn(),
};

jest.unstable_mockModule('@/platform', () => ({
  getPlatform: () => platform,
}));
jest.unstable_mockModule('@/stores/layoutStore', () => ({
  openPanel: jest.fn(),
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

let useFileTreeOperations: typeof import('../useFileTreeOperations').useFileTreeOperations;
let resetWorkspaceStore: typeof import('@/stores/workspaceStore').resetWorkspaceStore;
let getWorkspaceState: typeof import('@/stores/workspaceStore').getWorkspaceState;
let getProjectStore: typeof import('@/stores/projectStore').getProjectStore;

describe('useFileTreeOperations (extracted from App.tsx, phase 1b) — real stores, mock platform', () => {
  beforeAll(async () => {
    ({ useFileTreeOperations } = await import('../useFileTreeOperations'));
    ({ resetWorkspaceStore, getWorkspaceState } = await import('@/stores/workspaceStore'));
    ({ getProjectStore } = await import('@/stores/projectStore'));
  });

  beforeEach(() => {
    jest.clearAllMocks();
    act(() => {
      resetWorkspaceStore();
      getProjectStore().getState().resetToUntitledProject();
    });
  });

  it('createNewTab seeds the project file and opens a workspace tab', () => {
    const h = createHookHarness(() => useFileTreeOperations());
    const before = getWorkspaceState().tabs.length;
    act(() => {
      h.current().createNewTab(null, 'cube(1);', 'part.scad');
    });
    expect(getProjectStore().getState().files['part.scad']?.content).toBe('cube(1);');
    expect(getWorkspaceState().tabs.length).toBe(before + 1);
    h.unmount();
  });

  it('handleFileTreeClick switches to an existing tab instead of duplicating it', () => {
    const h = createHookHarness(() => useFileTreeOperations());
    let id = '';
    act(() => {
      id = h.current().createNewTab(null, 'a();', 'a.scad');
      h.current().createNewTab(null, 'b();', 'b.scad');
    });
    const count = getWorkspaceState().tabs.length;
    act(() => {
      h.current().handleFileTreeClick('a.scad');
    });
    expect(getWorkspaceState().tabs.length).toBe(count); // no duplicate
    expect(getWorkspaceState().activeTabId).toBe(id);
    h.unmount();
  });

  it('closeTab on a clean tab closes it and records analytics', async () => {
    const h = createHookHarness(() => useFileTreeOperations());
    let id = '';
    act(() => {
      id = h.current().createNewTab(null, 'x();', 'x.scad');
      // addFile seeds new files isDirty (never saved to disk); mark saved so the tab is clean
      getProjectStore().getState().markFileSaved('x.scad');
    });
    const count = getWorkspaceState().tabs.length;
    await act(async () => {
      await h.current().closeTab(id);
    });
    expect(getWorkspaceState().tabs.length).toBe(count - 1);
    expect(analytics.track).toHaveBeenCalledWith('tab closed', {
      had_unsaved_changes: false,
    });
    expect(mockAsk).not.toHaveBeenCalled(); // clean tab: no save prompt
    h.unmount();
  });

  it('closeTab on a DIRTY tab keeps it open when the user chooses Save', async () => {
    const h = createHookHarness(() => useFileTreeOperations());
    let id = '';
    act(() => {
      id = h.current().createNewTab(null, 'x();', 'x.scad');
      getProjectStore().getState().updateFileContent('x.scad', 'x(); // edited');
    });
    mockAsk.mockResolvedValue(true); // "Save" — the caller's save flow takes over
    const count = getWorkspaceState().tabs.length;
    await act(async () => {
      await h.current().closeTab(id);
    });
    expect(getWorkspaceState().tabs.length).toBe(count); // still open
    h.unmount();
  });

  it('handleRenameFile renames the project file and the open tab with it', async () => {
    const h = createHookHarness(() => useFileTreeOperations());
    act(() => {
      h.current().createNewTab(null, 'g();', 'gear.scad');
    });
    await act(async () => {
      await h.current().handleRenameFile('gear.scad', 'sprocket.scad');
    });
    const files = getProjectStore().getState().files;
    expect(files['gear.scad']).toBeUndefined();
    expect(files['sprocket.scad']?.content).toBe('g();');
    expect(
      getWorkspaceState().tabs.some((t) => t.projectPath === 'sprocket.scad'),
    ).toBe(true);
    h.unmount();
  });

  it('handleDeleteFile respects the confirm dialog in both directions', async () => {
    const h = createHookHarness(() => useFileTreeOperations());
    act(() => {
      h.current().createNewTab(null, 'd();', 'doomed.scad');
    });
    mockConfirm.mockResolvedValueOnce(false);
    await act(async () => {
      await h.current().handleDeleteFile('doomed.scad');
    });
    expect(getProjectStore().getState().files['doomed.scad']).toBeDefined();
    mockConfirm.mockResolvedValueOnce(true);
    await act(async () => {
      await h.current().handleDeleteFile('doomed.scad');
    });
    expect(getProjectStore().getState().files['doomed.scad']).toBeUndefined();
    h.unmount();
  });

  it('handleAddExternalFiles resolves name conflicts with _1 suffixes', async () => {
    const h = createHookHarness(() => useFileTreeOperations());
    act(() => {
      h.current().createNewTab(null, 'orig();', 'clip.scad');
    });
    await act(async () => {
      await h.current().handleAddExternalFiles({ 'clip.scad': 'incoming();' }, '');
    });
    const files = getProjectStore().getState().files;
    expect(files['clip.scad']?.content).toBe('orig();'); // original untouched
    expect(files['clip_1.scad']?.content).toBe('incoming();');
    h.unmount();
  });
});
