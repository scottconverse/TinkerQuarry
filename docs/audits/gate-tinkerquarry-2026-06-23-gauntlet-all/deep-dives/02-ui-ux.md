# UI/UX Deep Dive

**Role:** UI/UX Designer
**Final counts after fixes:** Blocker 0 / Critical 0 / Major 0 / Minor 0 / Nit 0

## Findings Closed

### UX-M001 - Product chrome exposed stale public OpenSCAD Studio links

**Original severity:** Major
**Evidence:** The UI defaulted public repository and Mac download links to OpenSCAD Studio URLs.
**Fix:** Repository and Mac release links are now opt-in via `VITE_TQ_REPOSITORY_URL` and `VITE_TQ_MAC_RELEASE_BASE`. Empty config hides those controls.

### UX-M002 - Workspace header and manufacturing controls could collide

**Original severity:** Major
**Evidence:** The workspace switcher used absolute positioning in the top toolbar.
**Fix:** The switcher now lives in normal flex flow and the header can scroll horizontally instead of overlapping controls.

### UX-M003 - Menu/dialog keyboard and modal semantics were incomplete

**Original severity:** Major
**Evidence:** Menubar lacked full ARIA menu roles/keyboard behavior; modal surfaces were missing some dialog semantics and Escape/focus handling.
**Fix:** Added ARIA menubar/menuitem roles and keyboard traversal. Export, settings, first-real-print, and print-outcome dialogs now expose modal labels and Escape/focus behavior.

## What Is Working

The design-spec journey is present in the running app: AI-first prompt, Studio viewer, Customize / Make it real rail, manual orientation, slice, send, and outcome. The new Playwright walkthrough exercises the desktop controls and a mobile/narrow smoke.
