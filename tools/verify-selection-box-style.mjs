// 验证：范围选择模式下的「拖动框」和「选中区域」都是实线边框 + 直角。
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.PREVIEW_URL || 'http://127.0.0.1:4175/';
const OUT = 'preview/verify';
fs.mkdirSync(OUT, { recursive: true });
const SETUP = `(() => {
  const app = document.querySelector('#app')?.__vue_app__;
  return app?._container?._vnode?.component?.setupState || null;
})()`;

const STYLE_OF = (sel) => `(() => {
  const el = document.querySelector('${sel}');
  if (!el) return null;
  const cs = getComputedStyle(el);
  return { border: cs.borderTopWidth + ' ' + cs.borderTopStyle + ' ' + cs.borderTopColor,
           borderStyle: cs.borderTopStyle, radius: cs.borderTopLeftRadius, background: cs.backgroundColor };
})()`;

const fails = [];
const check = (n, c, d) => { if (!c) fails.push(`${n} :: ${JSON.stringify(d)}`); console.log(`${c ? 'ok  ' : 'FAIL'} ${n}${c ? '' : ` :: ${JSON.stringify(d)}`}`); };

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1680, height: 1000 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(900);
await page.evaluate(`(() => { const s = ${SETUP}; s.currentModule = 'case-workflow'; s.workflowSetupStep = 2; })()`);
await page.waitForTimeout(800);

const nodes = await page.evaluate(`[...document.querySelectorAll('.wf-node-shell[data-node-id]')].map((el) => {
  const r = el.getBoundingClientRect();
  return { id: el.dataset.nodeId, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
})`);
const start = nodes.find((n) => n.id === 'wf-start');
const pp = nodes.find((n) => n.id === 'wf-pp');

if (!(await page.evaluate(`(${SETUP}).wfSelectionMode`))) {
  await page.click('.wf-canvas-select-tool');
  await page.waitForTimeout(300);
}

// 拖动中：读 marquee 样式
await page.mouse.move(start.x - 6, start.y - 6);
await page.mouse.down();
await page.mouse.move(pp.x + pp.w + 6, pp.y + pp.h + 6, { steps: 8 });
await page.waitForTimeout(150);
const marqueeStyle = await page.evaluate(STYLE_OF('.wf-selection-marquee'));
console.log('[拖动框 .wf-selection-marquee]', JSON.stringify(marqueeStyle));
check('拖动框存在', !!marqueeStyle, marqueeStyle);
check('拖动框：实线', marqueeStyle?.borderStyle === 'solid', marqueeStyle);
check('拖动框：直角（无圆角）', marqueeStyle?.radius === '0px', marqueeStyle?.radius);
await page.screenshot({ path: `${OUT}/selection-marquee.png` });

await page.mouse.up();
await page.waitForTimeout(400);
const regionStyle = await page.evaluate(STYLE_OF('.wf-selection-region'));
console.log('[选中区域 .wf-selection-region]', JSON.stringify(regionStyle));
check('选中区域存在', !!regionStyle, regionStyle);
check('选中区域：实线', regionStyle?.borderStyle === 'solid', regionStyle);
check('选中区域：直角（无圆角）', regionStyle?.radius === '0px', regionStyle?.radius);
check('选中区域：边框为不透明主色', !/rgba?\\([^)]*,\\s*0?\\.\\d+\\)/.test(regionStyle?.border || ''), regionStyle?.border);
await page.screenshot({ path: `${OUT}/selection-region.png` });

console.log('\nconsole errors:', errors.length ? errors : 'none');
console.log(fails.length ? `\n${fails.length} 件 FAIL:\n${fails.join('\n')}` : '\nすべて PASS');
await browser.close();
process.exit(fails.length || errors.length ? 1 : 0);
