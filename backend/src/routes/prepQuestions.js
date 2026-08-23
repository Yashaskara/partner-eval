import { Router } from 'express';
import db, { DOMAINS } from '../db.js';
import { getProvider } from '../llm/index.js';

const router = Router();

const DOMAIN_LABELS = {
  lifestyle: 'Lifestyle', career: 'Career', family: 'Family',
  conflict: 'Conflict resolution', spirituality: 'Spirituality',
  finances: 'Finances', children: 'Children', intimacy: 'Physical intimacy',
  hobbies: 'Hobbies', health: 'Health', social: 'Friends & social',
  history: 'Previous relationships',
};

router.get('/', async (req, res) => {
  const profileId = Number(req.query.profileId) || 1;
  const questions = await db.all(
    'SELECT * FROM prep_questions WHERE profile_id = ? ORDER BY priority ASC, id ASC',
    profileId
  );
  res.json(questions);
});

router.post('/generate', async (req, res) => {
  try {
    const profileId = Number(req.body.profileId) || 1;
    const selfDomains = await db.all(
      'SELECT domain, answer, priority FROM profile_domains WHERE profile_id = ?', profileId
    );
    const hasContent = selfDomains.some(d => d.answer.trim().length > 0);
    if (!hasContent) return res.status(400).json({ error: 'Fill in your self-profile first' });

    const activeProvider = (await db.get("SELECT value FROM settings WHERE key = 'active_provider'"))?.value || 'anthropic';
    const provider = getProvider(activeProvider);

    const prompt = buildPrepPrompt(selfDomains);
    const result = await provider.analyze(prompt);

    const stmts = [{ sql: 'DELETE FROM prep_questions WHERE profile_id = ?', args: [profileId] }];
    for (const q of result.questions) {
      stmts.push({
        sql: 'INSERT INTO prep_questions (profile_id, domain, priority, question, guide_aligned, guide_watch, guide_flag) VALUES (?, ?, ?, ?, ?, ?, ?)',
        args: [profileId, q.domain, q.priority, q.question, q.guide_aligned, q.guide_watch, q.guide_flag],
      });
    }
    await db.batch(stmts);

    const questions = await db.all(
      'SELECT * FROM prep_questions WHERE profile_id = ? ORDER BY priority ASC, id ASC', profileId
    );
    res.json(questions);
  } catch (err) {
    console.error('Prep question generation error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/', async (req, res) => {
  const profileId = Number(req.query.profileId) || 1;
  await db.run('DELETE FROM prep_questions WHERE profile_id = ?', profileId);
  res.json({ ok: true });
});

function buildPrepPrompt(selfDomains) {
  const selfMap = {};
  for (const d of selfDomains) selfMap[d.domain] = d;

  let text = `You are generating preparation questions for someone about to meet potential partners in an arranged-marriage context. These questions are for the USER to ask during meetings.

USER'S SELF-PROFILE:
`;
  for (const domain of DOMAINS) {
    const s = selfMap[domain];
    const label = DOMAIN_LABELS[domain];
    const priorityWord = s?.priority === 1 ? 'dealbreaker' : s?.priority === 2 ? 'matters a lot' : 'good to know';
    text += `\n${label} (priority: ${s?.priority || 2} — ${priorityWord}):\n${s?.answer || 'Not specified'}\n`;
  }

  text += `
INSTRUCTIONS:
Generate 12-16 preparation questions, prioritized by the user's domain priorities. Focus more questions on priority-1 domains.

For each question, provide three answer-zone guides calibrated to THIS user's profile:
1. "aligned" — what a reassuring answer sounds like
2. "watch" — worth slowing down for
3. "flag" — take seriously

Return a JSON object with this structure:
{
  "questions": [
    {
      "domain": "<domain key>",
      "priority": <1-3>,
      "question": "The question text",
      "guide_aligned": "What a reassuring answer looks like...",
      "guide_watch": "Worth slowing down for...",
      "guide_flag": "Take seriously..."
    }
  ]
}

Domain keys: ${DOMAINS.join(', ')}

Questions should be natural, conversational, and specific to what this user cares about. Not generic.
Return ONLY the JSON object.`;

  return text;
}

export default router;
