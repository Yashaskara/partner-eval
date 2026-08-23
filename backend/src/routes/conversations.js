import { Router } from 'express';
import db, { DOMAINS } from '../db.js';
import { getProvider } from '../llm/index.js';

const router = Router();

const DOMAIN_LABELS = {
  lifestyle: 'Lifestyle', career: 'Career', family: 'Family',
  conflict: 'Conflict resolution', spirituality: 'Spirituality',
  finances: 'Finances', children: 'Children', intimacy: 'Physical intimacy',
  hobbies: 'Hobbies & interests', health: 'Health',
  social: 'Friends & social life', history: 'Previous relationships',
};

router.get('/', async (req, res) => {
  const profileId = Number(req.query.profileId) || 1;
  const conversations = await db.all(
    'SELECT * FROM conversations WHERE profile_id = ? ORDER BY started_at DESC',
    profileId
  );
  res.json(conversations);
});

router.post('/', async (req, res) => {
  const { profileId = 1, domain } = req.body;
  const result = await db.run(
    'INSERT INTO conversations (profile_id, domain) VALUES (?, ?)',
    profileId, domain || null
  );
  res.status(201).json({ id: result.lastInsertRowid });
});

router.get('/:id/messages', async (req, res) => {
  const messages = await db.all(
    'SELECT * FROM conversation_messages WHERE conversation_id = ? ORDER BY created_at',
    req.params.id
  );
  res.json(messages);
});

