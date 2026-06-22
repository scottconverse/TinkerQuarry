# 03 - Technical Writer Deep Dive

**Role:** Technical Writer for TinkerQuarry  
**Commit audited:** `0b13cb2d8725a5453496bca37a277c0e30d8df55`  
**Lane:** GauntletGate Full role pass - docs/manual/audit accuracy  
**Scope:** `README.md`, `docs/STATUS.md`, `docs/EVALUATE.md`, `docs/HANDOFF-TO-CODEX.md`, `docs/MANUAL.md`, and current/historical `docs/audits/*.md`; static source cross-checks only.  
**Severity counts:** Blocker 0 / Critical 0 / Major 5 / Minor 3 / Nit 0

## Findings

### DOC-001 - Manual promises a target-state first-run/product flow as user instructions

**Severity:** Major  
**Category:** Manual accuracy / first-run honesty

**Evidence:** `docs/MANUAL.md:7-10` warns that the manual describes the target product, but the body immediately gives operational current-user instructions: `docs/MANUAL.md:41-64` says first open presents a setup wizard that downloads/starts local AI, picks a printer, configures direct printing, and can be reopened from Settings; `docs/MANUAL.md:80-82` says users can download or send straight to a connected printer; `docs/MANUAL.md:119-120` says users can export/import `.kimcad` files. Current truth docs say first-run tool health is unverified/no current `FirstRunWizard` (`docs/HANDOFF-TO-CODEX.md:51-54`, `docs/audits/v1-coverage-2026-06-22.md:130-132`) and send/outcome has zero front-end callers (`docs/STATUS.md:59`). Source agrees: the current welcome screen is a describe/recent-design surface (`apps/ui/src/components/WelcomeScreen.tsx:205-227`), AI Settings configures providers rather than one-click model download (`apps/ui/src/components/settings/AiSettings.tsx:331-430`), Make it real slices/downloads (`apps/ui/src/App.tsx:744-780`, `apps/ui/src/App.tsx:2894-2918`), and `engine.send`/`engine.outcome` exist only as client methods with no UI callers (`apps/ui/src/services/engineClient.ts:160-164`).

**Impact / blast radius:** A new user or evaluator following the manual will expect onboarding, direct-print setup, and import/export affordances that are absent or not current. Because the manual is linked as a product manual, the warning at the top is insufficient; it mixes target-state content with actionable instructions.

**Fix:** Split the target manual from a current-build manual. Either rewrite Part I as "current build as of 2026-06-22" using the README/EVALUATE flow, or move the target-state material under a clearly labeled PRD/manual-draft file. Remove or qualify direct-send, setup-wizard, and `.kimcad` import/export claims until shipped.

**Test:** On a clean checkout, follow the manual end to end with no chat context. Every named button/path should exist in the current app, or the manual should explicitly label it "planned/not shipped."

### DOC-002 - Manual technical reference is unreproducible and points at obsolete repo layout

**Severity:** Major  
**Category:** Operational docs / contributor onboarding

**Evidence:** `docs/MANUAL.md:190-192` links the API contract to `../../KimCadClaude/docs/api.md`, outside the current repo. `Test-Path C:\Users\Scott\Desktop\CODE\tinkerquarry\KimCadClaude\docs\api.md` is false; the sibling path happens to exist on this machine, but that is not repo-portable. `docs/MANUAL.md:254-263` gives old KimCadClaude test commands and stale counts (`~1,554`, `405`, `KimCadClaude/frontend`), while current handoff/README commands use `packages/engine` and `apps/ui` with FE `643`, live API `2`, and engine `1559 passed, 14 failed, 101 skipped` (`README.md:58-79`, `docs/HANDOFF-TO-CODEX.md:86-100`, `docs/HANDOFF-TO-CODEX.md:288-327`). `docs/MANUAL.md:266` links `../gate-tinkerquarry-2026-06-21/gate-report.md`; both checked likely repo locations are absent. `docs/MANUAL.md:392-407` still maps the product as `KimCadClaude/` plus `tinkerquarry/`, contradicting the README's repo-of-record decision (`README.md:81-85`).

**Impact / blast radius:** Contributors cannot reproduce tests or locate API docs from the repo alone. This is especially risky because the manual labels itself "Technical reference" and "Architecture."

