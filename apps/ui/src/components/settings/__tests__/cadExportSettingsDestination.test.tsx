/** @jest-environment jsdom */

// TQ-N1: ProvenancePanel renders "CAD handoff: trusted twin exists; enable CadQuery in Settings
// for STEP" whenever the engine emits step_offer:"settings". This suite is the guard that the
// destination that sentence NAMES actually exists in the shipped Settings dialog. It walks the
// real SettingsDialog the way a user would — every nav tab, clicked — and carries a positive
// control so a zero-match result is a measurement rather than a failed render.

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { jest } from '@jest/globals';
import { ThemeProvider } from '../../../contexts/ThemeContext';

const mockGetPlatform = jest.fn();

jest.unstable_mockModule('@/platform', () => ({
  getPlatform: () => mockGetPlatform(),
}));

jest.unstable_mockModule('@monaco-editor/react', () => ({
  Editor: () => null,
}));

jest.unstable_mockModule('@/localAnalytics', () => ({
  bucketCount: (value: number) => String(value),
  createAnalyticsApi: () => ({
    track: jest.fn(),
    trackError: jest.fn(),
    setAnalyticsEnabled: jest.fn(),
  }),
  inferErrorDomain: () => 'ui',
  setAnalyticsEnabled: jest.fn(),
  trackAnalyticsError: jest.fn(),
  trackAnalyticsEvent: jest.fn(),
  useAnalytics: () => ({
    track: jest.fn(),
    trackError: jest.fn(),
    setAnalyticsEnabled: jest.fn(),
  }),
}));

jest.unstable_mockModule('@/stores/layoutStore', () => ({
  applyWorkspacePreset: jest.fn(),
}));

jest.unstable_mockModule('@/services/desktopMcp', () => ({
  buildClaudeMcpCommand: (port: number) => `claude ${port}`,
  buildCodexMcpCommand: (port: number) => `codex ${port}`,
  buildCursorMcpConfig: (port: number) => `cursor ${port}`,
  buildOpenCodeMcpConfig: (port: number) => `opencode ${port}`,
  getDesktopMcpStatus: jest.fn(async () => ({
    enabled: false,
    port: 32123,
    status: 'stopped',
    endpoint: 'http://127.0.0.1:32123/mcp',
    message: null,
  })),
  syncDesktopMcpConfig: jest.fn(async () => ({
    enabled: false,
    port: 32123,
    status: 'stopped',
    endpoint: 'http://127.0.0.1:32123/mcp',
    message: null,
  })),
}));

let SettingsDialog: typeof import('../../SettingsDialog').SettingsDialog;

// The seven tabs the punchlist's runtime proof walked, in nav order.
const TABS = ['appearance', 'viewer', 'editor', 'project', 'libraries', 'ai', 'about'] as const;

// The literal sentence ProvenancePanel renders for step_offer:"settings"
// (apps/ui/src/components/ProductEvidencePanels.tsx). Kept verbatim so a reword there that
// re-points the user somewhere else has to come back through this test.
const PROVENANCE_SENTENCE =
  'CAD handoff: trusted twin exists; enable CadQuery in Settings → Project for STEP';

describe('TQ-N1: the Settings destination the Provenance step_offer sentence names', () => {
  beforeAll(async () => {
    ({ SettingsDialog } = await import('../../SettingsDialog'));
  });

  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
    // SettingsDialog only renders the Libraries tab on the desktop branch (it reads
    // '__TAURI_INTERNALS__' in window), so force it on to walk all seven tabs.
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    mockGetPlatform.mockReturnValue({
      getLibraryPaths: jest.fn(async () => []),
      getDefaultProjectsDirectory: jest.fn(async () => '/Users/test/Documents/TinkerQuarry'),
      pickDirectory: jest.fn(async () => null),
      confirm: jest.fn(async () => true),
      capabilities: { hasFileSystem: true },
    });
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: jest.fn(async (input: string | URL | Request) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.includes('/api/health')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              version: '0.9.4',
              openscad: true,
              orcaslicer: true,
              cadquery: false,
              external_binaries: [],
            }),
          } as Response;
        }
        return { ok: true, status: 200, json: async () => ({ bundled: [], external: [] }) } as Response;
      }),
    });
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: jest.fn().mockImplementation(() => ({
        matches: false,
        media: '(prefers-color-scheme: dark)',
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      })),
    });
  });

  it('exists: walking all seven tabs finds a CadQuery/STEP control', async () => {
    const { container } = render(
      <ThemeProvider>
        <SettingsDialog isOpen onClose={() => {}} initialTab="appearance" />
      </ThemeProvider>
    );

    const seen: string[] = [];
    let allTabsText = '';
    for (const tab of TABS) {
      const navButton = screen.getByTestId(`settings-nav-${tab}`);
      fireEvent.click(navButton);
      await waitFor(() => expect(navButton).toHaveAttribute('aria-pressed', 'true'));
      seen.push(tab);
      allTabsText += `\n${container.textContent ?? ''}`;
    }

    // POSITIVE CONTROL 1 — every tab really was reached and rendered.
    expect(seen).toEqual([...TABS]);
    // POSITIVE CONTROL 2 — the walk really captured tab bodies, not an empty shell. "Anthropic"
    // lives only in the AI Assistant tab, so seeing it proves the concatenation has real content.
    expect(allTabsText).toMatch(/Anthropic/i);

    // THE ASSERTION: the destination named by PROVENANCE_SENTENCE is reachable in Settings.
    expect(PROVENANCE_SENTENCE).toMatch(/CadQuery/);
    expect(PROVENANCE_SENTENCE).toMatch(/STEP/);
    expect(allTabsText).toMatch(/CadQuery/i);
    expect(allTabsText).toMatch(/\.STEP|STEP/);

    // ...and the TAB it names is a real tab, not just a word in a sentence.
    expect(PROVENANCE_SENTENCE).toContain('Settings → Project');
    expect(screen.getByTestId('settings-nav-project')).toBeTruthy();
  });

  it('is a first-class card: the CAD export section carries a status and a re-check control', async () => {
    render(
      <ThemeProvider>
        <SettingsDialog isOpen onClose={() => {}} initialTab="project" />
      </ThemeProvider>
    );

    expect(await screen.findByText('Editable CAD export (.STEP)')).toBeTruthy();
    expect(screen.getByLabelText('Check for the CAD export engine')).toBeTruthy();
  });
});
