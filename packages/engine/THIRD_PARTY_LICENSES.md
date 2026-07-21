# Third-party licenses & attribution

KimCad (the engine inside **TinkerQuarry**) is licensed **GPL-2.0-only** — see [LICENSE](LICENSE).
This file documents the third-party components it ships with, invokes, or depends on, and why the
combined work is GPL-2.0-compatible.

> **Why GPL-2.0:** TinkerQuarry (Option B) absorbs the **OpenSCAD-Studio** front-end, which is
> **GPL-2.0-only**. A combined work containing GPL-2.0-only code must itself be GPL-2.0. KimCad's
> own code was therefore relicensed Apache-2.0 → GPL-2.0. The current root
> [STATUS matrix](../../docs/STATUS.md) tracks release proof and remaining beta work. *(Not legal
> advice; get counsel sign-off before a public 1.0.)*

## 1. KimCad's own code & templates

GPL-2.0-only. Includes the Python engine (`src/kimcad/`), the SCAD template families
(`library/*.scad` — KimCad's own work, not third-party), and the built SPA (`src/kimcad/web/`,
reskinned to TinkerQuarry from the absorbed Studio front-end).

## 2. Absorbed front-end

| Component | License | Notes |
|---|---|---|
| OpenSCAD-Studio front-end (React/TS, reskinned) | **GPL-2.0-only** | the source of the GPL-2.0 obligation on the combined work; not relicensed (cannot be) |

## 3. External engines — invoked as separate subprocesses

These are **not** linked into KimCad; KimCad calls them as separate processes. Windows release
builds stage the checksum-pinned binaries into the installer payload under `tools/`. They keep
their own licenses and source-availability terms.

| Engine | License | How used | Release/source notes |
|---|---|---|---|
| **OpenSCAD 2026.03.16** | GPL-2.0-**or-later** | geometry kernel: KimCad shells out to render `.scad` → mesh | Windows snapshot is fetched from `files.openscad.org/snapshots` and pinned by SHA-256 in `scripts/fetch_tools.py`. Source: <https://github.com/openscad/openscad>. |
| **OrcaSlicer 2.4.0-alpha** | **AGPL-3.0** | slicer: KimCad shells out to produce G-code | Windows portable build is fetched and pinned by SHA-256 in `scripts/fetch_tools.py`. Source: <https://github.com/SoftFever/OrcaSlicer>. |
| **PrintProof3D 0.6.2** | MIT | readiness validation engine: KimCad shells out to validate the rendered mesh | Windows binary is fetched from the GitHub release and pinned by SHA-256 in `scripts/build_installer.py`. Source/release: <https://github.com/scottconverse/PrintProof3D/releases/tag/v0.6.2>. |
| Ollama + models (qwen3.5:9b chat/planner, qwen2.5vl:3b vision, qwen2.5vl:7b / qwen3-vl:8b / minicpm-v:8b optional VCL) | Ollama: MIT · Qwen models: Apache-2.0 · MiniCPM-V model license per upstream distribution | local AI and optional local visual critique, separate process at `:11434` | Not bundled in the installer; managed/setup flows may download or use a user-installed local runtime. qwen2.5:7b (prior default chat model) remains selectable via local_qwen2_5 backend in config. |

## 4. Bundled SCAD libraries (vendored — all GPLv2-compatible)

The permissive SCAD stack is vendored into the approved `library/` path. All are GPLv2-compatible
(redistributable in a GPL-2.0 product):

| Library | License |
|---|---|
| BOSL2 | BSD-2-Clause |
| Round-Anything | MIT |
| Dan Kirshner threads.scad | Not bundled; available source is GPL-3.0-or-later, which is incompatible with this GPL-2.0-only combined work |
| YAPP_Box | MIT |
| gridfinity-rebuilt | MIT |

**Not bundled** (GPLv3/LGPLv3, incompatible with GPL-2.0): NopSCADlib (GPL-3.0+), dotSCAD
(LGPL-3.0) — supported only via an optional, user-installed, arms-length path.

## 5. Python runtime dependencies

Installed separately via `pip` (declared in `pyproject.toml`); the installer additionally
bundles this set in its private venv. Since v1.5-1 the bundle is **license-clean by
construction and CI-enforced**: `scripts/license_scan.py` runs in CI and the release gate,
and fails on any GPL-2.0-incompatible license linking in-process.

| Package | License |
|---|---|
| pydantic, pyyaml, trimesh | MIT |
| numpy, scipy, networkx, lxml | BSD-3-Clause |
| httpx (chat transport for `kimcad.chat_client`) | BSD-3-Clause |
| manifold3d | Apache-2.0 \* |

\* Apache-2.0 is not GPLv2-*compatible* for combining into one work, so manifold3d is **never
imported in-process**: it runs behind the `manifold_worker.py` subprocess, the same
arm's-length process boundary used for OpenSCAD, OrcaSlicer, and CadQuery (see section 3).
The license gate enforces that only `*_worker.py` files may import it.

*History:* through v1.4.0 the bundle also shipped the `openai` client (Apache-2.0, with
`distro` in its dependency tail) under an aggregation rationale. v1.5-1 removed both —
`kimcad.chat_client` now implements the OpenAI-compatible calls directly over `httpx` — and
made their reappearance a CI failure (`FORBIDDEN` list in the license gate).

## 6. Front-end dependencies

The SPA (`frontend/`) builds against React, Three.js, and related libraries — predominantly **MIT**
— installed via `npm` (`package.json`), not redistributed as source here.

---

Corrections welcome — open an issue if any license here is inaccurate or out of date.
