import { Router } from 'express';
import db from '../db.js';

const router = Router();

const PROVIDERS = {
  anthropic: {
    name: 'Anthropic',
    defaultModel: 'claude-sonnet-4-5-20250514',
    envKey: 'ANTHROPIC_API_KEY',
    envModel: 'ANTHROPIC_MODEL',
  },
  openai: {
    name: 'OpenAI',
    defaultModel: 'gpt-5.6-luna',
    envKey: 'OPENAI_API_KEY',
    envModel: 'OPENAI_MODEL',
  },
  google: {
    name: 'Google',
    defaultModel: 'gemini-3.1-flash-lite',
    envKey: 'GOOGLE_API_KEY',
    envModel: 'GOOGLE_MODEL',
  },
};

function maskKey(key) {
  if (!key) return null;
  return '····' + key.slice(-4);
}

router.get('/', async (req, res) => {
  const userId = req.user.id;
  const userPref = await db.get(
    "SELECT value FROM user_settings WHERE user_id = ? AND key = 'active_provider'",
    userId
  );
  const activeProvider = userPref?.value
    || (await db.get("SELECT value FROM settings WHERE key = 'active_provider'"))?.value
    || 'anthropic';

  const providers = Object.entries(PROVIDERS).map(([id, p]) => {
    const rawKey = process.env[p.envKey];
    const model = process.env[p.envModel] || p.defaultModel;
    return {
      id,
      name: p.name,
      model,
      active: id === activeProvider,
      keySet: !!rawKey,
      keyMasked: rawKey ? `key set · ${maskKey(rawKey)}` : 'no key in .env',
    };
  });

  const provenance = await db.all(
    `SELECT ar.model, COUNT(da.id) as count, MAX(da.created_at) as recent
     FROM domain_assessments da
     JOIN analysis_runs ar ON da.run_id = ar.id
     GROUP BY ar.model ORDER BY recent DESC`
  );

  res.json({ activeProvider, providers, provenance });
});

router.put('/provider', async (req, res) => {
  const { provider } = req.body;
  if (!PROVIDERS[provider]) return res.status(400).json({ error: 'Invalid provider' });
  await db.run(
    "INSERT INTO user_settings (user_id, key, value) VALUES (?, 'active_provider', ?) ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value",
    req.user.id, provider
  );
  res.json({ ok: true });
});

export default router;