**Fix:** Replace KimCadClaude paths with current `packages/engine`, `apps/ui`, and repo-local docs. Move or copy the API contract into this repo, or explicitly document the sibling dependency as non-portable. Update test counts and remove the dead gate-report link.

**Test:** Run a link checker from repo root and execute every command block in the manual on a fresh clone with only documented prerequisites.

### DOC-003 - Canonical STATUS still contains a stale "not yet wired" contradiction

**Severity:** Major  
**Category:** Internal consistency / single source of truth

**Evidence:** `docs/STATUS.md:5-6` declares STATUS the single source of truth and says it supersedes prior "done" claims. The P0/P1 rows then say the Studio front end is engine-fed and working (`docs/STATUS.md:43`, `docs/STATUS.md:47`, `docs/STATUS.md:54-55`). Current source supports that: `describeIntoStudio` is called by the shipping describe handler (`apps/ui/src/App.tsx:686-740`), Make it real calls `engine.slice` (`apps/ui/src/App.tsx:744-780`), and the toolbar exposes printer/material selectors plus Make it real (`apps/ui/src/App.tsx:2818-2918`). But the Run section still says: "Not yet wired: Studio's surfaces onto the engine (Phase 4 body)" (`docs/STATUS.md:91`).

**Impact / blast radius:** The canonical truth file tells readers both that the engine wiring works and that it is not wired. Future agents can make the wrong prioritization call from a single stale sentence.

**Fix:** Remove the stale "Not yet wired" sentence or replace it with the current caveat: core describe/source/slice wiring exists; remaining gaps are refine polish/browser automation/send-orient/VCL as listed above.

**Test:** Add a lightweight docs consistency check for banned stale phrases such as "Not yet wired: Studio's surfaces onto the engine" in current truth docs.

### DOC-004 - Current audit folder still presents obsolete CLEAR TO ADVANCE as current-looking truth

**Severity:** Major  
**Category:** Audit honesty / historical artifact labeling

**Evidence:** `docs/audits/gate-report.md:9-13` says "ROUND 2 ... CLEAR TO ADVANCE at 0/0/0/0/0" and `docs/audits/gate-report.md:39-43` says a brand-new user reaches the core feature. The current STATUS explicitly says it supersedes every prior "done"/"CLEAR TO ADVANCE" claim (`docs/STATUS.md:5-6`) and documents missing signature/V1 work (`docs/STATUS.md:42`, `docs/STATUS.md:59`). The newer honesty and coverage audits also supersede that older gate posture (`docs/audits/honesty-audit-2026-06-22.md:3-6`, `docs/audits/v1-coverage-2026-06-22.md:39-42`).

**Impact / blast radius:** A reader landing in `docs/audits/gate-report.md` can reasonably treat the older 0/0/0/0/0 gate as current. This directly conflicts with the user's current target of fixing until 0/0/0/0/0 and undermines gate history.

**Fix:** Add a top banner to obsolete gate/audit reports: "Historical; superseded by STATUS.md and gate-tinkerquarry-2026-06-22-codex." Consider moving old reports under `docs/audits/historical/`.

**Test:** Repo-wide grep for `CLEAR TO ADVANCE` should require a nearby "historical/superseded" marker unless it is the active gate report.

### DOC-005 - v1 coverage audit contains corrected rows plus stale residual contradictions

**Severity:** Major  
**Category:** Audit accuracy / requirements map integrity

**Evidence:** `docs/audits/v1-coverage-2026-06-22.md:24` says "Everything else below stands." But row `docs/audits/v1-coverage-2026-06-22.md:69` says seven libraries are now vendored, while its key-files line still says bundled third-party libraries are absent (`docs/audits/v1-coverage-2026-06-22.md:144`). Row `docs/audits/v1-coverage-2026-06-22.md:97` still says "code drawer absent" even though the same file corrected the code-drawer finding at lines 10-15 and 124-126. The handoff already warns about this class of stale inline body text (`docs/HANDOFF-TO-CODEX.md:350-354`), but the audit file remains reader-facing.

**Impact / blast radius:** The coverage map is one of the highest-signal audit files, but readers must manually reconcile header corrections against stale body rows. That invites both over-credit and under-credit.

**Fix:** Apply corrections inline, not just in a header. Replace stale row text for code drawer and vendored libraries; add "historical row corrected" notes only where preserving provenance matters.

**Test:** For each "correction" heading in audit files, grep the body for the corrected false phrase and fail if it still appears as an unqualified current claim.

