/** @jest-environment node */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * TQ-N1 was: a panel told the user to "enable CadQuery in Settings" when Settings had no such
 * control. Fixing it introduced the SAME defect one level down — the restored card pointed at
 * a control called "Download editable CAD (.STEP)" in the Export dialog, and no such label
 * exists anywhere in apps/ui. The Export dialog labels that format simply `STEP`.
 *
 * A prose sentence naming a UI control has nothing holding it to the UI, so it rots the moment
 * the control is renamed — which is exactly how TQ-N1 happened in the first place. This test is
 * that missing tie: any control name the CAD-export card quotes must actually be findable in
 * the component that owns it.
 */

// Jest runs this suite as ESM, where __dirname does not exist. Resolve from the package root
// the way the sibling doc-truth suite does (jest cwd is apps/ui).
const SRC = resolve(process.cwd(), "src", "components");
const CARD = readFileSync(resolve(SRC, "settings", "CadExportCard.tsx"), "utf8");
const EXPORT_DIALOG = readFileSync(resolve(SRC, "ExportDialog.tsx"), "utf8");

describe("the CAD export settings card only names controls that exist", () => {
  it("does not resurrect the phantom 'Download editable CAD' label", () => {
    expect(CARD).not.toMatch(/Download editable CAD/i);
  });

  it("names the STEP option the Export dialog actually renders", () => {
    // The card claims a STEP entry exists in the Export dialog's format list.
    expect(CARD).toMatch(/STEP/);
    expect(EXPORT_DIALOG).toMatch(/label:\s*['"]STEP['"]/);
  });

  it("still points at Settings only for things Settings owns", () => {
    // The card IS the Settings destination, so it must never send the reader onward to a
    // different Settings section to do the same job — that loop is what TQ-N1 was.
    expect(CARD).not.toMatch(/in Settings under/i);
  });
});
