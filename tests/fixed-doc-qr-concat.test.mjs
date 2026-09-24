import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// QR 連結読み取りの仕様（帳票側の実仕様）:
//   QR1 ‖ QR2 ‖ … ‖ QRn → (連結) → payload.split(/[$^]/) → 項目順に写像
// QR 単位で分割してはいけない（項目が QR 境界をまたぐため）。
// 本テストは main.js の定数を実データとして読み出し、上記の規則を再実装して検証する。

const main = await readFile(new URL('../main.js', import.meta.url), 'utf8');

function extractLiteral(name) {
  const re = new RegExp(`const ${name} = (\\{[\\s\\S]*?\\n    \\});`);
  const hit = main.match(re);
  assert.ok(hit, `${name} を main.js から抽出できる`);
  return hit[1];
}

function extractArrayLiteral(name) {
  const re = new RegExp(`const ${name} = \\[([\\s\\S]*?)\\n    \\];`);
  const hit = main.match(re);
  assert.ok(hit, `${name} を main.js から抽出できる`);
  return `[${hit[1]}]`;
}

const PAYLOADS = new Function(`return (${extractLiteral('FIXED_DOC_QR_SAMPLE_PAYLOADS')});`)();
const FIELD_NAMES = new Function(`return (${extractArrayLiteral('FIXED_DOC_QR_FIELD_NAMES')});`)();

const DELIMITERS = ['$', '^'];
const SPLIT = new RegExp(`[${DELIMITERS.map((d) => `\\${d}`).join('')}]`);

/** main.js と同じ規則：QR 番号順 → '$' を含む区画のみ → 連結 → 区切り文字で扁平分割 */
function readQrFields(payloads) {
  const segments = Object.keys(payloads)
    .sort((a, b) => Number(String(a).replace(/\D/g, '')) - Number(String(b).replace(/\D/g, '')))
    .map((key) => payloads[key])
    .filter((segment) => segment.includes('$'));
  const concatenated = segments.join('');
  return { segments, concatenated, values: concatenated.split(SPLIT) };
}

test('QR payload concatenation maps one value per field in field order', () => {
  assert.match(main, /const FIXED_DOC_QR_DELIMITERS = \['\$', '\^'\];/);

  const { segments, concatenated, values } = readQrFields(PAYLOADS);

  // データ QR は '$' を含む区画のみ。ID 系（受理 ID・アップロード ID）は除外される。
  assert.equal(Object.keys(PAYLOADS).length, 6, 'サンプルは QR1〜QR6');
  assert.equal(segments.length, 6, '6 区画すべてがデータ QR として採用される');
  assert.ok(
    Object.values(PAYLOADS).every((segment) => segment.includes('$')),
    'サンプルに ID 系区画は含まれない',
  );

  // 連結してから分割するため、値の個数は項目数と一致する（= 行番号がそのまま項目順）。
  assert.equal(concatenated.length, 701, '連結後は 701 文字');
  assert.equal(FIELD_NAMES.length, 407, 'A01 様式の項目数は 407');
  assert.equal(values.length, 407, '連結 → 分割で 407 値（項目数と一致）');

  // '$' は主区切り、'^' は 3 番目の '$' 区画内の副区切り（templateID^patientName）。
  assert.equal(values[2], 'LIAJ045-A01-202104');
  assert.equal(values[3], '安達　珠美');
  assert.equal(concatenated.split('$').filter((token) => token.includes('^')).length, 1);
  assert.equal(values[0], '040c1');
  assert.equal(values.at(-1), '外科');
});

test('fields straddling a QR boundary resolve only after concatenation', () => {
  const { segments, values } = readQrFields(PAYLOADS);

  // 各 QR 境界（前の区画までの文字数）が、連結後のどの値に入るかを求める。
  const boundaries = [];
  let offset = 0;
  for (const segment of segments.slice(0, -1)) {
    offset += segment.length;
    let cursor = 0;
    for (let index = 0; index < values.length; index += 1) {
      const end = cursor + values[index].length;
      if (offset > cursor && offset <= end) {
        boundaries.push({ offset, index, value: values[index] });
        break;
      }
      cursor = end + 1;
    }
  }
  // 境界が区切り文字の直後に重なる場合はまたぎ無しなので、値に落ちた境界のみ拾う。
  assert.ok(boundaries.length >= 3, `QR 境界をまたぐ値が 3 件以上検出できる（検出: ${boundaries.length}）`);

  // 境界をまたぐ値は「QR 単体の分割結果」には完全形で現れない＝連結が必須。
  const perQrTokens = new Set(segments.flatMap((segment) => segment.split(SPLIT)));
  const straddling = boundaries.filter((item) => item.value && !perQrTokens.has(item.value));
  assert.ok(
    straddling.length >= 2,
    `QR 境界をまたぐ値が 2 件以上ある（検出: ${straddling.map((s) => s.value).join(', ')}）`,
  );
  assert.ok(
    straddling.some((item) => item.value === '便潜血陽性'),
    'QR2→QR3 境界の「便潜血陽性」は連結後のみ得られる',
  );
  assert.ok(
    straddling.some((item) => item.value === '上行結腸腫瘍'),
    'QR4→QR5 境界の「上行結腸腫瘍」は連結後のみ得られる',
  );

  // 禁止されている QR 単位分割では値の個数も項目数に一致しない。
  const perQrValues = segments.flatMap((segment) => segment.split(SPLIT));
  assert.notEqual(perQrValues.length, values.length, 'QR 単位分割は誤った値数を生む');
});
