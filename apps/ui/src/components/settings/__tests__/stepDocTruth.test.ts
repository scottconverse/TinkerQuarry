/** @jest-environment node */

// TQ-N2. packages/engine/docs/troubleshooting.md is the ONLY user-reachable instruction for
// enabling STEP export, and every sentence of its previous version was false against the shipped
// app: it said the Export panel "says so and points at Settings" (it says nothing), and it named
// a "Settings -> Editable CAD export" section and a "check again" button that did not exist.
// Nothing in the repo could have caught that, because no check ever compared the doc to the UI.
//
// This is that check. It reads the real doc off disk and the real components off disk and fails
// when they diverge. It is deliberately string-literal: the point is that a reword on either side
// has to be made on BOTH sides.

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// jest `roots` is <rootDir>/src with rootDir = apps/ui, and jest runs with cwd = apps/ui.
const REPO = resolve(process.cwd(), '..', '..');
const read = (rel: string) => {
  const p = resolve(REPO, rel);
  if (!existsSync(p)) throw new Error(`expected file is missing: ${p}`);
  return readFileSync(p, 'utf8');
};

const TROUBLESHOOTING = 'packages/engine/docs/troubleshooting.md';
const CARD = 'apps/ui/src/components/settings/CadExportCard.tsx';
const PROJECT_TAB = 'apps/ui/src/components/settings/ProjectSettings.tsx';
const PROVENANCE = 'apps/ui/src/components/ProductEvidencePanels.tsx';
const EXPORT_DIALOG = 'apps/ui/src/components/ExportDialog.tsx';

const SECTION_HEADING = '## No "STEP" option in the Export dialog';

/** The one section this guard owns, from its heading to the next h2. */
function stepSection(): string {
  const doc = read(TROUBLESHOOTING);
  const start = doc.indexOf(SECTION_HEADING);
  if (start === -1) {
    throw new Error(
      `${TROUBLESHOOTING} has no section starting "${SECTION_HEADING}". ` +
        'The STEP recovery instructions must describe the shipped app (TQ-N2).'
    );
  }
  const rest = doc.slice(start + 3);
  const end = rest.indexOf('\n## ');
  return end === -1 ? rest : rest.slice(0, end);
}

describe('TQ-N2: the STEP recovery doc describes the app that actually shipped', () => {
  it('has the STEP recovery section at all', () => {
    expect(stepSection()).toContain('CadQuery');
  });

  it('names a Settings destination that exists: Project tab -> "Editable CAD export (.STEP)"', () => {
    expect(stepSection()).toContain('Settings → Project → Editable CAD export (.STEP)');

    const card = read(CARD);
    expect(card).toContain('title="Editable CAD export (.STEP)"');
    // ...and that card is genuinely mounted in the Project tab the doc sends the user to.
    expect(read(PROJECT_TAB)).toContain('<CadExportCard />');
  });

  it('names the two status words and the button the card actually renders', () => {
    const section = stepSection();
    const card = read(CARD);
    expect(section).toContain('**Installed**');
    expect(section).toContain('**Not installed**');
    expect(section).toContain('**Check again**');
    expect(card).toContain("installed: 'Installed'");
    expect(card).toContain("absent: 'Not installed'");
    expect(card).toContain('Check again');
  });

  it('quotes the same pip command the card shows', async () => {
    const { CADQUERY_INSTALL_COMMAND } = await import('../CadExportCard');
    expect(stepSection()).toContain(CADQUERY_INSTALL_COMMAND);
  });

  it('quotes the Provenance sentences verbatim, and does NOT claim the Export dialog explains anything', () => {
    const section = stepSection();
    const provenance = read(PROVENANCE);
    for (const sentence of [
      'CAD handoff: trusted twin exists; enable CadQuery in Settings → Project for STEP',
      'CAD handoff: STEP unavailable for this design',
    ]) {
      expect(section).toContain(sentence);
      expect(provenance).toContain(sentence);
    }

    // The refuted claim, pinned so it cannot come back: ExportDialog carries no such copy.
    expect(read(EXPORT_DIALOG)).not.toMatch(/CadQuery/i);
    expect(section).not.toContain('the Export panel then says so and points at Settings');
  });

  it('does not send the user to the pre-migration destinations that never existed', () => {
    const doc = read(TROUBLESHOOTING);
    // The exact strings TQ-N2 was filed for.
    expect(doc).not.toContain('*Settings → Editable CAD export*');
    expect(doc).not.toContain('*check again* in Settings');
  });

  // The pass-2 verifier's finding: this guard covered troubleshooting.md ONLY, while three other
  // user-facing docs named the same destination and could drift unnoticed. The card is TITLED
  // 'Editable CAD export (.STEP)' but it LIVES in the Project tab, so 'Settings → Editable CAD
  // export' is not a navigable path — the same "points at something that isn't there" defect
  // TQ-N1 and WALK-2 were both filed for.
  it.each([
    'packages/engine/docs/cadquery-backend.md',
    'packages/engine/docs/FAQ.md',
    'packages/engine/README.md',
  ])('%s names the real navigation path to the CAD export card', (rel) => {
    const doc = read(rel);
    // If a doc mentions the card at all, it must route through the tab that actually hosts it.
    if (/Editable CAD export/.test(doc)) {
      expect(doc).toContain('Settings → Project → Editable CAD export');
      expect(doc).not.toMatch(/Settings → Editable CAD export/);
    }
  });

  it('the card that all those docs point at is really in the Project tab', () => {
    expect(read(CARD)).toContain('Editable CAD export (.STEP)');
    expect(read(PROJECT_TAB)).toContain('CadExportCard');
  });
});