router.post('/:id/message', async (req, res) => {
  try {
    const conversationId = req.params.id;
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: 'content required' });

    const conversation = await db.get('SELECT * FROM conversations WHERE id = ?', conversationId);
    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });

    await db.run(
      'INSERT INTO conversation_messages (conversation_id, role, content) VALUES (?, ?, ?)',
      conversationId, 'user', content
    );

    const profileDomains = await db.all(
      'SELECT domain, answer, priority FROM profile_domains WHERE profile_id = ?',
      conversation.profile_id
    );

    const history = await db.all(
      'SELECT role, content FROM conversation_messages WHERE conversation_id = ? ORDER BY created_at',
      conversationId
    );

    let domainContext = '';
    for (const d of profileDomains) {
      if (d.answer) {
        domainContext += `${DOMAIN_LABELS[d.domain]} (priority ${d.priority}): ${d.answer}\n`;
      }
    }

    const system = `You are a thoughtful conversational partner helping someone refine what they want in a life partner. You know them well from their profile.

Here's what you know about them:
${domainContext || 'No profile filled in yet.'}

Be warm, perceptive, and natural. Ask follow-up questions that go deeper. If they share something that shifts or refines their preferences, acknowledge it. Don't summarize or update anything — just have a genuine conversation. Keep responses concise (2-4 sentences).`;

    const messages = history.map(m => ({ role: m.role, content: m.content }));

    const activeProvider = (await db.get("SELECT value FROM settings WHERE key = 'active_provider'"))?.value || 'anthropic';
    const provider = getProvider(activeProvider);
    const reply = await provider.chat(system, messages);

    await db.run(
      'INSERT INTO conversation_messages (conversation_id, role, content) VALUES (?, ?, ?)',
      conversationId, 'assistant', reply
    );

    res.json({ role: 'assistant', content: reply });
  } catch (err) {
    console.error('Conversation error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/classify', async (req, res) => {
  try {
    const conversationId = req.params.id;
    const conversation = await db.get('SELECT * FROM conversations WHERE id = ?', conversationId);
    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });

    const messages = await db.all(
      'SELECT role, content FROM conversation_messages WHERE conversation_id = ? ORDER BY created_at',
      conversationId
    );

    const transcript = messages.map(m => `${m.role}: ${m.content}`).join('\n');

    const activeProvider = (await db.get("SELECT value FROM settings WHERE key = 'active_provider'"))?.value || 'anthropic';
    const provider = getProvider(activeProvider);

    const prompt = `Analyze this conversation and determine which life domains were discussed or revealed preferences about.

Conversation:
${transcript}

The 12 domains are: ${DOMAINS.map(d => `${d} (${DOMAIN_LABELS[d]})`).join(', ')}

Return a JSON object:
{
  "domains": ["domain1", "domain2"],
  "reasoning": "Brief explanation of what was revealed about each domain"
}

Only include domains where the conversation revealed meaningful new information or a shift in preferences. Return ONLY the JSON.`;

    const result = await provider.analyze(prompt);
    res.json(result);
  } catch (err) {
    console.error('Classify error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/update-preferences', async (req, res) => {
  try {
    const conversationId = req.params.id;
    const { domains: targetDomains } = req.body;
    if (!Array.isArray(targetDomains) || targetDomains.length === 0) {
      return res.status(400).json({ error: 'domains array required' });
    }

    const conversation = await db.get('SELECT * FROM conversations WHERE id = ?', conversationId);
    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });

    const messages = await db.all(
      'SELECT role, content FROM conversation_messages WHERE conversation_id = ? ORDER BY created_at',
      conversationId
    );
    const transcript = messages.map(m => `${m.role}: ${m.content}`).join('\n');

    const currentSummaries = {};
    for (const domain of targetDomains) {
      const row = await db.get(
        'SELECT answer, priority FROM profile_domains WHERE profile_id = ? AND domain = ?',
        conversation.profile_id, domain
      );
      currentSummaries[domain] = row;
    }

    const activeProvider = (await db.get("SELECT value FROM settings WHERE key = 'active_provider'"))?.value || 'anthropic';
    const provider = getProvider(activeProvider);

    let prompt = `Based on a recent conversation, update the user's profile summaries for the following domains.

Current summaries:
`;
    for (const domain of targetDomains) {
      const s = currentSummaries[domain];
      prompt += `\n${DOMAIN_LABELS[domain]} (priority ${s?.priority || 2}):\n${s?.answer || 'Empty — no summary yet'}\n`;
    }

    prompt += `\nRecent conversation:\n${transcript}\n`;

    prompt += `\nReturn a JSON object with updated summaries for ONLY the domains that should change:
{
  "updates": [
    {
      "domain": "<domain key>",
      "old_summary": "the current summary",
      "new_summary": "Updated first-person summary incorporating new insights from the conversation. Keep it 2-4 sentences, concrete and specific.",
      "priority": <1, 2, or 3>,
      "change_reason": "One sentence explaining what changed and why"
    }
  ]
}

If a domain's summary doesn't need to change based on this conversation, omit it. Use first person ("I want...", "I value..."). Return ONLY the JSON.`;

    const result = await provider.analyze(prompt);

    await db.run(
      "UPDATE conversations SET summary = ?, ended_at = datetime('now') WHERE id = ?",
      transcript.slice(0, 500), conversationId
    );

    res.json(result);
  } catch (err) {
    console.error('Update preferences error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/apply-updates', async (req, res) => {
  const conversationId = req.params.id;
  const { updates } = req.body;
  if (!Array.isArray(updates)) return res.status(400).json({ error: 'updates array required' });

  const conversation = await db.get('SELECT * FROM conversations WHERE id = ?', conversationId);
  if (!conversation) return res.status(404).json({ error: 'Conversation not found' });

  const stmts = [];
  for (const u of updates) {
    if (!DOMAINS.includes(u.domain)) continue;
    stmts.push({
      sql: `UPDATE profile_domains SET answer = ?, priority = ?, updated_at = datetime('now')
            WHERE profile_id = ? AND domain = ?`,
      args: [u.new_summary, u.priority, conversation.profile_id, u.domain],
    });
  }
  stmts.push({
    sql: "UPDATE profiles SET updated_at = datetime('now') WHERE id = ?",
    args: [conversation.profile_id],
  });
  await db.batch(stmts);

  res.json({ ok: true });
});

export default router;
