import { ridFromResult } from '../engineDocument';
import type { DesignResult } from '../engineClient';

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
