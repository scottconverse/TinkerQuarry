/** @jest-environment node */

// TQ-N4 / TQ-N5. packages/engine/THIRD_PARTY_LICENSES.md section 6 ("Front-end dependencies") once
// described a tree that is not the product and asserted the opposite of what was committed:
//   "The SPA (`frontend/`) builds against React, Three.js, and related libraries - predominantly
//    MIT - installed via `npm` (`package.json`), not redistributed as source here."
// The owner then chose TQ-N5: DELETE the historical `frontend/` and `backend/` prototype trees
// entirely rather than keep documenting them. So the correct end state is not "describe frontend/
// accurately" but "frontend/ is gone, and section 6 describes only the real front end, apps/ui,
// with no dangling reference to the deleted tree or its old vendored bundles."
//
// This guard measures that off disk. It lives with the settings suite because that is this lane's
// test home; it asserts nothing about settings.

import { existsSync, readFileSync } from 'node:fs';
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

describe('TQ-N5: the deleted prototype tree left no trace in attribution', () => {
  it('the historical frontend/ and backend/ trees are actually gone', () => {
    // The production front end still has its real manifest...
    expect(existsSync(path('apps/ui/package.json'))).toBe(true);
    // ...and the historical prototype trees TQ-N5 removed are gone from disk.
    expect(existsSync(path('frontend'))).toBe(false);
    expect(existsSync(path('backend'))).toBe(false);
    expect(existsSync(path('scripts/dev.py'))).toBe(false);
  });

  it('names apps/ui as the production front end', () => {
    const section = frontEndSection();
    expect(section).toContain('apps/ui');
    expect(section).toContain('pnpm-lock.yaml');
    // The exact false sentence the finding was filed for must not reappear.
    expect(section).not.toContain('The SPA (`frontend/`)');
  });

  it('carries no dangling reference to the deleted frontend/ tree', () => {
    const section = frontEndSection();
    // The tree is gone, so section 6 must not describe it, link to it, or list its vendored bundles.
    expect(section).not.toContain('frontend/');
    for (const f of ['react.development.js', 'react-dom.development.js', 'babel.min.js']) {
      expect(section).not.toContain(f);
    }
    // The old false half must not stand either.
    const stale = 'installed via `npm` (`package.json`), not redistributed as source here';
    expect(section).not.toContain(stale);
  });
});
