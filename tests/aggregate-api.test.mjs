import test from 'node:test';
import assert from 'node:assert/strict';

import { handleAggregateRuleRequest } from '../server/aggregate-api.mjs';

const input = {
  businessScene: '保険金請求',
  mainDocument: { docType: '請求書', primaryKey: '請求番号', fields: ['請求番号'] },
  relatedDocuments: [{ docType: '診断書', fields: ['請求番号'] }],
  existingRules: [],
};

test('returns generated relations from the GLM caller', async () => {
  let receivedInput;
  const result = await handleAggregateRuleRequest(input, {
    callModel: async (modelInput) => {
      receivedInput = modelInput;
      return [{
      sourceDocType: '請求書',
      sourceField: '請求番号',
      targetDocType: '診断書',
      targetField: '請求番号',
      conditionGroupId: 'group-ai-1',
      }];
    },
  });

  assert.deepEqual(result, { relations: result.relations });
  assert.equal(result.relations.length, 1);
  assert.deepEqual(receivedInput.existingRules, []);
});

test('rejects requests without at least two documents', async () => {
  await assert.rejects(
    () => handleAggregateRuleRequest({ ...input, relatedDocuments: [] }),
    /帳票を2件以上/,
  );
});
