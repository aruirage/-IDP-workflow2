// マウスモード（範囲選択 ON）/ ドラッグモード（OFF）の操作範囲を実機で検証する。
//   マウスモード = 「選んで丸ごと動かす」だけのモード
//     1. ノードをクリックしても編集パネルは開かない（選択のトグルのみ）
//     2. ノード追加（＋）/ 接続削除（×）のボタンは出ない
//     3. 選択済みノードの上でドラッグすると、選択中のかたまりが丸ごと動く
//     3b. 選択枠の中（ノードの隙間・余白）の空白を掴んでも同じように丸ごと動く
//     3c. 枠の中にある未選択ノードを掴んでも選択は置き換わらず、丸ごと動く
//     3d. 枠はノードより上のレイヤーにあり、枠の中の全点が枠自身に当たる（カーソルも move）
//     4. ⌘/Ctrl + Z / ⇧Z / V / C / D と ⌫ は効く
//   ドラッグモード
//     5. クリックで編集パネルが開く
//     6. 単一選択でも ⌘C / ⌘D / ⌫ が効く
// 使い方: node tools/verify-workflow-selection-mode.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.PREVIEW_URL || 'http://127.0.0.1:4175/';
const OUT = 'preview/verify';
fs.mkdirSync(OUT, { recursive: true });

const SETUP = `(() => {
  const app = document.querySelector('#app')?.__vue_app__;
  return app?._container?._vnode?.component?.setupState || null;
})()`;

