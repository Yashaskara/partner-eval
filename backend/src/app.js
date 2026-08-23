import 'dotenv/config';
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
import { seedProfileQuestions } from './seeds/seed.js';

await seedProfileQuestions();

const app = express();
app.use(cors({
  origin: process.env.BETTER_AUTH_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());

app.all('/api/auth/*', toNodeHandler(auth));

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
