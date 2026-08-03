import { Router } from 'express';
import db from '../db.js';

const router = Router();

const PROVIDERS = {
  anthropic: {
    name: 'Anthropic',
    defaultModel: 'claude-sonnet-4-5-20241022',
    envKey: 'ANTHROPIC_API_KEY',
    envModel: 'ANTHROPIC_MODEL',
  },
  openai: {
    name: 'OpenAI',
    defaultModel: 'gpt-4o',
    envKey: 'OPENAI_API_KEY',
    envModel: 'OPENAI_MODEL',
  },
  google: {
    name: 'Google',
    defaultModel: 'gemini-1.5-pro',
    envKey: 'GOOGLE_API_KEY',
    envModel: 'GOOGLE_MODEL',
  },
};

function maskKey(key) {
  if (!key) return null;
  return '····' + key.slice(-4);
}

router.get('/', (req, res) => {
  const activeProvider = db.prepare("SELECT value FROM settings WHERE key = 'active_provider'").get()?.value || 'anthropic';

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

  const provenance = db.prepare(
    `SELECT ar.model, COUNT(da.id) as count, MAX(da.created_at) as recent
     FROM domain_assessments da
     JOIN analysis_runs ar ON da.run_id = ar.id
     GROUP BY ar.model ORDER BY recent DESC`
  ).all();

  res.json({ activeProvider, providers, provenance });
});

router.put('/provider', (req, res) => {
  const { provider } = req.body;
  if (!PROVIDERS[provider]) return res.status(400).json({ error: 'Invalid provider' });
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('active_provider', ?)").run(provider);
  res.json({ ok: true });
});

export default router;
