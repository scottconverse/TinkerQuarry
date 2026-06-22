# GauntletGate (full) — 02 · UI/UX Designer lane — TinkerQuarry — ROUND 2 re-audit

**Date:** 2026-06-21 · **Role:** UI/UX re-audit (verify round-1 fixes + find residual/new at the
same bar) · Audit-only (read product code; no edits).
**Round-1 baseline:** `02-uiux.md` (2 Major, 4 Minor, 3 Nit). Round-1 fixes committed at
`KimCadClaude@da65bc8`.
**Scope read this round:** `styles.css` (tokens `:43–138`, status tones `:1548–1735`, msg/active
selectors, busy overlay, focus glow), `useTheme.ts` (full), `Topbar.tsx`, `Landing.tsx`,
`FirstRunWizard.tsx`, `RightPanel.tsx` (`gateTone` badge wiring), `designStatus.ts`, plus a fresh
`KimCad|kimcad` rebrand grep across `frontend/src/**`.

All ratios below COMPUTED with the WCAG 2.x relative-luminance formula; `color-mix()` tints resolved
in sRGB against the exact surface each selector paints on (calculator in `/tmp/contrast.py`).

## Severity counts (round 2)
- **Blocker:** 0
- **Critical:** 0
- **Major:** 0
- **Minor:** 1  (new — pass-tone status badge, light theme)
- **Nit:** 0

Round 1 → Round 2: Major **2 → 0**, Minor **4 → 1**, Nit **3 → 0**. Net: every round-1 finding is
genuinely fixed; **one new residual** of the same family the round-1 fix didn't reach.

---

## Verified FIXED (with recomputed ratios)

### UIUX-01 (was Major) — light PRIMARY button text — FIXED ✓
`--kc-accent-strong` darkened `#b35f29 → #9a4f1c` (`styles.css:58`); `--kc-on-accent #fff7ec` (`:60`).
- white-on-fill (`--kc-on-accent` on `--kc-accent-strong`): **5.63:1** (was 4.31) ✓
- accent-text on `--kc-surface`: **5.41:1** (was 4.31) ✓ · on `--kc-bg`: **4.99:1** ✓ ·
  on `--kc-surface-2` (chat AI bubble / version pill bg): **4.52:1** ✓ (just clears)
All shared consumers confirmed on the same token: `.kc-btn-accent` (`:337`), `.kc-msg-user`
(`:1196`), `.kc-unit-btn-active` / theme+units toggle (`:1312`), `.kc-version-pill-active` (`:2889`),
`.kc-btn-accent-sm` (`:3631`). The `:55–58` comment now matches reality. **AA met.**

### UIUX-02 (was Major) — light accent-text + warn/fail status tints — FIXED ✓
`--kc-warn #74510f` (`:69`), `--kc-fail #8f3819` (`:74`), with `--kc-warn-text #5f460a` (`:72`).
Computed on the ACTUAL tinted backgrounds the `.kc-tone-*` classes paint:
- `.kc-tone-warn` (`--kc-warn` on warn-accent-18%-tint `#f0e2c7`): **5.61:1** (was 4.29) ✓
- `.kc-tone-fail` (`--kc-fail` on fail-16%-tint `#e7d5c7`): **5.36:1** (was 4.33) ✓
- `.kc-msg-error` (`--kc-fail` on fail-10%-tint `#eee0d3`): **5.91:1** ✓
- warn/fail/accent-text on plain surface: 6.5 / 6.9 / 5.4:1 ✓
The readiness card correctly routes small text through `--tone-text` (`:1600–1617`): pass-text on
14% tint = **5.46:1** ✓. **AA met for warn, fail, accent.**

### UIUX-03 (was Minor) — Kim persona — FIXED ✓
Wizard welcome now introduces her: *"I'm Kim, your on-device design assistant…"*
(`FirstRunWizard.tsx:285`). Topbar brand logo is now `alt=""` (decorative; the button keeps
`aria-label="TinkerQuarry — home"`, `Topbar.tsx:69–70`) — the dead "Kim" alt is gone. Persona is now
intentional and coherent. (Wizard rail + chat rows still use `alt="Kim"`, which is now correct since
the name is established.)

### UIUX-04 (was Minor) — dark default theme — FIXED ✓
`useTheme.ts`: unset/garbage → `'dark'` (`:22`), `getServerSnapshot → 'dark'` (`:29`), explicit
`'system'` still re-resolves live via `matchMedia` (`:42`, `:90–101`). The doc comment (`:5–7`) now
accurately states the dark default and that `'system'` follows the OS — drift resolved.

### UIUX-05 (was Minor) — viewport-overlay pills — FIXED ✓
`.kc-busy-sub` 0.6 → **0.72** (`:823`), `.kc-busy-elapsed` 0.46 → **0.62** (`:829`). On the
`#0d0b07` dark viewport: sub = **10.2:1**, elapsed = **7.7:1**; on the `#1a160f` light-theme
viewport: 9.7 / 7.4:1. Base overlay (0.55) = 6.2:1, overlay-error `#e9a08a` = 9.2:1. **AA met.**

