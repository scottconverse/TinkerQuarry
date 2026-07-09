# TinkerQuarry v1.4.0 — Technical Writer deep-dive

**Role:** Technical Writer (release-readiness gate, five-role review)
**Scope:** delta since tag `v1.3.1` on `release/v1.4.0-prep`, plus public release surfaces —
README.md, CHANGELOG.md, CODE_SIGNING_POLICY.md, docs/USER-MANUAL.md, docs/STATUS.md,
docs/ARCHITECTURE.md, docs/index.html, docs/discussions/*.md.
**Method:** every version/test/feature claim below was checked against the actual repo state
(`git cat-file -e v1.3.1:<path>`, `git diff v1.3.1..HEAD`, `git log`, package manifests, and a
real pytest/Jest/Playwright test-collection count) — not read off the docs themselves. Live link
checks used `curl`/`gh api` against the real GitHub Pages site and GitHub API.
Builds on, does not repeat, `walkthrough-report.md` (runtime first-run behavior).

---

## What's working

- **Feature-attribution correction in CHANGELOG.md is real and verifiable.** The five features the
  changelog moves from `[1.3.1]` to `[1.4.0]` — intent panel, properties panel, visual inspection
  cards, agent toolbox/provenance, reverse import — are confirmed absent at the `v1.3.1` tag:
  `packages/engine/src/kimcad/reverse_import.py` and `tests/test_reverse_import.py` both
  `fatal: ... exists on disk, but not in 'v1.3.1'`; `apps/ui/src/components/ProductEvidencePanels.tsx`
  (444 new lines) does not exist at `v1.3.1` either. The changelog's parenthetical explaining the
  correction (lines 23–25) is honest and matches the git history.
- **Telemetry-removal claim is verified, not just asserted.** `git diff v1.3.1..HEAD --stat` shows
  `apps/ui/src/analytics/{bootstrap,runtime,sanitize,stableId}.ts`, `apps/ui/src/sentry.ts`,
  `apps/ui/src/__mocks__/sentry.ts`, and `apps/ui/src/components/settings/PrivacySettings.tsx`
  deleted outright (removed, not just disabled). A repo-wide grep for `posthog|sentry` in
  `apps/ui/src`, `apps/web/src`, and `packages/engine/src` at HEAD returns zero real hits (the one
  substring match is `webkitGetAsEntry`, unrelated). The README/CHANGELOG "no telemetry" claim is
  true of the current tree.
- **CODE_SIGNING_POLICY.md does not overclaim.** It states plainly, in its first line, that v1.4.0
  artifacts are NOT signed, describes SignPath as "planned," and matches the README/manual/landing
  page SmartScreen guidance verbatim in substance across all three surfaces.
- **Test-count claims in STATUS.md and USER-MANUAL.md are independently reproducible, not just
  copy-pasted between docs.** Re-collected against the real toolchain in this environment:
  - `pytest --collect-only -q` in `packages/engine` → **1746 tests collected**, matching the
    claimed "1746 pytest tests, 0 skipped" exactly.
  - `jest --listTests` in `apps/ui` → **94** suite files, matching "94 Jest suites" exactly.
  - `jest --listTests` in `apps/web` → **4** suite files, matching "4 Jest suites" exactly.
  - Playwright: `test(` declarations in `apps/ui/e2e/*.spec.ts` (excluding `test.use`/`test.describe`)
    total **7** (3 + 3 + 1 across `workspace-walkthrough`, `manufacturing-flow`,
    `accessibility-release`), matching "7 Playwright tests (accessibility, manufacturing flow,
    workspace, mobile/tablet)" exactly — including the mobile/tablet viewport sub-tests the label
    calls out (`test.use({ viewport: ... })` blocks at lines 197–226 of `manufacturing-flow.spec.ts`
    and 197 of `workspace-walkthrough.spec.ts`).
  - The `RUSTSEC-2026-0194`/`-0195` ignore-list claim matches `package.json:30` verbatim.
- **Version matrix is internally consistent.** Checked seven independent version sources
  (`package.json`, `apps/ui/package.json`, `apps/ui/src-tauri/tauri.conf.json`,
  `apps/ui/src-tauri/Cargo.toml` → `1.4.0`; `packages/engine/pyproject.toml` → `0.9.4`;
  `apps/web/package.json` → `0.6.0`; `packages/shared/package.json` → `0.4.0`) against the tables
  in STATUS.md and USER-MANUAL.md — all match, in both docs.
- **Security/privacy claims in USER-MANUAL.md's Technical User section are grounded in code**, not
  just asserted: loopback-first default (`webapp.py:3378` `host: str = "127.0.0.1"`), per-boot
  session token compared with `hmac.compare_digest` (`webapp.py:1677`), masked API keys
  (`_mask_key`, `webapp.py:540`, last-5-chars-only, "The full key is NEVER returned by the API"),
  and OS-credential-store-with-disclosed-fallback (`settings_store.py:54–66`, keyring-backed,
  documented JSON fallback when no keyring backend is usable).
- **All in-repo relative links in scope resolve**: `packages/engine/THIRD_PARTY_LICENSES.md`,
  `packages/engine/docs/api.md`, `docs/roadmap-zookeeper-inspired-cad-agent.md`,
  `docs/discussions/README.md`, `LICENSE` all exist at the paths referenced from README/manual/status.
- **Live external links resolve as expected, with one exception noted below.** GitHub Pages
  (`scottconverse.github.io/TinkerQuarry/`, `/ARCHITECTURE.html`, `/STATUS.html`,
  `/USER-MANUAL.html`) and `github.com/scottconverse/TinkerQuarry/discussions` all returned **200**
  live — the `docs/_config.yml` Jekyll setup (no `.nojekyll`, default permalinks) correctly explains
  why `.md`-sourced links resolve as `.html` in `docs/index.html`.

## Findings

### Major — Discussion seed docs still announce v1.3.1, and one repeats the exact attribution error the CHANGELOG says it fixed

`docs/discussions/01-announcement.md`, `02-faq.md`, `04-roadmap-and-ideas.md`, and
`docs/discussions/README.md` are all **in this release's diff** (`git diff v1.3.1..HEAD --stat`
shows 52/42/37/31 changed lines respectively) and the CHANGELOG explicitly claims
"Refreshed the GitHub Discussions seed documents" as a v1.4.0 documentation change. But the edited
content still names and links v1.3.1:

- `docs/discussions/01-announcement.md:3` — title is `# TinkerQuarry v1.3.1: local-first AI CAD for
  printable parts`, immediately followed by a bullet list of the intent/properties/inspection-cards/
  provenance/reverse-import features that are v1.4.0-exclusive per the CHANGELOG's own correction.
- `docs/discussions/01-announcement.md:42` — `Release: https://github.com/scottconverse/TinkerQuarry/releases/tag/v1.3.1`
  (should point at the v1.4.0 tag once cut).
- `docs/discussions/02-faq.md:34` — "the Windows NSIS installer builds as
  `TinkerQuarry_1.3.1_x64-setup.exe`" (wrong filename for this release; every other surface — README,
  STATUS.md, USER-MANUAL.md — says `TinkerQuarry_1.4.0_x64-setup.exe`).
- `docs/discussions/04-roadmap-and-ideas.md:7` — heading `## v1.3.1 baseline`, with the bullet list
  underneath being intent/properties/evidence/provenance review, conservative reverse import, and
  STEP export — **the exact same features the CHANGELOG (lines 23–25) explicitly says were
  misattributed to 1.3.1 and actually ship for the first time in 1.4.0.** This is not a stale
  leftover from before the correction; it was touched in this diff and still carries the error the
  rest of the release was written specifically to fix.
- `docs/discussions/README.md:8` — the seed-document index itself lists the announcement's title as
  "TinkerQuarry v1.3.1: local-first AI CAD for printable parts."

**Why it matters:** these are maintainer-authored posts meant to be pasted directly into GitHub
Discussions the day v1.4.0 ships (per the file's own instructions: "paste each file into a new
discussion... Pin the announcement and FAQ"). If pasted as-is, the pinned public announcement for
v1.4.0 will say v1.3.1 in its title, link the wrong release, cite the wrong installer filename, and
the roadmap post will re-introduce the precise feature-attribution error the CHANGELOG was written
to correct — on a different, more visible surface (a pinned GitHub Discussion) than the file it was
fixed in.

**Impact scope:** every reader of the pinned Announcements/Ideas discussions for this release —
these are typically the first thing a new community member reads, and factually wrong on version,
release link, and feature-era attribution.

**Fix path:** in the four files above, replace `v1.3.1` → `v1.4.0` in titles/headings, the release
link, and the installer filename; rename the roadmap heading to `## v1.4.0 baseline` (or similar)
so its feature list isn't captioned with the wrong version.

### Minor — USER-MANUAL.md and ARCHITECTURE.md both carry a stale "Last updated" stamp

Both files declare `**Last updated:** 2026-07-02` (USER-MANUAL.md:5, ARCHITECTURE.md:5), but
`git log` shows both were edited again in commit `6491b78` on **2026-07-09** — the same commit that
bumped both docs from "v1.3.1 / KimCad 0.9.3" to "v1.4.0 / KimCad 0.9.4" and added the entire
"SmartScreen Prompt, Step By Step" section to USER-MANUAL.md (`git show 6491b78 -- docs/USER-MANUAL.md`
confirms 40 lines inserted, 19 removed, including the new version header and SmartScreen walkthrough).
The freshness stamp was never bumped alongside the content it's supposed to date.

**Why it matters:** a reader trusting the "Last updated" line would reasonably conclude the v1.4.0
version bump and SmartScreen instructions predate the actual v1.4.0 release prep by a week, which
is confusing but not functionally harmful — the content itself is current and correct.

**Fix path:** bump both `**Last updated:**` lines to `2026-07-09` (or automate it from
`git log -1 --format=%ad -- <file>` in the release script that already bumps version numbers across
docs, so this doesn't recur on the next release).

## Coverage notes (could not verify, not treated as findings)

- **`https://github.com/scottconverse/TinkerQuarry/releases/tag/v1.4.0` returns 404 as of this
  audit** (`gh api repos/scottconverse/TinkerQuarry/releases/tags/v1.4.0` → `404 Not Found`;
  `gh release list` shows only `v1.3.1` as latest). README's badge, STATUS.md, USER-MANUAL.md, and
  docs/index.html all link to this tag as though it is already published. This is expected for a
  release-prep branch that hasn't been tagged yet — not a defect in the docs themselves — but it is
  the one external link in scope that cannot be confirmed live today. **Action:** re-check this
  exact link resolves (200, correct asset list, correct SHA256SUMS.txt) at the moment the v1.4.0 tag
  and GitHub Release are actually cut, before announcing.
- **`SignPath.io` / SignPath Foundation URLs in CODE_SIGNING_POLICY.md** are named but not
  hyperlinked, so there was no URL to check; the described onboarding process (author/approver
  roles, HSM-backed key custody) could not be verified against SignPath's actual program terms from
  this repo alone — noting only from external prior knowledge that this matches SignPath Foundation's
  publicly documented free-signing model for open-source projects, not something this repo can prove
  internally.
- I did not execute the full `pnpm test:gate` / `pytest tests -q` / `jest` run-to-completion in this
  session (only test **collection**, i.e., counts, not pass/fail) — the pass counts and "0 skipped"
  claims in STATUS.md rest on the release's own gate run, which is a different role's territory
  (Test/QA engineer) to re-execute and confirm; I can only confirm the collected counts match.
- `docs/EVALUATE.md` and `docs/engine-divergence.md`/other non-listed docs under `docs/` changed in
  this diff but were outside the file list given for this role; not reviewed.

## Version-string consistency table (verified)

| Surface | Product | Engine |
| --- | --- | --- |
| README.md badges | v1.4.0 | 0.9.4 |
| CHANGELOG.md `[1.4.0]` header | v1.4.0 | 0.9.4 |
| CODE_SIGNING_POLICY.md | v1.4.0 | — |
| docs/STATUS.md | v1.4.0 | 0.9.4 |
| docs/USER-MANUAL.md (both header and Version Surfaces table) | v1.4.0 | 0.9.4 |
| docs/ARCHITECTURE.md | v1.4.0 | 0.9.4 |
| docs/index.html | v1.4.0 | 0.9.4 |
| `package.json` / `apps/ui/package.json` / `tauri.conf.json` / `Cargo.toml` (actual) | 1.4.0 | — |
| `packages/engine/pyproject.toml` (actual) | — | 0.9.4 |
| **docs/discussions/*.md (actual)** | **v1.3.1 (stale — see Major finding)** | not mentioned |

All surfaces except the discussion seeds are consistent.
