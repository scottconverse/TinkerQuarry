/** @jest-environment node */

// UIUX-6 wiring guard. explainDisabledActions() has its own unit test, but the punch-list claim is
// that the disabled-control reasons are REACHABLE in the visible Explain panel — which only holds if
// App.tsx actually (a) calls the helper, (b) keeps its output in `disabledActionReasons`, and
// (c) renders that list inside the explain panel. App.tsx has no RTL harness (2600+ lines, deeply
// wired), so this asserts the full data path structurally against the source: helper -> state ->
// rendered element. Removing any link (drop the render, or stop feeding it from the helper) trips a
// distinct assertion — unlike a bare "the word appears somewhere" grep, which the whole v1.5.1
// branch exists to stop writing.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const APP = readFileSync(resolve(process.cwd(), 'src', 'App.tsx'), 'utf8');

describe('UIUX-6: the Explain panel is actually wired to the disabled-reason helper', () => {
  it('imports and calls explainDisabledActions to compute disabledActionReasons', () => {
    expect(APP).toMatch(/import\s*\{\s*explainDisabledActions\s*\}\s*from\s*["'][^"']*explainDisabledActions["']/);
    // computed from the helper, not hand-rolled
    expect(APP).toMatch(/const\s+disabledActionReasons\s*=\s*explainDisabledActions\(/);
  });

  it('renders disabledActionReasons inside the explain-disabled-actions panel element', () => {
    // the panel element exists...
    expect(APP).toContain('data-testid="explain-disabled-actions"');
    // ...and it is fed by the helper output, not static text
    expect(APP).toMatch(/disabledActionReasons\.map\(/);
    // the render is gated on there being something to say (no empty panel)
    expect(APP).toMatch(/disabledActionReasons\.length\s*>\s*0/);
  });

  it('feeds the helper the gates a keyboard/SR user cannot otherwise reach', () => {
    // the inputs that drive the reasons a disabled button hides
    const call = APP.slice(APP.indexOf('explainDisabledActions('));
    for (const field of ['renderExportShareReason', 'hasEngineDesign', 'selectedPrinterBlocked', 'sliceProfileReady']) {
      expect(call).toContain(field);
    }
  });
});
