import { engineDesignPreview, engineGateSummary, type EnginePreview } from '../engineDesign';
import type { DesignResult } from '../engineClient';

describe('engineDesign — engine → preview glue (Phase 4)', () => {
  it('maps a completed design with a mesh to the viewer preview fields', () => {
    const d: DesignResult = {
      rid: 1,
      status: 'completed',
      has_mesh: true,
      mesh_url: '/api/mesh/1',
    };
    const p = engineDesignPreview(d) as EnginePreview;
    expect(p).toEqual({ previewSrc: '/api/mesh/1', previewKind: 'mesh' });
  });

  it('returns null when there is no mesh (gate_failed / clarification / model_unavailable)', () => {
    expect(engineDesignPreview({ rid: 2, status: 'gate_failed', has_mesh: false })).toBeNull();
    expect(engineDesignPreview({ rid: 3, status: 'clarification_needed' })).toBeNull();
  });

  it('summarizes the gate as verdict + score + failing/warning checks', () => {
    const d: DesignResult = {
      rid: 4,
      status: 'completed',
      has_mesh: true,
      mesh_url: '/api/mesh/4',
      report: {
        gate_status: 'pass',
        readiness: { score: 92, verdict: 'Ready to slice' },
        findings: [
          { key: 'mesh.solid', label: 'Closed, watertight solid', ok: true },
          { key: 'wall.ok', label: 'Wall thickness', warn: true, detail: '1.0 mm is thin' },
        ],
      },
    };
    const s = engineGateSummary(d);
    expect(s).toContain('Ready to slice (92/100)');
    expect(s).toContain('Wall thickness: 1.0 mm is thin'); // the warning check is surfaced
    expect(s).not.toContain('Closed, watertight solid'); // passing checks are not noise
  });
});
