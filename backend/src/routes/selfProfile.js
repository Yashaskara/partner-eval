import { Router } from 'express';
import db, { DOMAINS } from '../db.js';

const router = Router();

router.get('/', async (req, res) => {
  const profileId = req.profileId;
  const profile = await db.get('SELECT * FROM profiles WHERE id = ?', profileId);
  const domains = await db.all(
    'SELECT domain, answer, priority, updated_at FROM profile_domains WHERE profile_id = ? ORDER BY rowid',
    profileId
  );
  res.json({ ...profile, domains });
});

router.put('/domains/:domain', async (req, res) => {
  const { domain } = req.params;
  const { answer, priority } = req.body;
  const profileId = req.profileId;

  if (!DOMAINS.includes(domain)) return res.status(400).json({ error: 'Invalid domain' });

  await db.run(
    `UPDATE profile_domains SET answer = COALESCE(?, answer), priority = COALESCE(?, priority),
     updated_at = datetime('now') WHERE profile_id = ? AND domain = ?`,
    answer, priority, profileId, domain
  );
  await db.run("UPDATE profiles SET updated_at = datetime('now') WHERE id = ?", profileId);

  res.json({ ok: true });
});

router.put('/domains', async (req, res) => {
  const { domains } = req.body;
  const profileId = req.profileId;
  if (!Array.isArray(domains)) return res.status(400).json({ error: 'domains array required' });

  const stmts = [];
  for (const { domain, answer, priority } of domains) {
    if (!DOMAINS.includes(domain)) continue;
    stmts.push({
      sql: `UPDATE profile_domains SET answer = COALESCE(?, answer), priority = COALESCE(?, priority),
       updated_at = datetime('now') WHERE profile_id = ? AND domain = ?`,
      args: [answer, priority, profileId, domain],
    });
  }
  stmts.push({ sql: "UPDATE profiles SET updated_at = datetime('now') WHERE id = ?", args: [profileId] });
  await db.batch(stmts);
  res.json({ ok: true });
});

router.post('/reset', async (req, res) => {
  const profileId = req.profileId;
  const current = await db.all(
    'SELECT domain, answer, priority FROM profile_domains WHERE profile_id = ?', profileId
  );

  const stmts = [
    { sql: "UPDATE profiles SET snapshot_json = ?, updated_at = datetime('now') WHERE id = ?", args: [JSON.stringify(current), profileId] },
  ];
  for (const d of DOMAINS) {
    stmts.push({
      sql: "UPDATE profile_domains SET answer = '', priority = 2, updated_at = datetime('now') WHERE profile_id = ? AND domain = ?",
      args: [profileId, d],
    });
  }
  await db.batch(stmts);
  res.json({ ok: true });
});

router.post('/restore', async (req, res) => {
  const profileId = req.profileId;
  const profile = await db.get('SELECT snapshot_json FROM profiles WHERE id = ?', profileId);
  if (!profile?.snapshot_json) return res.status(404).json({ error: 'No snapshot to restore' });

  const snapshot = JSON.parse(profile.snapshot_json);
  const stmts = [];
  for (const { domain, answer, priority } of snapshot) {
    stmts.push({
      sql: "UPDATE profile_domains SET answer = ?, priority = ?, updated_at = datetime('now') WHERE profile_id = ? AND domain = ?",
      args: [answer, priority, profileId, domain],
    });
  }
  stmts.push({ sql: "UPDATE profiles SET snapshot_json = NULL, updated_at = datetime('now') WHERE id = ?", args: [profileId] });
  await db.batch(stmts);
  res.json({ ok: true });
});

export default router;
