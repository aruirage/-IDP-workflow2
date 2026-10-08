// 範囲選択（マウスモード）のハイライト矩形を実機で検証する。
//   1. ドラッグ中はマーキーだけ（確定ハイライトは出ない）
//   2. 離すと「選択中ノードを囲む矩形」が出る。位置・サイズはパン・ズーム後も
//      選択ノードの実測 union + 14px * scale に一致する（＝ドラッグした範囲とズレない）
//   3. ハイライトはステージより前に置かれ、ノードより上のレイヤーで自分で操作を受ける
//      （枠の中はどこを押しても「かたまりを動かす」になる）
//   4. 右クリックで複製 / 削除が効く（左下のフローティングバーは存在しない）
//   5. ノード優先（dify 互換）: ノードの一部に触れただけでそのノードは丸ごと選ばれ、
//      ハイライトも生のドラッグ矩形ではなくノード全体を囲む矩形になる
// 使い方: node tools/verify-workflow-selection-region.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.PREVIEW_URL || 'http://127.0.0.1:4175/';
const OUT = 'preview/verify';
fs.mkdirSync(OUT, { recursive: true });
const PAD = 14;
const TOL = 2.5;

const SETUP = `(() => {
  const app = document.querySelector('#app')?.__vue_app__;
  return app?._container?._vnode?.component?.setupState || null;
})()`;

const SNAP = `(() => {
  const r = (el) => {
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return { x: b.left, y: b.top, w: b.width, h: b.height };
  };
  const s = ${SETUP};
  const region = document.querySelector('.wf-selection-region');
  const marquee = document.querySelector('.wf-selection-marquee');
  const viewport = document.querySelector('.idp-canvas-viewport');
  const stage = document.querySelector('.idp-canvas-stage');
  const boxStyle = (el) => {
    if (!el) return null;
    const cs = getComputedStyle(el);
    return { borderStyle: cs.borderTopStyle, radius: cs.borderTopLeftRadius, borderColor: cs.borderTopColor };
  };
  return {
    marquee: r(marquee),
    marqueeStyle: boxStyle(marquee),
    region: r(region),
    regionStyle: boxStyle(region),
    regionPresent: !!region,
    regionIsStagePreviousSibling: !!region && region.parentElement === viewport && region.nextElementSibling === stage,
    regionZIndex: region ? getComputedStyle(region).zIndex : null,
    regionPointerEvents: region ? getComputedStyle(region).pointerEvents : null,
    multiBarPresent: !!document.querySelector('.wf-multi-selection-actions'),
    selectedIds: [...s.wfSelectedNodeIds],
    nodes: [...document.querySelectorAll('.wf-node-shell[data-node-id]')].map((el) => ({ id: el.dataset.nodeId, ...r(el) })),
    menuVisible: s.wfCanvasContextMenu.visible,
    nodeCount: document.querySelectorAll('.wf-node-shell[data-node-id]').length,
  };
})()`;

