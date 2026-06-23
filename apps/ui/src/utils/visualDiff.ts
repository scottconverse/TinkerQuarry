export function pixelDifferencePercent(
  before: Uint8ClampedArray,
  after: Uint8ClampedArray,
  threshold = 24
): number | null {
  if (before.length !== after.length || before.length === 0 || before.length % 4 !== 0) {
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

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load preview image.'));
    img.src = dataUrl;
  });
}

export async function estimatePreviewDifferencePercent(
  beforeDataUrl: string,
  afterDataUrl: string,
  size = 128
): Promise<number | null> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    return null;
  }
  try {
    const [beforeImage, afterImage] = await Promise.all([
      loadImage(beforeDataUrl),
      loadImage(afterDataUrl),
    ]);
    const canvas = document.createElement('canvas');
    canvas.width = size * 2;
    canvas.height = size;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
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

export function formatVisualDifference(percent: number | null): string | null {
  if (percent == null) return null;
  if (percent < 0.05) return 'Visual diff: no visible change from prior candidate';
  return `Visual diff: ${percent.toFixed(percent < 10 ? 1 : 0)}% changed from prior candidate`;
}
