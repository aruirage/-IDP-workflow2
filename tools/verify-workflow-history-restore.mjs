// 変更履歴からの復元を実機で検証する。
//   1. 位置・構造だけでなく「ノード設定」も復元される
//      （ここが壊れると「履歴をクリックしても何も戻らない」に見える）
//   2. ポップオーバーの項目クリックでも同じように戻る
//   3. 復元後はインスペクタの表示も復元後の値になる
// 使い方: node tools/verify-workflow-history-restore.mjs
import { chromium } from 'playwright';

const BASE = process.env.PREVIEW_URL || 'http://127.0.0.1:4175/';
const NODE_ID = 'wf-d-pre';   // 条件分岐（設定を持つノード）
const FIELD = 'conditionType';

const SETUP = `(() => {
  const app = document.querySelector('#app')?.__vue_app__;
  return app?._container?._vnode?.component?.setupState || null;
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

// 外部フォントは検証に不要。環境によっては Chrome 側で応答が返らず networkidle が
// 永久に来なくなり goto がタイムアウトする。先に遮断しておく。
await page.route(/fonts\.googleapis\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await page.evaluate(`(${SETUP}).workflowSetupStep = 2`);
await page.waitForTimeout(800);
await page.click('.wf-canvas-tool-btn[title="整列して全体表示"]');
await page.waitForTimeout(400);

const live = () => page.evaluate(`(() => {
  const s = ${SETUP};
  const n = (s.activeWorkflow.nodes || []).find((x) => x.id === '${NODE_ID}');
  if (!n) return null;
  return { field: n['${FIELD}'], x: Math.round(n.x), y: Math.round(n.y), label: n.label };
})()`);
const snapshotOf = (label) => page.evaluate(`(() => {
  const s = ${SETUP};
  const e = s.workflowHistoryEntries.find((x) => x.label === '${label}');
  const n = e?.workflow?.nodes?.find((x) => x.id === '${NODE_ID}');
  return n ? { field: n['${FIELD}'], x: Math.round(n.x), y: Math.round(n.y), label: n.label } : null;
})()`);
const entries = () => page.evaluate(`(${SETUP}).workflowHistoryEntries.map((e) => ({ i: e.index, l: e.label }))`);
// スナップショットと現在のワークフローを全フィールド比較して差分を文字列で返す。
// 「初期状態」のスナップショットは normalize 前に取られるため、読み込み直後から
// 1〜2 件の無害な差（start ノードの trigger など）が出ることがある。
// そこで「読み込み直後の差」をベースラインとして取り、復元後に差が増えていないかを見る。
const deepDiff = () => page.evaluate(`(() => {
  const s = ${SETUP};
  const e = s.workflowHistoryEntries.find((x) => x.label === '初期状態');
  const snap = e.workflow;
  const live = s.activeWorkflow;
  const out = [];
  if (snap.nodes.length !== live.nodes.length) out.push('ノード数 ' + live.nodes.length + ' / 期待 ' + snap.nodes.length);
  if ((snap.edges || []).length !== (live.edges || []).length) out.push('エッジ数 ' + (live.edges || []).length + ' / 期待 ' + (snap.edges || []).length);
  for (const sn of snap.nodes) {
    const ln = live.nodes.find((n) => n.id === sn.id);
    if (!ln) { out.push(sn.id + ' : ノードが無い'); continue; }
    for (const k of Object.keys(sn)) {
      const a = JSON.stringify(sn[k]);
      const b = JSON.stringify(ln[k]);
      if (a !== b) out.push(sn.id + '.' + k + ' >> live=' + b + ' || 期待=' + a);
    }
  }
  return out.sort();
})()`);
const setField = (v) => page.evaluate(`(() => { const s = ${SETUP}; const n = s.activeWorkflow.nodes.find((x) => x.id === '${NODE_ID}'); n['${FIELD}'] = ${JSON.stringify(v)}; })()`);
const dragNode = async () => {
  const p = await page.evaluate(`(() => { const b = document.querySelector('.wf-node-shell[data-node-id="${NODE_ID}"]').getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; })()`);
  await page.mouse.move(p.x + p.w / 2, p.y + p.h / 2);
  await page.mouse.down();
  await page.mouse.move(p.x + p.w / 2 + 120, p.y + p.h / 2 + 80, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(450);
};

const base = await snapshotOf('初期状態');
check('初期状態スナップショットを取得', !!base, JSON.stringify(base));
const baselineDiff = await deepDiff();
console.log(`     （読み込み直後のベースライン差分 ${baselineDiff.length} 件${baselineDiff.length ? ': ' + baselineDiff.join(' | ') : ''}）`);

// --- 1. 設定も復元される（関数を直接呼ぶ経路）---
await setField('ZZZ_MARK');
await dragNode();                       // ここで履歴が 1 件積まれる（スナップショットには ZZZ_MARK）
await setField('YYY_LIVE');
const beforeRestore = await live();
check('復元前は設定が書き換わっている', beforeRestore.field === 'YYY_LIVE', JSON.stringify(beforeRestore));

const zero = (await entries()).find((e) => e.l === '初期状態');
await page.evaluate(`(${SETUP}).restoreWorkflowHistoryEntry(${zero.i})`);
await page.waitForTimeout(600);

const after = await live();
check('復元でノード設定も戻る', after.field === base.field, `設定 ${after.field} / 期待 ${base.field}`);
check('復元で位置も戻る', after.x === base.x && after.y === base.y, `位置 ${after.x},${after.y} / 期待 ${base.x},${base.y}`);

// --- 2. ポップオーバーの項目クリックでも戻る ---
await setField('ZZZ2_MARK');
await dragNode();
await setField('YYY2_LIVE');
await page.click('.wf-canvas-tool-btn[title="変更履歴"]');
await page.waitForTimeout(400);
const items = await page.$$eval('.wf-history-item', (els) => els.map((el) => el.textContent.replace(/\s+/g, ' ').trim()));
check('ポップオーバーが開く', items.length >= 2, JSON.stringify(items));
const oldest = items.length - 1;
await page.click(`.wf-history-item >> nth=${oldest}`);
await page.waitForTimeout(600);
const afterClick = await live();
check('項目クリックでノード設定が戻る', afterClick.field === base.field, `設定 ${afterClick.field} / 期待 ${base.field}`);
check('項目クリックで位置も戻る', afterClick.x === base.x && afterClick.y === base.y, `位置 ${afterClick.x},${afterClick.y} / 期待 ${base.x},${base.y}`);
check('項目クリックでポップオーバーが閉じる', !(await page.evaluate(`(${SETUP}).wfChangeHistoryVisible`)));
check('現在位置（履歴インデックス）が更新される',
  (await page.evaluate(`(${SETUP}).wfHistoryIndex`)) === zero.i,
  `index=${await page.evaluate(`(${SETUP}).wfHistoryIndex`)} / 期待 ${zero.i}`);

// --- 4. 復元後はスナップショットと完全に一致している（全ノード・全フィールド・全エッジ）---
//     ここは「ノードを選択してインスペクタを開く」より前に測る。選択すると
//     applyDecisionConditionDefaultValues が条件値を書き換えるため、比較が濁る。
{
  const afterDiff = await deepDiff();
  const newDiffs = afterDiff.filter((d) => !baselineDiff.includes(d));
  check('復元結果がスナップショットと完全一致（ベースライン差を除く）', newDiffs.length === 0,
    newDiffs.length ? `${newDiffs.length} 件の新しい差分 → ${newDiffs.slice(0, 6).join(' | ')}` : '全ノード・全フィールド一致');
}

// --- 3. 復元後にインスペクタを開くと復元後の値が見えている ---
await page.evaluate(`(${SETUP}).wfSelectionMode = false`);
await page.waitForTimeout(150);
const p = await page.evaluate(`(() => { const b = document.querySelector('.wf-node-shell[data-node-id="${NODE_ID}"]').getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; })()`);
await page.mouse.click(p.x + p.w / 2, p.y + p.h / 2);
await page.waitForTimeout(500);
const shown = await page.evaluate(`(() => {
  const s = ${SETUP};
  const node = s.selectedWorkflowNode;
  return node ? { id: node.id, field: node['${FIELD}'] } : null;
})()`);
check('インスペクタが復元後のノードを指している', shown?.id === NODE_ID && shown?.field === base.field, JSON.stringify(shown));

console.log('\nconsole errors:', errors.length ? errors : 'none');
if (errors.length) failures.push(`console errors: ${errors.length}`);
console.log(failures.length ? `\n${failures.length} 件の失敗:\n- ${failures.join('\n- ')}` : '\nALL_OK');
await browser.close();
process.exit(failures.length ? 1 : 0);
