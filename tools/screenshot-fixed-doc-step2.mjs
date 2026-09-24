// 固定帳票（診断書）Step2/Step5 を実機で開き、QR 設定ビュー撤去と連結読み取りを確認する。
// 使い方: node tools/screenshot-fixed-doc-step2.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.PREVIEW_URL || 'http://127.0.0.1:4175/';
const OUT = 'preview/verify';
fs.mkdirSync(OUT, { recursive: true });

const SETUP = `(() => {
  const app = document.querySelector('#app')?.__vue_app__;
  return app?._container?._vnode?.component?.setupState || null;
})()`;

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1680, height: 1000 } });

const errors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text());
});
page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(900);

// Step1（帳票タイプ設定）を開く
await page.evaluate(`(${SETUP}).openFixedDocSettingsFromMenu()`);
await page.waitForTimeout(700);
await page.screenshot({ path: `${OUT}/step1.png` });

// Step2（読取モデル設定）
const step2 = await page.evaluate(`(() => {
  const s = ${SETUP};
  s.fixedDocSetupStep = 2;
  return {
    readTab: s.fixedDocReadTab,
    hasReadModeRef: 'fixedDocReadMode' in s,
    qrFieldCount: s.fixedDocQrFieldMappings?.length ?? null,
    qrValueCount: s.fixedDocQrValues?.length ?? null,
    concatenatedLength: s.fixedDocQrConcatenatedPayload?.length ?? null,
    firstValues: (s.fixedDocQrValues || []).slice(0, 6),
  };
})()`);
console.log('step2:', JSON.stringify(step2));
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/step2.png`, fullPage: true });

// Step5（テスト読取）— QR 経路の値解決
await page.evaluate(`(${SETUP}).fixedDocSetupStep = 5`);
await page.waitForTimeout(1000);
const step5 = await page.evaluate(`(() => {
  const s = ${SETUP};
  const rows = s.fixedDocTestRows || [];
  return {
    count: rows.length,
    qrSourced: rows.filter((r) => r.sourceLabel === 'QR読取').length,
    sample: rows.slice(0, 8).map((r) => ({ no: r.no, name: r.name, value: r.value, src: r.sourceLabel })),
    straddle: rows.filter((r) => ['便潜血陽性', '上行結腸腫瘍'].includes(String(r.value))).map((r) => ({ no: r.no, name: r.name, value: r.value })),
  };
})()`);
console.log('step5:', JSON.stringify(step5, null, 2));
await page.screenshot({ path: `${OUT}/step5.png`, fullPage: true });

console.log('console errors:', errors.length ? errors : 'none');
await browser.close();
