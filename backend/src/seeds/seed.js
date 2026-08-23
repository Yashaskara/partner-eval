import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import db from '../db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function seedProfileQuestions() {
  const existing = await db.get('SELECT COUNT(*) as count FROM profile_questions');
  if (existing?.count > 0) return;

  const raw = readFileSync(path.join(__dirname, 'profile-questions.json'), 'utf-8');
  const data = JSON.parse(raw);

  const stmts = [];
  const crossCuttingInserts = [];

  for (const group of data.domain_questions) {
    for (const q of group.questions) {
      stmts.push({
        sql: `INSERT INTO profile_questions (domain, layer, question_text, options_json, conditional_on, sort_order)
              VALUES (?, ?, ?, ?, ?, ?)`,
        args: [
          group.domain,
          q.layer,
          q.question,
          JSON.stringify(q.options),
          q.conditional_on || null,
          q.sort_order,
        ],
      });
    }
  }

  await db.batch(stmts);

  for (const q of data.cross_cutting) {
    const result = await db.run(
      `INSERT INTO profile_questions (domain, layer, question_text, options_json, sort_order)
       VALUES (NULL, ?, ?, ?, ?)`,
      q.layer, q.question, JSON.stringify(q.options), q.sort_order + 100
    );
    const qId = result.lastInsertRowid;
    for (const domain of q.domains) {
      await db.run(
        'INSERT INTO profile_question_domains (question_id, domain) VALUES (?, ?)',
        qId, domain
      );
    }
  }

  console.log('Seeded profile questions.');
}
