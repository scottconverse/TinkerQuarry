import { chromium } from '@playwright/test';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve('C:/Users/Scott/Desktop/CODE/tinkerquarry');
const outDir = resolve(root, 'docs/audits/gate-tinkerquarry-2026-06-23-gauntlet-all/artifacts');
mkdirSync(outDir, { recursive: true });

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForUrl(url, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = '';
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
      lastError = `${res.status} ${res.statusText}`;
    } catch (err) {
      lastError = String(err);
    }
    await wait(500);
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError}`);
}

function spawnProc(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: options.cwd || root,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...options.env },
    shell: true,
  });
  const log = [];
  child.stdout.on('data', (chunk) => log.push(String(chunk)));
  child.stderr.on('data', (chunk) => log.push(String(chunk)));
  return { child, log };
}

async function withBrowser(profileName, fn) {
  const profileDir = join(outDir, profileName);
  rmSync(profileDir, { recursive: true, force: true });
  mkdirSync(profileDir, { recursive: true });
  const browser = await chromium.launchPersistentContext(profileDir, {
    channel: 'chrome',
    headless: true,
    viewport: { width: 1440, height: 1000 },
  });
  const page = browser.pages()[0] || (await browser.newPage());
  const consoleErrors = [];
  const responseErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));
  page.on('response', (response) => {
    const status = response.status();
    if (status >= 400 && /\/api\//.test(response.url())) {
      responseErrors.push(`${status} ${response.url()}`);
    }
  });
  try {
    return await fn(page, { profileDir, consoleErrors, responseErrors });
  } finally {
    await browser.close();
  }
}

async function collectInteractives(page) {
  return page.locator('button, a[href], input, textarea, select, [role="button"], [role="menuitem"], [tabindex]').evaluateAll((nodes) =>
    nodes
      .filter((node) => {
        const el = node;
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      })
      .map((node, index) => ({
        index,
        tag: node.tagName.toLowerCase(),
        role: node.getAttribute('role') || '',
        testid: node.getAttribute('data-testid') || '',
        aria: node.getAttribute('aria-label') || '',
        title: node.getAttribute('title') || '',
        text: (node.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 120),
        disabled: Boolean(node.disabled) || node.getAttribute('aria-disabled') === 'true',
      })),
  );
}

async function clickIfVisible(locator, timeout = 3_000) {
  if (await locator.first().isVisible({ timeout }).catch(() => false)) {
    await locator.first().click();
    return true;
  }
  return false;
}

async function firstRunAbsent() {
  const port = 1434;
  const vite = spawnProc('pnpm.cmd', ['--dir', 'apps/ui', 'exec', 'vite', '--host', '127.0.0.1', '--port', String(port)], {
    env: { TINKERQUARRY_DEV_TOKEN: 'tq-dev-token' },
  });
  try {
    await waitForUrl(`http://127.0.0.1:${port}`);
    return await withBrowser('first-run-absent-profile', async (page, ctx) => {
      await page.goto(`http://127.0.0.1:${port}/`);
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(5_000);
      const build = page.getByRole('button', { name: /^Build$/i });
      const checkAgain = page.getByRole('button', { name: /Check again|Set up local AI/i });
      const examples = await page.getByRole('button', { name: /Create a 3D printable mini lamp|Design a parametric phone stand|Make a custom gear/i }).all();
      const exampleStates = [];
      for (const example of examples) {
        exampleStates.push({
          text: (await example.innerText().catch(() => '')).trim(),
          enabled: await example.isEnabled().catch(() => false),
        });
      }
      const result = {
        url: page.url(),
        title: await page.title(),
        profileDir: ctx.profileDir,
        profileExists: existsSync(ctx.profileDir),
        rootText: (await page.locator('#root').innerText()).slice(0, 1000),
        buildVisible: await build.isVisible().catch(() => false),
        buildEnabled: await build.isEnabled().catch(() => false),
        recoveryVisible: await checkAgain.isVisible().catch(() => false),
        exampleStates,
        interactives: await collectInteractives(page),
        consoleErrors: ctx.consoleErrors,
        responseErrors: ctx.responseErrors,
      };
      await page.screenshot({ path: join(outDir, 'first-run-dependency-absent.png'), fullPage: true });
      writeFileSync(join(outDir, 'first-run-dependency-absent.json'), JSON.stringify(result, null, 2));
      writeFileSync(join(outDir, 'first-run-dependency-absent.html'), await page.content());
      return result;
    });
  } finally {
    spawnSync('taskkill', ['/PID', String(vite.child.pid), '/T', '/F'], { stdio: 'ignore' });
    writeFileSync(join(outDir, 'first-run-vite.log'), vite.log.join(''));
  }
}

