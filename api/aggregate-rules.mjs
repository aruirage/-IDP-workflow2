import { handleAggregateRuleRequest } from '../server/aggregate-api.mjs';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method Not Allowed' });
      return;
    }
    const input = req.body || {};
    const result = await handleAggregateRuleRequest(input);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: error?.message || 'AI関連ルールの生成に失敗しました' });
  }
}
