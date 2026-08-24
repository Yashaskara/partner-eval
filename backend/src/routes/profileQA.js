import { Router } from 'express';
import db, { DOMAINS } from '../db.js';
import { getProvider } from '../llm/index.js';
import { checkTokenLimit } from '../middleware/checkTokenLimit.js';
import { logUsage } from '../llm/meter.js';

const router = Router();

const DOMAIN_LABELS = {
  lifestyle: 'Lifestyle', career: 'Career', family: 'Family',
  conflict: 'Conflict resolution', spirituality: 'Spirituality',
  finances: 'Finances', children: 'Children', intimacy: 'Physical intimacy',
  hobbies: 'Hobbies & interests', health: 'Health',
  social: 'Friends & social life', history: 'Previous relationships',
};

async function getActiveProvider(userId) {
  const userPref = await db.get(
    "SELECT value FROM user_settings WHERE user_id = ? AND key = 'active_provider'", userId
  );
  return userPref?.value
    || (await db.get("SELECT value FROM settings WHERE key = 'active_provider'"))?.value
    || 'anthropic';
}

router.get('/questions/:domain', async (req, res) => {
  const { domain } = req.params;
  const profileId = req.profileId;

  const domainQuestions = await db.all(
    'SELECT * FROM profile_questions WHERE domain = ? ORDER BY sort_order',
    domain
  );

  const allQuestions = domainQuestions.map(q => ({
    ...q,
    options: typeof q.options_json === 'string' ? JSON.parse(q.options_json) : q.options_json,
    domains: q.domains ? q.domains.split(',') : [q.domain],
  }));

  const answers = await db.all(
    `SELECT question_id, selected_option_index, selected_option_text, free_text
     FROM profile_answers WHERE profile_id = ?`,
    profileId
  );
  const answerMap = {};
  for (const a of answers) {
    let indices, texts;
    try { indices = JSON.parse(a.selected_option_index); } catch { indices = a.selected_option_index != null ? [a.selected_option_index] : []; }
    try { texts = JSON.parse(a.selected_option_text); } catch { texts = a.selected_option_text ? [a.selected_option_text] : []; }
    answerMap[a.question_id] = {
      ...a,
      selected_option_indices: Array.isArray(indices) ? indices : [indices],
      selected_option_texts: Array.isArray(texts) ? texts : [texts],
    };
  }

  res.json({ questions: allQuestions, answers: answerMap });
});

router.get('/progress', async (req, res) => {
  const profileId = req.profileId;

  const progress = {};
  for (const domain of DOMAINS) {
    const total = await db.get(
      'SELECT COUNT(*) as count FROM profile_questions WHERE domain = ?',
      domain
    );
    const answered = await db.get(
      `SELECT COUNT(*) as count FROM profile_answers pa
       JOIN profile_questions pq ON pa.question_id = pq.id
       WHERE pa.profile_id = ? AND pq.domain = ?`,
      profileId, domain
    );
    progress[domain] = {
      total: total?.count || 0,
      answered: answered?.count || 0,
      complete: (answered?.count || 0) >= (total?.count || 1),
    };
  }

  const crossCuttingTotal = await db.get(
    'SELECT COUNT(*) as count FROM profile_questions WHERE domain IS NULL'
  );
  const crossCuttingAnswered = await db.get(
    `SELECT COUNT(*) as count FROM profile_answers pa
     JOIN profile_questions pq ON pa.question_id = pq.id
     WHERE pa.profile_id = ? AND pq.domain IS NULL`,
    profileId
  );

  const completedDomains = Object.values(progress).filter(p => p.complete).length;
  const unlocked = completedDomains >= 3;

  progress._crossCutting = {
    total: crossCuttingTotal?.count || 0,
    answered: crossCuttingAnswered?.count || 0,
    unlocked,
  };

  res.json(progress);
});

router.get('/cross-cutting', async (req, res) => {
  const profileId = req.profileId;

  const completedDomains = [];
  for (const domain of DOMAINS) {
    const total = await db.get(
      'SELECT COUNT(*) as count FROM profile_questions WHERE domain = ?', domain
    );
    const answered = await db.get(
      `SELECT COUNT(*) as count FROM profile_answers pa
       JOIN profile_questions pq ON pa.question_id = pq.id
       WHERE pa.profile_id = ? AND pq.domain = ?`,
      profileId, domain
    );
    if ((answered?.count || 0) >= (total?.count || 1)) completedDomains.push(domain);
  }

  const questions = await db.all(
    `SELECT pq.*, GROUP_CONCAT(pqd.domain) as domains
     FROM profile_questions pq
     JOIN profile_question_domains pqd ON pqd.question_id = pq.id
     WHERE pq.domain IS NULL
     GROUP BY pq.id
     ORDER BY pq.sort_order`
  );

  const eligible = questions.filter(q => {
    const needed = q.domains.split(',');
    return needed.every(d => completedDomains.includes(d));
  }).map(q => ({
    ...q,
    options: typeof q.options_json === 'string' ? JSON.parse(q.options_json) : q.options_json,
    domains: q.domains.split(','),
  }));

  const answers = await db.all(
    'SELECT question_id, selected_option_index, selected_option_text, free_text FROM profile_answers WHERE profile_id = ?',
    profileId
  );
  const answerMap = {};
  for (const a of answers) answerMap[a.question_id] = a;

  res.json({ questions: eligible, answers: answerMap });
});

