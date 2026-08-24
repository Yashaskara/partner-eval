import { Router } from 'express';
import { auth } from '../auth.js';
import db from '../db.js';

const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Light in-memory throttle for the public submit endpoint.
const submitHits = new Map();
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 5;

function throttled(ip) {
  const now = Date.now();
  const hits = (submitHits.get(ip) || []).filter(t => now - t < WINDOW_MS);
  if (hits.length >= MAX_PER_WINDOW) return true;
  hits.push(now);
  submitHits.set(ip, hits);
  return false;
}

// Public: anyone can ask for access to be granted to their email.
router.post('/', async (req, res) => {
  const email = String(req.body?.email || '').toLowerCase().trim();
  const name = String(req.body?.name || '').trim().slice(0, 120);
  const note = String(req.body?.note || '').trim().slice(0, 500);

  if (!EMAIL_RE.test(email) || email.length > 254) {
    return res.status(400).json({ error: 'Enter a valid email address' });
  }
  if (throttled(req.ip)) {
    return res.status(429).json({ error: 'Too many requests. Try again later.' });
  }

  const allowed = await db.get('SELECT email FROM allowlist WHERE email = ?', email);
  if (allowed) return res.json({ ok: true, status: 'approved', alreadyAllowed: true });

  const existing = await db.get('SELECT id, status FROM access_requests WHERE email = ?', email);
  if (existing) {
    // A rejected email — or one whose access was later revoked — may ask again.
    // A pending request is left untouched.
    if (existing.status !== 'pending') {
      await db.run(
        `UPDATE access_requests
         SET status = 'pending', name = ?, note = ?, created_at = datetime('now'),
             reviewed_at = NULL, reviewed_by = NULL
         WHERE id = ?`,
        name, note, existing.id
      );
      return res.json({ ok: true, status: 'pending' });
    }
    return res.json({ ok: true, status: existing.status, alreadyRequested: true });
  }

  await db.run(
    'INSERT INTO access_requests (email, name, note) VALUES (?, ?, ?)',
    email, name, note
  );
  res.json({ ok: true, status: 'pending' });
});

// Signed-in but not-yet-allowlisted users need this to render the waiting screen,
// so it checks the session directly instead of going through requireAuth.
router.get('/me', async (req, res) => {
  const session = await auth.api.getSession({ headers: req.headers }).catch(() => null);
  if (!session?.user) return res.json({ authenticated: false });

  const email = session.user.email.toLowerCase();
  const allowed = await db.get('SELECT email FROM allowlist WHERE email = ?', email);
  const request = await db.get(
    'SELECT status, created_at FROM access_requests WHERE email = ?',
    email
  );

  res.json({
    authenticated: true,
    email: session.user.email,
    name: session.user.name || '',
    allowed: !!allowed,
    request: request || null,
  });
});

export default router;
