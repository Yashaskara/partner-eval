import { Router } from 'express';
import db, { DOMAINS } from '../db.js';

const router = Router();

router.get('/', async (req, res) => {
  const { status, includeDeleted } = req.query;
  const profileId = Number(req.query.profileId) || 1;
  let sql = 'SELECT * FROM partners WHERE profile_id = ? AND deleted_at IS NULL';
  const params = [profileId];
  if (status && status !== 'all') {
    sql += ' AND status = ?';
    params.push(status);
  }
  if (includeDeleted === 'true') {
    sql = 'SELECT * FROM partners WHERE profile_id = ? AND deleted_at IS NOT NULL';
  }
  sql += ' ORDER BY updated_at DESC';
  const partners = await db.all(sql, ...params);

  const enriched = [];
  for (const p of partners) {
    const domains = await db.all('SELECT domain, answer FROM partner_domains WHERE partner_id = ?', p.id);
    const latestRun = await db.get('SELECT * FROM analysis_runs WHERE partner_id = ? ORDER BY created_at DESC LIMIT 1', p.id);
    const assessments = latestRun
      ? await db.all('SELECT * FROM domain_assessments WHERE run_id = ?', latestRun.id)
      : [];
    const notes = await db.all('SELECT * FROM positives_negatives WHERE partner_id = ? ORDER BY created_at DESC', p.id);
    const profile = await db.get('SELECT updated_at FROM profiles WHERE id = ?', profileId);
    const stale = latestRun && profile?.updated_at && latestRun.created_at < profile.updated_at;
    enriched.push({ ...p, domains, latestRun, assessments, notes, stale });
  }

  res.json(enriched);
});

router.get('/:id', async (req, res) => {
  const partner = await db.get('SELECT * FROM partners WHERE id = ? AND deleted_at IS NULL', req.params.id);
  if (!partner) return res.status(404).json({ error: 'Not found' });

  const domains = await db.all('SELECT domain, answer FROM partner_domains WHERE partner_id = ?', partner.id);
  const runs = await db.all('SELECT * FROM analysis_runs WHERE partner_id = ? ORDER BY created_at DESC', partner.id);
  const latestRun = runs[0];
  const assessments = latestRun
    ? await db.all('SELECT * FROM domain_assessments WHERE run_id = ?', latestRun.id)
    : [];
  const notes = await db.all('SELECT * FROM positives_negatives WHERE partner_id = ? ORDER BY created_at DESC', partner.id);
  const profile = await db.get('SELECT updated_at FROM profiles WHERE id = ?', partner.profile_id);
  const stale = latestRun && profile?.updated_at && latestRun.created_at < profile.updated_at;

  res.json({ ...partner, domains, runs, assessments, notes, stale });
});

router.post('/', async (req, res) => {
  const { name, source, status, dob, notes, profileId = 1 } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });

  const result = await db.run(
    'INSERT INTO partners (profile_id, name, source, status, dob, notes) VALUES (?, ?, ?, ?, ?, ?)',
    profileId, name, source || '', status || 'active', dob || null, notes || ''
  );

  await db.batch(
    DOMAINS.map(domain => ({
      sql: 'INSERT INTO partner_domains (partner_id, domain, answer) VALUES (?, ?, ?)',
      args: [result.lastInsertRowid, domain, ''],
    }))
  );

  res.status(201).json({ id: result.lastInsertRowid });
});

router.put('/:id', async (req, res) => {
  const { name, source, status, dob, notes } = req.body;
  await db.run(
    `UPDATE partners SET name = COALESCE(?, name), source = COALESCE(?, source),
     status = COALESCE(?, status), dob = COALESCE(?, dob), notes = COALESCE(?, notes),
     updated_at = datetime('now') WHERE id = ? AND deleted_at IS NULL`,
    name, source, status, dob, notes, req.params.id
  );
  res.json({ ok: true });
});

router.put('/:id/domains', async (req, res) => {
  const { domains } = req.body;
  if (!Array.isArray(domains)) return res.status(400).json({ error: 'domains array required' });

  const stmts = domains.map(({ domain, answer }) => ({
    sql: `INSERT INTO partner_domains (partner_id, domain, answer) VALUES (?, ?, ?)
     ON CONFLICT(partner_id, domain) DO UPDATE SET answer = excluded.answer, updated_at = datetime('now')`,
    args: [req.params.id, domain, answer || ''],
  }));
  stmts.push({
    sql: "UPDATE partners SET updated_at = datetime('now') WHERE id = ?",
    args: [req.params.id],
  });
  await db.batch(stmts);
  res.json({ ok: true });
});

router.delete('/:id', async (req, res) => {
  await db.run("UPDATE partners SET deleted_at = datetime('now') WHERE id = ?", req.params.id);
  res.json({ ok: true });
});

router.post('/:id/restore', async (req, res) => {
  await db.run('UPDATE partners SET deleted_at = NULL WHERE id = ?', req.params.id);
  res.json({ ok: true });
});

router.delete('/:id/permanent', async (req, res) => {
  await db.run('DELETE FROM partners WHERE id = ?', req.params.id);
  res.json({ ok: true });
});

router.post('/:id/notes', async (req, res) => {
  const { type, text } = req.body;
  if (!type || !text) return res.status(400).json({ error: 'type and text required' });
  const result = await db.run(
    'INSERT INTO positives_negatives (partner_id, type, text) VALUES (?, ?, ?)',
    req.params.id, type, text
  );
  res.status(201).json({ id: result.lastInsertRowid });
});

router.delete('/:partnerId/notes/:noteId', async (req, res) => {
  await db.run('DELETE FROM positives_negatives WHERE id = ? AND partner_id = ?',
    req.params.noteId, req.params.partnerId);
  res.json({ ok: true });
});

export default router;
