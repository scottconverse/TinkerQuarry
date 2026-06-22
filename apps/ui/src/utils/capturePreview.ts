import { captureSvgPreviewImage, type SvgPreviewImageOptions } from './captureSvgPreviewImage';

export const MAIN_PREVIEW_VIEWER_ID = 'workspace-preview';

export type CaptureCurrentPreviewOptions = Pick<
  SvgPreviewImageOptions,
  'svgSourceUrl' | 'targetWidth' | 'targetHeight'
> & {
  viewerId?: string | null;
};

function getPreviewRoot(viewerId?: string | null): ParentNode | null {
  if (typeof document === 'undefined' || !viewerId) {
    return null;
  }

  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return document.querySelector(`[data-preview-root="${CSS.escape(viewerId)}"]`);
  }

  return document.querySelector(`[data-preview-root="${viewerId.replace(/"/g, '\\"')}"]`);
}

export async function captureCurrentPreview(
  options: CaptureCurrentPreviewOptions = {}
): Promise<string | null> {
  const previewRoot = getPreviewRoot(options.viewerId);
  const canvas = (previewRoot?.querySelector('canvas[data-engine]') ??
    document.querySelector('canvas[data-engine]')) as HTMLCanvasElement | null;
  if (canvas) {
    try {
      if (options.targetWidth || options.targetHeight) {
        const sourceWidth = canvas.width || canvas.clientWidth;
        const sourceHeight = canvas.height || canvas.clientHeight;
        const maxWidth = options.targetWidth ?? sourceWidth;
        const maxHeight = options.targetHeight ?? sourceHeight;
        const scale = Math.min(1, maxWidth / sourceWidth, maxHeight / sourceHeight);
        const width = Math.max(1, Math.round(sourceWidth * scale));
        const height = Math.max(1, Math.round(sourceHeight * scale));
        const out = document.createElement('canvas');
        out.width = width;
        out.height = height;
        out.getContext('2d')?.drawImage(canvas, 0, 0, width, height);
        return out.toDataURL('image/png');
      }
      return canvas.toDataURL('image/png');
    } catch (error) {
      if (import.meta.env.DEV) {
        console.warn('[capturePreview] Failed to capture 3D canvas:', error);
      }
    }
  }

  try {
    const svgElement =
      (previewRoot?.querySelector('[data-preview-svg]')?.closest('svg') as SVGSVGElement | null) ??
      null;

    return await captureSvgPreviewImage({
      svgSourceUrl: options.svgSourceUrl,
      svgElement,
      targetWidth: options.targetWidth,
      targetHeight: options.targetHeight,
    });
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('[capturePreview] Failed to capture SVG preview:', error);
    }
  }

  return null;
}
