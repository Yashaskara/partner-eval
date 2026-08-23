import { auth } from '../auth.js';
import db, { DOMAINS } from '../db.js';

export async function requireAuth(req, res, next) {
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session?.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const allowed = await db.get(
      'SELECT email FROM allowlist WHERE email = ?',
      session.user.email.toLowerCase()
    );
    if (!allowed) {
      return res.status(403).json({ error: 'Not authorized. Contact admin for access.' });
    }

    req.user = session.user;

    // Auto-claim legacy profile_id=1 data for admin on first login
    if (session.user.email.toLowerCase() === (process.env.ADMIN_EMAIL || '').toLowerCase()) {
      const orphan = await db.get('SELECT id FROM profiles WHERE id = 1 AND user_id IS NULL');
      if (orphan) {
        await db.batch([
          { sql: 'UPDATE profiles SET user_id = ? WHERE id = 1', args: [session.user.id] },
          { sql: 'UPDATE partners SET user_id = ? WHERE profile_id = 1 AND user_id IS NULL', args: [session.user.id] },
          { sql: 'UPDATE conversations SET user_id = ? WHERE profile_id = 1 AND user_id IS NULL', args: [session.user.id] },
          { sql: 'UPDATE prep_questions SET user_id = ? WHERE profile_id = 1 AND user_id IS NULL', args: [session.user.id] },
        ]);
      }
    }

    let profile = await db.get('SELECT id FROM profiles WHERE user_id = ?', session.user.id);
    if (!profile) {
      const result = await db.run(
        'INSERT INTO profiles (user_id, name) VALUES (?, ?)',
        session.user.id, session.user.name || 'Default'
      );
      profile = { id: result.lastInsertRowid };
      await db.batch(
        DOMAINS.map(d => ({
          sql: 'INSERT OR IGNORE INTO profile_domains (profile_id, domain) VALUES (?, ?)',
          args: [profile.id, d],
        }))
      );
    }
    req.profileId = profile.id;

    next();
  } catch (e) {
    console.error('Auth middleware error:', e);
    return res.status(401).json({ error: 'Authentication failed' });
  }
}
