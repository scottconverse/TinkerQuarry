import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const port = valueAfter('--port') || '8765';
const out = valueAfter('--out');
const engineRoot = resolve('packages', 'engine');

function valueAfter(flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

function engineCommand() {
  const common = ['web', '--host', '127.0.0.1', '--port', port, '--demo'];
  if (out) common.push('--out', out);

  const venvKimcad = resolve(engineRoot, '.venv', 'Scripts', 'kimcad.exe');
  if (existsSync(venvKimcad)) {
    return { command: venvKimcad, args: common, extraEnv: {} };
  }

  const stagedPython = resolve(engineRoot, 'dist', 'staging', 'python', 'python.exe');
  const stagedLauncher = resolve(engineRoot, 'dist', 'staging', 'kimcad_launcher.py');
  if (existsSync(stagedPython) && existsSync(stagedLauncher)) {
    return { command: stagedPython, args: [stagedLauncher, ...common], extraEnv: {} };
  }

  return {
    command: 'py',
    args: ['-3.12', '-m', 'kimcad.cli', ...common],
    extraEnv: { PYTHONPATH: resolve(engineRoot, 'src') },
  };
}

const { command, args: childArgs, extraEnv } = engineCommand();
const child = spawn(command, childArgs, {
  cwd: engineRoot,
  env: { ...process.env, ...extraEnv },
  stdio: 'inherit',
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
