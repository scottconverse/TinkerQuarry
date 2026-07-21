/** @jest-environment node */

// TQ-N4. packages/engine/THIRD_PARTY_LICENSES.md section 6 ("Front-end dependencies") described a
// tree that is not the product and asserted the opposite of what is committed:
//   "The SPA (`frontend/`) builds against React, Three.js, and related libraries - predominantly
//    MIT - installed via `npm` (`package.json`), not redistributed as source here."
// Three errors: frontend/ is not the SPA (apps/ui is), frontend/ has no package.json at all, and
// three MIT bundles ARE redistributed as source in that exact directory.
//
// This guard measures each of those facts off disk and holds the attribution text to them. It
// lives with the settings suite because that is this lane's test home; it asserts nothing about
// settings.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO = resolve(process.cwd(), '..', '..');
const path = (rel: string) => resolve(REPO, rel);
const read = (rel: string) => readFileSync(path(rel), 'utf8');

const LICENSES = 'packages/engine/THIRD_PARTY_LICENSES.md';

function frontEndSection(): string {
  const doc = read(LICENSES);
  const start = doc.indexOf('## 6. Front-end dependencies');
  if (start === -1) throw new Error(`${LICENSES} has no "## 6. Front-end dependencies" section.`);
  const rest = doc.slice(start + 3);
  const end = rest.indexOf('\n## ');
  return end === -1 ? rest : rest.slice(0, end);
}

describe('TQ-N4: front-end attribution matches what is actually in the tree', () => {
  it('measures the ground truth this section has to match', () => {
    // The production front end, with a real manifest.
    expect(existsSync(path('apps/ui/package.json'))).toBe(true);
    // frontend/ has NO package.json — it installs nothing via npm.
    expect(existsSync(path('frontend/package.json'))).toBe(false);
    // ...and it DOES redistribute three bundles as source.
    const vendored = readdirSync(path('frontend/vendor')).sort();
    expect(vendored).toEqual(['babel.min.js', 'react-dom.development.js', 'react.development.js']);
    expect(read('frontend/vendor/react.development.js')).toContain('@license React');
    expect(read('frontend/vendor/react-dom.development.js')).toContain('@license React');
  });

  it('names apps/ui as the production front end, not frontend/', () => {
    const section = frontEndSection();
    expect(section).toContain('apps/ui');
    expect(section).toContain('pnpm-lock.yaml');
    // The exact false sentence TQ-N4 was filed for.
    expect(section).not.toContain('The SPA (`frontend/`)');
  });

  it('does not claim npm/package.json for a directory that has neither', () => {
    const section = frontEndSection();
    // The false attribution: frontend/ described as building/installing anything.
    expect(section).not.toMatch(/`?frontend\/`?\)? *(builds against|installed via)/);
    // The corrected fact, stated positively so a future edit cannot quietly drop it.
    expect(section).toMatch(/frontend\/[\s\S]{0,400}?no `package\.json`/);
    // Only apps/ui gets a manifest, and it is the real path.
    expect(section).toContain('`apps/ui/package.json`');
  });

  it('discloses the vendored bundles instead of denying them', () => {
    const section = frontEndSection();
    for (const f of ['react.development.js', 'react-dom.development.js', 'babel.min.js']) {
      expect(section).toContain(f);
    }
    // "not redistributed as source here" was the false half; it must not stand unqualified over
    // a directory where three bundles are committed.
    const stale = 'installed via `npm` (`package.json`), not redistributed as source here';
    expect(section).not.toContain(stale);
  });
});