async function presentWorkflowWalkthrough() {
  const uiPort = 1435;
  const enginePort = 8765;
  const profileRoot = join(outDir, 'workflow-profile');
  rmSync(profileRoot, { recursive: true, force: true });
  mkdirSync(profileRoot, { recursive: true });
  const env = {
    TINKERQUARRY_DEV_TOKEN: 'tq-dev-token',
    LOCALAPPDATA: join(profileRoot, 'LocalAppData'),
    APPDATA: join(profileRoot, 'AppData'),
    USERPROFILE: join(profileRoot, 'UserProfile'),
    HOME: join(profileRoot, 'Home'),
    TQ_E2E_PROFILE_ROOT: profileRoot,
  };
  const engineOut = join(profileRoot, 'engine-output');
  const engine = spawnProc('.venv\\Scripts\\kimcad.exe', ['web', '--port', String(enginePort), '--demo', '--out', engineOut], {
    cwd: join(root, 'packages/engine'),
    env,
  });
  const vite = spawnProc('pnpm.cmd', ['--dir', 'apps/ui', 'exec', 'vite', '--host', '127.0.0.1', '--port', String(uiPort)], { env });
  try {
    await waitForUrl(`http://127.0.0.1:${enginePort}/api/health`);
    await waitForUrl(`http://127.0.0.1:${uiPort}`);
    return await withBrowser('workflow-browser-profile', async (page, ctx) => {
      await page.goto(`http://127.0.0.1:${uiPort}/`);
      await page.waitForLoadState('domcontentloaded');
      await page.locator('textarea[placeholder="Describe what you want to build..."]').fill('a small test gear');
      await page.getByRole('button', { name: /^Build$/i }).click();
      await page.getByTestId('make-it-real-button').waitFor({ state: 'visible', timeout: 120_000 });
      await page.screenshot({ path: join(outDir, 'workflow-design-ready.png'), fullPage: true });

      const clickLog = [];
      for (const testId of ['preview-fit-view', 'preview-toggle-orthographic', 'preview-toggle-wireframe', 'preview-toggle-annotate']) {
        const loc = page.getByTestId(testId);
        if (await loc.isVisible().catch(() => false)) {
          await loc.click().catch(() => {});
          clickLog.push(testId);
        }
      }
      await page.keyboard.press('Escape').catch(() => {});
      await clickIfVisible(page.getByText('Settings', { exact: true }));
      await page.keyboard.press('Escape').catch(() => {});
      await clickIfVisible(page.getByRole('button', { name: /^File$/i }));
      await page.keyboard.press('Escape').catch(() => {});

      await page.getByTestId('make-it-real-button').click();
      const firstReal = page.getByTestId('first-real-print-dialog');
      if (await firstReal.isVisible().catch(() => false)) {
        await firstReal.getByTestId('first-real-print-confirm').click();
      }
      await page.getByTestId('workflow-slice').getByText(/Sliced/i).waitFor({ timeout: 180_000 });
      await page.screenshot({ path: join(outDir, 'workflow-sliced.png'), fullPage: true });
      await page.getByTestId('connector-select').selectOption('mock');
      await page.getByTestId('send-to-printer-button').click();
      await page.getByTestId('print-outcome-dialog').waitFor({ state: 'visible', timeout: 60_000 });
      await page.screenshot({ path: join(outDir, 'workflow-outcome-dialog.png'), fullPage: true });
      await page.getByTestId('print-outcome-dialog').getByRole('button', { name: /^Clean$/i }).click();
      await page.getByTestId('print-outcome-dialog').waitFor({ state: 'hidden', timeout: 30_000 });

      const result = {
        title: await page.title(),
        profileRoot,
        browserProfileDir: ctx.profileDir,
        engineOut,
        engineOutputExists: existsSync(engineOut),
        interactivesAfterWorkflow: await collectInteractives(page),
        clickedControls: clickLog,
        rootText: (await page.locator('#root').innerText()).slice(0, 1500),
        consoleErrors: ctx.consoleErrors,
        responseErrors: ctx.responseErrors,
      };
      writeFileSync(join(outDir, 'workflow-present.json'), JSON.stringify(result, null, 2));
      writeFileSync(join(outDir, 'workflow-present.html'), await page.content());
      return result;
    });
  } finally {
    for (const proc of [vite, engine]) {
      spawnSync('taskkill', ['/PID', String(proc.child.pid), '/T', '/F'], { stdio: 'ignore' });
    }
    writeFileSync(join(outDir, 'workflow-vite.log'), vite.log.join(''));
    writeFileSync(join(outDir, 'workflow-engine.log'), engine.log.join(''));
  }
}

const absent = await firstRunAbsent();
const present = await presentWorkflowWalkthrough();
const summary = { absent, present };
writeFileSync(join(outDir, 'walkthrough-summary.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
