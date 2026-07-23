/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { jest } from '@jest/globals';
import { ThemeProvider } from '../../contexts/ThemeContext';
import {
  getAvailableProviders,
  getOpenAiCompatibleConfig,
  storeOpenAiCompatibleConfig,
} from '../../stores/apiKeyStore';

const mockGetPlatform = jest.fn();
const mockTrack = jest.fn();
const mockApplyWorkspacePreset = jest.fn();
const mockGetDesktopMcpStatus = jest.fn();
const mockSyncDesktopMcpConfig = jest.fn();
let platformMock: {
  getLibraryPaths: ReturnType<typeof jest.fn>;
  getDefaultProjectsDirectory: ReturnType<typeof jest.fn>;
  pickDirectory: ReturnType<typeof jest.fn>;
  confirm: ReturnType<typeof jest.fn>;
  capabilities: { hasFileSystem: boolean };
};

jest.unstable_mockModule('@/platform', () => ({
  getPlatform: () => mockGetPlatform(),
}));

jest.unstable_mockModule('@monaco-editor/react', () => ({
  Editor: () => null,
}));

jest.unstable_mockModule('@/localAnalytics', () => ({
  bucketCount: (value: number) => String(value),
  createAnalyticsApi: () => ({
    track: (...args: unknown[]) => mockTrack(...args),
    trackError: jest.fn(),
    setAnalyticsEnabled: jest.fn(),
  }),
  inferErrorDomain: () => 'ui',
  setAnalyticsEnabled: jest.fn(),
  trackAnalyticsError: jest.fn(),
  trackAnalyticsEvent: jest.fn(),
  useAnalytics: () => ({
    track: (...args: unknown[]) => mockTrack(...args),
    trackError: jest.fn(),
    setAnalyticsEnabled: jest.fn(),
  }),
}));

jest.unstable_mockModule('@/stores/layoutStore', () => ({
  applyWorkspacePreset: (...args: unknown[]) => mockApplyWorkspacePreset(...args),
}));

jest.unstable_mockModule('@/services/desktopMcp', () => ({
  buildClaudeMcpCommand: (port: number) =>
    `claude mcp add --transport http --scope user tinkerquarry http://127.0.0.1:${port}/mcp`,
  buildCodexMcpCommand: (port: number) =>
    `codex mcp add tinkerquarry --url http://127.0.0.1:${port}/mcp`,
  buildCursorMcpConfig: (port: number) => `{
  "mcpServers": {
    "tinkerquarry": {
      "url": "http://127.0.0.1:${port}/mcp"
    }
  }
}`,
  buildOpenCodeMcpConfig: (port: number) => `{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "tinkerquarry": {
      "type": "remote",
      "url": "http://127.0.0.1:${port}/mcp",
      "enabled": true
    }
  }
}`,
  getDesktopMcpStatus: (...args: unknown[]) => mockGetDesktopMcpStatus(...args),
  syncDesktopMcpConfig: (...args: unknown[]) => mockSyncDesktopMcpConfig(...args),
}));

let SettingsDialog: typeof import('../SettingsDialog').SettingsDialog;

