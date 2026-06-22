import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');
const engineRoot = join(repoRoot, 'packages', 'engine');
const stagingRoot = join(engineRoot, 'dist', 'staging');

const pythonCandidates = [
  process.env.TINKERQUARRY_ENGINE_PYTHON,
  join(engineRoot, '.venv', 'Scripts', 'python.exe'),
  join(engineRoot, '.venv', 'bin', 'python'),
  'python',
].filter(Boolean);

const python = pythonCandidates.find((candidate) => {
  if (candidate === 'python') return true;
  return existsSync(candidate);
});

if (!python) {
  console.error('Could not find a Python interpreter to stage the TinkerQuarry engine.');
  process.exit(1);
}

const pipCheck = spawnSync(python, ['-m', 'pip', '--version'], {
  cwd: engineRoot,
  stdio: 'ignore',
});
if (pipCheck.status !== 0) {
  const ensurePip = spawnSync(python, ['-m', 'ensurepip', '--upgrade'], {
    cwd: engineRoot,
    stdio: 'inherit',
  });
  if (ensurePip.status !== 0) {
    console.error(
      `Python at ${python} has no pip, and ensurepip could not bootstrap it. ` +
        'Set TINKERQUARRY_ENGINE_PYTHON to a compatible Python interpreter with pip.'
    );
    process.exit(ensurePip.status ?? 1);
  }
}

const args = [join(engineRoot, 'scripts', 'build_installer.py'), '--stage-only'];
const result = spawnSync(python, args, {
  cwd: engineRoot,
  stdio: 'inherit',
  env: {
    ...process.env,
    PYTHONDONTWRITEBYTECODE: '1',
  },
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

const required = [
  join(stagingRoot, 'kimcad_launcher.py'),
  join(stagingRoot, 'python', process.platform === 'win32' ? 'python.exe' : 'python'),
  join(stagingRoot, 'site-packages'),
  join(stagingRoot, 'config'),
  join(stagingRoot, 'library'),
];

const missing = required.filter((path) => !existsSync(path));
if (missing.length > 0) {
  console.error(`Engine staging is incomplete:\n${missing.map((path) => `  - ${path}`).join('\n')}`);
  process.exit(1);
}

console.log(`TinkerQuarry engine sidecar staged at ${stagingRoot}`);
