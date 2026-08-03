import { Router } from 'express';
import db, { DOMAINS } from '../db.js';

const router = Router();

router.get('/', (req, res) => {
  const profile = db.prepare('SELECT * FROM self_profile WHERE id = 1').get();
  const domains = db.prepare(
    'SELECT domain, answer, priority, updated_at FROM self_profile_domains ORDER BY rowid'
  ).all();
  res.json({ ...profile, domains });
});

router.put('/domains/:domain', (req, res) => {
  const { domain } = req.params;
  const { answer, priority } = req.body;

  if (!DOMAINS.includes(domain)) return res.status(400).json({ error: 'Invalid domain' });

  db.prepare(
    `UPDATE self_profile_domains SET answer = COALESCE(?, answer), priority = COALESCE(?, priority),
     updated_at = datetime('now') WHERE domain = ?`
  ).run(answer, priority, domain);

  db.prepare("UPDATE self_profile SET updated_at = datetime('now') WHERE id = 1").run();

  res.json({ ok: true });
});

router.put('/domains', (req, res) => {
  const { domains } = req.body;
  if (!Array.isArray(domains)) return res.status(400).json({ error: 'domains array required' });

  const tx = db.transaction(() => {
    for (const { domain, answer, priority } of domains) {
      if (!DOMAINS.includes(domain)) continue;
      db.prepare(
        `UPDATE self_profile_domains SET answer = COALESCE(?, answer), priority = COALESCE(?, priority),
         updated_at = datetime('now') WHERE domain = ?`
      ).run(answer, priority, domain);
    }
    db.prepare("UPDATE self_profile SET updated_at = datetime('now') WHERE id = 1").run();
  });
  tx();
  res.json({ ok: true });
});

router.post('/reset', (req, res) => {
  const current = db.prepare(
    'SELECT domain, answer, priority FROM self_profile_domains'
  ).all();
  db.prepare(
    "UPDATE self_profile SET snapshot_json = ?, updated_at = datetime('now') WHERE id = 1"
  ).run(JSON.stringify(current));

  const reset = db.prepare(
    "UPDATE self_profile_domains SET answer = '', priority = 2, updated_at = datetime('now') WHERE domain = ?"
  );
  const tx = db.transaction(() => {
    for (const d of DOMAINS) reset.run(d);
  });
  tx();

  res.json({ ok: true });
});

router.post('/restore', (req, res) => {
  const profile = db.prepare('SELECT snapshot_json FROM self_profile WHERE id = 1').get();
  if (!profile?.snapshot_json) return res.status(404).json({ error: 'No snapshot to restore' });

  const snapshot = JSON.parse(profile.snapshot_json);
  const update = db.prepare(
    "UPDATE self_profile_domains SET answer = ?, priority = ?, updated_at = datetime('now') WHERE domain = ?"
  );
  const tx = db.transaction(() => {
    for (const { domain, answer, priority } of snapshot) {
      update.run(answer, priority, domain);
    }
    db.prepare("UPDATE self_profile SET snapshot_json = NULL, updated_at = datetime('now') WHERE id = 1").run();
  });
  tx();

  res.json({ ok: true });
});

export default router;
