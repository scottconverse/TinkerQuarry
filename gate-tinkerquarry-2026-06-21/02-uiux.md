# GauntletGate (full) — 02 · UI/UX Designer lane — TinkerQuarry

**Date:** 2026-06-21 · **Role:** UI/UX (visual hierarchy, interaction states, copy, accessibility,
journey gaps, rebrand+retheme quality) · Audit-only (read product code; no edits).
**Scope read:** `frontend/src/styles.css` (full, 4536 lines), `useTheme.ts`, `FirstRunWizard.tsx`,
`Topbar.tsx`, `Landing.tsx`, `SettingsPanel.tsx` (theme toggle), plus a rebrand grep across
`frontend/src/**`. Consumed the walkthrough lane (did not re-walk first-run reachability / self-heal).

All contrast ratios below computed with the WCAG 2.x relative-luminance formula; `color-mix()` tints
resolved in sRGB against the actual surface they paint on.

## Severity counts
- **Blocker:** 0
- **Critical:** 0
- **Major:** 2
- **Minor:** 4
- **Nit:** 3

**Headline:** The **dark theme (the new default) is contrast-clean** — every key pair clears AA with
large margin; the retheme PRESERVED the dark fill-vs-text splits. The **light theme regressed**: the
new TinkerQuarry light accent (`--kc-accent-strong: #b35f29`) lands the *primary button text* and
several accent-text/status-tint pairs **just under AA (4.1–4.4:1)**, contradicting the in-file
"clears AA ≥4.5:1" comments that were written for the old Zen palette. Two Major findings, both
light-theme; light theme is user-reachable (Settings → Appearance → Light). No Blockers/Criticals.

---

## Findings

### UIUX-01 — (Major · Contrast/WCAG) Light-theme PRIMARY button text fails AA
- **Evidence:** `styles.css:336` `.kc-btn-accent { background: var(--kc-accent-strong); color: var(--kc-on-accent) }`.
  Light tokens: `--kc-accent-strong:#b35f29` (`:48/57`), `--kc-on-accent:#fff7ec` (`:59`).
  Computed **4.31:1** — below the 4.5:1 AA floor for normal text. The label is 12.5px/600 (not "large").
- **Same token, same failure, on the most-used controls:** `.kc-msg-user` (chat bubbles, `:1189`),
  `.kc-mobile-cta` (`:2486`), `.kc-unit-btn-active` (units + the **theme toggle itself**, `:1303`),
  `.kc-version-pill-active` (`:2878`), `.kc-btn-accent-sm` (`:3619`), `.kc-switch-on` knob track.
  The "Design it" CTA (`Landing.tsx:147`) and "Continue/Start designing" wizard buttons are `.kc-btn-accent`.
- **Observed vs expected:** code comments at `:55` and `:1187` assert `-strong` is the AA-safe text
  variant ("raw --kc-accent is 3.99:1 … -strong clears 4.5:1"). That was true for the *old* Zen gold;
  the retheme replaced the light accent with terracotta `#b35f29` whose on-`#fff7ec` ratio is 4.31:1.
  The guarantee the comments promise is now **false in light mode**.
- **Why it matters:** the single most-repeated interactive surface in the app (every primary action,
  every user chat bubble) is sub-AA for the ~half of users who pick Light or whose System resolves light.
- **Blast radius:** Major (primary controls, app-wide, but light-theme-only and only ~0.2 below floor —
  legible, not unreadable, so not Critical).
- **Fix:** darken the light `--kc-accent-strong` to ~`#a4561f` (≈4.9:1 on `#fff7ec`) or darken
  `--kc-on-accent` toward pure white; re-verify all `.kc-*-active`/`.kc-btn-accent` pairs. The dark
  theme is fine — change light only.

