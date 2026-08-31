import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT_DIR = path.join(ROOT, 'prd-public', 'assets');
const BASE_URL = process.env.PRD_CAPTURE_URL || 'http://127.0.0.1:4175';
const PORT = Number(new URL(BASE_URL).port || 4175);

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(url, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (res.ok) return;
    } catch (_) {}
    await sleep(250);
  }
  throw new Error(`Server not ready: ${url}`);
}

function startServer() {
  return spawn(process.execPath, ['server/local-server.mjs'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1' },
  });
}

async function openFixedDocType(page, typeLabel = '診断書') {
  await page.locator('button.global-nav-subitem', { hasText: '帳票タイプ設定' }).click();
  await page.locator('.fixed-doc-type-item', { hasText: typeLabel }).first().click();
  await sleep(500);
}

async function goFixedDocStep(page, step) {
  await page.locator('.fixed-doc-step').filter({
    has: page.locator('.fixed-doc-step-index', { hasText: String(step) }),
  }).click();
  await sleep(400);
}

async function openWorkflowScene(page) {
  await page.locator('button.global-nav-subitem', { hasText: '業務シーン設定' }).click();
  await sleep(400);
  await page.locator('.scene-card').first().click();
  await sleep(1000);
  await page.waitForSelector('.idp-workflow-module', { timeout: 20000 });
}

async function goWorkflowStep(page, step) {
  await openWorkflowScene(page);
  if (step === 2) {
    await page.waitForSelector('.wf-setup-step.is-active .wf-setup-step-index', { timeout: 10000 });
    return;
  }
  await page.locator('.wf-setup-step').filter({
    has: page.locator('.wf-setup-step-index', { hasText: String(step) }),
  }).click();
  await sleep(800);
}

async function clickWorkflowNode(page, nodeId) {
  await goWorkflowStep(page, 2);
  const node = page.locator(`[data-node-id="${nodeId}"]`).first();
  if (await node.isVisible().catch(() => false)) {
    await node.click();
    await sleep(600);
    return;
  }
  const byLabel = page.locator('.wf-node-name', {
    hasText: nodeId === 'wf-pp' ? '前処理' : 'OCR抽出',
  }).first();
  if (await byLabel.isVisible().catch(() => false)) {
    await byLabel.click();
    await sleep(600);
  }
}

async function runCapture(page) {
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForSelector('.app-shell', { timeout: 60000 });
  await sleep(1000);

  const shots = [
    {
      file: 'fixed-doc-step1-threshold.png',
      run: async () => {
        await openFixedDocType(page);
        await goFixedDocStep(page, 1);
      },
    },
    {
      file: 'fixed-doc-step2-qr.png',
      run: async () => {
        await openFixedDocType(page);
        await goFixedDocStep(page, 2);
        const readPanel = page.locator('.fixed-doc-step-panel--read');
        await readPanel.locator('button', { hasText: 'テキスト読取' }).first().click();
        await readPanel.locator('button', { hasText: 'QR設定' }).click();
        await sleep(800);
      },
    },
    {
      file: 'fixed-doc-step2-ocr-mask.png',
      run: async () => {
        await openFixedDocType(page);
        await goFixedDocStep(page, 2);
        const readPanel = page.locator('.fixed-doc-step-panel--read');
        await readPanel.locator('button', { hasText: 'テキスト読取' }).first().click();
        await readPanel.locator('button', { hasText: 'OCR設定' }).click();
        await sleep(400);
      },
    },
    {
      file: 'fixed-doc-step3-range.png',
      run: async () => {
        await openFixedDocType(page);
        await goFixedDocStep(page, 3);
      },
    },
    {
      file: 'fixed-doc-step5-test.png',
      run: async () => {
        await openFixedDocType(page);
        await goFixedDocStep(page, 5);
      },
    },
    {
      file: 'wf-preprocess-inspector.png',
      run: async () => {
        await clickWorkflowNode(page, 'wf-pp');
      },
    },
    {
      file: 'wf-ocr-inspector.png',
      run: async () => {
        await clickWorkflowNode(page, 'wf-oc');
      },
    },
    {
      file: 'scene-step3-notify.png',
      run: async () => goWorkflowStep(page, 3),
    },
    {
      file: 'scene-step4-export.png',
      run: async () => goWorkflowStep(page, 4),
    },
  ];

  for (const shot of shots) {
    await shot.run();
    await sleep(500);
    await page.screenshot({
      path: path.join(OUT_DIR, shot.file),
      fullPage: false,
    });
    console.log(`Captured ${shot.file}`);
  }
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const server = startServer();
  let exitCode = 0;
  try {
    await waitForServer(BASE_URL);
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await runCapture(page);
    await browser.close();
  } catch (error) {
    exitCode = 1;
    const msg = error?.message || String(error);
    await writeFile(path.join(OUT_DIR, '.capture-error.txt'), msg, 'utf8');
    console.error(msg);
    if (/Cannot find module 'playwright'/.test(msg)) {
      console.error('Run: npm install -D playwright && npx playwright install chromium');
    }
  } finally {
    server.kill('SIGTERM');
  }
  process.exit(exitCode);
}

main();
