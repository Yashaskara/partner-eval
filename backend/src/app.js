import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import partnersRouter from './routes/partners.js';
import selfProfileRouter from './routes/selfProfile.js';
import analysisRouter from './routes/analysis.js';
import prepQuestionsRouter from './routes/prepQuestions.js';
import settingsRouter from './routes/settings.js';

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/partners', partnersRouter);
app.use('/api/self-profile', selfProfileRouter);
app.use('/api/analysis', analysisRouter);
app.use('/api/prep-questions', prepQuestionsRouter);
app.use('/api/settings', settingsRouter);

export default app;
