import { describeIntoStudio } from '../engineDocument';
import { getProjectStore, getProjectState } from '../../stores/projectStore';
import type { DesignResult } from '../engineClient';

// Locks the core describe→document orchestration: a successful design replaces the render-target
// document with the engine's SCAD; a no-design result leaves the document untouched and reports why;
// an empty workspace gets a fresh document. Uses the real project store (seeded) + injected engine
// stubs (no module mocking — keeps this suite robust).

function stubRun(result: Partial<DesignResult>, ok = true) {
  return async () => ({ result: result as DesignResult, preview: null, ok });
}
function stubSource(scad: string | null, ok = true) {
  return async () => ({ status: ok ? 200 : 500, ok, data: { rid: 1, scad: scad ?? '' } });
}

describe('describeIntoStudio — orchestration (Phase 4 B core)', () => {
  beforeEach(() => {
    getProjectStore().getState().openProject('/p', { 'main.scad': '// old' }, 'main.scad');
  });

  it('replaces the render-target document with the engine SCAD on a successful design', async () => {
    const out = await describeIntoStudio('a cube', undefined, {
      run: stubRun({ status: 'completed', mesh_url: '/api/mesh/5' }),
      source: stubSource('cube(5);'),
    });
    expect(out.ok).toBe(true);
    expect(out.rid).toBe(5);
    expect(out.path).toBe('main.scad');
    expect(getProjectState().files['main.scad'].content).toBe('cube(5);');
  });

  it('surfaces the engine dimensional headline as a lightweight Explain (§6.3)', async () => {
    const out = await describeIntoStudio('a 70x50x30 box', undefined, {
      run: stubRun({
        status: 'completed',
        mesh_url: '/api/mesh/5',
        report: { headline: 'Dimensions match: 70.0 × 50.0 × 30.0 mm.' },
      }),
      source: stubSource('box(70,50,30);'),
    });
    expect(out.ok).toBe(true);
    expect(out.headline).toBe('Dimensions match: 70.0 × 50.0 × 30.0 mm.');
  });

  it('leaves the document untouched and reports the reason when there is no printable design', async () => {
    const out = await describeIntoStudio('???', undefined, {
      run: stubRun({ status: 'gate_failed', error: 'walls too thin' }, false),
      source: stubSource(null),
    });
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/walls too thin/);
    expect(getProjectState().files['main.scad'].content).toBe('// old');
  });

  it('passes prior turns to the engine as `history` (the refine path)', async () => {
    let seenOpts: Record<string, unknown> | undefined;
    const prior = [
      { role: 'user' as const, content: 'a box' },
      { role: 'assistant' as const, content: 'Looks printable' },
    ];
    await describeIntoStudio('make it 10mm taller', prior, {
      run: async (_p: string, opts: Record<string, unknown>) => {
        seenOpts = opts;
        return {
          result: { status: 'completed', mesh_url: '/api/mesh/9' } as DesignResult,
          preview: null,
          ok: true,
        };
      },
      source: stubSource('box_taller();'),
    });
    expect(seenOpts?.history).toEqual(prior); // refine-in-context: prior turns reach the engine
  });

  it('creates a fresh document in an empty workspace', async () => {
    getProjectStore().getState().openProject(null, {}, null);
    const out = await describeIntoStudio('a cube', undefined, {
      run: stubRun({ status: 'completed', mesh_url: '/api/mesh/7' }),
      source: stubSource('cube(7);'),
    });
    expect(out.ok).toBe(true);
    expect(out.path).toBe('design.scad');
    expect(getProjectState().files['design.scad'].content).toBe('cube(7);');
  });
});
