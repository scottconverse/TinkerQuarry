<!-- Category: 🙋 Q&A -->

# Getting started / it's not working — troubleshooting thread

New to TinkerQuarry, or hit a snag? Ask here. To get a fast answer, include the basics below.

### Before posting, check these

- **First design hanging on "Planning the shape"?** The AI model is cold-loading (a few GB, ~1–2
  min on CPU the first time). Give it a moment — there's a **Cancel** button if you want to stop.
- **"Set up your AI" not finishing?** It's a one-time multi-GB download. Re-open Settings to see
  progress. The setup flow exists, but clean first-run/dependency-absent release proof is still being
  gated; report anything that does not guide you clearly.
- **"Photos and sketches need one more download"?** The vision model isn't fetched yet — use the
  wizard's or Settings' Download button. Text-to-design works without it.
- **A part won't slice?** It failed the printability check — read the named checks and fix the
  size/shape, or pick a printer it fits.
- **Slicing errors?** Make sure OrcaSlicer is installed and a printer profile is selected in Settings.

Most of these are covered in the [Manual → Troubleshooting](../MANUAL.md#8-troubleshooting).

### When you post, include

```
**What I tried (exact prompt or action):**
**What happened (and any error text):**
**OS + how I'm running it:** (kimcad web / installed app)
**Health:** Settings shows OpenSCAD / OrcaSlicer / AI as: …
**Printer selected:**
```

### Quick self-check

Run a health check — the app's Settings shows whether **OpenSCAD**, **OrcaSlicer**, and the **AI
model** are present. Most "it won't design/slice" issues are one of those three not set up yet. If
all three are green and it still fails, paste the error and we'll dig in.

Friendly reminder: everything runs locally, so there's no account/login to get wrong — it's almost
always a missing tool or a part that didn't pass the gate. We'll help you get the first print out. 🧱
