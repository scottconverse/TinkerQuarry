export function pixelDifferencePercent(
  before: Uint8ClampedArray,
  after: Uint8ClampedArray,
  threshold = 24,
): number | null {
  if (
    before.length !== after.length ||
    before.length === 0 ||
    before.length % 4 !== 0
  ) {
    return null;
  }
  let changed = 0;
  const pixels = before.length / 4;
  for (let i = 0; i < before.length; i += 4) {
    const dr = Math.abs(before[i] - after[i]);
    const dg = Math.abs(before[i + 1] - after[i + 1]);
    const db = Math.abs(before[i + 2] - after[i + 2]);
    const da = Math.abs(before[i + 3] - after[i + 3]);
    if (dr + dg + db + da >= threshold) {
      changed += 1;
    }
  }
  return (changed / pixels) * 100;
}

export interface VisualDiffHotspot {
  region:
    | "top-left"
    | "top"
    | "top-right"
    | "left"
    | "center"
    | "right"
    | "bottom-left"
    | "bottom"
    | "bottom-right";
  changedPercent: number;
}

export interface VisualDiffAnalysis {
  changedPercent: number;
  hotspots: VisualDiffHotspot[];
  boundingBox: { x: number; y: number; width: number; height: number } | null;
  structuralSummary: string;
}

export function analyzePixelDifference(
  before: Uint8ClampedArray,
  after: Uint8ClampedArray,
  width: number,
  height: number,
  threshold = 24,
): VisualDiffAnalysis | null {
  if (
    width <= 0 ||
    height <= 0 ||
    before.length !== after.length ||
    before.length !== width * height * 4
  ) {
    return null;
  }

  const grid = new Array<number>(9).fill(0);
  const gridTotals = new Array<number>(9).fill(0);
  let changed = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const gx = Math.min(2, Math.floor((x / width) * 3));
      const gy = Math.min(2, Math.floor((y / height) * 3));
      const gridIndex = gy * 3 + gx;
      gridTotals[gridIndex] += 1;

      const delta =
        Math.abs(before[i] - after[i]) +
        Math.abs(before[i + 1] - after[i + 1]) +
        Math.abs(before[i + 2] - after[i + 2]) +
        Math.abs(before[i + 3] - after[i + 3]);
      if (delta >= threshold) {
        changed += 1;
        grid[gridIndex] += 1;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  const regionNames: VisualDiffHotspot["region"][] = [
    "top-left",
    "top",
    "top-right",
    "left",
    "center",
    "right",
    "bottom-left",
    "bottom",
    "bottom-right",
  ];
  const hotspots = grid
    .map((count, index) => ({
      region: regionNames[index],
      changedPercent: gridTotals[index] ? (count / gridTotals[index]) * 100 : 0,
    }))
    .filter((item) => item.changedPercent >= 0.5)
    .sort((a, b) => b.changedPercent - a.changedPercent)
    .slice(0, 3);

  const changedPercent = (changed / (width * height)) * 100;
  const boundingBox =
    changed === 0
      ? null
      : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
  const hotspotText = hotspots.length
    ? `hotspots ${hotspots.map((h) => `${h.region} ${h.changedPercent.toFixed(1)}%`).join(", ")}`
    : "no localized hotspot";

  return {
    changedPercent,
    hotspots,
    boundingBox,
    structuralSummary:
      changedPercent < 0.05
        ? "Structural diff: no visible geometry movement detected"
        : `Structural diff: ${changedPercent.toFixed(changedPercent < 10 ? 1 : 0)}% changed, ${hotspotText}`,
  };
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load preview image."));
    img.src = dataUrl;
  });
}

export async function estimatePreviewDifferencePercent(
  beforeDataUrl: string,
  afterDataUrl: string,
  size = 128,
): Promise<number | null> {
  if (typeof document === "undefined" || typeof Image === "undefined") {
    return null;
  }
  try {
    const [beforeImage, afterImage] = await Promise.all([
      loadImage(beforeDataUrl),
      loadImage(afterDataUrl),
    ]);
    const canvas = document.createElement("canvas");
    canvas.width = size * 2;
    canvas.height = size;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(beforeImage, 0, 0, size, size);
    ctx.drawImage(afterImage, size, 0, size, size);
    const before = ctx.getImageData(0, 0, size, size).data;
    const after = ctx.getImageData(size, 0, size, size).data;
    return pixelDifferencePercent(before, after);
  } catch {
    return null;
  }
}

export async function analyzePreviewDifference(
  beforeDataUrl: string,
  afterDataUrl: string,
  size = 192,
): Promise<VisualDiffAnalysis | null> {
  if (typeof document === "undefined" || typeof Image === "undefined") {
    return null;
  }
  try {
    const [beforeImage, afterImage] = await Promise.all([
      loadImage(beforeDataUrl),
      loadImage(afterDataUrl),
    ]);
    const canvas = document.createElement("canvas");
    canvas.width = size * 2;
    canvas.height = size;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(beforeImage, 0, 0, size, size);
    ctx.drawImage(afterImage, size, 0, size, size);
    const before = ctx.getImageData(0, 0, size, size).data;
    const after = ctx.getImageData(size, 0, size, size).data;
    return analyzePixelDifference(before, after, size, size);
  } catch {
    return null;
  }
}

export function formatVisualDifference(percent: number | null): string | null {
  if (percent == null) return null;
  if (percent < 0.05)
    return "Visual diff: no visible change from prior candidate";
  return `Visual diff: ${percent.toFixed(percent < 10 ? 1 : 0)}% changed from prior candidate`;
}
