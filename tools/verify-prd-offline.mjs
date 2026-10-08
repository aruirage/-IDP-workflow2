// 验证：PRD 评审稿在「外网全部不可达」的情况下仍然可用。
//   - 外部リクエスト（Google Fonts / CDN すべて）を hang させる
//   - 本文が描画されること
//   - mermaid のフロー図がローカルの vendor から描画されること
//   - コンソールにエラーが出ないこと
// 使い方: 4177 で `python3 -m http.server --directory prd-public` を起動してから
//   node tools/verify-prd-offline.mjs
import { chromium } from 'playwright';

const BASE = process.env.PRD_URL || 'http://127.0.0.1:4177/';

const fails = [];
const check = (name, cond, detail) => {
  if (!cond) fails.push(`${name} :: ${JSON.stringify(detail)}`);
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${cond ? '' : ` :: ${JSON.stringify(detail)}`}`);
};

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

// 外部ホストは一切応答させない（＝回線が詰まっている状況を再現）
const hang = () => new Promise(() => {});
await page.route('**/*', (route) => {
  const url = route.request().url();
  if (url.startsWith('http://127.0.0.1:') || url.startsWith('http://localhost:')) return route.continue();
  return hang();
});

await page.goto(BASE, { waitUntil: 'commit', timeout: 20000 });
await page.waitForTimeout(1500);

// mermaid の描画を最大 10 秒待つ
let svgCount = 0;
for (let i = 0; i < 20; i += 1) {
  svgCount = await page.evaluate("document.querySelectorAll('.mermaid svg').length");
  if (svgCount > 0) break;
  await page.waitForTimeout(500);
}

const state = await page.evaluate(`(() => ({
  blocks: document.querySelectorAll('.mermaid').length,
  svg: document.querySelectorAll('.mermaid svg').length,
  h1: (document.querySelector('.paper h1')?.textContent || '').trim(),
  headings: Array.from(document.querySelectorAll('.paper h4')).map((h) => h.textContent.trim()),
  sections: document.querySelectorAll('.paper h3, .paper h4').length,
  unavailable: document.documentElement.classList.contains('mermaid-unavailable'),
}))()`);

console.log('state: ' + JSON.stringify(state));

check('PRD 本文が描画されている', state.h1.includes('NeosAI'), state.h1);
check('見出しが 20 件以上ある', state.sections >= 20, state.sections);
check('mermaid ブロックが存在する', state.blocks >= 1, state.blocks);
check('mermaid がローカルから描画された（svg 生成）', state.svg === state.blocks, { blocks: state.blocks, svg: state.svg });
check('mermaid フォールバックに落ちていない', state.unavailable === false, state.unavailable);
check('コンソールエラーなし', errors.length === 0, errors.slice(0, 3));

const html = await page.content();
check('ページに jsdelivr / unpkg への参照がない', !/jsdelivr|unpkg/.test(html), 'jsdelivr|unpkg found');

await browser.close();
console.log(fails.length ? `\n${fails.length} 件 FAIL` : '\nすべて PASS');
process.exit(fails.length ? 1 : 0);
