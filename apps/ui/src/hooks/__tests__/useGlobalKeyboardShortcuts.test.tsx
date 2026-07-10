/** @jest-environment jsdom */

import { act, render } from '@testing-library/react';
import { jest } from '@jest/globals';
import { createRef } from 'react';

const mockOpenPanel = jest.fn();
const mockEmit = jest.fn();

jest.unstable_mockModule('@/stores/layoutStore', () => ({
  openPanel: (...args: unknown[]) => mockOpenPanel(...args),
}));
jest.unstable_mockModule('@/platform', () => ({
  eventBus: { emit: (...args: unknown[]) => mockEmit(...args) },
}));

let useGlobalKeyboardShortcuts: typeof import('../useGlobalKeyboardShortcuts').useGlobalKeyboardShortcuts;

const openSettings = jest.fn();
const createNewTab = jest.fn();
const closeTab = jest.fn();
const focusPrompt = jest.fn();
const aiPromptPanelRef = createRef<{ focusPrompt: () => void } | null>() as {
  current: { focusPrompt: () => void } | null;
};

function Harness() {
  useGlobalKeyboardShortcuts({
    aiPromptPanelRef,
    openSettings,
    createNewTab,
    closeTab,
    activeTabId: 'tab-1',
  });
  return null;
}

function press(key: string, init: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', {
    key,
    ctrlKey: true,
    cancelable: true,
    ...init,
  });
  act(() => {
    window.dispatchEvent(event);
  });
  return event;
}

describe('useGlobalKeyboardShortcuts (extracted from App.tsx, phase 1a)', () => {
  beforeAll(async () => {
    ({ useGlobalKeyboardShortcuts } = await import('../useGlobalKeyboardShortcuts'));
  });

  beforeEach(() => {
    jest.clearAllMocks();
    aiPromptPanelRef.current = { focusPrompt };
  });

  it('Ctrl+T creates a tab, Ctrl+W closes the ACTIVE tab, Ctrl+, opens settings', () => {
    const { unmount } = render(<Harness />);
    expect(press('t').defaultPrevented).toBe(true);
    expect(createNewTab).toHaveBeenCalledTimes(1);
    press('w');
    expect(closeTab).toHaveBeenCalledWith('tab-1');
    press(',');
    expect(openSettings).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('Ctrl+K opens the AI panel and focuses the prompt after the tick', () => {
    jest.useFakeTimers();
    try {
      const { unmount } = render(<Harness />);
      press('k');
      expect(mockOpenPanel).toHaveBeenCalledWith('ai-chat', 'ai-chat', 'AI');
      expect(focusPrompt).not.toHaveBeenCalled(); // deferred to a setTimeout(0)
      act(() => {
        jest.runAllTimers();
      });
      expect(focusPrompt).toHaveBeenCalledTimes(1);
      unmount();
    } finally {
      jest.useRealTimers();
    }
  });

  it('Ctrl+Alt+S emits the save-all menu event; plain keys do nothing', () => {
    const { unmount } = render(<Harness />);
    press('s', { altKey: true });
    expect(mockEmit).toHaveBeenCalledWith('menu:file:save_all');
    const plain = press('t', { ctrlKey: false });
    expect(plain.defaultPrevented).toBe(false);
    expect(createNewTab).not.toHaveBeenCalled();
    unmount();
  });

  it('unmount removes the listener (no zombie shortcuts)', () => {
    const { unmount } = render(<Harness />);
    unmount();
    press('t');
    expect(createNewTab).not.toHaveBeenCalled();
  });
});
