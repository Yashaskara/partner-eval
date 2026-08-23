import db from '../db.js';

export async function logUsage(userId, provider, model, endpoint, usage) {
  await db.run(
    'INSERT INTO llm_usage (user_id, provider, model, endpoint, input_tokens, output_tokens) VALUES (?, ?, ?, ?, ?, ?)',
    userId, provider, model, endpoint, usage.input_tokens, usage.output_tokens
  );
}

export async function checkDailyLimit(userId) {
  const today = new Date().toISOString().slice(0, 10);
  const used = await db.get(
    `SELECT COALESCE(SUM(input_tokens + output_tokens), 0) as total
     FROM llm_usage WHERE user_id = ? AND created_at >= ?`,
    userId, today
  );
  const limitRow = await db.get(
    'SELECT daily_token_limit FROM user_limits WHERE user_id = ?', userId
  );
  const dailyLimit = limitRow?.daily_token_limit || 100000;
  return {
    used: Number(used.total),
    limit: dailyLimit,
    remaining: dailyLimit - Number(used.total),
    exceeded: Number(used.total) >= dailyLimit,
  };
}
