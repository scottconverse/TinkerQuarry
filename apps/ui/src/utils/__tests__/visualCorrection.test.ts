import {
  MAX_VISUAL_CORRECTION_ROUNDS,
  canApplyVisualCorrection,
  visualCorrectionApplyingSummary,
} from '../visualCorrection';

describe('visualCorrection helpers', () => {
  it('allows a non-empty correction below the convergence cap', () => {
    expect(canApplyVisualCorrection('Fix the hole placement', 0, false)).toBe(true);
    expect(visualCorrectionApplyingSummary(1)).toBe(
      `Visual review: applying fix 2 of ${MAX_VISUAL_CORRECTION_ROUNDS}`
    );
  });

  it('blocks empty prompts, concurrent applies, and correction rounds at the cap', () => {
    expect(canApplyVisualCorrection('   ', 0, false)).toBe(false);
    expect(canApplyVisualCorrection('Fix it', 0, true)).toBe(false);
    expect(canApplyVisualCorrection('Fix it', MAX_VISUAL_CORRECTION_ROUNDS, false)).toBe(false);
  });
});
