import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildAggregateRulePrompt,
  callGlmAggregateRules,
  normalizeAggregateRuleResponse,
} from '../server/aggregate-ai.mjs';

const input = {
  businessScene: '保険金請求',
  mainDocument: {
    docType: '保険金請求書',
    primaryKey: '請求番号',
    fields: ['請求番号', '被保険者氏名'],
  },
  relatedDocuments: [
    { docType: '診断書', fields: ['患者氏名', '生年月日'] },
  ],
  existingRules: [{
    leftDocType: '保険金請求書',
    rightDocType: '診断書',
    group: { relations: [{ leftField: '被保険者氏名', rightField: '患者氏名' }] },
  }],
};

test('builds prompt with current scene documents and output schema', () => {
  const prompt = buildAggregateRulePrompt(input);

  assert.match(prompt, /# 任务[\s\S]*生成覆盖全部账票的案件集约字段关联关系/);
  assert.match(prompt, /<business_scene>\s*保険金請求\s*<\/business_scene>/);
  assert.match(prompt, /"primaryKey":"請求番号"/);
  assert.match(prompt, /"docType":"診断書"/);
  assert.doesNotMatch(prompt, /<existing_rules>/);
  assert.match(prompt, /"rules"/);
});

test('requests both main-related and related-related rule forms', () => {
  const prompt = buildAggregateRulePrompt(input);

  assert.match(prompt, /主账票与关联账票、关联账票之间均可连接/);
  assert.match(prompt, /必须覆盖全部账票/);
  assert.match(prompt, /以主账票为根的单一连通图/);
  assert.match(prompt, /每个账票都必须能直接或间接到达主账票/);
  assert.match(prompt, /输出前从主账票遍历自检/);
  assert.match(prompt, /禁止生成与主账票断开的独立子图/);
  assert.match(prompt, /仅关联同一业务对象的同一属性/);
  assert.match(prompt, /字段名可以不同，但语义必须明确一致/);
  assert.match(prompt, /禁止仅凭名称相近建立关系/);
  assert.match(prompt, /核心字段：请求番号、跨机构个人标识、人物姓名/);
  assert.match(prompt, /辅助字段：出生年月、输入明确标记为同一标准字段的机构名/);
  assert.match(prompt, /辅助字段不能单独建立关系，只能与核心字段组成 AND/);
  assert.match(prompt, /禁止字段：住所、金额、业务日期、长文本说明、诊断\/伤病内容、合同\/保单编号、机构或系统内部编号/);
  assert.match(prompt, /每个 Group 至少包含一条核心关系/);
  assert.match(prompt, /姓名与出生年月在两侧均存在时，优先放入同一 Group/);
  assert.match(prompt, /否则可以仅使用姓名/);
  assert.match(prompt, /不得返回空规则/);
  assert.match(prompt, /不得使用输入中不存在的账票或字段/);
  assert.doesNotMatch(prompt, /主账票配置的主键/);
  assert.doesNotMatch(prompt, /JSON 返回示例/);
  assert.doesNotMatch(prompt, /"warnings"/);
  assert.match(prompt, /组内关系为 AND/);
  assert.doesNotMatch(prompt, /区分度较高/);
  assert.doesNotMatch(prompt, /不设账票对优先级/);
  assert.doesNotMatch(prompt, /优先关联主账票与关联账票/);
  assert.doesNotMatch(prompt, /"reason"/);
});

test('rejects generated rules that do not connect every document to the main document', () => {
  const multiDocumentInput = {
    ...input,
    relatedDocuments: [
      ...input.relatedDocuments,
      { docType: '領収書', fields: ['患者氏名', '金額'] },
    ],
  };
  const response = {
    rules: [{
      leftDocType: '保険金請求書',
      rightDocType: '診断書',
      group: {
        relations: [{ leftField: '被保険者氏名', rightField: '患者氏名' }],
      },
    }],
  };

  assert.throws(
    () => normalizeAggregateRuleResponse(response, multiDocumentInput),
    /すべての帳票を主帳票へ接続できませんでした：領収書/,
  );
});

test('normalizes one generated group into workflow relations', () => {
  const response = {
    rules: [{
      leftDocType: '保険金請求書',
      rightDocType: '診断書',
      group: {
        relations: [{ leftField: '被保険者氏名', rightField: '患者氏名' }],
      },
    }],
  };

  const relations = normalizeAggregateRuleResponse(response, input);

  assert.equal(relations.length, 1);
  assert.equal(relations[0].sourceDocType, '保険金請求書');
  assert.equal(relations[0].targetDocType, '診断書');
  assert.equal(relations[0].sourceField, '被保険者氏名');
  assert.equal(relations[0].targetField, '患者氏名');
  assert.equal('reason' in relations[0], false);
  assert.match(relations[0].conditionGroupId, /^group-ai-/);
});

test('removes address and issuance date relations while retaining birth date', () => {
  const response = {
    rules: [{
      leftDocType: '保険金請求書',
      rightDocType: '診断書',
      group: {
        relations: [
          { leftField: '被保険者氏名', rightField: '患者氏名' },
          { leftField: '登録住所', rightField: '生年月日' },
        ],
      },
    }],
  };

  const relations = normalizeAggregateRuleResponse(response, input);
  assert.equal(relations.length, 1);
  assert.equal(relations[0].sourceField, '被保険者氏名');
});

test('removes institution relation without an explicit standard-field mapping', () => {
  const institutionInput = {
    ...input,
    mainDocument: { ...input.mainDocument, fields: [...input.mainDocument.fields, '医療機関名'] },
    relatedDocuments: [{ docType: '診断書', fields: ['患者氏名', '医療機関名'] }],
  };
  const response = {
    rules: [{
      leftDocType: '保険金請求書',
      rightDocType: '診断書',
      group: {
        relations: [
          { leftField: '被保険者氏名', rightField: '患者氏名' },
          { leftField: '医療機関名', rightField: '医療機関名' },
        ],
      },
    }],
  };

  const relations = normalizeAggregateRuleResponse(response, institutionInput);
  assert.equal(relations.length, 1);
  assert.equal(relations[0].sourceField, '被保険者氏名');
});

test('removes differently named institution fields without a standard-field mapping', () => {
  const institutionInput = {
    ...input,
    mainDocument: { ...input.mainDocument, fields: [...input.mainDocument.fields, '医療機関名'] },
    relatedDocuments: [{ docType: '診断書', fields: ['患者氏名', '診療機関名'] }],
  };
  const response = {
    rules: [{
      leftDocType: '保険金請求書',
      rightDocType: '診断書',
      group: {
        relations: [
          { leftField: '被保険者氏名', rightField: '患者氏名' },
          { leftField: '医療機関名', rightField: '診療機関名' },
        ],
      },
    }],
  };

  const relations = normalizeAggregateRuleResponse(response, institutionInput);
  assert.equal(relations.length, 1);
  assert.equal(relations[0].sourceField, '被保険者氏名');
});

test('removes institution-local identifiers from generated relations', () => {
  const localIdInput = {
    ...input,
    mainDocument: { docType: '診療明細書A', fields: ['患者番号', '患者氏名'] },
    relatedDocuments: [{ docType: '診療明細書B', fields: ['患者番号', '患者氏名'] }],
  };
  const response = {
    rules: [{
      leftDocType: '診療明細書A',
      rightDocType: '診療明細書B',
      group: {
        relations: [
          { leftField: '患者番号', rightField: '患者番号' },
          { leftField: '患者氏名', rightField: '患者氏名' },
        ],
      },
    }],
  };

  const relations = normalizeAggregateRuleResponse(response, localIdInput);
  assert.equal(relations.length, 1);
  assert.equal(relations[0].sourceField, '患者氏名');
});

test('does not accept a policy number as the only core relation', () => {
  const policyInput = {
    ...input,
    mainDocument: { docType: '請求書A', primaryKey: '請求番号', fields: ['証券番号'] },
    relatedDocuments: [{ docType: '請求書B', fields: ['証券番号'] }],
  };
  const response = {
    rules: [{
      leftDocType: '請求書A',
      rightDocType: '請求書B',
      group: { relations: [{ leftField: '証券番号', rightField: '証券番号' }] },
    }],
  };

  assert.throws(
    () => normalizeAggregateRuleResponse(response, policyInput),
    /案件・個人を特定できる関連フィールドがありません/,
  );
});

test('rejects fields that are not in the current document schema', () => {
  const response = {
    rules: [{
      leftDocType: '保険金請求書',
      rightDocType: '診断書',
      group: {
        relations: [{ leftField: '存在しない項目', rightField: '患者氏名' }],
      },
    }],
  };

  assert.throws(
    () => normalizeAggregateRuleResponse(response, input),
    /入力に存在しないフィールド/,
  );
});

test('disables model thinking for rule generation', async () => {
  let requestBody;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return {
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify({
              rules: [{
                leftDocType: '保険金請求書',
                rightDocType: '診断書',
                group: {
                  relations: [{ leftField: '被保険者氏名', rightField: '患者氏名' }],
                },
              }],
            }),
          },
        }],
      }),
    };
  };

  try {
    await callGlmAggregateRules(input, { apiKey: 'test-key' });
    assert.deepEqual(requestBody.thinking, { type: 'disabled' });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
