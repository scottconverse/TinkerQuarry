# TinkerQuarry v1.4.0 Release Gate — Senior UI/UX Designer Deep-Dive

**Scope:** new v1.4.0 surfaces per assignment — `ProductEvidencePanels.tsx` (Intent, Properties,
Visual Review, Provenance), `WelcomeScreen.tsx` model-setup states, the reverse-import user flow
(`App.tsx` Import CAD path), and the SmartScreen install journey as documented in README.md,
`docs/USER-MANUAL.md`, and `docs/index.html`.
**Method:** static read of the delta since `v1.3.1` (`git diff v1.3.1..HEAD`) plus the shipped
docs; built on `walkthrough-report.md` (W-1, W-2 accepted as-is, not re-verified here). No new
runtime session was driven for this pass — findings below are grounded in file:line evidence from
the diff, cross-checked against related config (Tailwind breakpoints, Tauri window config) where a
claim depended on it.

---

## What's working

- **The four evidence panels are a genuinely new, well-structured surface**, not a bolt-on: each of
  Intent/Properties/Visual-Review/Provenance has a real empty state with an explanatory sentence
  *and* an actionable button (`ProductEvidencePanels.tsx:141-147`, `230-233`, `295-298`, `400-404`)
  rather than a bare "no data" placeholder. That's the right default for a beta audience meeting
  these panels for the first time.
- **Consistent numeric formatting.** `formatMm`/`formatNumber` (`ProductEvidencePanels.tsx:88-98`)
  give every measured value a matched "Not measured"/"Not estimated" fallback instead of blank
  cells or `undefined` leaking into the UI — checked across all six Properties fields and the
  Intent dimension list.
- **The reverse-import provenance message is honest, not just decorative**: "The mesh was accepted
  only after envelope, volume, and surface checks" (`ProductEvidencePanels.tsx:396-397`) tells the
  user *why* they can trust an imported mesh, which matters for a feature whose entire value
  proposition is "we didn't just accept your file blindly."
- **The "My Designs" two-step delete** (arm-then-confirm, `WelcomeScreen.tsx:627-652`) is a solid
  pattern — a stray click can't destroy a saved design, and the confirm row replaces the delete
  button in place rather than opening a modal that would lose the user's place in the grid.
- **WelcomeScreen's model-status box correctly switches ARIA role** between `status` (ready) and
  `alert` (not ready) (`WelcomeScreen.tsx:424`) — a real accessibility-aware choice, not just visual
  styling, for the single most important first-run signal in the app.
- **The SmartScreen manual section is well-written prose**: it names the exact button labels
  ("More info" → "Run anyway"), gives the PowerShell one-liner for checksum verification, and is
  honest about *why* the warning appears ("not yet known to Microsoft," not "unsafe") —
  `docs/USER-MANUAL.md:67-90`. The content quality is not in question; the finding below is about
  presentation format, not accuracy.
- **CODE_SIGNING_POLICY.md, README, and the manual tell the same story** about the unsigned state
  with consistent phrasing across all three surfaces — no contradiction for a user who reads more
  than one doc.

---

## Findings

### UX-1 · Major — Disabled buttons lost their only strong visual signal, right at the first-run gate

`apps/ui/src/components/ui/Button.tsx:10-15` (new `DISABLED_STYLE`, diffed this release) vs.
`apps/ui/src/components/ui/Button.tsx:42-49` (enabled `secondary` variant):

| | disabled | enabled secondary (inactive) |
|---|---|---|
| background | `var(--bg-secondary)` | `var(--bg-secondary)` |
| border | `1px solid var(--border-primary)` | `1px solid var(--border-primary)` |
| text | `var(--text-secondary)` | `var(--text-primary)` |
| opacity | *(none — removed)* | *(n/a)* |

The old `DISABLED_STYLE` carried `opacity: 0.65` (visible in the diff as a removed line); the new
one drops it. Background, border, and size are now **pixel-identical** between a disabled
secondary button and an active one — the only remaining difference is a text-color shade
(`text-secondary` vs `text-primary`), which on most of this app's themes is a subtle mid-gray vs.
dark-gray distinction, not something a user scans a row of buttons for.

This lands directly on the exact first-run moment this gate is scrutinizing: the Example-prompt
buttons on WelcomeScreen are `variant="secondary"` and `disabled={!hasApiKey || !modelReady}`
(`WelcomeScreen.tsx:547-565`), and the reverse-import toolbar button is the same variant/disabled
pattern (`App.tsx:4139-4149`). During "Local AI setup needed" — the state W-1 already flags as the
highest-risk moment in the whole first-run flow — a new user scanning the five Example buttons now
has almost no visual cue that they're inert. Previously, 65%-opacity buttons visibly looked "grayed
out"; now they look like ordinary buttons until clicked (title tooltip only appears on hover, which
a mouse-first user won't do before clicking).
**Impact:** every new user during the "Local AI setup needed" window — i.e., the same population
W-1 already identifies as the widest-beta-default cohort.
**Fix:** restore an opacity (or a distinct `--text-disabled`/desaturated background token) on
`DISABLED_STYLE` so disabled and enabled secondary buttons are distinguishable without hovering.

