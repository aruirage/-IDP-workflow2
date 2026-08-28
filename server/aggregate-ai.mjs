const OUTPUT_SCHEMA = {
  rules: [{
    leftDocType: 'string',
    rightDocType: 'string',
    group: {
      relations: [{ leftField: 'string', rightField: 'string' }],
    },
  }],
};

const EXCLUDED_RELATION_FIELD_PATTERN = /(住所|所在地|発行日|記入日|請求日|証明年月日|作成日|届出日)/;
const LOCAL_IDENTIFIER_FIELD_PATTERN = /(患者番号|カルテ番号|明細管理番号|収納管理番号|医療機関番号)/;
const INSTITUTION_FIELD_PATTERN = /(医療機関|診療機関|病院|薬局)/;

function isExcludedRelationField(field) {
  const value = String(field || '');
  return LOCAL_IDENTIFIER_FIELD_PATTERN.test(value)
    || (EXCLUDED_RELATION_FIELD_PATTERN.test(value) && !value.includes('生年月日'));
}

function getCoreFieldType(field) {
  const value = String(field || '');
  if (/請求番号/.test(value)) return 'case-id';
  if (/(個人番号|住民コード)/.test(value)) return 'person-id';
  if (!/生年月日/.test(value) && /(氏名|被保険者|患者名|受取人|世帯主)/.test(value)) return 'person-name';
  return '';
}

function isCoreRelation(relation) {
  const leftType = getCoreFieldType(relation?.leftField);
  return !!leftType && leftType === getCoreFieldType(relation?.rightField);
}

function findFallbackCoreRelation(leftFields, rightFields) {
  for (const type of ['case-id', 'person-id', 'person-name']) {
    const leftField = [...leftFields].find((field) => getCoreFieldType(field) === type);
    const rightField = [...rightFields].find((field) => getCoreFieldType(field) === type);
    if (leftField && rightField) return { leftField, rightField };
  }
  return null;
}

function usesInstitutionField(relation) {
  return INSTITUTION_FIELD_PATTERN.test(String(relation?.leftField || ''))
    || INSTITUTION_FIELD_PATTERN.test(String(relation?.rightField || ''));
}

export function buildAggregateRulePrompt(input) {
  return `# 角色
你是案件集约关联规则生成 AI。

# 任务
根据业务场景、主账票、关联账票及其抽出字段，生成覆盖全部账票的案件集约字段关联关系。

# 规则
- 仅使用输入字段，生成以主账票为根的单一连通图；每个账票都必须能直接或间接到达主账票。
- 输出前从主账票遍历自检；账票仅参与某条关系不代表已连通，禁止生成与主账票断开的独立子图。
- 主账票与关联账票、关联账票之间均可连接。
- 每个账票对只生成一个 Group，组内关系为 AND，关系不得重复。
- 仅关联同一业务对象的同一属性。
- 字段名可以不同，但语义必须明确一致；禁止仅凭名称相近建立关系。
- 核心字段：请求番号、跨机构个人标识、人物姓名。
- 每个 Group 至少包含一条核心关系。
- 辅助字段：出生年月、输入明确标记为同一标准字段的机构名。
- 辅助字段不能单独建立关系，只能与核心字段组成 AND。
- 禁止字段：住所、金额、业务日期、长文本说明、诊断/伤病内容、合同/保单编号、机构或系统内部编号。
- 姓名与出生年月在两侧均存在时，优先放入同一 Group；否则可以仅使用姓名。
- 必须覆盖全部账票，不得返回空规则。
- 不得使用输入中不存在的账票或字段。

# 输入

<business_scene>
${input.businessScene || ''}
</business_scene>

<main_document>
${JSON.stringify(input.mainDocument || {})}
</main_document>

<related_documents>
${JSON.stringify(input.relatedDocuments || [])}
</related_documents>

<output_schema>
${JSON.stringify(OUTPUT_SCHEMA)}
</output_schema>

# 输出
仅输出符合 output_schema 的合法 JSON。
账票名和字段名必须与输入完全一致。
禁止输出 Markdown、注释、解释及 JSON 之外的文本。`;
}

export function parseAggregateRuleModelText(text) {
  const raw = String(text || '').trim();
  if (!raw) throw new Error('AIから空の応答が返されました');
  const normalized = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(normalized);
  } catch {
    throw new Error('AIの応答をJSONとして解析できませんでした');
  }
}

