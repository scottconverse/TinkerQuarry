/** @jest-environment jsdom */

import { act } from '@testing-library/react';
import { jest } from '@jest/globals';
import { createAnalyticsSpy, createHookHarness } from './test-utils';
import type { AiDraft } from '@/types/aiChat';
import type { EngineDocOutcome } from '@/services/engineDocument';

const analytics = createAnalyticsSpy();

const mockPickDirectory = jest.fn<() => Promise<string | null>>();
const mockCreateProjectDirectory = jest.fn<() => Promise<string | null>>();
const mockGetDefaultProjectsDirectory = jest.fn<() => Promise<string | null>>();
const mockFileOpen = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockFileRead = jest.fn<(...args: unknown[]) => Promise<unknown>>();

const platform = {
  capabilities: { hasFileSystem: true },
  pickDirectory: (...args: unknown[]) => mockPickDirectory(...(args as [])),
  createProjectDirectory: (...args: unknown[]) =>
    mockCreateProjectDirectory(...(args as [])),
  getDefaultProjectsDirectory: () => mockGetDefaultProjectsDirectory(),
  fileOpen: (...args: unknown[]) => mockFileOpen(...args),
  fileRead: (...args: unknown[]) => mockFileRead(...args),
};

const mockOpenFileInWindow = jest.fn<(...args: unknown[]) => Promise<unknown>>(
  async () => ({
    projectRoot: null,
    projectPath: 'opened.scad',
    activeTabId: 'tab-1',
    fileCount: 1,
    reusedExistingTab: false,
  }),
);
const mockOpenWorkspaceFolderInWindow = jest.fn<
  (...args: unknown[]) => Promise<unknown>
>(async () => ({
  workspaceRoot: '/opened/dir',
  renderTargetPath: 'main.scad',
  emptyFolders: [],
  createdDefaultFile: false,
  fileCount: 1,
  activeTabId: 'tab-1',
}));

