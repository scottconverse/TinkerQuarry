import { ridFromResult, parseCustomizerValues, pureTuneValues } from '../engineDocument';
import type { DesignResult } from '../engineClient';

const ORIGINAL = `width = 80; // [10:1:170]
depth = 60; // [10:1:170]
wall = 2; // [0.8:0.2:8]
use <library/containers.scad>;
snap_box(width=width, depth=depth, wall=wall);
`;

describe('engineDocument — customizer tune detection (re-render-on-tune)', () => {
  it('parses top-level customizer slider values', () => {
    expect(parseCustomizerValues(ORIGINAL)).toEqual({ width: 80, depth: 60, wall: 2 });
  });

  it('returns the tuned values when ONLY a slider value changed', () => {
    const tuned = ORIGINAL.replace('width = 80;', 'width = 120;');
    expect(pureTuneValues(tuned, ORIGINAL)).toEqual({ width: 120, depth: 60, wall: 2 });
  });

  it('returns null for a STRUCTURAL edit (never mistakes an edit for a tune)', () => {
    const edited = ORIGINAL + '\ncube(5); // user-added';
    expect(pureTuneValues(edited, ORIGINAL)).toBeNull();
  });

  it('returns null when nothing actually changed, or there are no sliders', () => {
    expect(pureTuneValues(ORIGINAL, ORIGINAL)).toBeNull();
    expect(pureTuneValues('cube(10);', 'cube(10);')).toBeNull(); // LLM part, no sliders
  });
});

describe('engineDocument — ridFromResult (Phase 4 B core)', () => {
  it('prefers a top-level numeric rid', () => {
    expect(ridFromResult({ rid: 5, status: 'completed' } as DesignResult)).toBe(5);
  });

  it('derives the id from the mesh URL when there is no top-level rid', () => {
    expect(ridFromResult({ status: 'completed', mesh_url: '/api/mesh/12' } as DesignResult)).toBe(12);
  });

  it('strips a cache-buster (?v=) from the mesh URL', () => {
    expect(
      ridFromResult({ status: 'completed', mesh_url: '/api/mesh/7?v=3' } as DesignResult)
    ).toBe(7);
  });

  it('returns undefined when neither is present (gate_failed / clarification)', () => {
    expect(ridFromResult({ status: 'gate_failed' } as DesignResult)).toBeUndefined();
    expect(ridFromResult({ status: 'clarification_needed', mesh_url: null } as DesignResult)).toBeUndefined();
  });
});
