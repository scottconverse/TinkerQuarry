/** @jest-environment jsdom */

import { screen, fireEvent } from '@testing-library/react';
import { jest } from '@jest/globals';
import { clearApiKey, storeApiKey } from '../../stores/apiKeyStore';
import { renderWithProviders } from './test-utils';

const mockGetPlatform = jest.fn();

jest.unstable_mockModule('@/platform', () => ({
  getPlatform: () => mockGetPlatform(),
}));

let WelcomeScreen: typeof import('../WelcomeScreen').WelcomeScreen;

function createJsonResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

function renderWelcome() {
  return renderWithProviders(
    <WelcomeScreen
      draft={{ text: '', attachmentIds: [] }}
      attachments={{}}
      draftErrors={[]}
      canSubmitDraft={false}
      isProcessingAttachments={false}
      onDraftTextChange={() => {}}
      onDraftFilesSelected={() => {}}
      onDraftRemoveAttachment={() => {}}
      onStartWithDraft={() => {}}
      onStartManually={() => {}}
      onReopenDesign={jest.fn()}
      onOpenRecent={async () => 'opened'}
    />
  );
}

describe('WelcomeScreen My Designs management', () => {
  beforeAll(async () => {
    ({ WelcomeScreen } = await import('../WelcomeScreen'));
  });

  beforeEach(() => {
    localStorage.clear();
    clearApiKey('anthropic');
    clearApiKey('openai');
    storeApiKey('openai', 'openai-test-key');
    mockGetPlatform.mockReturnValue({
      capabilities: { hasFileSystem: false },
      fileExists: jest.fn(async () => false),
    });
  });

  afterEach(() => {
    localStorage.clear();
    jest.restoreAllMocks();
  });

  it('renames a saved design', async () => {
    const calls: string[] = [];
    jest.spyOn(window, 'prompt').mockReturnValue('Renamed Coaster');
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: jest.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        calls.push(`${init?.method ?? 'GET'} ${url} ${String(init?.body ?? '')}`);
        if (url.includes('/rename')) return createJsonResponse({ ok: true });
        if (url.includes('/api/designs')) {
          return createJsonResponse({
            designs: [{ id: 'd1', name: 'My Coaster', object_type: 'coaster' }],
          });
        }
        return createJsonResponse({ data: [] });
      }),
    });

    renderWelcome();
    await screen.findByText('My Coaster');
    fireEvent.click(screen.getByTestId('rename-design-d1'));

    await screen.findByText('Renamed Coaster');
    expect(calls.some((c) => c.includes('POST /api/designs/d1/rename'))).toBe(true);
    expect(calls.some((c) => c.includes('"name":"Renamed Coaster"'))).toBe(true);
  });

  it('duplicates a saved design', async () => {
    const calls: string[] = [];
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: jest.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        calls.push(`${init?.method ?? 'GET'} ${url}`);
        if (url.includes('/duplicate')) return createJsonResponse({ ok: true, id: 'd2' });
        if (url.includes('/api/designs')) {
          return createJsonResponse({
            designs: [{ id: 'd1', name: 'My Coaster', object_type: 'coaster' }],
          });
        }
        return createJsonResponse({ data: [] });
      }),
    });

    renderWelcome();
    await screen.findByText('My Coaster');
    fireEvent.click(screen.getByTestId('duplicate-design-d1'));

    await screen.findByText('My Coaster (copy)');
    expect(calls.some((c) => c === 'POST /api/designs/d1/duplicate')).toBe(true);
  });
});
