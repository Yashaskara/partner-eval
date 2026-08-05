import { Router } from 'express';
import db, { DOMAINS } from '../db.js';

const router = Router();

router.get('/', async (req, res) => {
  const profile = await db.get('SELECT * FROM self_profile WHERE id = 1');
  const domains = await db.all(
    'SELECT domain, answer, priority, updated_at FROM self_profile_domains ORDER BY rowid'
  );
  res.json({ ...profile, domains });
});

router.put('/domains/:domain', async (req, res) => {
  const { domain } = req.params;
  const { answer, priority } = req.body;

  if (!DOMAINS.includes(domain)) return res.status(400).json({ error: 'Invalid domain' });

  await db.run(
    `UPDATE self_profile_domains SET answer = COALESCE(?, answer), priority = COALESCE(?, priority),
     updated_at = datetime('now') WHERE domain = ?`,
    answer, priority, domain
  );
  await db.run("UPDATE self_profile SET updated_at = datetime('now') WHERE id = 1");

  res.json({ ok: true });
});

router.put('/domains', async (req, res) => {
  const { domains } = req.body;
  if (!Array.isArray(domains)) return res.status(400).json({ error: 'domains array required' });

  const stmts = [];
  for (const { domain, answer, priority } of domains) {
    if (!DOMAINS.includes(domain)) continue;
    stmts.push({
      sql: `UPDATE self_profile_domains SET answer = COALESCE(?, answer), priority = COALESCE(?, priority),
       updated_at = datetime('now') WHERE domain = ?`,
      args: [answer, priority, domain],
    });
  }
  stmts.push({ sql: "UPDATE self_profile SET updated_at = datetime('now') WHERE id = 1", args: [] });
  await db.batch(stmts);
  res.json({ ok: true });
});

router.post('/reset', async (req, res) => {
  const current = await db.all('SELECT domain, answer, priority FROM self_profile_domains');

  const stmts = [
    { sql: "UPDATE self_profile SET snapshot_json = ?, updated_at = datetime('now') WHERE id = 1", args: [JSON.stringify(current)] },
  ];
  for (const d of DOMAINS) {
    stmts.push({
      sql: "UPDATE self_profile_domains SET answer = '', priority = 2, updated_at = datetime('now') WHERE domain = ?",
      args: [d],
    });
  }
  await db.batch(stmts);
  res.json({ ok: true });
});

router.post('/restore', async (req, res) => {
  const profile = await db.get('SELECT snapshot_json FROM self_profile WHERE id = 1');
  if (!profile?.snapshot_json) return res.status(404).json({ error: 'No snapshot to restore' });

  const snapshot = JSON.parse(profile.snapshot_json);
  const stmts = [];
  for (const { domain, answer, priority } of snapshot) {
    stmts.push({
      sql: "UPDATE self_profile_domains SET answer = ?, priority = ?, updated_at = datetime('now') WHERE domain = ?",
      args: [answer, priority, domain],
    });
  }
  stmts.push({ sql: "UPDATE self_profile SET snapshot_json = NULL, updated_at = datetime('now') WHERE id = 1", args: [] });
  await db.batch(stmts);
  res.json({ ok: true });
});

export default router;
