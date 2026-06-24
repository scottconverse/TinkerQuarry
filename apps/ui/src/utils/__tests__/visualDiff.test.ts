import {
  analyzePixelDifference,
  formatVisualDifference,
  pixelDifferencePercent,
} from "../visualDiff";

describe("visualDiff helpers", () => {
  it("computes changed pixels above the color threshold", () => {
    const before = new Uint8ClampedArray([0, 0, 0, 255, 10, 10, 10, 255]);
    const after = new Uint8ClampedArray([0, 0, 0, 255, 200, 10, 10, 255]);

    expect(pixelDifferencePercent(before, after)).toBe(50);
  });

  it("rejects incompatible buffers and formats small/large differences", () => {
    expect(
      pixelDifferencePercent(
        new Uint8ClampedArray([0]),
        new Uint8ClampedArray([0]),
      ),
    ).toBeNull();
    expect(formatVisualDifference(null)).toBeNull();
    expect(formatVisualDifference(0.01)).toBe(
      "Visual diff: no visible change from prior candidate",
    );
    expect(formatVisualDifference(6.25)).toBe(
      "Visual diff: 6.3% changed from prior candidate",
    );
    expect(formatVisualDifference(42.25)).toBe(
      "Visual diff: 42% changed from prior candidate",
    );
  });

  it("reports structural hotspots and bounding boxes", () => {
    const before = new Uint8ClampedArray(3 * 3 * 4).fill(0);
    const after = new Uint8ClampedArray(before);
    for (let i = 0; i < after.length; i += 4) {
      after[i + 3] = 255;
      before[i + 3] = 255;
    }
    const center = (1 * 3 + 1) * 4;
    after[center] = 255;

    const analysis = analyzePixelDifference(before, after, 3, 3);

    expect(analysis?.changedPercent).toBeCloseTo(100 / 9);
    expect(analysis?.boundingBox).toEqual({ x: 1, y: 1, width: 1, height: 1 });
    expect(analysis?.hotspots[0]?.region).toBe("center");
    expect(analysis?.structuralSummary).toContain("Structural diff");
  });
});
