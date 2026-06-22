import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const gateDir = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const artifacts = path.join(gateDir, 'artifacts');
const mode = process.argv[2] || 'provisioned';
const url = process.argv[3] || 'http://127.0.0.1:1420';
const userDataDir = path.join(artifacts, `browser-profile-${mode}`);

await fs.mkdir(artifacts, { recursive: true });
await fs.rm(userDataDir, { recursive: true, force: true });
await fs.mkdir(userDataDir, { recursive: true });

const context = await chromium.launchPersistentContext(userDataDir, {
  headless: true,
  viewport: { width: 1440, height: 1000 },
  recordVideo: { dir: artifacts, size: { width: 1440, height: 1000 } },
});
const page = await context.newPage();
const consoleMessages = [];
const failedRequests = [];
page.on('console', (msg) => consoleMessages.push({ type: msg.type(), text: msg.text() }));
page.on('requestfailed', (req) => {
  failedRequests.push({ url: req.url(), failure: req.failure()?.errorText ?? 'unknown' });
});

const result = {
  mode,
  url,
  userDataDir,
  startedAt: new Date().toISOString(),
  steps: [],
  consoleMessages,
  failedRequests,
};

async function step(name, fn) {
  const entry = { name, ok: false };
  result.steps.push(entry);
  try {
    entry.value = await fn();
    entry.ok = true;
  } catch (error) {
    entry.error = String(error?.stack ?? error);
  }
}

await step('first paint', async () => {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(artifacts, `${mode}-first-paint.png`), fullPage: true });
  return {
    title: await page.title(),
    localStorage: await page.evaluate(() => Object.keys(localStorage).sort()),
    bodyText: (await page.locator('body').innerText()).slice(0, 4000),
  };
});

await step('api health from browser', async () => {
  return await page.evaluate(async () => {
    try {
      const res = await fetch('/api/health');
      return { ok: res.ok, status: res.status, body: await res.text() };
    } catch (error) {
      return { ok: false, status: 0, error: String(error) };
    }
  });
});

await step('model status from browser', async () => {
  return await page.evaluate(async () => {
    try {
      const res = await fetch('/api/model-status');
      return { ok: res.ok, status: res.status, body: await res.text() };
    } catch (error) {
      return { ok: false, status: 0, error: String(error) };
    }
  });
});

if (mode === 'provisioned') {
  await step('submit welcome describe', async () => {
    const text = 'a 20 mm cube';
    const textarea = page.getByPlaceholder(/Describe what you want to build/i);
    await textarea.waitFor({ state: 'visible', timeout: 30000 });
    await textarea.fill(text);
    await page.getByRole('button', { name: /^Build$/ }).click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(artifacts, `${mode}-after-build-click.png`), fullPage: true });
    return {
      hasDesigningToast: await page.getByText(/Designing/i).count(),
      bodyText: (await page.locator('body').innerText()).slice(0, 4000),
    };
  });

  await step('wait for design result', async () => {
    await page.waitForFunction(
      () => document.body.innerText.includes('Looks printable') ||
        document.body.innerText.includes('Ready') ||
        document.body.innerText.includes('Could not') ||
        document.body.innerText.includes('model'),
      null,
      { timeout: 180000 }
    );
    await page.screenshot({ path: path.join(artifacts, `${mode}-design-result.png`), fullPage: true });
    return {
      bodyText: (await page.locator('body').innerText()).slice(0, 6000),
      makeItRealDisabled: await page.getByTestId('make-it-real-button').evaluate((el) => el.disabled).catch(() => null),
    };
  });
}

if (mode === 'engine-absent') {
  await step('try core action with engine absent', async () => {
    const textarea = page.getByPlaceholder(/Describe what you want to build/i);
    await textarea.waitFor({ state: 'visible', timeout: 30000 });
    await textarea.fill('a 20 mm cube');
    await page.getByRole('button', { name: /^Build$/ }).click();
    await page.waitForTimeout(4000);
    await page.screenshot({ path: path.join(artifacts, `${mode}-after-build-click.png`), fullPage: true });
    return {
      bodyText: (await page.locator('body').innerText()).slice(0, 6000),
    };
  });
}

result.endedAt = new Date().toISOString();
await fs.writeFile(path.join(artifacts, `${mode}-walkthrough.json`), JSON.stringify(result, null, 2));
await context.close();
