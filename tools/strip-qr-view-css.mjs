// QR 設定ビュー撤去に伴い、参照されなくなった CSS セレクタを style.css から除去する。
// セレクタリストを分解し、死んだセレクタだけを落とす（生きたセレクタが同居するブロックは保持）。
// 使い方: node tools/strip-qr-view-css.mjs
import fs from 'node:fs';

const FILE = new URL('../style.css', import.meta.url);
const lines = fs.readFileSync(FILE, 'utf8').split('\n');

// QR 設定ビュー専用のクラス名（index.html / main.js / scripts から参照ゼロを確認済み）
// 'fixed-doc-qr-' と 'fixed-doc-table-qr-' は前方一致で全クラスを対象にする。
const DEAD = [
  'fixed-doc-qr-',
  'fixed-doc-table-qr-',
  'fixed-doc-table--qr-read',
  'fixed-doc-table--table-qr',
  'fixed-doc-read-mode-switch',
  'fixed-doc-read-mode-bar',
  'fixed-doc-read-body--qr',
  'fixed-doc-type-readonly',
  'fixed-doc-test-source-label',
  'fixed-doc-preview-hotspot',
  'fixed-doc-preview-region-draft',
];
const isDead = (sel) => DEAD.some((token) => sel.includes(token));

// セレクタリストをトップレベルのカンマで分割
function splitSelectors(text) {
  const out = [];
  let buf = '';
  let depth = 0;
  for (const ch of text) {
    if (ch === '(' || ch === '[') depth += 1;
    if (ch === ')' || ch === ']') depth -= 1;
    if (ch === ',' && depth === 0) {
      out.push(buf);
      buf = '';
      continue;
    }
    buf += ch;
  }
  out.push(buf);
  return out;
}

const out = [];
let i = 0;
let removedSelectors = 0;
let removedBlocks = 0;

while (i < lines.length) {
  const line = lines[i];
  const trimmed = line.trim();

  // 空行・コメントはそのまま通す
  if (!trimmed || trimmed.startsWith('/*') || trimmed.startsWith('//')) {
    out.push(line);
    i += 1;
    continue;
  }

  // @media などの at-rule は中身に死セレクタが無いことを確認済みなので、ブロックごと素通しする
  if (trimmed.startsWith('@')) {
    if (!trimmed.includes('{')) {
      out.push(line);
      i += 1;
      continue;
    }
    let depth = 0;
    while (i < lines.length) {
      const cur = lines[i];
      depth += (cur.match(/{/g) || []).length - (cur.match(/}/g) || []).length;
      out.push(cur);
      i += 1;
      if (depth === 0) break;
    }
    continue;
  }

  // ブロック開始：最初の '{' を見つけてから、深さが 0 に戻るまでが 1 ブロック
  const start = i;
  let depth = 0;
  let seenBrace = false;
  const headerParts = [];
  while (i < lines.length) {
    const cur = lines[i];
    if (!seenBrace) headerParts.push(cur);
    const opens = (cur.match(/{/g) || []).length;
    depth += opens - (cur.match(/}/g) || []).length;
    if (!seenBrace && opens > 0) seenBrace = true;
    i += 1;
    if (seenBrace && depth === 0) break;
  }
  const block = lines.slice(start, i);

  // セレクタ部分を取り出して選別
  const headerText = headerParts.join('\n');
  const braceIdx = headerText.lastIndexOf('{');
  if (braceIdx < 0) {
    out.push(...block);
    continue;
  }
  const selectorText = headerText.slice(0, braceIdx);
  const selectors = splitSelectors(selectorText);
  const kept = selectors.filter((sel) => !isDead(sel));

  if (kept.length === selectors.length) {
    out.push(...block);
    continue;
  }
  removedSelectors += selectors.length - kept.length;

  if (kept.length === 0) {
    removedBlocks += 1;
    continue;
  }

  // 先頭セレクタのインデントを引き継いで再構成
  const indentMatch = selectorText.match(/\n([ \t]*)\S/);
  const indent = indentMatch ? indentMatch[1] : '';
  const rebuilt = kept.map((sel) => sel.trim()).join(`,\n${indent}`);
  const firstLineIndent = selectorText.match(/^[ \t]*/)[0];
  // ヘッダ側の '{' 以降（1 行ルールでは本体も同居）をそのまま残す
  const restOfHeader = headerText.slice(braceIdx);
  out.push(`${firstLineIndent}${rebuilt} ${restOfHeader}`);
  out.push(...block.slice(headerParts.length));
}

fs.writeFileSync(FILE, out.join('\n'));
console.log(`removed selectors: ${removedSelectors}, whole blocks: ${removedBlocks}`);
console.log(`style.css lines: ${lines.length} -> ${out.length}`);