### UIUX-02 — (Major · Contrast/WCAG) Light-theme accent-TEXT and warn/fail status tints fall under AA
- **Evidence (accent text on surface — `--kc-accent-strong:#b35f29` on `--kc-surface:#f8f3e8`): 4.14:1.**
  Selectors painting accent text this way in light mode: `.kc-chip:hover` (`:387`), `.kc-cap-icon`
  (`:580`), `.kc-photo-affordance:hover` (`:3812`), `.kc-measure-toggle-on` (`:888`),
  `.kc-param-updating` (`:1340`), `.kc-chip-library` (`:2303`), `.kc-set-badge-cloud`-adjacent text.
  Comment `:55` claims accent-on-surface clears 4.5:1 — **false (4.14)** in light.
- **`.kc-tone-warn`** (`:1549`): `--kc-warn:#876312` on warn-accent-18%-on-surface tint = **4.29:1** — under AA.
- **`.kc-msg-error` / `.kc-tone-fail`** fail text on the fail-tint = **4.33:1** (`:1203`, `:1553`) — under AA.
- **`.kc-gauge-num`** readiness "pass" score: `--kc-pass:#1d7a4e` on the tinted readiness card = **4.51:1**
  — passes only because it's large (≥24px); fine, noted for completeness.
- **Why it matters:** these are status/feedback colors — the moments where a user is being told pass/
  warn/fail or "this is interactive." Sub-AA status text is the classic accessibility gap.
