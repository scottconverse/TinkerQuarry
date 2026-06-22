import { Label, Text } from '../ui';

// TinkerQuarry Phase 7 (PRD §6.14): About / Licenses with source links. TinkerQuarry, its KimCad
// engine, and the OpenSCAD-Studio base are all GPL-2.0; OpenSCAD is GPL-2.0; OrcaSlicer is AGPL-3.0
// — all copyleft, so the *corresponding source* must be offered. This panel is that offer + the
// component attributions. Facts verified against the in-repo LICENSE files (GPL-2.0) and each
// project's canonical repository; no URL is fabricated (first-party source ships in this repo).

interface OssComponent {
  name: string;
  role: string;
  license: string;
  /** Canonical upstream source. Omitted for first-party parts whose source ships in this repo. */
  source?: string;
}

const COMPONENTS: OssComponent[] = [
  { name: 'TinkerQuarry', role: 'This application', license: 'GPL-2.0-only' },
  { name: 'KimCad engine', role: 'Design → readiness gate → slice pipeline', license: 'GPL-2.0-only' },
  { name: 'OpenSCAD Studio', role: 'Editor / viewer / customizer base', license: 'GPL-2.0' },
  {
    name: 'OpenSCAD',
    role: 'Geometry renderer (CSG → mesh)',
    license: 'GPL-2.0',
    source: 'https://github.com/openscad/openscad',
  },
  {
    name: 'OrcaSlicer',
    role: 'Slicer (mesh → G-code)',
    license: 'AGPL-3.0',
    source: 'https://github.com/SoftFever/OrcaSlicer',
  },
  {
    name: 'Ollama + local models',
    role: 'Local AI runtime (planner + vision)',
    license: 'MIT (Ollama)',
    source: 'https://github.com/ollama/ollama',
  },
];

export function AboutSettings() {
  return (
    <div className="space-y-5">
      <div
        className="rounded-xl p-4"
        style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)' }}
      >
        <Label className="mb-0">TinkerQuarry</Label>
        <Text variant="caption" color="tertiary" className="mt-1">
          Plain-English descriptions → 3D-printable objects, running locally. Free software under the
          GNU General Public License, version 2. The complete corresponding source for this build —
          including the KimCad engine — is provided in the project repository that accompanies it, as
          GPL-2.0 §3 requires.
        </Text>
      </div>

      <div
        className="rounded-xl overflow-hidden"
        style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)' }}
      >
        <div className="px-4 pt-4 pb-2">
          <Label className="mb-0">Open-source components &amp; licenses</Label>
        </div>
        {COMPONENTS.map((c) => (
          <div
            key={c.name}
            className="flex items-center justify-between gap-4 px-4 py-3"
            style={{ borderTop: '1px solid var(--border-primary)' }}
          >
            <div className="min-w-0">
              <Text weight="medium">{c.name}</Text>
              <Text variant="caption" color="tertiary" className="mt-0.5">
                {c.role} · {c.license}
              </Text>
            </div>
            {c.source ? (
              <a
                href={c.source}
                target="_blank"
                rel="noreferrer noopener"
                style={{ color: 'var(--accent-primary)', whiteSpace: 'nowrap' }}
                className="text-sm hover:underline shrink-0"
              >
                Source ↗
              </a>
            ) : (
              <Text variant="caption" color="tertiary" className="shrink-0">
                in this repository
              </Text>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
