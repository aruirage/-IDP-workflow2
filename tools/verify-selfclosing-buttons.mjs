// 自闭合 <el-input /> が後続の <el-button> を吞み込んでいた bug の修復確認。
//   - 実機: 既定モジュールに .scene-add-btn が描画されているか
//   - 静的解析: ビルド済み index.html を DOMParser で解釈し、
//     4 つのボタンが el-input の「兄弟」として残っているか（吞み込まれていないか）を確認。
// 使い方: node tools/verify-selfclosing-buttons.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.PREVIEW_URL || 'http://127.0.0.1:4175/';
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1680, height: 1000 } });
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForSelector('#app', { timeout: 10000 });

// 1. 実機: 既定モジュール（案件シーン）の .scene-add-btn が存在するか（以前は live で不在だった）
const liveSceneAdd = await page.evaluate(() => !!document.querySelector('.scene-add-btn'));

// 2. 静的解析: アプリが使うテンプレート = #app.innerHTML（ブラウザ解析済み）。
//    それと同等の構造を再現するため index.html を DOMParser で解釈し、<template> の中も潜る。
const htmlText = fs.readFileSync('public/index.html', 'utf8');
const result = await page.evaluate((html) => {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const find = (sel) => {
    let el = doc.querySelector(sel);
    if (el) return el;
    for (const t of doc.querySelectorAll('template')) {
      el = t.content.querySelector(sel);
      if (el) return el;
    }
    return null;
  };
  const prevIsElInput = (el) => {
    if (!el) return null;
    const prev = el.previousElementSibling;
    return !!prev && prev.tagName.toLowerCase() === 'el-input';
  };
  const sceneAdd = find('.scene-add-btn');
  const typeAdd = find('.fixed-doc-type-add');
  const masterAdd = find('.master-data-add-source');
  // ↻ リフレッシュボタンは class なし → 親 .master-data-search 内の el-button を探す
  let masterRefresh = null;
  for (const t of [doc, ...doc.querySelectorAll('template')]) {
    const wrap = (t.content || t).querySelector('.master-data-search');
    if (wrap) { masterRefresh = wrap.querySelector('el-button'); break; }
  }
  return {
    sceneAddExists: !!sceneAdd,
    sceneAddSibling: prevIsElInput(sceneAdd),
    typeAddExists: !!typeAdd,
    typeAddSibling: prevIsElInput(typeAdd),
    masterAddExists: !!masterAdd,
    masterAddSibling: prevIsElInput(masterAdd),
    masterRefreshExists: !!masterRefresh,
    masterRefreshSibling: masterRefresh
      ? (() => { const prev = masterRefresh.previousElementSibling; return !!prev && prev.tagName.toLowerCase() === 'el-input'; })()
      : null,
  };
}, htmlText);

await browser.close();

const allOk = liveSceneAdd
  && result.sceneAddExists && result.sceneAddSibling
  && result.typeAddExists && result.typeAddSibling
  && result.masterAddExists && result.masterAddSibling
  && result.masterRefreshExists && result.masterRefreshSibling;

console.log('live .scene-add-btn rendered :', liveSceneAdd);
console.log(JSON.stringify(result, null, 2));
console.log(allOk ? 'ALL_OK' : 'FAIL');
process.exit(allOk ? 0 : 1);
