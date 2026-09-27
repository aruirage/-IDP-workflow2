// QR 読取バー（AI 入力欄の下・項目表の上）を実機で検証する。
//   0. 既定は OFF（無効 — OCR のみで読取）。槽位条もプレビューの QR 枠も出ない
//   1. ON: スイッチを入れるとその場でスキャンが走る。読み取りには時間がかかり、
//      結果は 1 つずつ出る（全部そろうまでパス徽标は出ず「スキャン中…」）
//   2. 完了: 掃出せた槽位だけが並ぶ（演示データは 6 個）、プレビューに QR 枠が出る。技術的な数値は出さない。
//      予設の枠数・「未検出」という概念を持たない（予約枠・赤枠・点線プレースホルダ・アラート行を描かない）
//   3. OFF: 槽位条が消え「無効 — OCR のみで読取」、プレビューの QR 枠も消える
//   4. 再スキャン ボタン: 実行できる（loading 表示 → 結果メッセージ）
//   5. Step2 遷移: 自動でスキャンが走る（槽位は一気に出ない）
//   6. 途中で OFF: 走っているスキャンを捨てる
// 使い方: node tools/verify-fixed-doc-qr-readbar.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.PREVIEW_URL || 'http://127.0.0.1:4175/';
const OUT = 'preview/verify';
fs.mkdirSync(OUT, { recursive: true });

const SETUP = `(() => {
  const app = document.querySelector('#app')?.__vue_app__;
  return app?._container?._vnode?.component?.setupState || null;
})()`;

const READ_BAR = `(() => {
  const bar = document.querySelector('.fixed-doc-qr-result');
  if (!bar) return { present: false };
  const slots = [...bar.querySelectorAll('.fixed-doc-qr-result-slot')].map((el) => ({
    id: el.dataset.sourceId,
    text: el.textContent.trim(),
    missing: el.classList.contains('is-missing'),
    scanning: el.classList.contains('is-scanning'),
  }));
  const textarea = document.querySelector('.fixed-doc-textarea-wrap');
  const table = document.querySelector('.fixed-doc-table-panel');
  const order = (a, b) => (a && b ? !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) : null);
  return {
    present: true,
    classes: [...bar.classList],
    head: bar.querySelector('.fixed-doc-qr-result-head')?.textContent.replace(/\\s+/g, ' ').trim() || null,
    slotsRowPresent: !!bar.querySelector('.fixed-doc-qr-result-slots'),
    slots,
    scannedCount: slots.filter((s) => !s.scanning).length,
    scanningCount: slots.filter((s) => s.scanning).length,
    missingSlots: slots.filter((s) => s.missing).map((s) => s.id),
    pathBadge: bar.querySelector('.fixed-doc-qr-result-path')?.textContent.replace(/\\s+/g, ' ').trim() || null,
    scanningLabel: bar.querySelector('.fixed-doc-qr-result-count')?.textContent.trim() || null,
    alert: bar.querySelector('.fixed-doc-qr-result-alert')?.textContent.replace(/\\s+/g, ' ').trim() || null,
    alertPresent: !!bar.querySelector('.fixed-doc-qr-result-alert'),
    placeholderCount: slots.filter((s) => s.missing || s.scanning).length,
    switchOn: bar.querySelector('.fixed-doc-qr-result-switch')?.classList.contains('is-checked') ?? null,
    scanBtn: bar.querySelector('.fixed-doc-qr-scan-btn')?.textContent.trim() || null,
    afterTextarea: order(textarea, bar),
    beforeTable: order(bar, table),
    hotspotCount: document.querySelectorAll('.fixed-doc-preview-hotspot').length,
    hotspotIds: [...document.querySelectorAll('.fixed-doc-preview-hotspot')].map((el) => el.dataset.sourceId),
  };
})()`;

const STATUS = `(() => {
  const s = ${SETUP};
  const st = s.fixedDocQrReadStatus;
  return { enabled: st.enabled, slots: s.fixedDocQrReadSlots.length, values: s.fixedDocQrValues.length, active: s.fixedDocQrScanActive };
})()`;

/** スキャン完了待ち。実機では枠ごとに読み取り時間がかかるので、必ず idle を待ってから検証する。 */
async function waitScanIdle(page, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const active = await page.evaluate(`(${SETUP}).fixedDocQrScanActive === true`);
    if (!active) return true;
    await page.waitForTimeout(100);
  }
  return false;
}

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1680, height: 1000 } });

const errors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text());
});
page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));

