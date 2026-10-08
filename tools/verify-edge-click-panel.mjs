// 验证：连线点击 → 打开「接続設定」面板；范围选择模式下的连线点击不再误触发框选；
//       右键菜单不显示快捷键；只选中「開始」时删除给出日文提示。
import { chromium } from 'playwright';

const BASE = process.env.PREVIEW_URL || 'http://127.0.0.1:4175/';
const SETUP = `(() => {
  const app = document.querySelector('#app')?.__vue_app__;
  return app?._container?._vnode?.component?.setupState || null;
})()`;

const STATE = `(() => {
  const s = ${SETUP};
  return {
    selMode: s.wfSelectionMode,
    selectedIds: [...(s.wfSelectedNodeIds || [])],
    inspectorMode: s.inspectorMode,
    collapsed: s.inspectorPanelCollapsed,
    edgeKey: s.selectedWorkflowEdgeKey,
    nodeId: s.selectedWorkflowNodeId,
    title: document.querySelector('.idp-inspector-title')?.textContent.trim() || null,
    edgeSection: !!document.querySelector('.inspector-edge-summary'),
    edgeSummary: document.querySelector('.inspector-edge-summary')?.textContent.trim() || null,
    toast: document.querySelector('.el-message')?.textContent.trim() || null,
  };
})()`;

