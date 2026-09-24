import { mkdir, writeFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT_DIR = path.join(ROOT, 'assets', 'prd-screenshots');
const PRD_PUBLIC_ASSETS = path.join(ROOT, 'prd-public', 'assets');
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

async function setNavCollapsed(page, collapsed) {
  await page.evaluate(`(() => {
    const s = document.querySelector('#app')?.__vue_app__?._container?._vnode?.component?.setupState;
    if (s) s.globalNavCollapsed = ${collapsed ? 'true' : 'false'};
  })()`);
  await sleep(350);
}

/**
 * QR 読取 スイッチは既定 OFF（無効 — OCR のみで読取 表示）。PRD 用の図は
 * 「ON にした状態」（槽位条 + パス徽标 + QR スキャン）を見せたいので明示的に ON にする。
 * ON にするとスキャンが走り、枠は 1 つずつ出る。撮るのは読み取り完了後なので idle を待つ。
 */
async function setQrReadEnabled(page, enabled) {
  await page.evaluate(`(() => {
    const s = document.querySelector('#app')?.__vue_app__?._container?._vnode?.component?.setupState;
    if (s) s.onFixedDocQrReadToggle(${enabled ? 'true' : 'false'});
  })()`);
  await sleep(300);
  if (!enabled) return;
  for (let i = 0; i < 60; i += 1) {
    const active = await page.evaluate(
      `document.querySelector('#app')?.__vue_app__?._container?._vnode?.component?.setupState?.fixedDocQrScanActive === true`,
    );
    if (!active) break;
    await sleep(150);
  }
  // スイッチ操作で出る完了トースト（QR を 6 / 6 検出しました）は図の邪魔なので消す。
  await page.evaluate(`document.querySelectorAll('.el-message').forEach((el) => el.remove())`);
  await sleep(300);
}

async function openFixedDocType(page, typeLabel = '診断書') {
  // 左ナビは既定で畳まれておりサブ項目が不可視。展開してクリックしたら、内容幅を
  // 圧迫しないよう撮影前に畳み直す。
  await setNavCollapsed(page, false);
  await page.locator('button.global-nav-subitem', { hasText: '帳票タイプ設定' }).click();
  await sleep(500);
  await setNavCollapsed(page, true);
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
  await setNavCollapsed(page, false);
  await page.locator('button.global-nav-subitem', { hasText: '業務シーン設定' }).click();
  await sleep(400);
  await setNavCollapsed(page, true);
  await page.locator('.scene-card').first().click();
  await sleep(1000);
  await page.waitForSelector('.idp-workflow-module', { timeout: 20000 });
}

async function goWorkflowStep(page, step) {
  await openWorkflowScene(page);
  const targetStep = page.locator('.wf-setup-step').filter({
    has: page.locator('.wf-setup-step-index', { hasText: String(step) }),
  });
  await targetStep.waitFor({ state: 'visible', timeout: 10000 });
  const isActive = await targetStep.evaluate((el) => el.classList.contains('is-active')).catch(() => false);
  if (!isActive) {
    await targetStep.click();
    await sleep(800);
  }
  if (step === 2) {
    await page.waitForSelector('[data-node-id="wf-pp"], .wf-node-name', { timeout: 15000 });
  }
}

async function clickWorkflowNode(page, nodeId) {
  await goWorkflowStep(page, 2);
  const label = nodeId === 'wf-pp' ? '前処理' : 'OCR抽出';
  // data-node-id はノード本体ではなく入出力ポートに付く（ポートはクリックを奪う）ので、
  // まずノード名で押し、だめならシェル（.wf-node-shell）の祖先を押す。
  const byName = page.locator('.wf-node-name', { hasText: label }).first();
  if (await byName.isVisible().catch(() => false)) {
    await byName.click();
    await sleep(600);
    return true;
  }
  const shell = page
    .locator(`[data-node-id="${nodeId}"]`)
    .first()
    .locator('xpath=ancestor::*[contains(@class,"wf-node-shell")]')
    .first();
  if (await shell.isVisible().catch(() => false)) {
    await shell.click({ position: { x: 24, y: 12 } });
    await sleep(600);
    return true;
  }
  return false;
}

async function captureElementShot(page, locator, filePath) {
  const target = typeof locator === 'string' ? page.locator(locator).first() : locator;
  await target.waitFor({ state: 'visible', timeout: 15000 });
  await sleep(300);
  await target.screenshot({ path: filePath });
}

async function openFixedDocReadTab(page) {
  await openFixedDocType(page);
  await goFixedDocStep(page, 2);
  const readPanel = page.locator('.fixed-doc-step-panel--read');
  await readPanel.locator('button', { hasText: 'テキスト読取' }).first().click();
  await sleep(600);
}

async function runCapture(page) {
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForSelector('.app-shell', { timeout: 60000 });
  await sleep(1000);
  await setNavCollapsed(page, true);

  const shots = [
    {
      file: 'fixed-doc-step1-classification-threshold.png',
      run: async () => {
        await openFixedDocType(page);
        await goFixedDocStep(page, 1);
      },
    },
    {
      // QR 連結読取 バー（开关 + 槽位条 + 路径徽标 + QR スキャン）。OCR設定 / QR設定 の切替は廃止済み。
      file: 'fixed-doc-step2-qr.png',
      run: async () => {
        await openFixedDocReadTab(page);
        await setQrReadEnabled(page, true);
        await page.locator('.fixed-doc-qr-result').waitFor({ state: 'visible', timeout: 15000 });
        await page.locator('.fixed-doc-qr-result').scrollIntoViewIfNeeded();
        await sleep(500);
      },
    },
    {
      // スキャン中：枠は左から 1 つずつ出る。全部そろうまでパス徽标は出ず「スキャン中…」。
      // このショットは意図的に読み取り途中で切るので、idle を待たずに撮る。
      file: 'fixed-doc-step2-qr-scanning.png',
      run: async () => {
        await openFixedDocReadTab(page);
        await setQrReadEnabled(page, false);
        await page.locator('.fixed-doc-qr-result').scrollIntoViewIfNeeded();
        await page.evaluate(`(() => {
          const s = document.querySelector('#app')?.__vue_app__?._container?._vnode?.component?.setupState;
          if (s) s.onFixedDocQrReadToggle(true);
        })()`);
        await sleep(700);
      },
    },
    {
      // マスク列（テキスト読取 字段表・左寄せで 番号〜マスク まで）
      file: 'fixed-doc-step2-ocr-mask.png',
      skipPageShot: true,
      run: async () => {
        // 直前のショットが読み取り途中で切っているので、まず止めてから撮る。
        await setQrReadEnabled(page, false);
        await openFixedDocReadTab(page);
        await page.evaluate(`(() => {
          const el = document.querySelector('.fixed-doc-table-scroll');
          if (el) el.scrollLeft = 0;
        })()`);
        await sleep(500);
        await captureElementShot(page, '.fixed-doc-table-panel', path.join(OUT_DIR, 'fixed-doc-step2-ocr-mask.png'));
      },
    },
    {
      // マスク / HITL 列のクローズアップ（テキスト読取 字段表・右端まで横スクロール）
      file: 'fixed-doc-step2-hitl.png',
      skipPageShot: true,
      run: async () => {
        await setQrReadEnabled(page, false);
        await openFixedDocReadTab(page);
        await page.evaluate(`(() => {
          const el = document.querySelector('.fixed-doc-table-scroll');
          if (el) el.scrollLeft = el.scrollWidth;
        })()`);
        await sleep(500);
        await captureElementShot(page, '.fixed-doc-table-panel', path.join(OUT_DIR, 'fixed-doc-step2-hitl.png'));
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
        const clicked = await clickWorkflowNode(page, 'wf-pp');
        if (!clicked) {
          throw new Error('前処理 node not found on workflow canvas');
        }
        await page.locator('.idp-workflow-module').scrollIntoViewIfNeeded();
        await sleep(400);
      },
    },
    {
      file: 'scene-step3-notify-add.png',
      run: async () => {
        await goWorkflowStep(page, 3);
        await page.locator('.workflow-notification-section-title', { hasText: '通知ルール追加' }).scrollIntoViewIfNeeded();
        await sleep(400);
      },
    },
  ];

  for (const shot of shots) {
    await shot.run();
    if (shot.skipPageShot) {
      console.log(`Captured ${shot.file}`);
      continue;
    }
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
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    // 1440 だと QR 読取 条が 2 行に折り返すため、ナビを畳んだうえで幅を確保する。
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await runCapture(page);
    await browser.close();
    await rm(path.join(OUT_DIR, '.capture-error.txt'), { force: true });
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