const fails = [];
const check = (name, cond, detail) => {
  if (!cond) fails.push(`${name} :: ${JSON.stringify(detail)}`);
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${cond ? '' : ` :: ${JSON.stringify(detail)}`}`);
};

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(900);

await page.evaluate(`(${SETUP}).openFixedDocSettingsFromMenu()`);
await page.waitForTimeout(600);
await page.evaluate(`(() => { const s = ${SETUP}; s.fixedDocSetupStep = 2; s.fixedDocReadTab = 'text'; })()`);
await page.waitForTimeout(600);

// --- 0. 既定 OFF ---
const off = await page.evaluate(READ_BAR);
console.log('\n[DEFAULT OFF] ', JSON.stringify(off));
check('既定 OFF: バーが描画される', off.present === true, off);
check('既定 OFF: スイッチが OFF', off.switchOn === false, off.switchOn);
check('既定 OFF: is-disabled が付く', off.classes?.includes('is-disabled') === true, off.classes);
check('既定 OFF: 枠行が無い', off.slotsRowPresent === false, off.slotsRowPresent);
check('既定 OFF: 無効ラベル', /無効 — OCR のみで読取/.test(off.head || ''), off.head);
check('既定 OFF: プレビューの QR 枠も無い', off.hotspotCount === 0, off.hotspotIds);
check('既定 OFF: スキャンボタンが無効', await page.evaluate(`document.querySelector('.fixed-doc-qr-scan-btn')?.disabled === true`) === true, null);
await page.screenshot({ path: `${OUT}/qr-readbar-default-off.png`, fullPage: true });

// --- 1. スイッチ ON → その場でスキャンが走り、枠は 1 つずつ出る ---
await page.click('.fixed-doc-qr-result-switch');
await page.waitForTimeout(320);
const mid = await page.evaluate(READ_BAR);
console.log('\n[SCANNING]', JSON.stringify(mid));
check('SCANNING: スイッチが ON', mid.switchOn === true, mid.switchOn);
check('SCANNING: 枠行が出ている', mid.slotsRowPresent === true, mid.slotsRowPresent);
check('SCANNING: まだ全部は出ていない', mid.scannedCount < 6, { scanned: mid.scannedCount });
check('SCANNING: 未確定の枠（点線プレースホルダ）を描かない', mid.placeholderCount === 0, { placeholders: mid.placeholderCount, scanned: mid.scannedCount });
check('SCANNING: 「スキャン中…」を出す', mid.scanningLabel === 'スキャン中…', mid.scanningLabel);
check('SCANNING: パス徽标はまだ出ない', mid.pathBadge === null, mid.pathBadge);
check('SCANNING: 不完全の赤枠にしない', !mid.classes?.includes('is-incomplete'), mid.classes);
check('SCANNING: 警告行もまだ出さない', mid.alertPresent === false, mid.alertPresent);
check('SCANNING: プレビューの QR 枠も途中まで', mid.hotspotCount === mid.scannedCount, { hotspots: mid.hotspotCount, scanned: mid.scannedCount });
await page.screenshot({ path: `${OUT}/qr-readbar-scanning.png`, fullPage: true });

// 途中経過が単調増加すること（一気に出ていないこと）を確認
await page.waitForTimeout(300);
const mid2 = await page.evaluate(READ_BAR);
check('SCANNING: 枠が順に増える', mid2.scannedCount > mid.scannedCount, { before: mid.scannedCount, after: mid2.scannedCount });

await waitScanIdle(page);
await page.waitForTimeout(200);

// --- 2. 完了後 ---
const on = await page.evaluate(READ_BAR);
console.log('\n[ON] ', JSON.stringify(on));
check('ON: テキストエリアの後にある', on.afterTextarea === true, on.afterTextarea);
check('ON: 項目表の前にある', on.beforeTable === true, on.beforeTable);
check('ON: 掃出せた槽位だけが並ぶ（演示データは 6 個）', on.slots?.length === 6, on.slots?.length);
check('ON: 未完スキャンの槽位を残さない', on.scannedCount === 6 && on.scanningCount === 0, { scanned: on.scannedCount, scanning: on.scanningCount });
check('ON: 槽位条に is-missing を付けない', on.missingSlots?.length === 0, on.missingSlots);
check('ON: 枠は QR id だけ', on.slots?.every((s) => s.text === s.id) === true, on.slots?.map((s) => s.text));
check('ON: 槽位条に赤枠・点線枠を残さない', on.placeholderCount === 0 && on.alertPresent === false, { placeholders: on.placeholderCount, alert: on.alertPresent });
check('ON: パス徽标が出る', on.pathBadge === '複数 QR 読取優先パス適用中', on.pathBadge);
check('ON: 「スキャン中…」が消える', on.scanningLabel === null, on.scanningLabel);
check('ON: QR 再スキャンボタンがある', on.scanBtn === '再スキャン', on.scanBtn);
check('ON: 技術的な数値（値数/検出数）を出さない', !/値/.test(on.head || '') && !/\d+\s*\/\s*\d+/.test(on.head || ''), on.head);
check('ON: 警告なし', on.alert === null, on.alert);
check('ON: プレビューに QR 枠 6 個', on.hotspotCount === 6, on.hotspotIds);
const onState = await page.evaluate(STATUS);
check('ON: 内部で値 407 件が切れている', onState.values === 407, onState);
await page.screenshot({ path: `${OUT}/qr-readbar-on.png`, fullPage: true });

// --- 3. QR スキャン ボタン ---
await page.click('.fixed-doc-qr-scan-btn');
await page.waitForTimeout(320);
const btnMid = await page.evaluate(READ_BAR);
check('SCAN: ボタン実行中は枠を戻して出し直す', btnMid.scannedCount < 6 && btnMid.scanningLabel === 'スキャン中…', { scanned: btnMid.scannedCount, label: btnMid.scanningLabel });
await waitScanIdle(page);
const scanned = await page.evaluate(`(() => {
  const s = ${SETUP};
  return {
    slots: s.fixedDocQrReadSlots.length,
    values: s.fixedDocQrValues.length,
    active: s.fixedDocQrScanActive,
    toast: document.querySelector('.el-message')?.textContent.trim() || null,
  };
})()`);
console.log('\n[SCAN]', JSON.stringify(scanned));
check('SCAN: 実行後に loading が解除される', scanned.active === false, scanned.active);
check('SCAN: 値 407 件', scanned.values === 407, scanned);
check('SCAN: 成功メッセージ', /QR の読み取りが完了しました/.test(scanned.toast || ''), scanned.toast);
await page.screenshot({ path: `${OUT}/qr-readbar-scanned.png`, fullPage: true });

// --- 4. OFF ---
await page.click('.fixed-doc-qr-result-switch');
await page.waitForTimeout(500);
const offAgain = await page.evaluate(READ_BAR);
console.log('\n[OFF]', JSON.stringify(offAgain));
check('OFF: is-disabled が付く', offAgain.classes?.includes('is-disabled') === true, offAgain.classes);
check('OFF: 枠行が消える', offAgain.slotsRowPresent === false, offAgain.slotsRowPresent);
check('OFF: 無効ラベル', /無効 — OCR のみで読取/.test(offAgain.head || ''), offAgain.head);
check('OFF: 警告なし', offAgain.alert === null, offAgain.alert);
check('OFF: プレビューの QR 枠も消える', offAgain.hotspotCount === 0, offAgain.hotspotIds);
check('OFF: スキャンボタンが無効化される', await page.evaluate(`document.querySelector('.fixed-doc-qr-scan-btn')?.disabled === true`) === true, null);
const offState = await page.evaluate(STATUS);
check('OFF: 連結をやめて値 0 件', offState.values === 0, offState);
await page.screenshot({ path: `${OUT}/qr-readbar-off.png`, fullPage: true });

// 直前の OFF セクションでスイッチを切っているため、自動スキャン検証の前提として ON に戻す
await page.click('.fixed-doc-qr-result-switch');
await waitScanIdle(page);

// --- 6. Step2 に入ると自動スキャンが走る（旧 QR 設定ビューの自動スキャンの代替）---
await page.evaluate(`(() => { const s = ${SETUP}; s.fixedDocSetupStep = 1; })()`);
await page.waitForTimeout(300);
await page.evaluate(`(${SETUP}).fixedDocSetupStep = 2`);
await page.waitForTimeout(400);
const autoMid = await page.evaluate(READ_BAR);
check('AUTO: Step2 遷移でも槽位は一気に出ない', autoMid.scannedCount < 6, { scanned: autoMid.scannedCount });
await waitScanIdle(page);
const autoScanned = await page.evaluate(STATUS);
const autoActive = await page.evaluate(`(${SETUP}).fixedDocQrScanActive`);
console.log('\n[AUTO]', JSON.stringify({ ...autoScanned, active: autoActive }));
check('AUTO: Step2 遷移で再スキャンされ値 407 件', autoScanned.values === 407, autoScanned);
check('AUTO: loading が残らない', autoActive === false, autoActive);

// --- 7. スキャン中にスイッチを切ったら止まる ---
await page.click('.fixed-doc-qr-result-switch');
await page.waitForTimeout(300);
await page.click('.fixed-doc-qr-result-switch');
await page.waitForTimeout(350);
await page.click('.fixed-doc-qr-result-switch');
await page.waitForTimeout(150);
const abortOff = await page.evaluate(READ_BAR);
check('ABORT: 途中で OFF にしたら枠行が消える', abortOff.slotsRowPresent === false && abortOff.hotspotCount === 0, abortOff);
await waitScanIdle(page);
const abortState = await page.evaluate(STATUS);
check('ABORT: OFF のまま値 0 件', abortState.values === 0 && abortState.enabled === false, abortState);
await page.waitForTimeout(600);
check('ABORT: 遅れて枠が復活しない', (await page.evaluate(`document.querySelectorAll('.fixed-doc-qr-result-slot').length`)) === 0, null);

console.log('\nconsole errors:', errors.length ? errors : 'none');
console.log(fails.length ? `\n${fails.length} 件 FAIL:\n${fails.join('\n')}` : '\nすべて PASS');
await browser.close();
process.exit(fails.length || errors.length ? 1 : 0);