- **Blast radius:** Major (status + accent text across chat, chips, readiness, errors; light-theme-only).
- **Fix:** in the light tokens, nudge `--kc-warn` to ~`#6f5010` (already have `--kc-warn-text:#6a4e0b`
  at 7.0:1 — `.kc-tone-warn` should use `-text`, not `--kc-warn`), use `--kc-warn-text` for the warn
  badge text, and darken light `--kc-fail` (#a8431f, 5.44:1 on surface but 4.33:1 on its own 16% tint)
  or lighten the tint. Mirror the dark theme, where every one of these clears 7–10:1.

### UIUX-03 — (Minor · Rebrand) "Kim" persona retained but never explained — coherence gap
- **Evidence:** the AI assistant is still **Kim** — `kim-avatar.png` rendered with `alt="Kim"` in
  Topbar logo (`Topbar.tsx:70`), Landing hero (`Landing.tsx:114`), wizard rail+welcome
  (`FirstRunWizard.tsx:250,278`), and every assistant chat row (`ChatPanel.tsx:170…236`). Landing copy
  speaks in Kim's first person: "I'll design it, check that it's actually printable" (`Landing.tsx:121`).
- **Observed vs expected:** the product is now "TinkerQuarry," the wordmark is Tinker|Quarry, but the
  face/voice is an unnamed "Kim" the UI never introduces. A new user sees a portrait labeled (to SR
  users) "Kim" with zero on-screen text saying who Kim is. The brand mark and the persona don't
  reference each other.
- **Why it matters:** mild brand incoherence + an SR oddity (the home button's logo alt is "Kim" while
  the button's aria-label is "TinkerQuarry — home" — the aria-label wins, so the "Kim" alt is dead weight
  there). Not a blocker; the persona is internally consistent across surfaces.
- **Blast radius:** Major surfaces (everywhere the avatar appears) but low impact.
- **Fix:** either (a) introduce Kim once ("Hi, I'm Kim, your TinkerQuarry design assistant") on the
  wizard welcome / landing, making the persona intentional, or (b) drop the name and use role-based alt
  text ("TinkerQuarry assistant"). On the Topbar brand button specifically, set the logo `alt=""`
  (decorative) since the button already has an accessible name.

### UIUX-04 — (Minor · Default theme UX) Forcing dark for unset AND for `getServerSnapshot`/garbage
- **Evidence:** `useTheme.ts:20` returns `'dark'` for unset/garbage localStorage; `:27`
  `getServerSnapshot` returns `'dark'`; comment "TinkerQuarry defaults to its dark earthy identity."
  The previous default was `'system'` (per the file's own doc comment at `:6`, "the default — follow
  the OS", now stale).
- **Why it matters:** ignoring the OS `prefers-color-scheme` is a real a11y/comfort regression for
  users who set their machine to Light for low-vision or glare reasons — TinkerQuarry overrides their
  stated system preference on first run. The dark theme is the stronger-contrast one here, so the harm
  is comfort/expectation, not legibility. The doc comment at `:6` now contradicts the code.
- **Blast radius:** every first-run user; reversible in Settings.
- **Fix:** consider defaulting to `'system'` and letting the dark identity show for the majority who run
  dark, OR keep dark-default but update the stale `:3–9` comment and add a one-line note. At minimum fix
  the doc/comment drift so the next maintainer isn't misled.

### UIUX-05 — (Minor · Contrast/hardcoded) Viewport-overlay error + dim pills use fixed light-on-dark that ignore theme
- **Evidence:** `.kc-viewport-overlay-error { color:#e9a08a }` (`:756`), `.kc-viewport-overlay
  { color: rgba(255,255,255,0.55) }` (`:750`), `.kc-busy-sub rgba(255,255,255,0.6)` (`:817`),
  `.kc-busy-elapsed rgba(255,255,255,0.46)` (`:823`). The viewport card is dark in both themes (by
  design, `:106`), so light-on-dark is correct here — but `rgba(255,255,255,0.46)` on `#0d0b07`
  (dark) / `#1a160f` (light viewport) is ~ **3.4:1**, under AA for the elapsed timer text.
- **Why it matters:** the "Designing…" busy screen is a core moment (multi-minute waits per the
  walkthrough). The elapsed timer + sub-copy are the reassurance; at 0.46–0.6 alpha they're borderline.
- **Blast radius:** the in-flight design overlay (every generation). Minor — secondary text.
- **Fix:** raise the busy sub/elapsed alphas to ≥0.7 (sub) / ≥0.6 (elapsed) so they clear ~4.5:1 on the
  `#0d0b07` viewport. `kc-busy-title`/Cancel are fine (white / 0.92).

### UIUX-06 — (Minor · Copy honesty) Landing badge "Ready to print in ~15 minutes" is an unconditional promise
- **Evidence:** `Landing.tsx:117` static badge "Ready to print in ~15 minutes · no CAD skills";
  wizard rail "Most first prints are ready in under 15 minutes" (`FirstRunWizard.tsx:268`). The
  walkthrough (W-2) measured a **~2-minute cold model load alone**, and the first run also downloads a
  ~7.7 GB model. The 15-min claim is the *warm, model-present, simple-part* path.
- **Why it matters:** on the very first run (model not yet pulled), "ready in 15 minutes" is optimistic
  by the multi-GB download time. The wizard's own copy is honest elsewhere ("a few minutes," "~7.7 GB"),
  so this badge is the one over-promise.
- **Blast radius:** Landing + wizard, first impression. Minor (it's a soft "~").
- **Fix:** scope it ("Most parts: design to print file in minutes") or condition the badge on
  model-present, mirroring the honesty the rest of the flow already shows.

### UIUX-07 — (Nit · Focus ring contrast on dark) Accent focus ring is fine; verify the 0.18 input glow
- **Evidence:** `.kc-input-card:focus-within` adds `0 0 0 3px rgba(200,98,58,0.18)` (`:490`) — a
  hardcoded terracotta at 18% alpha. On the dark surface this is a very faint wash; the border-color
  change to `--kc-accent` carries the real focus signal, so it's not a failure, but the rgba is a
  pre-retheme literal (matches neither light nor dark accent exactly) and is nearly invisible on dark.
- **Fix:** tokenize as `color-mix(in srgb, var(--kc-accent) 18%, transparent)` so it tracks the theme.

### UIUX-08 — (Nit · Rebrand consistency) Stale "Zen Design World" identity comments in styles.css header
- **Evidence:** `styles.css:1–8` still describes the design system as "Zen Design World … Kim's Zen
  Design World aesthetic (warm white / deep black / gold accent, 'Design in Balance')." The tokens are
  now TinkerQuarry warm-earthy. Internal-only, but it's the file header a maintainer reads first and it
  describes a brand that no longer exists.
- **Fix:** update the header comment to the TinkerQuarry identity (the `:107–137` dark block already
  documents it well — lift that framing up top).

### UIUX-09 — (Nit · A11y) Theme/units active state leans on color; SR cue present, visual sub-AA
- **Evidence:** `.kc-unit-btn-active` (`:1303`) is the only at-rest differentiator between the
  selected/unselected Appearance + Units toggle buttons, and in light mode its text is 4.31:1 (see
  UIUX-01). `aria-pressed` (`SettingsPanel.tsx:321`) gives SR users the state — good — so this is a
  visual-only nit layered on the UIUX-01 fix.
- **Fix:** resolved by UIUX-01's token darkening; optionally add a non-color active cue (weight/inset)
  for robustness.

---

## What's working (specific credit)

- **Dark theme contrast is genuinely strong and the splits were preserved.** Every key dark pair clears
  AA with room: ink/bg **14.1:1**; accent-strong text on surface **10.4:1**; on-accent on the
  accent-strong button fill **10.4:1**; pass-text on its tint **8.0:1**; warn-text on warn tints
  **8.1–8.5:1**; fail on surface **6.0:1**; muted on surface **5.5:1**; accent-deep links **6.5:1**.
  The retheme correctly LIGHTENED the accent for dark (`#e0a667` fill / `#f0bd84` text) and flipped
  `--kc-on-accent` to dark ink — the fill-vs-text discipline the original code documented is intact in
  the new default theme.
- **First-run journey has no dead-ends** (corroborates the walkthrough): the wizard is a real focus
  trap (`FirstRunWizard.tsx:167–196` — focus-in, Esc to skip, Tab cycling), every step is skippable,
  the model step's "Set up TinkerQuarry's AI" is honest about the download (size shown, progress rows,
  coarse SR-live announcement that won't spam), and the recap step **re-probes and demotes "You're all
  set" → "Almost ready"** when the model isn't actually ready (`:236–237, 547–558`) — exactly the
  honesty a beta needs.
- **Empty / loading / error / disabled states are thorough:** `.kc-mydesigns-empty`,
  `.kc-photo-card-error`, `.kc-viewport-overlay-error`, per-card `.kc-design-err`, disabled buttons
  drop `pointer-events` (`:333`), `prefers-reduced-motion` honored globally (`:1044`),
  `aria-disabled` no-op on the in-flight "check again" link.
- **Rebrand completeness is high.** No user-facing "KimCad" leakage: every `kimcad` hit is a protocol
  identifier that MUST stay — `X-KimCad-Session` / `kimcad-session-token` (`api.ts:242,230`), the
  `.kimcad` export format, the `#kimcad-main` skip-link anchor, the `kimcad-rerun-setup` event. The
  wordmark renders Tinker|**Quarry** (`Topbar.tsx:72`, `FirstRunWizard.tsx:252`). All product copy says
  TinkerQuarry. The only persona question is UIUX-03 ("Kim" unexplained), not a missed rename.
- **Touch-target + responsive discipline is excellent and battle-scarred** (lots of prior-audit fix
  comments): dual-arm `(pointer:coarse), (max-width:640px)` 44px floors everywhere, the slider hit-area
  grown via transparent padding while the painted track stays thin, the topbar wraps to 2 lines as a
  safety net, the wizard rail collapses to a top strip, the workspace stacks to one column with a sticky
  mobile "Check & download" CTA. Keyboard focus rings are consistent (`2px accent` everywhere) and the
  viewport canvas is focusable with a visible inset ring for arrow-orbit (WCAG 2.1.1).

## What I could NOT assess
- **Rendered pixels** (no running instance in this lane; the walkthrough lane covered live render and
  confirmed palette/wordmark render correctly on the real engine). Contrast here is computed from
  tokens, which is authoritative for ratios but doesn't catch e.g. font-smoothing or sub-pixel effects.
- **The actual `kim-avatar.png` artwork** — whether the portrait reads as coherent with an earthy-quarry
  brand is a visual judgment I can't make from code; flagged as the UIUX-03 coherence question.
- **`color-scheme: dark` form-control theming** (`:108`) on real browsers — native selects/scrollbars
  rely on the UA; not verifiable from CSS alone.
