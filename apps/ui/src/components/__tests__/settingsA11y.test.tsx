/** @jest-environment jsdom */

import { axe } from 'jest-axe';
import { jest } from '@jest/globals';
import { renderWithProviders } from './test-utils';

jest.unstable_mockModule('@monaco-editor/react', () => ({
  Editor: () => null,
}));

jest.unstable_mockModule('@/platform', () => ({
  getPlatform: () => ({
    capabilities: { hasFileSystem: false },
    getDefaultProjectsDirectory: jest.fn(async () => '/tmp/projects'),
    pickDirectory: jest.fn(async () => null),
    getLibraryPaths: jest.fn(async () => []),
  }),
}));

let EditorSettings: typeof import('../settings/EditorSettings').EditorSettings;
let ProjectSettings: typeof import('../settings/ProjectSettings').ProjectSettings;
let useSettings: typeof import('../../stores/settingsStore').useSettings;

beforeAll(async () => {
  ({ EditorSettings } = await import('../settings/EditorSettings'));
  ({ ProjectSettings } = await import('../settings/ProjectSettings'));
  ({ useSettings } = await import('../../stores/settingsStore'));
});

async function seriousOrCritical(container: HTMLElement) {
  const results = await axe(container);
  const found = results.violations.filter(
    (v) => v.impact === 'critical' || v.impact === 'serious'
  );
  if (found.length > 0) {
    console.error(
      'settings a11y serious/critical:',
      JSON.stringify(
        found.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length })),
        null,
        2
      )
    );
  }
  return found;
}

function EditorHarness() {
  const [settings] = useSettings();
  return (
    <EditorSettings
      settings={settings}
      onEditorChange={() => {}}
      localVimConfig=""
      onLocalVimConfigChange={() => {}}
    />
  );
}

function ProjectHarness() {
  const [settings] = useSettings();
  return <ProjectSettings settings={settings} onViewerChange={() => {}} />;
}

describe('Settings dropdowns a11y (§10/§12)', () => {
  it('EditorSettings (Indent Size / Render Delay selects) has no serious/critical violations', async () => {
    const { container } = renderWithProviders(<EditorHarness />);
    expect(await seriousOrCritical(container)).toEqual([]);
  });

  it('ProjectSettings (Measurement Unit select) has no serious/critical violations', async () => {
    const { container } = renderWithProviders(<ProjectHarness />);
    expect(await seriousOrCritical(container)).toEqual([]);
  });
});