### UIUX-06 (was Minor) — landing badge copy — FIXED ✓
`Landing.tsx:117` now reads *"Most first prints in ~15 minutes · no CAD skills"* — the unconditional
"Ready to print" promise is gone; framed as typical-case with a soft "~". Honest.

### UIUX-07 (was Nit) — focus glow tokenized — FIXED ✓
`.kc-input-card:focus-within` (`:494`) now `color-mix(in srgb, var(--kc-accent) 30%, transparent)` —
tracks the theme; the rgba literal is gone; alpha bumped 0.18→0.30 for visibility on dark.

### UIUX-08 (was Nit) — stale "Zen Design World" header — FIXED ✓
`styles.css:1–9` rewritten to the TinkerQuarry warm-earthy identity. No "Zen"/"gold"/"Design in
Balance" left in the header.

### UIUX-09 (was Nit) — non-color active cue — FIXED ✓
`.kc-unit-btn-active` (`:1317`) adds `box-shadow: inset 0 0 0 1.5px var(--kc-accent-deep)` — a
shape/border affordance independent of hue, paired with the existing `aria-pressed`.

---

## Residual / NEW finding

### UIUX-R2-01 — (Minor · Contrast/WCAG) Light-theme PASS status badge text is sub-AA
- **Evidence:** `.kc-tone-pass` (`styles.css:1556–1559`) sets `color: var(--kc-pass)` (the *bright
  fill* green `#1d7a4e`) on its own 15% tint background `#d7e1d1`. Computed **3.95:1** — under the
  4.5:1 AA floor for normal text.
- **Where it renders as TEXT:** the always-visible gate verdict badge —
  `RightPanel.tsx:675` `<span className="kc-status-badge kc-tone-${gateTone(...)}">` showing the
  word **"Passed"** at 12px / weight 700 (`.kc-status-badge`, `:1548–1554`). `gateTone` returns
  `'pass'` for a passing printability gate (`designStatus.ts:9–20`), so this is the normal happy-path
  state.
- **Why it's the round-1 fix's blind spot:** round-1 fixed warn/fail by darkening their tokens, and
  fixed the readiness CARD by routing small text through `--tone-text` (the darker `--kc-pass-text
  #15633d`). But the standalone `.kc-tone-pass` *class* still paints the raw fill green — it never got
  the `-text` treatment. Round-1 only computed `.kc-tone-pass` for the 32px gauge number (large text,
  passes at 3.0); the 12px gate badge using the same class was not separately computed.
- **Scope:** the warn/fail siblings of this exact badge are fine (`.kc-tone-warn` 5.61:1,
  `.kc-tone-fail` 5.36:1) — only the pass tone fails. Light-theme only; the dark theme's
  `.kc-tone-pass` (sage `#9cc47e` on its dark tint) is well clear.
- **Blast radius:** one status indicator, light-theme-only, the happy path (so high-frequency), and
  legible at 3.95 (not unreadable) → **Minor**, not Major. It is a contrast failure on a primary
  status control, so it sits right at the Minor/Major line; kept Minor because it is a single
  selector and ~0.55 below floor.
- **Fix:** mirror what the readiness card already does — give `.kc-tone-pass` `color: var(--kc-pass-text)`
  (`#15633d`), which computes **5.40:1** on the same 15% tint. One-token change, no new color needed.

---

## Dark theme — regression check (round-1 win, re-verified clean)
Recomputed from the `:root.kc-theme-dark` tokens — all key pairs still clear AA with room:
- on-accent on accent-strong fill: **10.4:1** · accent-strong text on surface: **10.4:1**
- ink on surface: **13.5:1** · muted on surface: **5.5:1** · pass-text on surface: **10.7:1**
- warn text on warn tint: **6.1:1** · fail text on fail tint: **4.7:1** (clears) · busy pills 7.7–10.2:1
The fill-vs-text accent split and the dark default are intact. **No regression from the round-1 edits.**

## Rebrand completeness — re-verified
Fresh grep: every `KimCad`/`kimcad` hit is an internal/protocol identifier that MUST stay —
`X-KimCad-Session` header (`api.ts:242`), `kimcad-session-token` meta, the `.kimcad` backup export
format (deliberately user-visible as "Backup (.kimcad)", `MyDesigns.tsx:164`), the `#kimcad-main`
skip-link anchor (`App.tsx:630` + every `<main>`), the `kimcad-rerun-setup` event, `~/.kimcad/`
settings path, backend `src/kimcad/` references, and code comments. Wordmark renders Tinker|**Quarry**
everywhere. **No stray user-facing brand leak.**

## What I could NOT assess
- Rendered pixels / font smoothing (no running instance in this lane; ratios are token-authoritative).
- The `kim-avatar.png` artwork's coherence with the earthy brand (visual judgment) — now lower-stakes
  since the persona is introduced in copy.
- Native `color-scheme: dark` form-control theming on real browsers (UA-dependent).

## Bottom line
UI/UX is **NOT** at a clean 0 — one residual **Minor** remains (UIUX-R2-01: light-theme "Passed"
gate badge at 3.95:1). Both round-1 Majors and all 4 Minors + 3 Nits are genuinely fixed and
recomputed clear. The dark default theme is re-verified AA-clean (no regression) and the rebrand is
complete. The single residual is a one-token fix (`.kc-tone-pass` → `--kc-pass-text`).