jest.unstable_mockModule('@/platform', () => ({
  getPlatform: () => platform,
}));
jest.unstable_mockModule('@/services/windowOpenService', () => ({
  openFileInWindow: (...args: unknown[]) => mockOpenFileInWindow(...args),
  openWorkspaceFolderInWindow: (...args: unknown[]) =>
    mockOpenWorkspaceFolderInWindow(...args),
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

let useProjectOnboarding: typeof import('../useProjectOnboarding').useProjectOnboarding;
let resetWorkspaceStore: typeof import('@/stores/workspaceStore').resetWorkspaceStore;
let getWorkspaceState: typeof import('@/stores/workspaceStore').getWorkspaceState;

const hideWelcomeScreen = jest.fn();
const switchTab = jest.fn<(id: string) => Promise<void>>(async () => {});
const setDraft = jest.fn<(draft: AiDraft) => void>();
const submitDraft = jest.fn<(draftOverride?: AiDraft) => Promise<void>>(
  async () => {},
);
const handleEngineDescribe = jest.fn<
  (prompt: string) => Promise<EngineDocOutcome>
>();

function mount(overrides: { defaultProjectDirectory?: string; draftText?: string } = {}) {
  return createHookHarness(() =>
    useProjectOnboarding({
      defaultProjectDirectory: overrides.defaultProjectDirectory ?? '',
      hideWelcomeScreen,
      switchTab,
      draftText: overrides.draftText ?? '',
      setDraft,
      submitDraft,
      handleEngineDescribe,
    }),
  );
}

describe('useProjectOnboarding (extracted from App.tsx, phase 1e) — real stores, mock platform', () => {
  beforeAll(async () => {
    ({ useProjectOnboarding } = await import('../useProjectOnboarding'));
    ({ resetWorkspaceStore, getWorkspaceState } = await import('@/stores/workspaceStore'));
  });

  beforeEach(() => {
    jest.clearAllMocks();
    platform.capabilities.hasFileSystem = true;
    act(() => {
      resetWorkspaceStore();
    });
  });

  describe('default project directory resolution', () => {
    it('adopts the configured directory immediately (no platform lookup)', async () => {
      const h = mount({ defaultProjectDirectory: '/configured/dir' });
      // Effect runs on mount; flush it.
      await act(async () => {});
      expect(mockGetDefaultProjectsDirectory).not.toHaveBeenCalled();
      expect(h.current().hasCustomProjectDir).toBe(true);
      expect(h.current().displayProjectDir).toBe('/configured/dir');
      h.unmount();
    });

    it('falls back to the platform default and appends a pending project name', async () => {
      mockGetDefaultProjectsDirectory.mockResolvedValue('/default/dir');
      const h = mount({ defaultProjectDirectory: '' });
      await act(async () => {});
      expect(mockGetDefaultProjectsDirectory).toHaveBeenCalledTimes(1);
      expect(h.current().hasCustomProjectDir).toBe(false);
      expect(h.current().displayProjectDir).toMatch(/^\/default\/dir\/.+/);
      h.unmount();
    });

    it('never resolves a directory on a platform without a filesystem', async () => {
      platform.capabilities.hasFileSystem = false;
      const h = mount({ defaultProjectDirectory: '/configured/dir' });
      await act(async () => {});
      expect(mockGetDefaultProjectsDirectory).not.toHaveBeenCalled();
      expect(h.current().displayProjectDir).toBeNull();
      h.unmount();
    });
  });

  describe('handleChangeProjectDirectory', () => {
    it('adopts the picked directory as the custom directory', async () => {
      mockPickDirectory.mockResolvedValue('/picked/dir');
      const h = mount({ defaultProjectDirectory: '' });
      await act(async () => {
        await h.current().handleChangeProjectDirectory();
      });
      expect(h.current().hasCustomProjectDir).toBe(true);
      expect(h.current().displayProjectDir).toBe('/picked/dir');
      h.unmount();
    });

    it('leaves the directory untouched when the picker is cancelled', async () => {
      mockPickDirectory.mockResolvedValue(null);
      const h = mount({ defaultProjectDirectory: '' });
      await act(async () => {
        await h.current().handleChangeProjectDirectory();
      });
      expect(h.current().hasCustomProjectDir).toBe(false);
      h.unmount();
    });
  });

  describe('handleStartManually / handleStartWithDraft', () => {
    it('handleStartManually hides the welcome screen immediately and opens the resolved directory', async () => {
      mockGetDefaultProjectsDirectory.mockResolvedValue('/default/dir');
      mockCreateProjectDirectory.mockResolvedValue('/default/dir/random-name');
      const h = mount({ defaultProjectDirectory: '' });
      await act(async () => {}); // let the directory-resolution effect settle
      await act(async () => {
        h.current().handleStartManually();
      });
      expect(hideWelcomeScreen).toHaveBeenCalledTimes(1);
      expect(mockOpenWorkspaceFolderInWindow).toHaveBeenCalledTimes(1);
      expect(mockCreateProjectDirectory).toHaveBeenCalledWith(
        '/default/dir',
        expect.any(String),
      );
      h.unmount();
    });

    it('handleStartManually does nothing on a platform without a filesystem', async () => {
      platform.capabilities.hasFileSystem = false;
      const h = mount({ defaultProjectDirectory: '/configured/dir' });
      await act(async () => {
        h.current().handleStartManually();
      });
      expect(hideWelcomeScreen).toHaveBeenCalledTimes(1);
      expect(mockOpenWorkspaceFolderInWindow).not.toHaveBeenCalled();
      h.unmount();
    });

    it('handleStartWithDraft prefers the local engine when a prompt is present, and hides the welcome screen only on success', async () => {
      handleEngineDescribe.mockResolvedValue({ ok: true } as EngineDocOutcome);
      const h = mount({ draftText: 'a lamp shade' });
      await act(async () => {
        h.current().handleStartWithDraft();
      });
      expect(handleEngineDescribe).toHaveBeenCalledWith('a lamp shade');
      expect(submitDraft).not.toHaveBeenCalled();
      expect(hideWelcomeScreen).toHaveBeenCalledTimes(1);
      h.unmount();
    });

    it('handleStartWithDraft keeps the welcome screen up when the engine describe fails', async () => {
      handleEngineDescribe.mockResolvedValue({ ok: false } as EngineDocOutcome);
      const h = mount({ draftText: 'a lamp shade' });
      await act(async () => {
        h.current().handleStartWithDraft();
      });
      expect(handleEngineDescribe).toHaveBeenCalledWith('a lamp shade');
      expect(hideWelcomeScreen).not.toHaveBeenCalled();
      h.unmount();
    });

    it('handleStartWithDraft prefers an explicit draftOverride prompt over the ambient draft text', async () => {
      handleEngineDescribe.mockResolvedValue({ ok: true } as EngineDocOutcome);
      const h = mount({ draftText: 'ambient text' });
      const override: AiDraft = { text: 'override text', attachmentIds: [] };
      await act(async () => {
        h.current().handleStartWithDraft(override);
      });
      expect(setDraft).toHaveBeenCalledWith(override);
      expect(handleEngineDescribe).toHaveBeenCalledWith('override text');
      h.unmount();
    });

    it('handleStartWithDraft falls back to the conversational agent when there is no prompt text', async () => {
      mockGetDefaultProjectsDirectory.mockResolvedValue('/default/dir');
      mockCreateProjectDirectory.mockResolvedValue('/default/dir/random-name');
      const h = mount({ defaultProjectDirectory: '', draftText: '   ' });
      await act(async () => {}); // let the directory-resolution effect settle
      await act(async () => {
        h.current().handleStartWithDraft();
      });
      expect(handleEngineDescribe).not.toHaveBeenCalled();
      expect(mockOpenWorkspaceFolderInWindow).toHaveBeenCalledTimes(1);
      expect(hideWelcomeScreen).toHaveBeenCalledTimes(1);
      expect(submitDraft).toHaveBeenCalledTimes(1);
      h.unmount();
    });
  });

  describe('openWorkspaceFolderInCurrentWindow / openFileInCurrentWindow', () => {
    it('tracks analytics only when a source is given, and reports isProjectLoading while pending', async () => {
      let resolveOpen!: (value: unknown) => void;
      mockOpenWorkspaceFolderInWindow.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveOpen = resolve;
        }),
      );
      const h = mount();
      let pending!: Promise<unknown>;
      act(() => {
        pending = h.current().openWorkspaceFolderInCurrentWindow('/dir', {
          source: 'menu_open',
        });
      });
      expect(h.current().isProjectLoading).toBe(true);
      await act(async () => {
        resolveOpen({
          workspaceRoot: '/dir',
          renderTargetPath: 'main.scad',
          emptyFolders: [],
          createdDefaultFile: true,
          fileCount: 3,
          activeTabId: 'tab-1',
        });
        await pending;
      });
      expect(h.current().isProjectLoading).toBe(false);
      expect(analytics.track).toHaveBeenCalledWith('folder opened', {
        source: 'menu_open',
        file_count: 3,
        created_default_file: true,
      });
      h.unmount();
    });

    it('openFileInCurrentWindow does not track analytics when no source is given', async () => {
      const h = mount();
      await act(async () => {
        await h.current().openFileInCurrentWindow(
          { path: '/x.scad', name: 'x.scad', content: 'cube(1);' },
        );
      });
      expect(analytics.track).not.toHaveBeenCalled();
      h.unmount();
    });
  });

  describe('handleOpenRecent', () => {
    it('opens a recent folder path directly', async () => {
      const h = mount();
      let result!: string;
      await act(async () => {
        result = await h.current().handleOpenRecent('/dir', 'folder');
      });
      expect(result).toBe('opened');
      expect(mockOpenWorkspaceFolderInWindow).toHaveBeenCalledWith('/dir', {
        createIfEmpty: undefined,
      });
      h.unmount();
    });

    it('cancels a recent folder open on a platform without a filesystem', async () => {
      platform.capabilities.hasFileSystem = false;
      const h = mount();
      let result!: string;
      await act(async () => {
        result = await h.current().handleOpenRecent('/dir', 'folder');
      });
      expect(result).toBe('cancelled');
      expect(mockOpenWorkspaceFolderInWindow).not.toHaveBeenCalled();
      h.unmount();
    });

    it('switches to the existing tab instead of re-reading the file from disk', async () => {
      const h = mount();
      act(() => {
        getWorkspaceState().createTab({
          filePath: '/disk/existing.scad',
          name: 'existing.scad',
          projectPath: 'existing.scad',
        });
      });
      let result!: string;
      await act(async () => {
        result = await h.current().handleOpenRecent('/disk/existing.scad');
      });
      expect(result).toBe('opened');
      expect(switchTab).toHaveBeenCalledTimes(1);
      expect(hideWelcomeScreen).toHaveBeenCalledTimes(1);
      expect(mockFileRead).not.toHaveBeenCalled();
      h.unmount();
    });

    it('reads a not-yet-open file from disk and opens it in the current window', async () => {
      const fileResult = { path: '/disk/new.scad', name: 'new.scad', content: 'cube(2);' };
      mockFileRead.mockResolvedValue(fileResult);
      const h = mount();
      let result!: string;
      await act(async () => {
        result = await h.current().handleOpenRecent('/disk/new.scad');
      });
      expect(result).toBe('opened');
      expect(mockOpenFileInWindow).toHaveBeenCalledWith(fileResult);
      h.unmount();
    });

    it('cancels when the file no longer exists (fileRead returns null)', async () => {
      mockFileRead.mockResolvedValue(null);
      const h = mount();
      let result!: string;
      await act(async () => {
        result = await h.current().handleOpenRecent('/disk/gone.scad');
      });
      expect(result).toBe('cancelled');
      expect(mockOpenFileInWindow).not.toHaveBeenCalled();
      h.unmount();
    });

    it('cancels on a platform without a filesystem for a not-yet-open file', async () => {
      platform.capabilities.hasFileSystem = false;
      const h = mount();
      let result!: string;
      await act(async () => {
        result = await h.current().handleOpenRecent('/disk/new.scad');
      });
      expect(result).toBe('cancelled');
      h.unmount();
    });

    it('removes a recent file that errors while reading, reporting "removed"', async () => {
      // notifyError logs the real error to console.error — expected on this path, so
      // locally silence the global setup's throw-on-console.error for this test only.
      jest.spyOn(console, 'error').mockImplementation(() => {});
      mockFileRead.mockRejectedValue(new Error('ENOENT: no such file'));
      const h = mount();
      let result!: string;
      await act(async () => {
        result = await h.current().handleOpenRecent('/disk/broken.scad');
      });
      expect(result).toBe('removed');
      h.unmount();
    });
  });

  describe('handleOpenFile', () => {
    it('opens the file the platform dialog returns', async () => {
      const fileResult = { path: '/disk/picked.scad', name: 'picked.scad', content: 'cube(1);' };
      mockFileOpen.mockResolvedValue(fileResult);
      const h = mount();
      await act(async () => {
        await h.current().handleOpenFile();
      });
      expect(mockOpenFileInWindow).toHaveBeenCalledWith(fileResult);
      h.unmount();
    });

    it('does nothing when the dialog is cancelled (fileOpen returns null)', async () => {
      mockFileOpen.mockResolvedValue(null);
      const h = mount();
      await act(async () => {
        await h.current().handleOpenFile();
      });
      expect(mockOpenFileInWindow).not.toHaveBeenCalled();
      h.unmount();
    });
  });
});
