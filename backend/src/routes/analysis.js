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
  hobbies: 'Hobbies', health: 'Health', social: 'Friends & social',
  history: 'Previous relationships',
};

function computeComposite(assessments, selfDomains) {
  const priorityMap = {};
  for (const d of selfDomains) priorityMap[d.domain] = d.priority;

  let num = 0, den = 0;
  for (const a of assessments) {
    const p = priorityMap[a.domain] || 2;
    const w = p === 1 ? 3 : p === 2 ? 2 : 1;
    num += a.score * w;
    den += w;
  }
  return den > 0 ? Math.round((num / den) * 10) / 10 : 0;
}

async function getActiveProvider(userId) {
  const userPref = await db.get(
    "SELECT value FROM user_settings WHERE user_id = ? AND key = 'active_provider'", userId
  );
  return userPref?.value
    || (await db.get("SELECT value FROM settings WHERE key = 'active_provider'"))?.value
    || 'anthropic';
}

router.post('/:partnerId', checkTokenLimit, async (req, res) => {
  try {
    const partnerId = req.params.partnerId;
    const partner = await db.get('SELECT * FROM partners WHERE id = ? AND user_id = ? AND deleted_at IS NULL', partnerId, req.user.id);
    if (!partner) return res.status(404).json({ error: 'Partner not found' });

    const partnerDomains = await db.all('SELECT domain, answer FROM partner_domains WHERE partner_id = ?', partnerId);
    const selfDomains = await db.all(
      'SELECT domain, answer, priority FROM profile_domains WHERE profile_id = ?',
      partner.profile_id
    );

    const activeProvider = await getActiveProvider(req.user.id);
    const provider = getProvider(activeProvider);

    const prompt = buildPrompt(partner, partnerDomains, selfDomains);
    const { result, usage } = await provider.analyze(prompt);
    await logUsage(req.user.id, activeProvider, provider.model, 'analysis:run', usage);

    const tx = await db.transaction();
    try {
      const run = await tx.run(
        'INSERT INTO analysis_runs (partner_id, provider, model, summary, composite_score) VALUES (?, ?, ?, ?, ?)',
        partnerId, activeProvider, provider.model, result.summary, 0
      );
      const runId = run.lastInsertRowid;

      const assessments = [];
      for (const a of result.assessments) {
        await tx.run(
          'INSERT INTO domain_assessments (run_id, partner_id, domain, tag, score, reasoning) VALUES (?, ?, ?, ?, ?, ?)',
          runId, partnerId, a.domain, a.tag, a.score, a.reasoning
        );
        assessments.push(a);
      }

      const composite = computeComposite(assessments, selfDomains);
      await tx.run('UPDATE analysis_runs SET composite_score = ? WHERE id = ?', composite, runId);
      await tx.commit();

      res.json({ runId, composite, summary: result.summary, assessments: result.assessments });
    } catch (e) {
      await tx.rollback();
      throw e;
    }
  } catch (err) {
    console.error('Analysis error:', err);
    res.status(500).json({ error: err.message });
  }
});

function buildPrompt(partner, partnerDomains, selfDomains) {
  const selfMap = {};
  for (const d of selfDomains) selfMap[d.domain] = d;
  const partnerMap = {};
  for (const d of partnerDomains) partnerMap[d.domain] = d;

  let text = `You are evaluating compatibility between a user and a potential partner for an arranged-marriage-style meeting.

USER'S SELF-PROFILE:
`;
  for (const domain of DOMAINS) {
    const s = selfMap[domain];
    const label = DOMAIN_LABELS[domain];
    const priorityWord = s?.priority === 1 ? 'dealbreaker' : s?.priority === 2 ? 'matters a lot' : 'good to know';
    text += `\n${label} (priority: ${s?.priority || 2} — ${priorityWord}):\n${s?.answer || 'Not specified'}\n`;
  }

  text += `\nPARTNER: ${partner.name}`;
  if (partner.source) text += ` (${partner.source})`;
  text += `\n`;
  if (partner.notes) text += `General notes: ${partner.notes}\n`;

  text += `\nPARTNER'S DOMAIN INFORMATION:\n`;
  for (const domain of DOMAINS) {
    const p = partnerMap[domain];
    const label = DOMAIN_LABELS[domain];
    text += `\n${label}:\n${p?.answer || 'Unknown / not discussed'}\n`;
  }

  text += `
INSTRUCTIONS:
Produce a JSON object with exactly this structure:
{
  "summary": "A holistic 150-250 word narrative assessment of the compatibility. Write in second person ('you'). Be honest and specific, not generic.",
  "assessments": [
    {
      "domain": "<domain key>",
      "tag": "green|amber|red",
      "score": <1-10 integer>,
      "reasoning": "2-3 sentences explaining this score, written in second person."
    }
  ]
}

The domain keys are: ${DOMAINS.join(', ')}

Scoring guide:
- green (7-10): aligned or better than expected
- amber (5-6): worth watching, not yet clear, or minor friction
- red (1-4): meaningful gap or flag

If a domain has no information, still assess it — give it an amber 5 with reasoning noting that it hasn't been discussed yet.

Return ONLY the JSON object, no markdown fences or other text.`;

  return text;
}

export default router;
