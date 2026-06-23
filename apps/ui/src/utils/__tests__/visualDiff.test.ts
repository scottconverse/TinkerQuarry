import { formatVisualDifference, pixelDifferencePercent } from '../visualDiff';

describe('visualDiff helpers', () => {
  it('computes changed pixels above the color threshold', () => {
    const before = new Uint8ClampedArray([
      0, 0, 0, 255,
      10, 10, 10, 255,
    ]);
    const after = new Uint8ClampedArray([
      0, 0, 0, 255,
      200, 10, 10, 255,
    ]);

    expect(pixelDifferencePercent(before, after)).toBe(50);
  });

  it('rejects incompatible buffers and formats small/large differences', () => {
    expect(pixelDifferencePercent(new Uint8ClampedArray([0]), new Uint8ClampedArray([0]))).toBeNull();
    expect(formatVisualDifference(null)).toBeNull();
    expect(formatVisualDifference(0.01)).toBe('Visual diff: no visible change from prior candidate');
    expect(formatVisualDifference(6.25)).toBe('Visual diff: 6.3% changed from prior candidate');
    expect(formatVisualDifference(42.25)).toBe('Visual diff: 42% changed from prior candidate');
  });
});
