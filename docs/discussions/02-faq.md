<!-- Category: Q&A. Pin this. -->

# FAQ: start here

## What is TinkerQuarry?

TinkerQuarry is a local-first AI CAD app for 3D printing. You describe a functional part, the local
engine generates editable OpenSCAD, the app validates the current model, and you slice/download or
send the current output.

## Do I need to know CAD?

No. The main workflow is prompt-first. Technical users can also inspect and edit the generated
OpenSCAD.

## Does it use the cloud?

No by default. Local operation is the default. Optional cloud providers are available only if you
configure a provider and key.

## What is KimCad?

KimCad is the internal Python engine and CLI inside TinkerQuarry. TinkerQuarry is the product name,
desktop app, installer, public documentation, and GitHub repository.

## Is it verified?

Yes for the documented beta scope. The current tree passed the full gate, native Windows build,
direct Tauri runtime smoke, and installed NSIS smoke. The mock send/outcome path is tested. Real
hardware connector certification is still beta field work.

## Does the installer work from a double-click `.exe`?

Yes. The Windows NSIS installer builds as `TinkerQuarry_1.3.1_x64-setup.exe`, and the installed-app
smoke test passed.

## Why did a malformed reverse-import mesh test pass?

Because TinkerQuarry rejected the malformed mesh. That is the intended behavior.

## What can I import?

Reverse import currently accepts STL, 3MF, and OBJ when the mesh clearly matches a known trusted part
family. Unknown or malformed meshes are rejected. STEP reverse import is not implemented yet.

## What can I export?

`.kimcad`, `.scad`, STL, OBJ, AMF, 3MF, SVG, DXF, PNG preview, and STEP when a trusted CadQuery twin
is available.

## What license is it?

GPL-2.0-only.