### DOC-006 - HANDOFF checklist still instructs agents to fix a rewritten README

**Severity:** Minor  
**Category:** Handoff clarity / task hygiene

**Evidence:** `docs/HANDOFF-TO-CODEX.md:333-338` says README and EVALUATE were rewritten and that remaining checklist items should be read as historical unless still demonstrably true. But `docs/HANDOFF-TO-CODEX.md:343-349` still has an unchecked "README.md is badly stale - highest priority" task describing claims that no longer appear in the current README (`README.md:1-37`, `README.md:81-107`).

**Impact / blast radius:** Future Codex agents can waste time "fixing" already-fixed README state or distrust the current README.

**Fix:** Mark the README task done or move it under a completed/historical subsection. Keep only demonstrably current checklist items.

**Test:** Run the checklist against current files; any unchecked task whose evidence no longer exists must be marked done or removed.

### DOC-007 - Manual points to a missing README naming anchor

**Severity:** Minor  
**Category:** Link integrity

**Evidence:** `docs/MANUAL.md:20-22` tells readers to see `../README.md#naming-tinkerquarry-vs-kimcad`. The current README headings are `Honest State`, `Run`, `Tests`, `Repository Decision`, `Library Decision`, and `License` (`README.md:12`, `README.md:39`, `README.md:58`, `README.md:81`, `README.md:87`, `README.md:105`); no naming anchor exists.

**Impact / blast radius:** Small, but it is an immediate broken internal link in the first page of the manual and increases the sense that the manual is stale.

**Fix:** Add the naming section back to README or change the manual note to point at `README.md#repository-decision` plus an inline explanation.

**Test:** Markdown link checker for repo-local anchors.

### DOC-008 - Product metadata still says OpenSCAD Studio

**Severity:** Minor  
**Category:** User-facing metadata / packaging honesty

**Evidence:** Root `package.json:2` is `"name": "openscad-studio"` and `package.json:5` describes "Modern OpenSCAD editor with live preview and AI copilot." `apps/ui/package.json:2` is `"ui"`. Separately, `apps/ui/src/utils/macDownload.ts:1` still points release downloads at `https://github.com/zacharyfmarion/openscad-studio/releases/latest/download`. The README says the repo of record is TinkerQuarry and OpenSCAD Studio is the upstream base (`README.md:81-85`).

**Impact / blast radius:** Package metadata and download links are not the primary docs, but they surface in dev tools, release assets, and UI download affordances. They contradict the rebrand/canonical-repo story.

**Fix:** Rename package metadata where safe, or document intentionally inherited names. Point download URLs at TinkerQuarry release assets when those exist; hide download affordances until they do.

**Test:** Repo-wide brand/URL audit: allowed `openscad-studio` mentions must be annotated as upstream provenance, not current product/release target.

## What's working

- The top-level README is materially honest now: it says the product is "not done," names the Visual Correction Loop/send/manual-orient/browser-coverage gaps, gives current two-terminal run commands, and makes the repo-of-record/library decisions explicit (`README.md:3-37`, `README.md:39-79`, `README.md:81-103`).
- `docs/EVALUATE.md` is concise and appropriately caveated: it distinguishes manual click-checks from automated browser coverage, gives a realistic 2-minute loop, and explicitly lists missing VCL/send/orient/external-library/iteration-history/browser-test work (`docs/EVALUATE.md:5-8`, `docs/EVALUATE.md:27-59`).
- `docs/STATUS.md` has the right honesty posture at the top: it clearly separates engine automation from manual-only front-end verification and calls the Visual Correction Loop "not built, 0 lines of code" (`docs/STATUS.md:8-18`, `docs/STATUS.md:20-33`, `docs/STATUS.md:42`).
- `docs/HANDOFF-TO-CODEX.md` is unusually useful for a next agent: it gives exact run commands, environment setup, known failing/cannot-run checks, proof locations, and the no-CI caveat (`docs/HANDOFF-TO-CODEX.md:67-160`, `docs/HANDOFF-TO-CODEX.md:163-187`, `docs/HANDOFF-TO-CODEX.md:288-327`).
- The newer honesty audit correctly warns that older absolute paths may omit the `tinkerquarry` segment, which prevents a confusing false-negative when following citations (`docs/audits/honesty-audit-2026-06-22.md:8-11`).
