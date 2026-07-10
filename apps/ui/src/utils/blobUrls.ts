/** Revoke a blob: object URL, ignoring anything else (moved verbatim from App.tsx during
 * the v1.5 phase-1b extraction — shared by the render pipeline and tab/file teardown). */
export function revokeBlobUrl(url: string | null | undefined) {
  if (!url || !url.startsWith("blob:")) {
    return;
  }

  URL.revokeObjectURL(url);
}