export function normalizeAggregateRuleResponse(response, input) {
  if (!response || !Array.isArray(response.rules)) {
    throw new Error('AIの応答にrulesがありません');
  }
  const documents = [input.mainDocument, ...(input.relatedDocuments || [])].filter(Boolean);
  const fieldsByDoc = new Map(documents.map((doc) => [doc.docType, new Set(doc.fields || [])]));
  const pairKeys = new Set();
  const relations = [];

  response.rules.forEach((rule, ruleIndex) => {
    const leftDocType = rule?.leftDocType;
    const rightDocType = rule?.rightDocType;
    if (!fieldsByDoc.has(leftDocType) || !fieldsByDoc.has(rightDocType) || leftDocType === rightDocType) {
      throw new Error('入力に存在しない帳票タイプが返されました');
    }
    const pairKey = [leftDocType, rightDocType].sort().join('|');
    if (pairKeys.has(pairKey)) throw new Error('同じ帳票ペアが複数返されました');
    pairKeys.add(pairKey);
    const rawGroupRelations = rule?.group?.relations;
    let groupRelations = Array.isArray(rawGroupRelations)
      ? rawGroupRelations.filter((relation) => (
        !isExcludedRelationField(relation?.leftField)
        && !isExcludedRelationField(relation?.rightField)
      ))
      : rawGroupRelations;
    if (!Array.isArray(groupRelations)) {
      throw new Error('関連フィールドが設定されていないGroupがあります');
    }
    if (!groupRelations.some(isCoreRelation)) {
      const fallback = findFallbackCoreRelation(fieldsByDoc.get(leftDocType), fieldsByDoc.get(rightDocType));
      if (fallback) groupRelations = [fallback, ...groupRelations];
    }
    const hasCoreRelation = groupRelations.some(isCoreRelation);
    if (!hasCoreRelation) {
      throw new Error('案件・個人を特定できる関連フィールドがありません');
    }
    const acceptedGroupRelations = groupRelations.filter((relation) => !usesInstitutionField(relation));
    if (!acceptedGroupRelations.length) {
      throw new Error('医療機関名のみのGroupは使用できません');
    }
    const conditionGroupId = `group-ai-${ruleIndex + 1}-${Date.now()}`;
    acceptedGroupRelations.forEach((relation, relationIndex) => {
      if (!fieldsByDoc.get(leftDocType).has(relation?.leftField)
        || !fieldsByDoc.get(rightDocType).has(relation?.rightField)) {
        throw new Error('入力に存在しないフィールドが返されました');
      }
      relations.push({
        id: `link-ai-${ruleIndex + 1}-${relationIndex + 1}-${Date.now()}`,
        sourceDocType: leftDocType,
        sourceField: relation.leftField,
        targetDocType: rightDocType,
        targetField: relation.rightField,
        conditionGroupId,
        groupOperator: 'or',
      });
    });
  });

  const mainDocType = input.mainDocument?.docType;
  const adjacency = new Map(documents.map((doc) => [doc.docType, new Set()]));
  relations.forEach((relation) => {
    adjacency.get(relation.sourceDocType)?.add(relation.targetDocType);
    adjacency.get(relation.targetDocType)?.add(relation.sourceDocType);
  });
  const reachable = new Set(mainDocType ? [mainDocType] : []);
  const queue = [...reachable];
  while (queue.length) {
    const current = queue.shift();
    adjacency.get(current)?.forEach((next) => {
      if (reachable.has(next)) return;
      reachable.add(next);
      queue.push(next);
    });
  }
  const unreachable = documents
    .map((doc) => doc.docType)
    .filter((docType) => !reachable.has(docType));
  if (unreachable.length) {
    throw new Error(`すべての帳票を主帳票へ接続できませんでした：${unreachable.join('、')}`);
  }

  return relations;
}

export async function callGlmAggregateRules(input, options = {}) {
  const apiKey = options.apiKey || process.env.ZHIPU_API_KEY;
  if (!apiKey) throw new Error('ZHIPU_API_KEYが設定されていません');
  const baseUrl = options.baseUrl || process.env.ZHIPU_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4';
  const model = options.model || process.env.GLM_MODEL || 'glm-5.2';
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: buildAggregateRulePrompt(input) }],
      temperature: 0.1,
      thinking: { type: 'disabled' },
      response_format: { type: 'json_object' },
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body?.error?.message || `GLM API error (${response.status})`);
  }
  const content = body?.choices?.[0]?.message?.content;
  return normalizeAggregateRuleResponse(parseAggregateRuleModelText(content), input);
}
