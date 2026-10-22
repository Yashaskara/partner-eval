import { Router } from 'express';
import db, { DOMAINS } from '../db.js';

const router = Router();

// A read goes stale when either side of the comparison has moved since it ran:
// the user's own profile (changes the weighting) or the partner's domain data
// (changes the evidence).
async function stalenessOf(partnerId, profileId, latestRun) {
  if (!latestRun) return { stale: false, stale_reason: null };
  const profile = await db.get('SELECT updated_at FROM profiles WHERE id = ?', profileId);
  const domainEdit = await db.get(
    'SELECT MAX(updated_at) AS updated_at FROM partner_domains WHERE partner_id = ?', partnerId
  );
  const profileStale = profile?.updated_at && latestRun.created_at < profile.updated_at;
  const domainStale = domainEdit?.updated_at && latestRun.created_at < domainEdit.updated_at;
  if (domainStale) return { stale: true, stale_reason: 'partner' };
  if (profileStale) return { stale: true, stale_reason: 'profile' };
  return { stale: false, stale_reason: null };
}

router.get('/', async (req, res) => {
  const { status, includeDeleted } = req.query;
  const profileId = req.profileId;
  const userId = req.user.id;
  let sql;
  const params = [profileId, userId];
  if (includeDeleted === 'true') {
    sql = 'SELECT * FROM partners WHERE profile_id = ? AND user_id = ? AND deleted_at IS NOT NULL';
  } else {
    sql = 'SELECT * FROM partners WHERE profile_id = ? AND user_id = ? AND deleted_at IS NULL';
    if (status && status !== 'all') {
      sql += ' AND status = ?';
      params.push(status);
    }
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
    const { stale, stale_reason } = await stalenessOf(p.id, profileId, latestRun);
    enriched.push({ ...p, domains, latestRun, assessments, notes, stale, stale_reason });
  }

  res.json(enriched);
});

router.get('/:id', async (req, res) => {
  const partner = await db.get('SELECT * FROM partners WHERE id = ? AND user_id = ? AND deleted_at IS NULL', req.params.id, req.user.id);
  if (!partner) return res.status(404).json({ error: 'Not found' });

  const domains = await db.all('SELECT domain, answer FROM partner_domains WHERE partner_id = ?', partner.id);
  const runs = await db.all('SELECT * FROM analysis_runs WHERE partner_id = ? ORDER BY created_at DESC', partner.id);
  const latestRun = runs[0];
  const assessments = latestRun
    ? await db.all('SELECT * FROM domain_assessments WHERE run_id = ?', latestRun.id)
    : [];
  const notes = await db.all('SELECT * FROM positives_negatives WHERE partner_id = ? ORDER BY created_at DESC', partner.id);
  const { stale, stale_reason } = await stalenessOf(partner.id, partner.profile_id, latestRun);

  res.json({ ...partner, domains, runs, assessments, notes, stale, stale_reason });
});

router.post('/', async (req, res) => {
  const { name, source, status, dob, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });

  const result = await db.run(
    'INSERT INTO partners (profile_id, user_id, name, source, status, dob, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
    req.profileId, req.user.id, name, source || '', status || 'active', dob || null, notes || ''
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
     updated_at = datetime('now') WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
    name, source, status, dob, notes, req.params.id, req.user.id
  );
  res.json({ ok: true });
});

router.put('/:id/domains', async (req, res) => {
  const { domains } = req.body;
  if (!Array.isArray(domains)) return res.status(400).json({ error: 'domains array required' });

  const partner = await db.get('SELECT id FROM partners WHERE id = ? AND user_id = ?', req.params.id, req.user.id);
  if (!partner) return res.status(404).json({ error: 'Not found' });

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
  await db.run("UPDATE partners SET deleted_at = datetime('now') WHERE id = ? AND user_id = ?", req.params.id, req.user.id);
  res.json({ ok: true });
});

router.post('/:id/restore', async (req, res) => {
  await db.run('UPDATE partners SET deleted_at = NULL WHERE id = ? AND user_id = ?', req.params.id, req.user.id);
  res.json({ ok: true });
});

router.delete('/:id/permanent', async (req, res) => {
  await db.run('DELETE FROM partners WHERE id = ? AND user_id = ?', req.params.id, req.user.id);
  res.json({ ok: true });
});

router.post('/:id/notes', async (req, res) => {
  const { type, text } = req.body;
  if (!type || !text) return res.status(400).json({ error: 'type and text required' });
  const partner = await db.get('SELECT id FROM partners WHERE id = ? AND user_id = ?', req.params.id, req.user.id);
  if (!partner) return res.status(404).json({ error: 'Not found' });
  const result = await db.run(
    'INSERT INTO positives_negatives (partner_id, type, text) VALUES (?, ?, ?)',
    req.params.id, type, text
  );
  res.status(201).json({ id: result.lastInsertRowid });
});

router.delete('/:partnerId/notes/:noteId', async (req, res) => {
  const partner = await db.get('SELECT id FROM partners WHERE id = ? AND user_id = ?', req.params.partnerId, req.user.id);
  if (!partner) return res.status(404).json({ error: 'Not found' });
  await db.run('DELETE FROM positives_negatives WHERE id = ? AND partner_id = ?',
    req.params.noteId, req.params.partnerId);
  res.json({ ok: true });
});

export default router;
