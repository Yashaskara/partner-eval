import './env.js';
import express from 'express';
import cors from 'cors';
import { toNodeHandler } from 'better-auth/node';
import { auth } from './auth.js';
import { requireAuth } from './middleware/requireAuth.js';
import partnersRouter from './routes/partners.js';
import selfProfileRouter from './routes/selfProfile.js';
import analysisRouter from './routes/analysis.js';
import prepQuestionsRouter from './routes/prepQuestions.js';
import settingsRouter from './routes/settings.js';
import profileQARouter from './routes/profileQA.js';
import conversationsRouter from './routes/conversations.js';
import adminRouter from './routes/admin.js';
import accessRequestsRouter from './routes/accessRequests.js';
import { seedProfileQuestions } from './seeds/seed.js';

await seedProfileQuestions();

const app = express();
app.use(cors({
  origin: ['http://localhost:5173', process.env.BETTER_AUTH_URL].filter(Boolean),
  credentials: true,
}));
app.use(express.json());

app.all('/api/auth/*', toNodeHandler(auth));

if (process.env.NODE_ENV !== 'production') {
  app.post('/api/dev-login', async (req, res) => {
    try {
      const email = (req.body.email || 'dev@anvaya.local').toLowerCase();
      const name = req.body.name || 'Dev User';
      const password = 'dev-only-not-for-prod';

      let ctx;
      try {
        ctx = await auth.api.signUpEmail({ body: { email, password, name } });
      } catch {
        try {
          ctx = await auth.api.signInEmail({ body: { email, password } });
        } catch {
          const db = (await import('./db.js')).default;
          await db.run('DELETE FROM "session" WHERE userId IN (SELECT id FROM "user" WHERE email = ?)', email);
          await db.run('DELETE FROM "account" WHERE userId IN (SELECT id FROM "user" WHERE email = ?)', email);
          await db.run('DELETE FROM "user" WHERE email = ?', email);
          ctx = await auth.api.signUpEmail({ body: { email, password, name } });
        }
      }

      // Ensure the user is in the allowlist for dev
      const db = (await import('./db.js')).default;
      await db.run('INSERT OR IGNORE INTO allowlist (email, added_by) VALUES (?, ?)', email, 'dev-bypass');

      res.json({ ok: true });
    } catch (e) {
      console.error('dev-login error:', e);
      res.status(500).json({ error: e.message });
    }
  });
}

// Public / session-only: must be mounted before the allowlist gate.
app.use('/api/access-requests', accessRequestsRouter);

app.use('/api', requireAuth);

app.use('/api/partners', partnersRouter);
app.use('/api/self-profile', selfProfileRouter);
app.use('/api/analysis', analysisRouter);
app.use('/api/prep-questions', prepQuestionsRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/profile-qa', profileQARouter);
app.use('/api/conversations', conversationsRouter);
app.use('/api/admin', adminRouter);

export default app;
