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

  it('falls back to plain source when inline source fails after a completed design', async () => {
    const calls: boolean[] = [];
    const out = await describeIntoStudio('a cube', undefined, {
      run: stubRun({ status: 'completed', mesh_url: '/api/mesh/5' }),
      source: async (_rid: number, inline: boolean) => {
        calls.push(inline);
        if (inline) {
          return { status: 500, ok: false, data: { error: 'inline failed' } };
        }
        return { status: 200, ok: true, data: { rid: 5, scad: 'use <library/box.scad>;' } };
      },
    });
    expect(out.ok).toBe(true);
    expect(calls).toEqual([true, false]);
    expect(getProjectState().files['main.scad'].content).toBe('use <library/box.scad>;');
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

  // E2E-D: a design that fails the gate BUT has a mesh must be shown read-only (report + mesh +
  // source, downloadable) instead of discarded — while never being marked sliceable (ok stays false).
  it('surfaces a gate-failed design read-only when it has a mesh, and loads its source', async () => {
    const runWithMesh = async () => ({
      result: {
        status: 'gate_failed',
        has_mesh: true,
        mesh_url: '/api/mesh/8',
        report: { headline: 'Walls 0.6 mm — below the 0.8 mm minimum.' },
      } as DesignResult,
      preview: { previewSrc: '/api/mesh/8', previewKind: 'mesh' as const },
      ok: false,
    });
    const out = await describeIntoStudio('a thin-walled box', undefined, {
      run: runWithMesh,
      source: stubSource('thin_box();'),
    });
    expect(out.ok).toBe(false); // NOT sliceable — it failed the gate
    expect(out.showable).toBe(true); // ...but inspectable + downloadable
    expect(out.rid).toBe(8);
    expect(out.scad).toBe('thin_box();');
    expect(getProjectState().files['main.scad'].content).toBe('thin_box();');
  });

  // Falsification pair for the test above: the SAME gate_failed status with NO mesh must NOT become
  // showable and must leave the document untouched — proving `showable` keys on the mesh, not on the
  // word "gate_failed". (If the discriminator were wrong, this would flip to showable and replace the doc.)
  it('does NOT surface a gate-failed design that has no mesh', async () => {
    const out = await describeIntoStudio('a nonsense part', undefined, {
      run: stubRun({ status: 'gate_failed', error: 'no geometry' }, false),
      source: stubSource('should_not_load();'),
    });
    expect(out.ok).toBe(false);
    expect(out.showable).toBeUndefined();
    expect(out.scad).toBeUndefined();
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
