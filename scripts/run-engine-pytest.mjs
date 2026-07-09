import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const engineRoot = resolve('packages', 'engine');
const venvPython = resolve(engineRoot, '.venv', 'Scripts', 'python.exe');

function canRun(command, args) {
  const probe = spawnSync(command, [...args, '-c', 'import sys'], {
    cwd: engineRoot,
    stdio: 'ignore',
    shell: false,
  });
  return probe.status === 0;
}

function pickPython() {
  if (existsSync(venvPython)) {
    return { command: venvPython, args: [] };
  }
  if (canRun('py', ['-3.13'])) {
    return { command: 'py', args: ['-3.13'] };
  }
  if (canRun('python', [])) {
    const version = spawnSync('python', ['-c', 'import sys; raise SystemExit(0 if sys.version_info >= (3, 13) else 1)'], {
      cwd: engineRoot,
      stdio: 'ignore',
      shell: false,
    });
    if (version.status === 0) {
      return { command: 'python', args: [] };
    }
  }
  if (canRun('py', ['-3.12'])) {
    console.warn('[engine-pytest] Python 3.13 venv/launcher not found; using local Python 3.12 for tests.');
    return { command: 'py', args: ['-3.12'] };
  }
  throw new Error('No usable Python interpreter found for engine pytest.');
}

const { command, args } = pickPython();
// --strict-no-skips: this script is the release gate's engine lane (pnpm test:gate), where a
// skipped test is a failure. The hosted CI smoke lane calls pytest directly without the flag.
const result = spawnSync(command, [...args, '-m', 'pytest', '-q', '--strict-no-skips'], {
  cwd: engineRoot,
  env: { ...process.env, PYTHONPATH: resolve(engineRoot, 'src') },
  stdio: 'inherit',
  shell: false,
});

process.exit(result.status ?? 1);
