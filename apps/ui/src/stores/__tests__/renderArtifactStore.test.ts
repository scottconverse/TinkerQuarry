import {
  __resetRenderArtifactStoreForTests,
  getArtifactByRequestId,
  getLatestArtifactForTarget,
  getLatestSuccessfulArtifactForTarget,
  getRenderArtifactState,
} from '../renderArtifactStore';

const sceneStyle = {
  background: 'system',
  lighting: 'studio',
  grid: true,
} as const;

describe('renderArtifactStore', () => {
  beforeEach(() => {
    __resetRenderArtifactStoreForTests();
  });

  it('publishes settled artifacts by target and request id', () => {
    const store = getRenderArtifactState();
    store.setActiveRenderTarget('openscad/poly555.scad', '/workspace/poly555');
    store.markRenderStarted('openscad/poly555.scad', 7);
    store.publishSettledArtifact({
      requestId: 7,
      renderTargetPath: 'openscad/poly555.scad',
      workspaceRoot: '/workspace/poly555',
      sourceHash: 'abc12345',
      previewKind: 'mesh',
      previewSrc: 'blob:poly555',
      diagnostics: [],
      error: '',
      dimensionMode: '3d',
      sceneStyle: sceneStyle as never,
      useModelColors: true,
      createdAt: 1,
    });

    expect(getLatestArtifactForTarget('openscad/poly555.scad')?.previewSrc).toBe('blob:poly555');
    expect(getLatestSuccessfulArtifactForTarget('openscad/poly555.scad')?.requestId).toBe(7);
    expect(getArtifactByRequestId(7)?.renderTargetPath).toBe('openscad/poly555.scad');
    expect(
      getRenderArtifactState().inFlightRequestIdByTarget['openscad/poly555.scad']
    ).toBeUndefined();
  });

  it('keeps the last successful artifact when a later render fails', () => {
    const store = getRenderArtifactState();
    store.setActiveRenderTarget('main.scad', '/workspace/project');
    store.publishSettledArtifact({
      requestId: 1,
      renderTargetPath: 'main.scad',
      workspaceRoot: '/workspace/project',
      sourceHash: 'clean123',
      previewKind: 'mesh',
      previewSrc: 'blob:clean',
      diagnostics: [],
      error: '',
      dimensionMode: '3d',
      sceneStyle: sceneStyle as never,
      useModelColors: true,
      createdAt: 1,
    });
    store.publishSettledArtifact({
      requestId: 2,
      renderTargetPath: 'main.scad',
      workspaceRoot: '/workspace/project',
      sourceHash: 'broken123',
      previewKind: 'mesh',
      previewSrc: '',
      diagnostics: [{ severity: 'error', message: 'Parser error' }],
      error: '',
      dimensionMode: '3d',
      sceneStyle: sceneStyle as never,
      useModelColors: true,
      createdAt: 2,
    });

    expect(getLatestArtifactForTarget('main.scad')?.requestId).toBe(2);
    expect(getLatestSuccessfulArtifactForTarget('main.scad')?.requestId).toBe(1);
  });

  it('clears prior artifacts when the workspace root changes', () => {
    const store = getRenderArtifactState();
    store.setActiveRenderTarget('main.scad', '/workspace/first');
    store.publishSettledArtifact({
      requestId: 1,
      renderTargetPath: 'main.scad',
      workspaceRoot: '/workspace/first',
      sourceHash: 'first123',
      previewKind: 'mesh',
      previewSrc: 'blob:first',
      diagnostics: [],
      error: '',
      dimensionMode: '3d',
      sceneStyle: sceneStyle as never,
      useModelColors: true,
      createdAt: 1,
    });

    store.setActiveRenderTarget('openscad/poly555.scad', '/workspace/second');

    expect(getLatestArtifactForTarget('main.scad')).toBeNull();
    expect(getRenderArtifactState().workspaceRoot).toBe('/workspace/second');
    expect(getRenderArtifactState().activeRenderTargetPath).toBe('openscad/poly555.scad');
  });
});
