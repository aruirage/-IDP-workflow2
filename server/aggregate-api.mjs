import { callGlmAggregateRules } from './aggregate-ai.mjs';

export async function handleAggregateRuleRequest(input, options = {}) {
  const mainDocument = input?.mainDocument;
  const relatedDocuments = Array.isArray(input?.relatedDocuments) ? input.relatedDocuments : [];
  if (!mainDocument?.docType || relatedDocuments.length < 1) {
    throw new Error('帳票を2件以上選択してください');
  }
  const callModel = options.callModel || callGlmAggregateRules;
  const relations = await callModel({
    businessScene: String(input.businessScene || ''),
    mainDocument,
    relatedDocuments,
    existingRules: Array.isArray(input.existingRules) ? input.existingRules : [],
  }, options);
  return { relations };
}
