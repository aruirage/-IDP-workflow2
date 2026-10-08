import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const readFigures = () => JSON.parse(readFileSync(join(root, 'tools', 'prd-figures.json'), 'utf8'));
const allFigures = (config) => [
  ...Object.values(config.sections || {}),
  ...Object.values(config.anchors || {}),
].flat();

const figureFiles = allFigures(readFigures()).map((item) => item.file);

// 登记了却没拍出来（或取图脚本被改名）会导致 PRD 图静默丢失，这里守住。
test('图目录登记的每张 PRD 截图都存在于 assets/prd-screenshots/', () => {
  const dir = join(root, 'assets', 'prd-screenshots');
  const missing = figureFiles.filter((file) => !existsSync(join(dir, file)));
  assert.deepEqual(missing, [], `missing screenshots: ${missing.join(', ')}`);
});

test('複数 QR 読取 条同时登记 OFF / ON / 扫描中三态', () => {
  const anchor = readFigures().anchors?.['liaj-診断書-qr-連結読取'] || [];
  const files = anchor.map((item) => item.file);
  for (const file of [
    'fixed-doc-step2-qr-off.png',
    'fixed-doc-step2-qr.png',
    'fixed-doc-step2-qr-scanning.png',
  ]) {
    assert.ok(files.includes(file), `${file} not registered under liaj-診断書-qr-連結読取`);
  }
});

test('取图脚本仍会产出条内各状态截图', () => {
  const script = readFileSync(join(root, 'tools', 'capture-prd-screenshots.mjs'), 'utf8');
  const shots = [...script.matchAll(/file:\s*'([^']+\.png)'/g)].map((match) => match[1]);
  for (const file of ['fixed-doc-step2-qr-off.png', 'fixed-doc-step2-qr-scanning.png']) {
    assert.ok(shots.includes(file), `${file} not captured by capture-prd-screenshots.mjs`);
  }
});

test('生成的 PRD 预览引用每张登记截图', () => {
  const previewPath = join(root, 'prd-public', 'index.html');
  if (!existsSync(previewPath)) return;
  const preview = readFileSync(previewPath, 'utf8');
  const missing = figureFiles.filter((file) => !preview.includes(`assets/${file}`));
  assert.deepEqual(missing, [], `not referenced in prd-public/index.html: ${missing.join(', ')}`);
});

// anchor key 与 #### 标题的 slug 对不上时，图不会报错，只会静默消失。
// 例：标题「範囲選択モード」曾在 slug 里被吃掉 モード（当时只保留汉字，丢片假名），
// 结果 prd-figures.json 的 key 永远匹配不上。
test('图目录的每个 anchor key 都能命中生成的 PRD 小节 id', () => {
  const previewPath = join(root, 'prd-public', 'index.html');
  if (!existsSync(previewPath)) return;
  const preview = readFileSync(previewPath, 'utf8');
  const keys = Object.keys(readFigures().anchors || {});
  const missing = keys.filter((key) => !preview.includes(`id="fig-${key}"`));
  assert.deepEqual(missing, [], `anchor key 与标题 slug 不一致（图会静默丢失）: ${missing.join(', ')}`);
});
