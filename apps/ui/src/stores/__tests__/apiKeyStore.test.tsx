/** @jest-environment jsdom */

import { act } from 'react';
import { render, screen } from '@testing-library/react';
import {
  clearOpenAiCompatibleConfig,
  clearApiKey,
  clearSessionApiKeysForTests,
  getOpenAiCompatibleConfig,
  getApiKey,
  getProviderFromModel,
  getStoredModel,
  getStoredModelSelection,
  invalidateApiKeyStatus,
  setStoredModelSelection,
  setStoredModel,
  storeOpenAiCompatibleConfig,
  storeApiKey,
  useAvailableProviders,
  useHasApiKey,
} from '../apiKeyStore';

function StoreHarness() {
  const providers = useAvailableProviders();
  const hasApiKey = useHasApiKey();

  return (
    <div>
      <div data-testid="providers">{providers.join(',')}</div>
      <div data-testid="has-key">{String(hasApiKey)}</div>
    </div>
  );
}

describe('apiKeyStore', () => {
  beforeEach(() => {
    localStorage.clear();
    clearSessionApiKeysForTests();
    invalidateApiKeyStatus();
  });

  it('keeps cloud keys in session memory and does not persist them', () => {
    storeApiKey('anthropic', 'secret-key');

    const stored = localStorage.getItem('openscad_studio_anthropic_api_key');
    expect(stored).toBeNull();
    expect(getApiKey('anthropic')).toBe('secret-key');
  });

  it('migrates legacy plaintext values into session memory and removes storage', () => {
    localStorage.setItem('openscad_studio_openai_api_key', 'plain-text');

    expect(getApiKey('openai')).toBe('plain-text');
    expect(localStorage.getItem('openscad_studio_openai_api_key')).toBeNull();
  });

  it('persists the selected model and infers providers from known model prefixes', () => {
    expect(getStoredModel()).toBe('claude-sonnet-4-5');
    expect(getStoredModelSelection()).toEqual({
      provider: 'anthropic',
      modelId: 'claude-sonnet-4-5',
    });

    setStoredModel('gpt-5.4');
    expect(getStoredModel()).toBe('gpt-5.4');
    expect(getStoredModelSelection()).toEqual({ provider: 'openai', modelId: 'gpt-5.4' });
    expect(getProviderFromModel('claude-sonnet-4-5')).toBe('anthropic');
    expect(getProviderFromModel('gpt-5.4')).toBe('openai');
    expect(getProviderFromModel('chatgpt-4o-latest')).toBe('openai');
    expect(getProviderFromModel('unknown-model')).toBe('anthropic');

    setStoredModelSelection({ provider: 'openai-compatible', modelId: 'gemma4:12b' });
    expect(getStoredModel()).toBe('gemma4:12b');
    expect(getStoredModelSelection()).toEqual({
      provider: 'openai-compatible',
      modelId: 'gemma4:12b',
    });
  });

  it('migrates legacy bare hosted model ids to provider-aware selections', () => {
    localStorage.setItem('openscad_studio_ai_model', 'claude-3-5-sonnet-20241022');

    expect(getStoredModelSelection()).toEqual({
      provider: 'anthropic',
      modelId: 'claude-3-5-sonnet-20241022',
    });

    localStorage.setItem('openscad_studio_ai_model', 'gpt-4o');

    expect(getStoredModelSelection()).toEqual({
      provider: 'openai',
      modelId: 'gpt-4o',
    });

    localStorage.setItem('openscad_studio_ai_model', 'o3-mini');

    expect(getStoredModelSelection()).toEqual({
      provider: 'openai',
      modelId: 'o3-mini',
    });
  });

  it('prefers the new provider-aware selection over a legacy bare model id', () => {
    localStorage.setItem('openscad_studio_ai_model', 'gpt-4o');
    localStorage.setItem(
      'openscad_studio_ai_model_selection',
      JSON.stringify({ provider: 'anthropic', modelId: 'claude-opus-4' })
    );

    expect(getStoredModel()).toBe('claude-opus-4');
    expect(getStoredModelSelection()).toEqual({
      provider: 'anthropic',
      modelId: 'claude-opus-4',
    });
  });

  it('falls back to a legacy bare model id when the provider-aware selection is corrupt', () => {
    localStorage.setItem('openscad_studio_ai_model_selection', 'not-json');
    localStorage.setItem('openscad_studio_ai_model', 'gpt-4o');

    expect(getStoredModelSelection()).toEqual({
      provider: 'openai',
      modelId: 'gpt-4o',
    });
  });

  it('falls back to the first configured provider for unknown legacy model ids', () => {
    storeApiKey('openai', 'openai-key');
    localStorage.setItem('openscad_studio_ai_model', 'unknown-legacy-model');

    expect(getStoredModelSelection()).toEqual({
      provider: 'openai',
      modelId: 'gpt-5.4',
    });
  });

  it('uses configured OpenAI-compatible settings for unknown legacy model ids', () => {
    storeOpenAiCompatibleConfig({
      baseUrl: ' http://127.0.0.1:11434/v1/ ',
      modelId: 'gemma4:12b',
      apiKey: null,
    });
    localStorage.setItem('openscad_studio_ai_model', 'local-alias');

    expect(getOpenAiCompatibleConfig()).toEqual({
      baseUrl: 'http://127.0.0.1:11434/v1',
      modelId: 'gemma4:12b',
      apiKey: null,
    });
    expect(getStoredModelSelection()).toEqual({
      provider: 'openai-compatible',
      modelId: 'gemma4:12b',
    });
  });

  it('publishes provider availability through useSyncExternalStore hooks', () => {
    render(<StoreHarness />);

    expect(screen.getByTestId('providers').textContent).toBe('');
    expect(screen.getByTestId('has-key').textContent).toBe('false');

    act(() => {
      storeApiKey('anthropic', 'a-key');
      storeApiKey('openai', 'o-key');
    });

    expect(screen.getByTestId('providers').textContent).toBe('anthropic,openai');
    expect(screen.getByTestId('has-key').textContent).toBe('true');

    act(() => {
      clearApiKey('anthropic');
      invalidateApiKeyStatus();
    });

    expect(screen.getByTestId('providers').textContent).toBe('openai');
    expect(screen.getByTestId('has-key').textContent).toBe('true');

    act(() => {
      clearApiKey('openai');
    });

    expect(screen.getByTestId('providers').textContent).toBe('');
    expect(screen.getByTestId('has-key').textContent).toBe('false');
  });

  it('publishes OpenAI-compatible availability without requiring an API key', () => {
    render(<StoreHarness />);

    act(() => {
      storeOpenAiCompatibleConfig({
        baseUrl: 'http://localhost:1234/v1',
        modelId: '',
        apiKey: null,
      });
    });

    expect(screen.getByTestId('providers').textContent).toBe('openai-compatible');
    expect(screen.getByTestId('has-key').textContent).toBe('true');
    expect(getApiKey('openai-compatible')).toBeNull();

    act(() => {
      clearOpenAiCompatibleConfig();
    });

    expect(screen.getByTestId('providers').textContent).toBe('');
    expect(screen.getByTestId('has-key').textContent).toBe('false');
  });
});