router.post('/answer', async (req, res) => {
  const profileId = req.profileId;
  const { questionId, selectedOptionIndices, selectedOptionTexts, freeText,
          selectedOptionIndex, selectedOptionText } = req.body;
  if (questionId == null) return res.status(400).json({ error: 'questionId required' });

  const indices = selectedOptionIndices ?? (selectedOptionIndex != null ? [selectedOptionIndex] : []);
  const texts = selectedOptionTexts ?? (selectedOptionText ? [selectedOptionText] : []);

  await db.run(
    `INSERT INTO profile_answers (profile_id, question_id, selected_option_index, selected_option_text, free_text)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(profile_id, question_id) DO UPDATE SET
       selected_option_index = excluded.selected_option_index,
       selected_option_text = excluded.selected_option_text,
       free_text = excluded.free_text,
       answered_at = datetime('now')`,
    profileId, questionId, JSON.stringify(indices), JSON.stringify(texts), freeText || ''
  );

  res.json({ ok: true });
});

router.post('/summarize/:domain', checkTokenLimit, async (req, res) => {
  try {
    const { domain } = req.params;
    const profileId = req.profileId;

    if (!DOMAINS.includes(domain)) return res.status(400).json({ error: 'Invalid domain' });

    const domainAnswers = await db.all(
      `SELECT pq.question_text, pq.layer, pa.selected_option_text, pa.free_text
       FROM profile_answers pa
       JOIN profile_questions pq ON pa.question_id = pq.id
       WHERE pa.profile_id = ? AND pq.domain = ?
       ORDER BY pq.sort_order`,
      profileId, domain
    );

    const crossCuttingAnswers = await db.all(
      `SELECT pq.question_text, pq.layer, pa.selected_option_text, pa.free_text
       FROM profile_answers pa
       JOIN profile_questions pq ON pa.question_id = pq.id
       JOIN profile_question_domains pqd ON pqd.question_id = pq.id
       WHERE pa.profile_id = ? AND pqd.domain = ? AND pq.domain IS NULL`,
      profileId, domain
    );

    const allAnswers = [...domainAnswers, ...crossCuttingAnswers];
    if (allAnswers.length === 0) return res.status(400).json({ error: 'No answers to summarize' });

    const activeProvider = await getActiveProvider(req.user.id);
    const provider = getProvider(activeProvider);

    let prompt = `You are analyzing someone's answers about the "${DOMAIN_LABELS[domain]}" domain of their life to build their relationship profile.

Here are their answers:

`;
    for (const a of allAnswers) {
      prompt += `Q (${a.layer}): ${a.question_text}\n`;
      let texts;
      try { texts = JSON.parse(a.selected_option_text); } catch { texts = [a.selected_option_text]; }
      prompt += `Selected: ${Array.isArray(texts) ? texts.join('; ') : texts}\n`;
      if (a.free_text) prompt += `Additional thoughts: ${a.free_text}\n`;
      prompt += '\n';
    }

    prompt += `Based on these answers, produce a JSON response with:
{
  "summary": "A 2-4 sentence first-person summary (use 'I want...', 'I value...', 'I need...') that captures what matters most to this person in ${DOMAIN_LABELS[domain]}. Be specific and concrete — not generic. Pay attention to contradictions between stated preferences and scenario choices.",
  "priority": <1, 2, or 3>,
  "priority_reasoning": "One sentence explaining why you chose this priority level based on the intensity of their answers."
}

Priority guide:
- 1 (Dealbreaker territory): Strong, non-negotiable positions. Scenario answers show rigidity or intensity.
- 2 (Matters a lot): Clear preferences but some flexibility. Willing to compromise in scenarios.
- 3 (Good to know): Relaxed or uncertain. Scenarios show adaptability.

Return ONLY the JSON object.`;

    const { result, usage } = await provider.analyze(prompt);
    await logUsage(req.user.id, activeProvider, provider.model, 'profileQA:summarize', usage);

    res.json({
      summary: result.summary,
      priority: result.priority,
      priority_reasoning: result.priority_reasoning,
    });
  } catch (err) {
    console.error('Summarize error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/save-summary/:domain', async (req, res) => {
  const { domain } = req.params;
  const profileId = req.profileId;
  const { summary, priority } = req.body;

  if (!DOMAINS.includes(domain)) return res.status(400).json({ error: 'Invalid domain' });

  await db.run(
    `UPDATE profile_domains SET answer = ?, priority = ?, updated_at = datetime('now')
     WHERE profile_id = ? AND domain = ?`,
    summary, priority, profileId, domain
  );
  await db.run(
    "UPDATE profiles SET updated_at = datetime('now') WHERE id = ?",
    profileId
  );

  res.json({ ok: true });
});

export default router;
