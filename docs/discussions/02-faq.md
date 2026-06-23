<!-- Category: 🙋 Q&A · Pin this -->

# FAQ — start here

Quick answers to the most common questions. If yours isn't here, ask in
[Getting started / troubleshooting](05-getting-started-help.md).

### What is TinkerQuarry, in one line?

Describe a 3D-printable part in plain English (or a photo/sketch) and get a checked, print-ready
file — entirely on your own machine.

### Do I need to know CAD?

No. You describe the _thing_; you don't draw it. You can fine-tune sizes afterward with sliders.

### Does it use the internet / the cloud?

No, by default. The AI and all the manufacturing run locally. There's an _optional_ cloud model you
can turn on in Settings — it's off unless you enable it, and even then vision stays local.

### Is my data private?

Yes. No account, no telemetry, no cloud by default. Your prompts, images, and designs stay on your
computer unless you explicitly enable a cloud model or send a job to a networked printer.

### What do I need installed?

Python 3.13, OpenSCAD, OrcaSlicer, and a local AI (Ollama + a model). The app has first-run/setup
surfaces for the AI and local tools; the fully clean first-run release matrix is still being gated.
Full steps:
[Manual → Install & first run](../MANUAL.md#1-install--first-run).

### Do I need a 3D printer?

Not to design and download files. A printer (or a connected service like OctoPrint/Bambu/Moonraker)
is only needed to print directly from the app.

### Why is the first design slow?

The AI model loads into memory the first time (a few GB). After that it's faster. With no graphics
card it runs on the CPU — still works, just not instant. The progress screen has a **Cancel** button.

### What printers are supported?

Slicing uses OrcaSlicer profiles, so anything OrcaSlicer supports. For _direct send_: OctoPrint,
Bambu (LAN mode), Moonraker, and PrusaLink connectors ship in the box.

### Why does it say "TinkerQuarry" but the program is `kimcad`?

KimCad is the **engine** inside TinkerQuarry. The window says TinkerQuarry; the command line and
file formats say `kimcad`. That's intentional — see the
[naming note](../../README.md#naming-tinkerquarry-vs-kimcad).

### Is it finished?

It's in active development. The full describe -> slice -> mock send/outcome happy path works and is
automated, but broader first-run, mobile/accessibility, hardware connector, and error-path gate
coverage is still in progress. See
[STATUS.md](../STATUS.md) for the honest, evidence-backed state.

### What license is it?

GPL-2.0. See [LICENSE](../../LICENSE).