const SNAP = `(() => {
  const s = ${SETUP};
  const r = (el) => {
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return { x: b.left, y: b.top, w: b.width, h: b.height };
  };
  const shown = (sel) => [...document.querySelectorAll(sel)].filter((el) => getComputedStyle(el).display !== 'none').length;
  return {
    selectionMode: s.wfSelectionMode,
    selectedIds: [...s.wfSelectedNodeIds],
    singleId: s.selectedWorkflowNodeId,
    inspectorOpen: !!document.querySelector('.idp-inspector'),
    inspectorCollapsed: s.inspectorPanelCollapsed,
    regionPresent: !!document.querySelector('.wf-selection-region'),
    region: r(document.querySelector('.wf-selection-region')),
    regionStyle: (() => {
      const el = document.querySelector('.wf-selection-region');
      if (!el) return null;
      const cs = getComputedStyle(el);
      return { z: cs.zIndex, pe: cs.pointerEvents, cursor: cs.cursor };
    })(),
    nodeCount: document.querySelectorAll('.wf-node-shell[data-node-id]').length,
    addBtnShown: shown('.wf-node-add-btn'),
    edgeDelBtnShown: shown('.wf-edge-delete-btn'),
    nodes: [...document.querySelectorAll('.wf-node-shell[data-node-id]')].map((el) => ({
      id: el.dataset.nodeId,
      isStart: el.classList.contains('wf-node--start'),
      isSelected: el.classList.contains('is-selected'),
      ...r(el),
    })),
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

const vp = await page.evaluate(`(() => { const b = document.querySelector('.idp-canvas-viewport').getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; })()`);
const inside = (n) => n.x >= vp.x && n.x + n.w <= vp.x + vp.w && n.y >= vp.y && n.y + n.h <= vp.y + vp.h;
const scaleOf = () => page.evaluate(`(() => new DOMMatrix(getComputedStyle(document.querySelector('.idp-canvas-stage')).transform).a)()`);

const setMode = async (on) => {
  await page.evaluate(`(() => { const s = ${SETUP}; s.wfSelectionMode = ${on}; s.wfSelectedNodeIds.clear(); s.selectedWorkflowNodeId = null; })()`);
  await page.waitForTimeout(220);
};
const snap = () => page.evaluate(SNAP);
const clickNode = async (n) => { await page.mouse.click(n.x + n.w / 2, n.y + n.h / 2); await page.waitForTimeout(400); };

async function marqueeSelect(minCount = 2) {
  const s = await snap();
  const nodes = s.nodes.filter((n) => inside(n) && n.w > 40);
  const a = nodes[0];
  const b = nodes[minCount - 1];
  await page.mouse.move(Math.min(a.x, b.x) - 16, Math.min(a.y, b.y) - 16);
  await page.mouse.down();
  await page.mouse.move((Math.min(a.x, b.x) + Math.max(a.x + a.w, b.x + b.w)) / 2, (Math.min(a.y, b.y) + Math.max(a.y + a.h, b.y + b.h)) / 2, { steps: 4 });
  await page.mouse.move(Math.max(a.x + a.w, b.x + b.w) + 16, Math.max(a.y + a.h, b.y + b.h) + 16, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(350);
  return snap();
}

// ============ マウスモード ============
console.log('===== マウスモード（範囲選択 ON） =====');
await setMode(true);

// 1. クリックしても編集パネルは開かない
{
  const s = await snap();
  const target = s.nodes.filter((n) => inside(n) && n.w > 40 && !n.isStart)[0];
  await clickNode(target);
  const after = await snap();
  check('mouse: クリックで編集パネルは開かない', !after.singleId && !after.inspectorOpen,
    `single=${after.singleId} inspector=${after.inspectorOpen}`);
  check('mouse: クリックは選択のトグルとして効く', after.selectedIds.includes(target.id),
    `selected=${JSON.stringify(after.selectedIds)} (target ${target.id})`);
}

// 2. ＋ / × ボタンは出ない
{
  const after = await marqueeSelect(3);
  check('mouse: ノード追加（＋）が出ない', after.addBtnShown === 0, `shown=${after.addBtnShown}`);
  check('mouse: 接続削除（×）が出ない', after.edgeDelBtnShown === 0, `shown=${after.edgeDelBtnShown}`);
  check('mouse: ハイライトが出る', after.regionPresent, `selected=${after.selectedIds.length}`);
}

// 3. 選択済みのかたまりを丸ごと動かす
{
  const before = await snap();
  const scale = await scaleOf();
  const sel = before.nodes.filter((n) => before.selectedIds.includes(n.id));
  const others = before.nodes.filter((n) => !before.selectedIds.includes(n.id));
  const lead = sel.find((n) => inside(n)) || sel[0];
  const DX = 120;
  const DY = 80;
  await page.mouse.move(lead.x + lead.w / 2, lead.y + lead.h / 2);
  await page.mouse.down();
  await page.mouse.move(lead.x + lead.w / 2 + DX / 2, lead.y + lead.h / 2 + DY / 2, { steps: 5 });
  await page.mouse.move(lead.x + lead.w / 2 + DX, lead.y + lead.h / 2 + DY, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  const after = await snap();
  const moved = sel.map((n) => {
    const now = after.nodes.find((x) => x.id === n.id);
    return { id: n.id, dx: Math.round(now.x - n.x), dy: Math.round(now.y - n.y) };
  });
  const allMoved = moved.every((m) => Math.abs(m.dx - DX) <= 2 && Math.abs(m.dy - DY) <= 2);
  check('mouse: 選択中のかたまりが丸ごと動く', allMoved, `${JSON.stringify(moved)} (期待 dx=${DX} dy=${DY})`);
  const othersMoved = others.filter((n) => {
    const now = after.nodes.find((x) => x.id === n.id);
    return Math.abs(now.x - n.x) > 1 || Math.abs(now.y - n.y) > 1;
  }).map((n) => n.id);
  check('mouse: 選択外のノードは動かない', othersMoved.length === 0, `moved=${JSON.stringify(othersMoved)}`);
  check('mouse: 動かしても選択は維持', after.selectedIds.length === sel.length, `selected=${after.selectedIds.length} / ${sel.length} (scale ${scale.toFixed(2)})`);
  await page.screenshot({ path: `${OUT}/selection-mode-mouse-drag.png` });
}

// 3b. 選択枠の中は「どこを掴んでも」丸ごと動く（ノードの隙間・余白も含む）
{
  await setMode(true);
  await marqueeSelect(3);
  const before = await snap();
  const region = before.region;
  // 選択枠の四隅（＝ノードの外側の余白）から、空白になっている点を探す。
  const candidates = [
    [region.x + 5, region.y + 5],
    [region.x + region.w - 5, region.y + 5],
    [region.x + 5, region.y + region.h - 5],
    [region.x + region.w - 5, region.y + region.h - 5],
  ];
  let start = null;
  let startKind = null;
  for (const [px, py] of candidates) {
    startKind = await page.evaluate(`(() => {
      const el = document.elementFromPoint(${px}, ${py});
      return el?.closest?.('.wf-node') ? 'node' : el?.closest?.('.idp-edge-hit') ? 'edge' : 'blank';
    })()`);
    if (startKind === 'blank') { start = [px, py]; break; }
  }
  check('mouse: 選択枠の中に空白の掴み点がある', !!start, `kind=${startKind} candidates=${JSON.stringify(candidates.map(([x, y]) => [Math.round(x), Math.round(y)]))}`);
  if (start) {
    const sel = before.nodes.filter((n) => before.selectedIds.includes(n.id));
    const DX = 90;
    const DY = 50;
    await page.mouse.move(start[0], start[1]);
    await page.mouse.down();
    await page.mouse.move(start[0] + DX / 2, start[1] + DY / 2, { steps: 5 });
    await page.mouse.move(start[0] + DX, start[1] + DY, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(400);
    const after = await snap();
    const moved = sel.map((n) => {
      const now = after.nodes.find((x) => x.id === n.id);
      return { id: n.id, dx: Math.round(now.x - n.x), dy: Math.round(now.y - n.y) };
    });
    check('mouse: 選択枠の空白を掴んでも丸ごと動く', moved.length > 0 && moved.every((m) => Math.abs(m.dx - DX) <= 2 && Math.abs(m.dy - DY) <= 2),
      `${JSON.stringify(moved)} (期待 dx=${DX} dy=${DY})`);
    check('mouse: 空白を掴んでも選択は維持', after.selectedIds.length === sel.length, `${after.selectedIds.length} / ${sel.length}`);
    check('mouse: 空白を掴んでもマーキーは出ない', after.regionPresent && after.selectedIds.length > 0, `region=${after.regionPresent}`);
    await page.screenshot({ path: `${OUT}/selection-mode-mouse-drag-blank.png` });

    // 枠の中を「押すだけ」（動かさない）でも選択は消えない。
    const region2 = after.region;
    await page.mouse.click(region2.x + 5, region2.y + 5);
    await page.waitForTimeout(300);
    const clicked = await snap();
    check('mouse: 選択枠の中をクリックしても選択は消えない', clicked.selectedIds.length === after.selectedIds.length,
      `${clicked.selectedIds.length} / ${after.selectedIds.length}`);
  }
}

// 3c. 選択枠の中にある「未選択ノード」を掴んでも、選択は置き換わらず丸ごと動く。
//     離れた 2 ノードだけを選ぶと、その外接矩形の中に未選択ノードが残る。
{
  await setMode(true);
  const s0 = await snap();
  const vis = s0.nodes.filter((n) => inside(n) && n.w > 40);
  const first = vis[0];
  const last = vis[vis.length - 1];
  await page.evaluate(`(() => { const s = ${SETUP}; s.wfSelectedNodeIds.clear(); s.wfSelectedNodeIds.add('${first.id}'); s.wfSelectedNodeIds.add('${last.id}'); })()`);
  await page.waitForTimeout(350);
  const before = await snap();
  const region = before.region;
  const inner = before.nodes.filter((n) => n.w > 40 && !before.selectedIds.includes(n.id)
    && n.x >= region.x && n.x + n.w <= region.x + region.w
    && n.y >= region.y && n.y + n.h <= region.y + region.h);
  check('mouse: 選択枠の中に未選択ノードがある', inner.length > 0,
    `選択=${before.selectedIds.length} 件 / 枠内の未選択=${inner.length} 件`);
  if (inner.length) {
    const victim = inner[0];
    await page.mouse.click(victim.x + victim.w / 2, victim.y + victim.h / 2);
    await page.waitForTimeout(350);
    const kept = await snap();
    check('mouse: 枠の中の未選択ノードをクリックしても選択は置き換わらない',
      kept.selectedIds.length === before.selectedIds.length && !kept.selectedIds.includes(victim.id),
      `selected=${kept.selectedIds.length} / ${before.selectedIds.length} (押したのは ${victim.id})`);
    check('mouse: そのときマーキーも出ない', kept.regionPresent, `region=${kept.regionPresent}`);

    const beforeDrag = await snap();
    const sel2 = beforeDrag.nodes.filter((n) => beforeDrag.selectedIds.includes(n.id));
    const DX = 70;
    const DY = 40;
    await page.mouse.move(victim.x + victim.w / 2, victim.y + victim.h / 2);
    await page.mouse.down();
    await page.mouse.move(victim.x + victim.w / 2 + DX / 2, victim.y + victim.h / 2 + DY / 2, { steps: 5 });
    await page.mouse.move(victim.x + victim.w / 2 + DX, victim.y + victim.h / 2 + DY, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(400);
    const afterDrag = await snap();
    const moved2 = sel2.map((n) => {
      const now = afterDrag.nodes.find((x) => x.id === n.id);
      return { id: n.id, dx: Math.round(now.x - n.x), dy: Math.round(now.y - n.y) };
    });
    check('mouse: 枠の中の未選択ノードから引いても丸ごと動く',
      moved2.length > 0 && moved2.every((m) => Math.abs(m.dx - DX) <= 2 && Math.abs(m.dy - DY) <= 2),
      `${JSON.stringify(moved2)} (期待 dx=${DX} dy=${DY})`);
    check('mouse: そのとき選択も変わらない',
      afterDrag.selectedIds.length === beforeDrag.selectedIds.length,
      `${afterDrag.selectedIds.length} / ${beforeDrag.selectedIds.length}`);
    await page.screenshot({ path: `${OUT}/selection-mode-mouse-drag-unselected.png` });
  }
}

// 3d. 枠を最前面に置いた結果、枠の中の「全点」が枠自身に当たる（＝どこを押しても同じ経路）。
//     ここが崩れると、ノードの上だけ挙動が違う／十字カーソルに戻る、といった再発をする。
{
  await setMode(true);
  const s0 = await snap();
  const vis = s0.nodes.filter((n) => inside(n) && n.w > 40);
  await page.evaluate(`(() => { const s = ${SETUP}; s.wfSelectedNodeIds.clear(); s.wfSelectedNodeIds.add('${vis[0].id}'); s.wfSelectedNodeIds.add('${vis[vis.length - 1].id}'); })()`);
  await page.waitForTimeout(350);
  const s = await snap();
  check('mouse: ハイライトはノードより上のレイヤー', s.regionStyle?.z === '4', JSON.stringify(s.regionStyle));
  check('mouse: ハイライト自身が mousedown を受ける', s.regionStyle?.pe === 'auto', JSON.stringify(s.regionStyle));
  check('mouse: 枠の中のカーソルは十字ではなく move', s.regionStyle?.cursor === 'move', `cursor=${s.regionStyle?.cursor}`);

  const reg = s.region;
  const misses = [];
  let sampled = 0;
  for (let y = reg.y + 4; y < reg.y + reg.h - 4; y += 40) {
    for (let x = reg.x + 4; x < reg.x + reg.w - 4; x += 40) {
      sampled += 1;
      const onRegion = await page.evaluate(`(() => { const el = document.elementFromPoint(${x}, ${y}); return !!el?.closest?.('.wf-selection-region'); })()`);
      if (!onRegion) misses.push(`${Math.round(x)},${Math.round(y)}`);
    }
  }
  check('mouse: 枠の中はどの点も枠自身に当たる', misses.length === 0,
    `サンプル ${sampled} 点 / 外れた ${misses.length} 点${misses.length ? ' → ' + misses.slice(0, 6).join(' ') : ''}`);
}

// 4. ショートカット
{
  await setMode(true);
  let s = await marqueeSelect(3);
  const expected = s.nodes.filter((n) => s.selectedIds.includes(n.id) && !n.isStart).length;
  check('mouse: 範囲ドラッグで選択できる', s.selectedIds.length >= 3 && expected >= 2, `selected=${s.selectedIds.length} copy対象=${expected}`);

  const beforeCopy = s.nodeCount;
  await page.keyboard.press('Meta+c');
  await page.waitForTimeout(300);
  await page.keyboard.press('Meta+v');
  await page.waitForTimeout(450);
  const afterV = await snap();
  check('mouse: ⌘C → ⌘V で貼り付け', afterV.nodeCount === beforeCopy + expected, `${beforeCopy} → ${afterV.nodeCount} (期待 +${expected})`);

  const beforeDup = (await snap()).nodeCount;
  await page.keyboard.press('Meta+d');
  await page.waitForTimeout(450);
  const afterDup = await snap();
  check('mouse: ⌘D で複製', afterDup.nodeCount > beforeDup, `${beforeDup} → ${afterDup.nodeCount}`);

  await page.keyboard.press('Meta+z');
  await page.waitForTimeout(450);
  const afterUndo = await snap();
  check('mouse: ⌘Z で元に戻る', afterUndo.nodeCount < afterDup.nodeCount, `${afterDup.nodeCount} → ${afterUndo.nodeCount}`);
  await page.keyboard.press('Meta+Shift+z');
  await page.waitForTimeout(450);
  const afterRedo = await snap();
  check('mouse: ⇧⌘Z でやり直し', afterRedo.nodeCount > afterUndo.nodeCount, `${afterUndo.nodeCount} → ${afterRedo.nodeCount}`);

  const beforeDel = (await snap()).nodeCount;
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(450);
  const afterDel = await snap();
  check('mouse: ⌫ で削除', afterDel.nodeCount < beforeDel, `${beforeDel} → ${afterDel.nodeCount}`);
}

// ============ ドラッグモード ============
console.log('\n===== ドラッグモード（範囲選択 OFF） =====');
await setMode(false);

// 5. クリックで編集パネルが開く
{
  const s = await snap();
  const target = s.nodes.filter((n) => inside(n) && n.w > 40 && !n.isStart)[0];
  await clickNode(target);
  const after = await snap();
  check('drag: クリックで編集パネルが開く', after.singleId === target.id && after.inspectorOpen && !after.inspectorCollapsed,
    `single=${after.singleId} inspector=${after.inspectorOpen}`);
}

// 6. 単一選択でもショートカットが効く
{
  const before = await snap();
  const target = before.nodes.filter((n) => inside(n) && n.w > 40 && !n.isStart && n.id !== before.singleId)[0];
  await clickNode(target);
  const s = await snap();
  check('drag: 単一選択になっている', s.singleId === target.id, `single=${s.singleId}`);
  check('drag: ＋ / × は出る（マウスモードだけの制限）', s.addBtnShown > 0 || s.edgeDelBtnShown > 0,
    `＋=${s.addBtnShown} ×=${s.edgeDelBtnShown}`);

  const beforeCopy = s.nodeCount;
  await page.keyboard.press('Meta+c');
  await page.waitForTimeout(300);
  await page.keyboard.press('Meta+v');
  await page.waitForTimeout(450);
  check('drag: 単一選択でも ⌘C → ⌘V', (await snap()).nodeCount === beforeCopy + 1, `${beforeCopy} → ${(await snap()).nodeCount} (期待 +1)`);

  await clickNode(target);
  const beforeDup = (await snap()).nodeCount;
  await page.keyboard.press('Meta+d');
  await page.waitForTimeout(450);
  const afterDup = await snap();
  check('drag: 単一選択でも ⌘D', afterDup.nodeCount > beforeDup, `${beforeDup} → ${afterDup.nodeCount}`);

  await clickNode(target);
  const beforeDel = (await snap()).nodeCount;
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(450);
  const afterDel = await snap();
  check('drag: 単一選択でも ⌫', afterDel.nodeCount < beforeDel, `${beforeDel} → ${afterDel.nodeCount}`);
}

console.log('\nconsole errors:', errors.length ? errors : 'none');
if (errors.length) failures.push(`console errors: ${errors.length}`);
console.log(failures.length ? `\n${failures.length} 件の失敗:\n- ${failures.join('\n- ')}` : '\nALL_OK');
await browser.close();
process.exit(failures.length ? 1 : 0);
