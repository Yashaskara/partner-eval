import { Router } from 'express';
import { requireAdmin } from '../middleware/requireAdmin.js';
import db from '../db.js';

const router = Router();
router.use(requireAdmin);

// Per-million-token pricing (USD). Input / Output.
const MODEL_PRICING = {
  'claude-sonnet-4-5-20250514': { input: 3, output: 15 },
  'claude-sonnet-4-20250514':   { input: 3, output: 15 },
  'claude-haiku-3-5-20241022':  { input: 0.80, output: 4 },
  'gpt-5.6-luna':               { input: 2.50, output: 10 },
  'gpt-4o':                     { input: 2.50, output: 10 },
  'gpt-4o-mini':                { input: 0.15, output: 0.60 },
  'gemini-1.5-pro':             { input: 1.25, output: 5 },
  'gemini-2.0-flash':           { input: 0.10, output: 0.40 },
};

function calcCost(model, inputTokens, outputTokens) {
  const pricing = MODEL_PRICING[model];
  if (!pricing) return null;
  return (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
}

router.get('/users', async (req, res) => {
  const users = await db.all(`
    SELECT u.id, u.email, u.name, u.image, u.createdAt,
      COALESCE(SUM(lu.input_tokens + lu.output_tokens), 0) as total_tokens,
      COUNT(lu.id) as total_calls
    FROM "user" u
    LEFT JOIN llm_usage lu ON lu.user_id = u.id
    GROUP BY u.id
    ORDER BY total_tokens DESC
  `);

  const usageByModel = await db.all(`
    SELECT user_id, model, SUM(input_tokens) as input_tokens, SUM(output_tokens) as output_tokens
    FROM llm_usage GROUP BY user_id, model
  `);
  const costMap = {};
  for (const row of usageByModel) {
    const cost = calcCost(row.model, Number(row.input_tokens), Number(row.output_tokens));
    if (cost != null) costMap[row.user_id] = (costMap[row.user_id] || 0) + cost;
  }

  res.json(users.map(u => ({ ...u, estimated_cost: costMap[u.id] || 0 })));
});

router.get('/usage', async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const daily = await db.all(`
    SELECT user_id, provider, model,
      SUM(input_tokens) as input_tokens,
      SUM(output_tokens) as output_tokens,
      COUNT(*) as calls
    FROM llm_usage WHERE created_at >= ?
    GROUP BY user_id, provider, model
  `, today);

  const dailyWithCost = daily.map(d => ({
    ...d,
    estimated_cost: calcCost(d.model, Number(d.input_tokens), Number(d.output_tokens)) || 0,
  }));

  const allTimeByModel = await db.all(`
    SELECT model, SUM(input_tokens) as input_tokens, SUM(output_tokens) as output_tokens, COUNT(*) as calls
    FROM llm_usage GROUP BY model
  `);
  let totalCost = 0;
  let totalInput = 0;
  let totalOutput = 0;
  let totalCalls = 0;
  for (const row of allTimeByModel) {
    totalInput += Number(row.input_tokens);
    totalOutput += Number(row.output_tokens);
    totalCalls += Number(row.calls);
    totalCost += calcCost(row.model, Number(row.input_tokens), Number(row.output_tokens)) || 0;
  }

  res.json({
    daily: dailyWithCost,
    allTime: { total_input: totalInput, total_output: totalOutput, total_calls: totalCalls, estimated_cost: totalCost },
  });
});

router.get('/usage/:userId', async (req, res) => {
  const usage = await db.all(`
    SELECT provider, model, endpoint, input_tokens, output_tokens, created_at
    FROM llm_usage WHERE user_id = ?
    ORDER BY created_at DESC LIMIT 100
  `, req.params.userId);
  res.json(usage.map(row => ({
    ...row,
    estimated_cost: calcCost(row.model, Number(row.input_tokens), Number(row.output_tokens)) || 0,
  })));
});

router.get('/allowlist', async (req, res) => {
  const list = await db.all('SELECT * FROM allowlist ORDER BY added_at DESC');
  res.json(list);
});

router.post('/allowlist', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'email required' });
  await db.run(
    'INSERT OR IGNORE INTO allowlist (email, added_by) VALUES (?, ?)',
    email.toLowerCase().trim(), req.user.email
  );
  res.json({ ok: true });
});

router.delete('/allowlist/:email', async (req, res) => {
  const email = decodeURIComponent(req.params.email);
  if (email.toLowerCase() === (process.env.ADMIN_EMAIL || '').toLowerCase()) {
    return res.status(400).json({ error: 'Cannot remove admin' });
  }
  await db.run('DELETE FROM allowlist WHERE email = ?', email);
  res.json({ ok: true });
});

router.put('/user-limits/:userId', async (req, res) => {
  const { dailyTokenLimit } = req.body;
  if (!dailyTokenLimit || dailyTokenLimit < 0) return res.status(400).json({ error: 'Valid dailyTokenLimit required' });
  await db.run(
    `INSERT INTO user_limits (user_id, daily_token_limit) VALUES (?, ?)
     ON CONFLICT(user_id) DO UPDATE SET daily_token_limit = excluded.daily_token_limit`,
    req.params.userId, dailyTokenLimit
  );
  res.json({ ok: true });
});

export default router;
