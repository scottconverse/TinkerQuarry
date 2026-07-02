<!-- Category: Q&A. -->

# Getting started and troubleshooting

If TinkerQuarry does not start, design, validate, slice, import, export, or send as expected, post
here.

## Before posting

- Try a simple prompt such as `a 70 mm round coaster, 4 mm tall`.
- Check Settings for engine, model, OpenSCAD, OrcaSlicer, CadQuery, printer, and material status.
- If Build is disabled, copy the recovery text.
- If slicing is blocked, copy the readiness finding.
- If reverse import is rejected, include the file type and whether it came from a known
  TinkerQuarry export.

## Support template

```text
What I tried:
What happened:
Exact error text:
OS:
Running from installer or source:
TinkerQuarry version:
Engine version from Settings/About:
Selected printer/material:
Engine/model/OpenSCAD/OrcaSlicer/CadQuery status:
Was this prompt, saved design, reverse import, or export?
Screenshot if available:
```

## Common causes

- Local engine unavailable.
- Local model missing or cold-loading.
- OpenSCAD or OrcaSlicer not found.
- Printer/material not selected.
- Source, orientation, printer, or material changed after the last slice.
- Readiness gate failed.
- Reverse import file is malformed or does not match a known trusted family.

The manual is here: `docs/USER-MANUAL.md`.
