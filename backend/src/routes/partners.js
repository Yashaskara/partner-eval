import { Router } from 'express';
import db, { DOMAINS } from '../db.js';

const router = Router();

router.get('/', (req, res) => {
  const { status, includeDeleted } = req.query;
  let sql = 'SELECT * FROM partners WHERE deleted_at IS NULL';
  const params = [];
  if (status && status !== 'all') {
    sql += ' AND status = ?';
    params.push(status);
  }
  if (includeDeleted === 'true') {
    sql = 'SELECT * FROM partners WHERE deleted_at IS NOT NULL';
  }
  sql += ' ORDER BY updated_at DESC';
  const partners = db.prepare(sql).all(...params);

  const enriched = partners.map(p => {
    const domains = db.prepare(
      'SELECT domain, answer FROM partner_domains WHERE partner_id = ?'
    ).all(p.id);
    const latestRun = db.prepare(
      'SELECT * FROM analysis_runs WHERE partner_id = ? ORDER BY created_at DESC LIMIT 1'
    ).get(p.id);
    const assessments = latestRun
      ? db.prepare('SELECT * FROM domain_assessments WHERE run_id = ?').all(latestRun.id)
      : [];
    const notes = db.prepare(
      'SELECT * FROM positives_negatives WHERE partner_id = ? ORDER BY created_at DESC'
    ).all(p.id);

    const selfProfile = db.prepare('SELECT updated_at FROM self_profile WHERE id = 1').get();
    const stale = latestRun && selfProfile?.updated_at && latestRun.created_at < selfProfile.updated_at;

    return { ...p, domains, latestRun, assessments, notes, stale };
  });

  res.json(enriched);
});

router.get('/:id', (req, res) => {
  const partner = db.prepare('SELECT * FROM partners WHERE id = ? AND deleted_at IS NULL').get(req.params.id);
  if (!partner) return res.status(404).json({ error: 'Not found' });

  const domains = db.prepare('SELECT domain, answer FROM partner_domains WHERE partner_id = ?').all(partner.id);
  const runs = db.prepare('SELECT * FROM analysis_runs WHERE partner_id = ? ORDER BY created_at DESC').all(partner.id);
  const latestRun = runs[0];
  const assessments = latestRun
    ? db.prepare('SELECT * FROM domain_assessments WHERE run_id = ?').all(latestRun.id)
    : [];
  const notes = db.prepare('SELECT * FROM positives_negatives WHERE partner_id = ? ORDER BY created_at DESC').all(partner.id);

  const selfProfile = db.prepare('SELECT updated_at FROM self_profile WHERE id = 1').get();
  const stale = latestRun && selfProfile?.updated_at && latestRun.created_at < selfProfile.updated_at;

  res.json({ ...partner, domains, runs, assessments, notes, stale });
});

router.post('/', (req, res) => {
  const { name, source, status, dob, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });

  const result = db.prepare(
    'INSERT INTO partners (name, source, status, dob, notes) VALUES (?, ?, ?, ?, ?)'
  ).run(name, source || '', status || 'active', dob || null, notes || '');

  for (const domain of DOMAINS) {
    db.prepare(
      'INSERT INTO partner_domains (partner_id, domain, answer) VALUES (?, ?, ?)'
    ).run(result.lastInsertRowid, domain, '');
  }

  res.status(201).json({ id: result.lastInsertRowid });
});

router.put('/:id', (req, res) => {
  const { name, source, status, dob, notes } = req.body;
  db.prepare(
    `UPDATE partners SET name = COALESCE(?, name), source = COALESCE(?, source),
     status = COALESCE(?, status), dob = COALESCE(?, dob), notes = COALESCE(?, notes),
     updated_at = datetime('now') WHERE id = ? AND deleted_at IS NULL`
  ).run(name, source, status, dob, notes, req.params.id);
  res.json({ ok: true });
});

router.put('/:id/domains', (req, res) => {
  const { domains } = req.body;
  if (!Array.isArray(domains)) return res.status(400).json({ error: 'domains array required' });

  const upsert = db.prepare(
    `INSERT INTO partner_domains (partner_id, domain, answer) VALUES (?, ?, ?)
     ON CONFLICT(partner_id, domain) DO UPDATE SET answer = excluded.answer, updated_at = datetime('now')`
  );
  const tx = db.transaction(() => {
    for (const { domain, answer } of domains) {
      upsert.run(req.params.id, domain, answer || '');
    }
    db.prepare("UPDATE partners SET updated_at = datetime('now') WHERE id = ?").run(req.params.id);
  });
  tx();
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  db.prepare("UPDATE partners SET deleted_at = datetime('now') WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

router.post('/:id/restore', (req, res) => {
  db.prepare('UPDATE partners SET deleted_at = NULL WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.delete('/:id/permanent', (req, res) => {
  db.prepare('DELETE FROM partners WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.post('/:id/notes', (req, res) => {
  const { type, text } = req.body;
  if (!type || !text) return res.status(400).json({ error: 'type and text required' });
  const result = db.prepare(
    'INSERT INTO positives_negatives (partner_id, type, text) VALUES (?, ?, ?)'
  ).run(req.params.id, type, text);
  res.status(201).json({ id: result.lastInsertRowid });
});

router.delete('/:partnerId/notes/:noteId', (req, res) => {
  db.prepare('DELETE FROM positives_negatives WHERE id = ? AND partner_id = ?')
    .run(req.params.noteId, req.params.partnerId);
  res.json({ ok: true });
});

export default router;
