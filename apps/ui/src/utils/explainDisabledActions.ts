// UIUX-6: the workspace toolbar's primary actions (Render / Export / Share / Save / Make it real)
// use the native `disabled` attribute. A disabled button is removed from the tab order, so a
// keyboard-only or screen-reader user cannot focus it to hear the hover `title` that explains WHY it
// is grayed out. The first pass added those titles, which only helped a sighted mouse user.
//
// This maps the SAME disabling conditions to plain-English lines that App renders as always-visible
// text inside the Explain panel (a persistent region in the a11y tree), so the reasons are reachable
// by everyone. Pure + input-only so it can be unit-tested directly — the regression guard UIUX-6 was
// missing.

export interface DisabledActionInputs {
  /** The shared Render/Export/Share disabled reason (rendering in progress, or engine still starting);
   *  null when those actions are enabled. */
  renderExportShareReason: string | null;
  /** True once a completed, sliceable engine design exists. Gates Save and Make it real. */
  hasEngineDesign: boolean;
  /** True when the selected printer profile can't be used for slicing. */
  selectedPrinterBlocked: boolean;
  /** True when a printer + material slice profile is selected and ready. */
  sliceProfileReady: boolean;
  /** True while a render is in flight (already reflected in renderExportShareReason). */
  isRendering: boolean;
}

/** Plain-English reasons for each currently-disabled primary toolbar action, most-blocking first.
 *  Empty when nothing is disabled. */
export function explainDisabledActions(i: DisabledActionInputs): string[] {
  const lines: string[] = [];
  if (i.renderExportShareReason) {
    lines.push(`Render, Export, Share: ${i.renderExportShareReason}`);
  }
  if (!i.hasEngineDesign) {
    lines.push("Save and Make it real: describe a part first");
  } else if (i.selectedPrinterBlocked) {
    lines.push("Make it real: the selected printer profile is unavailable");
  } else if (!i.sliceProfileReady && !i.isRendering) {
    lines.push("Make it real: choose a printer and material profile first");
  }
  return lines;
}
