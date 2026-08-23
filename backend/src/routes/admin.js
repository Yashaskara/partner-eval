import { Router } from 'express';
import { requireAdmin } from '../middleware/requireAdmin.js';
import db from '../db.js';

const router = Router();
router.use(requireAdmin);

router.get('/users', async (req, res) => {
  const users = await db.all(`
    SELECT u.id, u.email, u.name, u.image, u.createdAt,
      COALESCE(SUM(lu.input_tokens + lu.output_tokens), 0) as total_tokens,
      COUNT(lu.id) as total_calls
    FROM user u
    LEFT JOIN llm_usage lu ON lu.user_id = u.id
    GROUP BY u.id
    ORDER BY total_tokens DESC
  `);
  res.json(users);
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

  const allTime = await db.get(`
    SELECT COALESCE(SUM(input_tokens), 0) as total_input,
      COALESCE(SUM(output_tokens), 0) as total_output,
      COUNT(*) as total_calls
    FROM llm_usage
  `);

  res.json({ daily, allTime });
});

router.get('/usage/:userId', async (req, res) => {
  const usage = await db.all(`
    SELECT provider, model, endpoint, input_tokens, output_tokens, created_at
    FROM llm_usage WHERE user_id = ?
    ORDER BY created_at DESC LIMIT 100
  `, req.params.userId);
  res.json(usage);
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
