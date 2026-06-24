<!-- Category: Q&A · Pin this -->

# FAQ

## What is TinkerQuarry?

TinkerQuarry is a local-first AI CAD app for 3D printing. You describe a functional part, the local
engine generates OpenSCAD, the app validates the model, and you slice/download or send the output.

## Do I need to know CAD?

No. The main workflow is prompt-first. Technical users can inspect and edit the generated OpenSCAD.

## Does it use the cloud?

No by default. Local operation is the default. Optional cloud providers are available only if you
configure a provider and key.

## What is KimCad?

KimCad is the internal engine and CLI inside TinkerQuarry. TinkerQuarry is the product name, app,
installer, documentation, and GitHub repository.

## What does v1.3.1 prove?

The release gate is run locally before tagging. It covers lint, type-check, UI unit tests, web
unit tests, the engine test suite, Playwright browser walkthroughs, Rust/Tauri tests, native Windows
package build, release executable smoke, and installed-app smoke.

## Is it finished?

It is a beta. The core path is real and release-gated. Hardware connector certification, full visual
diff, richer Explain, metrology-grade vision, and broader browser matrix coverage remain future work.

## What license is it?

GPL-2.0-only.