### UX-2 · Major — New reverse-import error/retry UI is invisible below a 640px window width, and nothing enforces a minimum window width

`apps/ui/src/App.tsx:4151-4173` (new this release; confirmed absent in `v1.3.1` — `git show
v1.3.1:apps/ui/src/App.tsx | grep reverse-import-status` returns nothing):

```tsx
<div
  data-testid="reverse-import-status"
  className="hidden max-w-[16rem] items-center gap-1 truncate text-xs sm:inline-flex"
  ...
>
```

`hidden` + `sm:inline-flex` means this element has `display: none` below Tailwind's `sm` breakpoint
(640px) and only becomes visible at 640px and up. `apps/ui/src-tauri/tauri.conf.json:14-21` sets a
default window size of 1400×900 but **no `minWidth`/`minHeight`** — the window is freely resizable
with no floor. A user who narrows the TinkerQuarry window (a normal thing to do on a laptop, or
when tiling windows side-by-side) below ~640px loses the only persistent surface for a failed
reverse-import: the error text and its **Retry** button both disappear along with it. The transient
toast (`notifyError`, `App.tsx:1736-1739`) still fires, but toasts self-dismiss — once it's gone,
a user in a narrowed window has no visible error, no visible reason, and no visible way to retry
without first widening the window (which isn't itself suggested anywhere).
**Impact:** any user who imports a mesh that fails validation while running TinkerQuarry in a
narrow window — plausible in a beta with unconstrained resizing.
**Fix:** either drop the `sm:` gate (this status bar has room to wrap/truncate at any width via its
existing `truncate`/`max-w` classes) or set a `minWidth` in `tauri.conf.json` that keeps the toolbar
above 640px.

### UX-3 · Major — None of the four new evidence panels use semantic heading markup

`ProductEvidencePanels.tsx` — `PanelShell`'s title (line 21-26) and every `Section`'s title (line
80-82) render as a plain `<div>` with font-weight/size styling, not an `<h2>`/`<h3>` or
`role="heading"`. This repeats across all four panels: Intent has four such "headings" (Design
plan, Dimensions, Features, Assumptions), Properties has two, Provenance has three, Visual Review
has up to five conditionally. Grep of the file confirms zero `h1`–`h6`, `role="heading"`, or
`aria-level` usage anywhere; the new test file
(`__tests__/ProductEvidencePanels.test.tsx`) has no heading-role assertions either, so nothing in
CI would catch a regression or a fix either way.

Screen-reader users navigating by heading (the standard NVDA/JAWS/VoiceOver "jump to next heading"
shortcut) get nothing from these four brand-new panels — they'd have to read linearly through the
whole document-order tree, item by item, to find "Assumptions" or "Estimates." This is systemic
across the entire new surface, not a one-off.
**Impact:** screen-reader users trying to use any of the four new evidence panels — the panels are
the headline new UI of this release.
**Fix:** promote `PanelShell`'s title to `<h2>` and `Section`'s title to `<h3>` (visually
restyle with CSS, not a semantic change to appearance) — a small, mechanical fix given both are
single shared components used by all four panels.

### UX-4 · Minor — Intent and Provenance tabs share one icon; text truncation would make them indistinguishable

`apps/ui/src/components/panels/PanelComponents.tsx:290-293` (new `PANEL_TYPES` entries):

```tsx
{ id: 'intent', label: 'Intent', icon: TbInfoCircle },
...
{ id: 'provenance', label: 'Provenance', icon: TbInfoCircle },
```

Two of the four new panel types reuse `TbInfoCircle`, while `properties`/`visual-inspection` each
got a distinct icon (`TbRuler`, `TbCamera`). The tab header always renders icon *and* label
together, and the label span has `overflow: hidden; textOverflow: ellipsis; whiteSpace: nowrap`
(`PanelComponents.tsx` ~line 377-382) — so in a docked layout with several narrow tabs (this
release adds four new panel types to what was already Editor/Preview/AI/Console, i.e. up to eight
tabs sharing one strip), a squeezed "Provenance" label can truncate toward just "Prov…" or clip
further, at which point the icon is the only fast visual differentiator left, and it's identical to
Intent's.
**Impact:** cosmetic/scan-speed only — the label always disambiguates when legible; the gap only
bites at narrow tab widths.
**Fix:** give Provenance a distinct icon (e.g. `TbHistory`, `TbListDetails`, or similar already
imported family) — a one-line change in `PANEL_TYPES`.

### UX-5 · Minor — Three UI entry points to the same reverse-import action use three different labels, and only one of them guards against re-entry

- Toolbar button: **"Import CAD"** (`App.tsx:4148`), disabled while `reverseImportStatus.state ===
  "running"`.
- Empty-state buttons inside Intent/Properties/Provenance panels: **"Import mesh"**
  (`ProductEvidencePanels.tsx:143`, `231`, `402`) — these call the identical
  `onReverseImportCad`/`handleReverseImportCad` handler but are plain `PanelAction` buttons with no
  `disabled` wiring to `reverseImportStatus` at all.

Two effects: (1) a user who successfully uses "Import mesh" from a panel, then later sees "Import
CAD" in the toolbar, has no textual cue these are the same feature; (2) because the panel buttons
never disable, a user could open a second native file-picker from a panel while an import triggered
from the toolbar (or another panel) is still resolving — `handleReverseImportCad` re-enters with no
guard beyond the toolbar button's own `disabled` prop, so overlapping `setReverseImportStatus` /
`notifySuccess`/`notifyError` calls could race and leave a stale status displayed.
**Impact:** minor confusion (label mismatch) plus a low-probability, non-destructive race
(mismatched status text) — no data loss, since each import's own file content is independent.
**Fix:** rename one label to match the other ("Import CAD" everywhere reads clearest next to the
toolbar's existing copy), and gate the panel buttons' `onClick` on
`reverseImportStatus.state !== "running"` the same way the toolbar button already is.

### UX-6 · Minor — The SmartScreen walkthrough for non-technical users is text-only; no screenshot anywhere in the repo

`docs/USER-MANUAL.md:67-90` ("The SmartScreen Prompt, Step By Step") sits inside the manual's
**Non-Technical User** section and describes "the blue SmartScreen dialog" and where the "Run
anyway" button appears purely in prose. A repo-wide check
(`find docs -iname "*.png" -o -iname "*.jpg" -o -iname "*.gif"` and a grep for markdown image
syntax across README/USER-MANUAL/index.html) turns up **zero images anywhere in the shipped docs**.
For an audience explicitly named "non-technical" encountering an OS security warning that says
"Windows protected your PC" — a moment specifically designed by Microsoft to look alarming — a
screenshot of the actual dialog with the two buttons circled would remove far more doubt than
prose describing a dialog the reader hasn't seen yet. This isn't a correctness gap (the steps are
accurate) — it's a trust/anxiety gap at exactly the highest-anxiety moment in the whole install
journey.
**Impact:** first-time non-technical installers who hesitate at an unfamiliar warning and have no
visual confirmation they're looking at the right dialog.
**Fix:** add one annotated screenshot of the actual SmartScreen dialog (both screens: the initial
warning and the "More info" expanded state) to `docs/USER-MANUAL.md` and mirror it in
`docs/index.html`'s note.

---

## Coverage notes (not findings)

- **Computed contrast ratios** for `--text-tertiary`/`--text-secondary` against `--bg-primary`/
  `--bg-secondary` were not measured (no rendered runtime session in this pass; `themes/index.ts`
  is a near-total rewrite this release — 1833 changed lines — but appears to be a reformat/
  restructure of an existing token system rather than new color values, so I did not treat token
  values themselves as new-in-1.4.0 risk without a rendered check). A runtime contrast audit of the
  new panels' `text-tertiary`-heavy `dt`/label styling (`ProductEvidencePanels.tsx` throughout) in
  both light and dark themes would be worth a follow-up pass.
- **The model-pull progress copy itself** (W-1's "Setting up..." with no percent/bytes) was not
  re-investigated beyond what the walkthrough already captured; I traced only as far as confirming
  the UI does have a dedicated progress span (`welcome-model-pull-progress`,
  `WelcomeScreen.tsx:496-506`) that's wired to `modelPull.detail`/`percent`, consistent with the
  walkthrough's characterization of this as a wiring gap rather than a missing UI slot.
- **Rename-via-`window.prompt`** for saved designs (`WelcomeScreen.tsx:161`) was checked and found
  to **predate v1.3.1** (present in the pre-release tree, not part of this delta) — excluded as
  out-of-scope for a release-delta review rather than reported as a new finding.
- **Live rendering of any of these states** (actually opening the app and driving the panels/
  reverse-import/disabled-button appearance) was not performed in this pass — findings here are
  static-analysis-grounded (file:line + cross-referenced config), not confirmed against pixels on
  screen. Recommend a quick visual spot-check of UX-1 (disabled-button contrast) and UX-4 (tab icon
  collision) before this list is treated as final.
