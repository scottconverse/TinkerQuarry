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

  // WALK-1 (Blocker, gate 2026-07-19): a response with NO `report` — every non-completed
  // status — used to fall through to `String(d.status)`, so the user was shown the raw enum
  // ("model_unavailable" / "clarification_needed") instead of the sentence the engine sent.
  // The engine's own words are the whole point of these branches.
  describe('no report — the engine speaks, not the enum (WALK-1)', () => {
    it('model_unavailable: shows the engine error sentence, never the raw status', () => {
      const d: DesignResult = {
        rid: 5,
        status: 'model_unavailable',
        has_mesh: false,
        error:
          "KimCad couldn't reach your local AI — it isn't running. It starts up with TinkerQuarry, so wait a few seconds and try again; if it keeps failing, close and reopen TinkerQuarry.",
      };
      const s = engineGateSummary(d);
      expect(s).toBe(d.error); // the engine's exact sentence, verbatim
      expect(s).not.toContain('model_unavailable');
    });

    it('clarification_needed: shows the engine question, never the raw status', () => {
      const d: DesignResult = {
        rid: 6,
        status: 'clarification_needed',
        has_mesh: false,
        clarification: 'How tall should the bracket be, in millimetres?',
      };
      const s = engineGateSummary(d);
      expect(s).toBe('How tall should the bracket be, in millimetres?');
      expect(s).not.toContain('clarification_needed');
    });

    it('prefers the clarification question over a generic error on the same payload', () => {
      const s = engineGateSummary({
        rid: 7,
        status: 'clarification_needed',
        clarification: 'What bore diameter do you need?',
        error: 'clarification required',
      });
      expect(s).toBe('What bore diameter do you need?');
    });

    // WALK-2 (Critical, gate 2026-07-19): the engine's model_unavailable copy used to tell users
    // to "restart it from Settings" when no such control exists anywhere in Settings. The engine
    // string now names the real recovery (pipeline.py MODEL_UNAVAILABLE_MESSAGE); the UI's own
    // fallback — used when the engine sends a bare status with no message — must say the same
    // thing rather than reintroducing the dead end.
    it('names the real recovery step for model_unavailable, never Settings', () => {
      const s = engineGateSummary({ rid: 9, status: 'model_unavailable' });
      expect(s).toMatch(/close and reopen TinkerQuarry/i);
      expect(s).not.toMatch(/settings/i);
    });

    it('never sends the user to Settings in any fallback copy', () => {
      for (const status of [
        'gate_failed',
        'render_failed',
        'plan_failed',
        'clarification_needed',
        'model_unavailable',
        'needs_experimental',
      ]) {
        expect(engineGateSummary({ rid: 10, status })).not.toMatch(/settings/i);
      }
    });

    it('never leaks a raw DesignStatus for any non-completed status with no message', () => {
      const statuses = [
        'gate_failed',
        'render_failed',
        'plan_failed',
        'clarification_needed',
        'model_unavailable',
        'needs_experimental',
      ];
      for (const status of statuses) {
        const s = engineGateSummary({ rid: 8, status });
        expect(s).not.toContain(status); // the bare enum is never user-facing copy
        expect(s.length).toBeGreaterThan(0); // ...and the user is not left with nothing
      }
    });
  });
});