const failures = [];
const check = (label, ok, detail) => {
  if (!ok) failures.push(`${label}: ${detail}`);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1680, height: 1000 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await page.evaluate(`(${SETUP}).workflowSetupStep = 2`);
await page.waitForTimeout(800);

const clickTool = async (title) => { await page.click(`.wf-canvas-tool-btn[title="${title}"]`); await page.waitForTimeout(350); };

async function marqueeCase(label, { fit = false, zoomIn = 0 } = {}) {
  if (fit) await clickTool('整列して全体表示');
  for (let i = 0; i < zoomIn; i += 1) await clickTool('拡大');
  await page.evaluate(`(${SETUP}).wfSelectionMode = true`);
  await page.waitForTimeout(200);

  const before = await page.evaluate(SNAP);
  const vp = await page.evaluate(`(() => { const b = document.querySelector('.idp-canvas-viewport').getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; })()`);
  const nodes = before.nodes.filter((n) => n.w > 40
    && n.x >= vp.x && n.x + n.w <= vp.x + vp.w
    && n.y >= vp.y && n.y + n.h <= vp.y + vp.h);
  if (nodes.length < 2) { console.log(`\n[${label}] ビューポート内のノードが ${nodes.length} 件のためスキップ`); return; }
  const scale = await page.evaluate(`(() => {
    const m = new DOMMatrix(getComputedStyle(document.querySelector('.idp-canvas-stage')).transform);
    return m.a;
  })()`);

  const a = nodes[0];
  const b = nodes[1];
  const x0 = Math.min(a.x, b.x) - 16;
  const y0 = Math.min(a.y, b.y) - 16;
  const x1 = Math.max(a.x + a.w, b.x + b.w) + 16;
  const y1 = Math.max(a.y + a.h, b.y + b.h) + 16;

  console.log(`\n===== ${label} (scale ${scale.toFixed(3)}) =====`);
  // ドラッグ開始点が何に当たっているか。ノードや線（.idp-edge-hit）の上だと
  // 範囲選択は始まらない（＝その要素の操作が優先される）ので、失敗時の切り分けに使う。
  const startHit = await page.evaluate(`(() => {
    const el = document.elementFromPoint(${x0}, ${y0});
    return el ? el.tagName.toLowerCase() + '.' + (el.getAttribute('class') || '') : null;
  })()`);
  console.log(`     ドラッグ開始点 ${Math.round(x0)},${Math.round(y0)} → ${startHit}`);
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  await page.mouse.move((x0 + x1) / 2, (y0 + y1) / 2, { steps: 5 });
  await page.mouse.move(x1, y1, { steps: 5 });
  await page.waitForTimeout(150);
  const during = await page.evaluate(SNAP);
  check(`${label}: ドラッグ中はマーキーだけ`, during.marquee && !during.regionPresent, `marquee=${!!during.marquee} region=${during.regionPresent}`);
  check(`${label}: マーキーは実線・直角`, during.marqueeStyle?.borderStyle === 'solid' && during.marqueeStyle?.radius === '0px', JSON.stringify(during.marqueeStyle));

  await page.mouse.up();
  await page.waitForTimeout(300);
  const after = await page.evaluate(SNAP);

  check(`${label}: ハイライトが出る`, after.regionPresent, `selected=${after.selectedIds.length}`);
  check(`${label}: ハイライトはステージの直前（DOM 順はそのまま）`, after.regionIsStagePreviousSibling, `sibling=${after.regionIsStagePreviousSibling}`);
  // 枠はノードより上のレイヤーに置き、pointer-events も受ける。こうしないと
  // 「枠の中のノードの上」を押したときにノード側がイベントを取ってしまう。
  check(`${label}: ハイライトはノードより上（z=4）`, after.regionZIndex === '4', `z=${after.regionZIndex}`);
  check(`${label}: ハイライト自身が操作を受ける`, after.regionPointerEvents === 'auto', `pointer-events=${after.regionPointerEvents}`);
  check(`${label}: ハイライトは実線・直角`, after.regionStyle?.borderStyle === 'solid' && after.regionStyle?.radius === '0px', JSON.stringify(after.regionStyle));
  check(`${label}: 左下のフローティングバーが無い`, !after.multiBarPresent);

  const sel = after.nodes.filter((n) => after.selectedIds.includes(n.id));
  if (!sel.length) { check(`${label}: 選択ノード`, false, '0 件'); return; }
  // 右クリック対象はビューポート内に収まっているノードから選ぶ（はみ出したノードの中心は
  // キャンバスの外＝サイドバーに落ちてしまうため）。
  const clickable = sel.filter((n) => n.x >= vp.x && n.x + n.w <= vp.x + vp.w && n.y >= vp.y && n.y + n.h <= vp.y + vp.h);
  const pad = PAD * scale;
  const want = {
    x: Math.min(...sel.map((n) => n.x)) - pad,
    y: Math.min(...sel.map((n) => n.y)) - pad,
    w: Math.max(...sel.map((n) => n.x + n.w)) - Math.min(...sel.map((n) => n.x)) + pad * 2,
    h: Math.max(...sel.map((n) => n.y + n.h)) - Math.min(...sel.map((n) => n.y)) + pad * 2,
  };
  const d = {
    dx: after.region.x - want.x,
    dy: after.region.y - want.y,
    dw: after.region.w - want.w,
    dh: after.region.h - want.h,
  };
  const ok = Object.values(d).every((v) => Math.abs(v) <= TOL);
  check(`${label}: 選択ノードを囲む（pad ${pad.toFixed(1)}px）`, ok,
    `delta dx=${d.dx.toFixed(1)} dy=${d.dy.toFixed(1)} dw=${d.dw.toFixed(1)} dh=${d.dh.toFixed(1)}`);

  await page.screenshot({ path: `${OUT}/selection-${label}.png` });
  // 選択範囲だけ切り出して拡大（見た目の確認用）
  const clip = {
    x: Math.max(0, after.region.x - 20),
    y: Math.max(0, after.region.y - 20),
    width: Math.min(900, after.region.w + 40),
    height: Math.min(500, after.region.h + 40),
  };
  await page.screenshot({ path: `${OUT}/selection-${label}-crop.png`, clip });

  // 右クリックメニュー（複製 / 削除）
  const target = clickable[0] || sel[0];
  const hit = await page.evaluate(`(() => {
    const el = document.elementFromPoint(${target.x + target.w / 2}, ${target.y + target.h / 2});
    return { cls: el?.className || null, inNode: !!el?.closest?.('.wf-node-shell[data-node-id]'), id: el?.closest?.('.wf-node-shell[data-node-id]')?.dataset.nodeId || null };
  })()`);
  console.log(`     right-click target ${target.id} @ ${Math.round(target.x + target.w / 2)},${Math.round(target.y + target.h / 2)} → ${JSON.stringify(hit)}`);
  await page.mouse.click(target.x + target.w / 2, target.y + target.h / 2, { button: 'right' });
  await page.waitForTimeout(250);
  const menu = await page.evaluate(SNAP);
  check(`${label}: 右クリックでメニュー`, menu.menuVisible, `visible=${menu.menuVisible}`);
  const items = await page.$$eval('.wf-canvas-context-menu-item', (els) => els.map((el) => el.textContent.replace(/\s+/g, ' ').trim()));
  check(`${label}: メニューは 複製 / 削除`, items.length === 2 && items[0].startsWith('複製') && items[1].startsWith('削除'), JSON.stringify(items));

  const beforeDup = menu.nodeCount;
  await page.click('.wf-canvas-context-menu-item:not(.is-danger)');
  await page.waitForTimeout(400);
  const dup = await page.evaluate(SNAP);
  check(`${label}: 複製でノードが増える`, dup.nodeCount > beforeDup, `${beforeDup} → ${dup.nodeCount}`);

  await page.evaluate(`(${SETUP}).wfSelectionMode = true`);
  await page.waitForTimeout(150);
  const afterDup = await page.evaluate(SNAP);
  const target2 = afterDup.nodes.filter((n) => afterDup.selectedIds.includes(n.id)
    && n.x >= vp.x && n.x + n.w <= vp.x + vp.w && n.y >= vp.y && n.y + n.h <= vp.y + vp.h)[0];
  if (target2) {
    await page.mouse.click(target2.x + target2.w / 2, target2.y + target2.h / 2, { button: 'right' });
    await page.waitForTimeout(250);
    const beforeDel = (await page.evaluate(SNAP)).nodeCount;
    await page.click('.wf-canvas-context-menu-item.is-danger');
    await page.waitForTimeout(400);
    const del = await page.evaluate(SNAP);
    check(`${label}: 削除でノードが減る`, del.nodeCount < beforeDel, `${beforeDel} → ${del.nodeCount}`);
  }

  await page.evaluate(`(() => { const s = ${SETUP}; s.wfSelectionMode = false; s.wfSelectedNodeIds.clear(); })()`);
  await page.waitForTimeout(150);
}

// 「ノード優先」の当たり判定（dify 互換）。
// ノードの一部にしか触れていないマーキーでも、そのノードは丸ごと選択され、
// ハイライト矩形は「生のドラッグ矩形」ではなく「ノード全体を囲む矩形」になる。
async function nodePriorityCase(label, { fit = false } = {}) {
  if (fit) await clickTool('整列して全体表示');
  await page.evaluate(`(${SETUP}).wfSelectionMode = true`);
  await page.waitForTimeout(200);
  await page.evaluate(`(() => { const s = ${SETUP}; s.wfSelectedNodeIds.clear(); })()`);
  await page.waitForTimeout(150);

  const snap = await page.evaluate(SNAP);
  const vp = await page.evaluate(`(() => { const b = document.querySelector('.idp-canvas-viewport').getBoundingClientRect(); return { x: b.left, y: b.top, r: b.right, b: b.bottom }; })()`);
  const scale = await page.evaluate(`(() => new DOMMatrix(getComputedStyle(document.querySelector('.idp-canvas-stage')).transform).a)()`);
  const inside = snap.nodes.filter((n) => n.w > 40
    && n.x >= vp.x && n.x + n.w <= vp.r && n.y >= vp.y && n.y + n.h <= vp.b);

  console.log(`\n===== node-priority ${label} (scale ${scale.toFixed(3)}) =====`);
  let tested = 0;
  for (const node of inside) {
    // ノードの右上の外（空白）から、ノードの右 40% だけを切るように左下へドラッグする。
    const sx = node.x + node.w + 40;
    const sy = node.y - 24;
    const ex = node.x + node.w * 0.6;
    const ey = node.y + node.h * 0.5;
    if (sx >= vp.r || sy <= vp.y || ex <= vp.x || ey >= vp.b) continue;
    const startHit = await page.evaluate(`(() => {
      const el = document.elementFromPoint(${sx}, ${sy});
      return el?.closest?.('.wf-node') ? 'node' : el?.closest?.('.idp-edge-hit') ? 'edge' : 'blank';
    })()`);
    if (startHit !== 'blank') continue;

    await page.mouse.move(sx, sy);
    await page.mouse.down();
    await page.mouse.move(ex, ey, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(300);
    const after = await page.evaluate(SNAP);
    tested += 1;

    const pad = PAD * scale;
    const drag = { x: Math.min(sx, ex), y: Math.min(sy, ey), r: Math.max(sx, ex), b: Math.max(sy, ey) };
    check(`node-priority ${label}: ${node.id} は一部接触で選択される`, after.selectedIds.includes(node.id),
      `selected=${after.selectedIds.join(',') || '(空)'}`);
    if (!after.region) { check(`node-priority ${label}: ${node.id} のハイライト`, false, 'region なし'); continue; }
    // ドラッグ矩形はノードの右端を越えているので、ハイライトはドラッグ矩形より左に広がる＝ノード全体を囲んでいる。
    check(`node-priority ${label}: ${node.id} は左端まで囲まれる`,
      after.region.x <= node.x - pad + TOL,
      `region.left=${after.region.x.toFixed(1)} node.left=${node.x.toFixed(1)} pad=${pad.toFixed(1)}`);
    check(`node-priority ${label}: ${node.id} は上端まで囲まれる`,
      after.region.y <= node.y - pad + TOL,
      `region.top=${after.region.y.toFixed(1)} node.top=${node.y.toFixed(1)}`);
    check(`node-priority ${label}: ${node.id} は下端まで囲まれる`,
      after.region.y + after.region.h >= node.y + node.h + pad - TOL,
      `region.bottom=${(after.region.y + after.region.h).toFixed(1)} node.bottom=${(node.y + node.h).toFixed(1)}`);
    // 生のドラッグ矩形そのままではない（＝スナップしている）。
    check(`node-priority ${label}: ${node.id} のハイライトは生のドラッグ矩形ではない`,
      Math.abs(after.region.x - drag.x) > 5,
      `region.left=${after.region.x.toFixed(1)} drag.left=${drag.x.toFixed(1)}`);

    await page.evaluate(`(() => { const s = ${SETUP}; s.wfSelectedNodeIds.clear(); })()`);
    await page.waitForTimeout(150);
    if (tested >= 3) break;
  }
  if (!tested) check(`node-priority ${label}: 検証できたノード`, false, '始点が空白になるノードが無かった');
  await page.evaluate(`(() => { const s = ${SETUP}; s.wfSelectionMode = false; })()`);
  await page.waitForTimeout(150);
}

await marqueeCase('default');
await marqueeCase('fit', { fit: true });
await marqueeCase('fit-zoom1', { fit: true, zoomIn: 1 });
await nodePriorityCase('fit');

console.log('\nconsole errors:', errors.length ? errors : 'none');
if (errors.length) failures.push(`console errors: ${errors.length}`);
console.log(failures.length ? `\n${failures.length} 件の失敗:\n- ${failures.join('\n- ')}` : '\nALL_OK');
await browser.close();
process.exit(failures.length ? 1 : 0);