describe('SettingsDialog', () => {
  beforeAll(async () => {
    ({ SettingsDialog } = await import('../SettingsDialog'));
  });

  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
    platformMock = {
      getLibraryPaths: jest.fn(async () => []),
      getDefaultProjectsDirectory: jest.fn(async () => '/Users/test/Documents/TinkerQuarry'),
      pickDirectory: jest.fn(async () => null),
      confirm: jest.fn(async () => true),
      capabilities: { hasFileSystem: true },
    };
    mockGetPlatform.mockReturnValue(platformMock);
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: jest.fn(async (input: string | URL | Request) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.includes('/api/libraries/admit')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              admitted: true,
              library: {
                name: 'NopSCADlib',
                slug: 'nopscadlib',
                include_prefix: 'external/nopscadlib/',
                file_count: 12,
              },
            }),
          } as Response;
        }
        if (url.includes('/api/libraries')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ bundled: [], external: [] }),
          } as Response;
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({}),
        } as Response;
      }),
    });
    mockGetDesktopMcpStatus.mockResolvedValue({
      enabled: true,
      port: 32123,
      status: 'running',
      endpoint: 'http://127.0.0.1:32123/mcp',
      message: null,
      sessionToken: 'a1b2c3d4e5f60718293a4b5c6d7e8f90',
    });
    mockSyncDesktopMcpConfig.mockResolvedValue({
      enabled: true,
      port: 32123,
      status: 'running',
      endpoint: 'http://127.0.0.1:32123/mcp',
      message: null,
      sessionToken: 'a1b2c3d4e5f60718293a4b5c6d7e8f90',
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

  it('shows viewer settings and disables axis labels when axes are hidden', async () => {
    localStorage.setItem(
      'openscad-studio-settings',
      JSON.stringify({
        viewer: {
          showAxes: false,
          showAxisLabels: false,
          show3DGrid: false,
          showShadows: false,
          showModelColors: false,
          showViewcube: false,
          measurementSnapEnabled: false,
          showSelectionInfo: false,
          show2DGrid: false,
          show2DAxes: false,
        },
      })
    );

    render(
      <ThemeProvider>
        <SettingsDialog isOpen onClose={() => {}} initialTab="viewer" />
      </ThemeProvider>
    );

    // 3D and 2D content are both visible without any tab switching
    expect(await screen.findByText('Show axes')).toBeTruthy();
    expect(screen.getByText('3D Viewer')).toBeTruthy();
    expect(screen.getByText('2D Viewer')).toBeTruthy();

    const axesToggle = screen.getByLabelText('Show axes');
    const axisLabelsToggle = screen.getByLabelText('Show axis labels');
    const threeDGridToggle = screen.getByLabelText('Show 3D grid');
    const shadowsToggle = screen.getByLabelText('Show shadows');
    const modelColorsToggle = screen.getByLabelText('Show model colors');
    const viewcubeToggle = screen.getByLabelText('Show viewcube');
    const snapToggle = screen.getByLabelText('Snap 3D measurements');
    const inspectionHudToggle = screen.getByLabelText('Show inspection HUD');

    expect(axesToggle).toHaveAttribute('data-state', 'unchecked');
    expect(axisLabelsToggle).toHaveAttribute('data-state', 'unchecked');
    expect(axisLabelsToggle).toBeDisabled();
    expect(threeDGridToggle).toHaveAttribute('data-state', 'unchecked');
    expect(shadowsToggle).toHaveAttribute('data-state', 'unchecked');
    expect(modelColorsToggle).toHaveAttribute('data-state', 'unchecked');
    expect(
      screen.getByText(/turn this off to render all geometry with the theme preview material/i)
    ).toBeTruthy();
    expect(viewcubeToggle).toHaveAttribute('data-state', 'unchecked');
    expect(snapToggle).toHaveAttribute('data-state', 'unchecked');
    expect(inspectionHudToggle).toHaveAttribute('data-state', 'unchecked');

    const gridToggle = screen.getByLabelText('Show 2D grid');
    const twoDAxesToggle = screen.getByLabelText('Show 2D axes');
    expect(gridToggle).toHaveAttribute('data-state', 'unchecked');
    expect(twoDAxesToggle).toHaveAttribute('data-state', 'unchecked');
  });

  it('offers Customizer First as a default layout option', async () => {
    render(
      <ThemeProvider>
        <SettingsDialog isOpen onClose={() => {}} initialTab="appearance" />
      </ThemeProvider>
    );

    expect(await screen.findByText('Default Layout')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Customizer First' })).toBeTruthy();
  });

  it('admits external SCAD libraries through the sandbox flow', async () => {
    platformMock.pickDirectory.mockResolvedValue('C:\\Users\\test\\NopSCADlib');

    render(
      <ThemeProvider>
        <SettingsDialog isOpen onClose={() => {}} initialTab="libraries" />
      </ThemeProvider>
    );

    expect(await screen.findByText('Admitted External Libraries')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Admit Library/i }));

    await waitFor(() => {
      expect(platformMock.confirm).toHaveBeenCalledWith(
        expect.stringMatching(/copy \.scad files into its sandbox/i),
        expect.objectContaining({ okLabel: 'Admit library' })
      );
    });
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/libraries/admit',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('NopSCADlib'),
        })
      );
    });
  });

  it('shows external agent MCP onboarding in the AI settings tab', async () => {
    render(
      <ThemeProvider>
        <SettingsDialog isOpen onClose={() => {}} initialTab="ai" />
      </ThemeProvider>
    );

    expect(await screen.findByText('External Agents')).toBeTruthy();
    expect(screen.getByText('Enable local MCP server')).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Claude Code/i })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getByRole('tab', { name: /Codex/i })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Cursor/i })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /OpenCode/i })).toBeTruthy();
    expect(screen.getByText(/claude mcp add --transport http --scope user/i)).toBeTruthy();
    expect(screen.getAllByText(/get_or_create_workspace/i).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: 'Copy' }).length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText(/http:\/\/127\.0\.0\.1:32123\/mcp/i).length).toBeGreaterThan(0);
    expect(mockGetDesktopMcpStatus).toHaveBeenCalled();
  });

  it('shows the per-boot MCP session token so an external agent can authenticate', async () => {
    const writeText = jest.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    render(
      <ThemeProvider>
        <SettingsDialog isOpen onClose={() => {}} initialTab="ai" />
      </ThemeProvider>
    );

    // The server rejects every request that does not carry this token, so if it
    // is never shown the whole External Agents feature is dead on arrival.
    expect(await screen.findByText('a1b2c3d4e5f60718293a4b5c6d7e8f90')).toBeTruthy();

    // Knowing the token is not enough — the client has to know which header it goes in.
    expect(screen.getByText(/Authorization: Bearer/i)).toBeTruthy();

    // And that a saved config goes stale on the next launch.
    expect(screen.getByText(/every time TinkerQuarry restarts/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /copy token/i }));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('a1b2c3d4e5f60718293a4b5c6d7e8f90');
    });
  });

  it('orders hosted API key cards before the OpenAI-compatible provider', async () => {
    render(
      <ThemeProvider>
        <SettingsDialog isOpen onClose={() => {}} initialTab="ai" />
      </ThemeProvider>
    );

    expect(
      await screen.findByText(
        'Connect hosted API keys or a local OpenAI-compatible server, then choose the model from the chat composer.'
      )
    ).toBeTruthy();

    const anthropicHeading = await screen.findByText('Anthropic API Key');
    const openAiHeading = screen.getByText('OpenAI API Key');
    const compatibleHeading = screen.getByText('OpenAI-compatible Provider');

    expect(
      anthropicHeading.compareDocumentPosition(openAiHeading) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(
      openAiHeading.compareDocumentPosition(compatibleHeading) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it('saves an OpenAI-compatible provider without requiring an API key', async () => {
    render(
      <ThemeProvider>
        <SettingsDialog isOpen onClose={() => {}} initialTab="ai" />
      </ThemeProvider>
    );

    expect(await screen.findByText('OpenAI-compatible Provider')).toBeTruthy();

    const baseUrlInput = screen.getByPlaceholderText('http://127.0.0.1:11434/v1');

    fireEvent.focus(baseUrlInput);
    fireEvent.change(baseUrlInput, { target: { value: ' http://localhost:1234/v1/ ' } });

    const saveButton = screen.getByRole('button', { name: 'Save AI Settings' });
    await waitFor(() => {
      expect(saveButton).not.toBeDisabled();
    });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(getAvailableProviders()).toContain('openai-compatible');
    });
    expect(getOpenAiCompatibleConfig()).toEqual({
      baseUrl: 'http://localhost:1234/v1',
      modelId: '',
      apiKey: null,
    });
    expect(mockTrack).toHaveBeenCalledWith('api key saved', {
      provider: 'openai-compatible',
    });
  });

  it('shows saved OpenAI-compatible settings before the local card is focused', async () => {
    storeOpenAiCompatibleConfig({
      baseUrl: 'http://localhost:1234/v1',
      modelId: '',
      apiKey: null,
    });

    render(
      <ThemeProvider>
        <SettingsDialog isOpen onClose={() => {}} initialTab="ai" />
      </ThemeProvider>
    );

    const baseUrlInput = (await screen.findByPlaceholderText(
      'http://127.0.0.1:11434/v1'
    )) as HTMLInputElement;
    expect(baseUrlInput.value).toBe('http://localhost:1234/v1');
  });

  it('notes that web users must enable CORS on local LLM servers', async () => {
    platformMock.capabilities.hasFileSystem = false;

    render(
      <ThemeProvider>
        <SettingsDialog isOpen onClose={() => {}} initialTab="ai" />
      </ThemeProvider>
    );

    expect(
      await screen.findByText('On the web, your local LLM server must allow browser CORS requests.')
    ).toBeTruthy();
  });

  it('tracks layout selection sources and viewer preference changes', async () => {
    const { unmount } = render(
      <ThemeProvider>
        <SettingsDialog isOpen onClose={() => {}} initialTab="appearance" />
      </ThemeProvider>
    );

    await screen.findByText('Default Layout');
    fireEvent.click(screen.getByRole('button', { name: 'Customizer First' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset layout' }));

    expect(mockTrack).toHaveBeenCalledWith(
      'workspace layout selected',
      expect.objectContaining({
        layout: 'customizer-first',
        source: 'settings',
        is_first_run: false,
      })
    );
    expect(mockTrack).toHaveBeenCalledWith(
      'workspace layout selected',
      expect.objectContaining({
        layout: 'customizer-first',
        source: 'layout_reset',
        is_first_run: false,
      })
    );
    expect(mockApplyWorkspacePreset).toHaveBeenCalledWith('customizer-first');
    unmount();

    render(
      <ThemeProvider>
        <SettingsDialog isOpen onClose={() => {}} initialTab="viewer" />
      </ThemeProvider>
    );

    await screen.findByText('Show axes');
    fireEvent.click(screen.getByLabelText('Snap 3D measurements'));
    fireEvent.click(screen.getByLabelText('Show model colors'));
    fireEvent.click(screen.getByRole('button', { name: 'Project' }));
    fireEvent.click(screen.getByLabelText('Measurement Unit'));
    fireEvent.click(await screen.findByRole('option', { name: /in \(inches\)/i }));

    expect(mockTrack).toHaveBeenCalledWith(
      'viewer preference changed',
      expect.objectContaining({
        setting: 'measurement_unit',
        value: 'in',
      })
    );
    expect(mockTrack).toHaveBeenCalledWith(
      'viewer preference changed',
      expect.objectContaining({
        setting: 'measurement_snap_enabled',
        enabled: false,
      })
    );
    expect(mockTrack).toHaveBeenCalledWith(
      'viewer preference changed',
      expect.objectContaining({
        setting: 'show_model_colors',
        enabled: false,
      })
    );
  });
});
