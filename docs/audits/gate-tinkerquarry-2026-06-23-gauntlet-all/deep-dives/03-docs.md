# Technical Writing Deep Dive

**Role:** Technical Writer
**Final counts after fixes:** Blocker 0 / Critical 0 / Major 0 / Minor 0 / Nit 0

## Findings Closed

### DOC-M001 - Live docs understated native/package proof and misstated browser breadth

**Original severity:** Major
**Evidence:** Live status/evaluation docs still framed browser coverage as a single happy path and had stale native/package wording.
**Fix:** `docs/STATUS.md`, `docs/EVALUATE.md`, `docs/MANUAL.md`, and package docs now describe the current proof more precisely: native build/install smoke exists, browser coverage includes core flow plus workspace/menu/dialog/mobile smoke, and remaining gaps are still named.

### DOC-M002 - User-facing legacy KimCad/OpenSCAD Studio release identity leaked into package docs

**Original severity:** Major
**Evidence:** Installer scripts and docs still used legacy product names or artifact naming.
**Fix:** Installer metadata, release asset naming, getting-started docs, FAQ, and engine README now point to TinkerQuarry as the product while preserving KimCad as the internal engine/protocol name.

## What Is Working

The live docs now separate product truth from historical audit records. Historical reports were left unchanged as dated evidence.
