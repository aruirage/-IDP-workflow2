import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// QR 連結読取的判定口径：配置端不判定「写入值数是否等于字段总数」，
// 判定看执行时（Step5 test）每字段的读取标签。
test('PRD 的 QR 判定按 Step5 读取标签，不把写入值数等于字段总数当流程门禁', () => {
  const prd = readFileSync(join(root, 'PRD.zh-CN.md'), 'utf8');

  // 2.6 配置流程以读取标签收尾。
  assert.match(prd, /Step5 test 按字段读取标签验收/);
  // 旧口径不得回归。
  assert.doesNotMatch(prd, /写入值数等于(该模板的)?字段总数/);
  assert.doesNotMatch(prd, /写入值数门禁/);
  assert.doesNotMatch(prd, /写入值数够不够/);
  // 判定依据写明两种标签结果。
  assert.match(prd, /Step5 全为 QR読取/);
  assert.match(prd, /Step5 出现 OCR読取/);
});

test('生成的 PRD 预览与源文件使用同一判定口径', () => {
  const previewPath = join(root, 'prd-public/index.html');
  if (!existsSync(previewPath)) return;
  const preview = readFileSync(previewPath, 'utf8');

  assert.match(preview, /Step5 test 按字段读取标签验收/);
  assert.doesNotMatch(preview, /写入值数等于(该模板的)?字段总数/);
  assert.doesNotMatch(preview, /写入值数门禁/);
});

// 旧口径の「値数门槛」句は削除済み。ソースにも生成プレビューにも戻らないようにする。
test('PRD 与生成的预览都不再出现值数门槛句', () => {
  const sentence = /门槛：写入值数必须等于该模板类型的 QR 仕样值数/;
  const prd = readFileSync(join(root, 'PRD.zh-CN.md'), 'utf8');
  assert.doesNotMatch(prd, sentence);

  const previewPath = join(root, 'prd-public/index.html');
  if (!existsSync(previewPath)) return;
  assert.doesNotMatch(readFileSync(previewPath, 'utf8'), sentence);
});