const fails = [];
const check = (name, cond, detail) => {
  if (!cond) fails.push(`${name} :: ${JSON.stringify(detail)}`);
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${cond ? '' : ` :: ${JSON.stringify(detail)}`}`);
};

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1680, height: 1000 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(900);
await page.evaluate(`(() => { const s = ${SETUP}; s.currentModule = 'case-workflow'; s.workflowSetupStep = 2; })()`);
await page.waitForTimeout(800);

// 取一条「視口内、且中点未被节点遮挡」的连线的屏幕坐标
const pick = await page.evaluate(`(() => {
  const vp = document.querySelector('.idp-canvas-viewport').getBoundingClientRect();
  const inView = (x, y) => x > vp.left + 20 && x < vp.right - 20 && y > vp.top + 20 && y < vp.bottom - 20;
  for (const el of document.querySelectorAll('.idp-edge-hit')) {
    const len = el.getTotalLength(), ctm = el.getScreenCTM();
    for (const t of [0.5, 0.4, 0.6, 0.3, 0.7]) {
      const p = el.getPointAtLength(len * t).matrixTransform(ctm);
      if (!inView(p.x, p.y)) continue;
      if (document.elementFromPoint(p.x, p.y) === el) return { x: p.x, y: p.y, t };
    }
  }
  return null;
})()`);
console.log('选中连线点:', JSON.stringify(pick));
check('存在可点的连线中点', !!pick, pick);

// ===== 1. 非选择模式：先选中一个节点（面板打开），再点连线 =====
await page.evaluate(`(() => { const s = ${SETUP}; s.wfSelectedNodeIds.clear(); s.wfSelectionMode = false; })()`);
await page.waitForTimeout(200);
const nodes = await page.evaluate(`[...document.querySelectorAll('.wf-node-shell[data-node-id]')].map((el) => {
  const r = el.getBoundingClientRect();
  return { id: el.dataset.nodeId, x: Math.round(r.x + r.width / 2), y: Math.round(r.y + 22) };
})`);
const target = nodes.find((n) => n.id !== 'wf-start') || nodes[0];
await page.mouse.click(target.x, target.y);
await page.waitForTimeout(400);
const nodeState = await page.evaluate(STATE);
console.log('点节点后:', JSON.stringify(nodeState));
check('点节点 → 面板打开且为节点模式', nodeState.collapsed === false && nodeState.inspectorMode === 'node', nodeState);

// mousedown 在连线上：不应关闭面板
await page.mouse.move(pick.x, pick.y);
await page.mouse.down();
await page.waitForTimeout(150);
const during = await page.evaluate(STATE);
console.log('连线 mousedown 中:', JSON.stringify(during));
check('连线按下时面板不被关闭（不再误判为空白点击）', during.collapsed === false, during);
await page.mouse.up();
await page.waitForTimeout(450);
const afterEdge = await page.evaluate(STATE);
console.log('点连线后:', JSON.stringify(afterEdge));
check('点连线 → 面板切到「接続設定」', afterEdge.inspectorMode === 'edge' && afterEdge.title === '接続設定', afterEdge);
check('点连线 → 连接信息区出现', afterEdge.edgeSection === true, afterEdge.edgeSummary);
check('点连线 → 节点选中被清空', afterEdge.nodeId === null, afterEdge.nodeId);

// ===== 2. 选择模式下点连线：不应触发范围选择 =====
await page.evaluate(`(() => { const s = ${SETUP}; s.wfSelectedNodeIds.clear(); })()`);
await page.click('.wf-canvas-select-tool');
await page.waitForTimeout(300);
check('选择模式已开启', await page.evaluate(`(${SETUP}).wfSelectionMode`) === true, null);
const pick2 = await page.evaluate(`(() => {
  for (const el of document.querySelectorAll('.idp-edge-hit')) {
    const len = el.getTotalLength(), ctm = el.getScreenCTM();
    for (const t of [0.5, 0.4, 0.6, 0.3, 0.7]) {
      const p = el.getPointAtLength(len * t).matrixTransform(ctm);
      if (document.elementFromPoint(p.x, p.y) === el) return { x: p.x, y: p.y };
    }
  }
  return null;
})()`);

// 2a. 選択モードでも、線を「クリック」したら接続パネルが開く
await page.mouse.click(pick2.x, pick2.y);
await page.waitForTimeout(450);
const clickState = await page.evaluate(STATE);
console.log('选择模式下单击连线:', JSON.stringify(clickState));
check('选择模式下单击连线 → 打开「接続設定」', clickState.inspectorMode === 'edge' && clickState.title === '接続設定', clickState);
check('选择模式下单击连线 → 不产生范围选择', clickState.selectedIds.length === 0, clickState.selectedIds);

// 2b. 選択モードで線の上から「ドラッグ」したら範囲選択が始まる（選択モードの本来の役割）
await page.evaluate(`(() => { const s = ${SETUP}; s.wfSelectedNodeIds.clear(); })()`);
await page.mouse.move(pick2.x, pick2.y);
await page.mouse.down();
await page.mouse.move(pick2.x + 40, pick2.y + 30, { steps: 5 });
await page.waitForTimeout(120);
const marqueeActive = await page.evaluate(`!!document.querySelector('.wf-selection-marquee')`);
await page.mouse.up();
await page.waitForTimeout(400);
console.log('选择模式下从连线拖动: marquee =', marqueeActive);
check('选择模式下从连线开始拖动 → 启动范围选择', marqueeActive === true, { marqueeActive });

// ===== 3. 右键菜单文案（无快捷键） =====
await page.click('.wf-canvas-select-tool');
await page.waitForTimeout(250);
await page.mouse.click(target.x, target.y, { button: 'right' });
await page.waitForTimeout(350);
const menu = await page.evaluate(`(() => {
  const m = document.querySelector('.wf-canvas-context-menu');
  return { visible: !!m, items: [...(m?.querySelectorAll('.wf-canvas-context-menu-item') || [])].map((b) => b.textContent.trim()) };
})()`);
console.log('右键菜单:', JSON.stringify(menu));
check('右键菜单可见', menu.visible === true, menu);
check('菜单项为「複製」「削除」且不含快捷键', JSON.stringify(menu.items) === JSON.stringify(['複製', '削除']), menu.items);

// ===== 4. 只选中「開始」时删除 → 日文提示 =====
await page.keyboard.press('Escape');
await page.evaluate(`(() => { const s = ${SETUP}; s.wfSelectedNodeIds.clear(); s.wfSelectedNodeIds.add('wf-start'); })()`);
await page.waitForTimeout(250);
const startNode = nodes.find((n) => n.id === 'wf-start');
await page.mouse.click(startNode.x, startNode.y, { button: 'right' });
await page.waitForTimeout(350);
const items = await page.$$('.wf-canvas-context-menu-item');
await items[items.length - 1].click();
await page.waitForTimeout(500);
const delState = await page.evaluate(STATE);
const nodeCount = await page.evaluate(`document.querySelectorAll('.wf-node-shell[data-node-id]').length`);
console.log('只选中開始后删除:', JSON.stringify(delState), 'nodes =', nodeCount);
check('開始 不可删 → 给出日文提示', /開始ノードは削除できません。/.test(delState.toast || ''), delState.toast);
check('開始 节点仍在', nodeCount === 13, nodeCount);

console.log('\nconsole errors:', errors.length ? errors : 'none');
console.log(fails.length ? `\n${fails.length} 件 FAIL:\n${fails.join('\n')}` : '\nすべて PASS');
await browser.close();
process.exit(fails.length || errors.length ? 1 : 0);
