import { createClient } from '@libsql/client';
import { fileURLToPath } from 'url';
import path from 'path';

let url = process.env.TURSO_DATABASE_URL;
if (!url) {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  url = `file:${path.resolve(__dirname, '../../partner-eval.db')}`;
}

const client = createClient({
  url,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

await client.execute('PRAGMA foreign_keys = ON');

// --- better-auth tables (must exist before auth handler runs) ---
await client.batch([
  `CREATE TABLE IF NOT EXISTS "user" (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    emailVerified INTEGER NOT NULL DEFAULT 0,
    image TEXT,
    createdAt TEXT NOT NULL DEFAULT (datetime('now')),
    updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS "session" (
    id TEXT PRIMARY KEY,
    expiresAt TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE,
    createdAt TEXT NOT NULL DEFAULT (datetime('now')),
    updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
    ipAddress TEXT,
    userAgent TEXT,
    userId TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "account" (
    id TEXT PRIMARY KEY,
    issuer TEXT NOT NULL DEFAULT '',
    accountId TEXT NOT NULL,
    providerId TEXT NOT NULL,
    userId TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    accessToken TEXT,
    refreshToken TEXT,
    idToken TEXT,
    accessTokenExpiresAt TEXT,
    refreshTokenExpiresAt TEXT,
    scope TEXT,
    password TEXT,
    createdAt TEXT NOT NULL DEFAULT (datetime('now')),
    updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS "verification" (
    id TEXT PRIMARY KEY,
    identifier TEXT NOT NULL,
    value TEXT NOT NULL,
    expiresAt TEXT NOT NULL,
    createdAt TEXT DEFAULT (datetime('now')),
    updatedAt TEXT DEFAULT (datetime('now'))
  )`,
], 'write');

await client.batch([
  // --- Profiles (was self_profile, now multi-profile) ---
  `CREATE TABLE IF NOT EXISTS profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL DEFAULT 'Default',
    avatar_emoji TEXT NOT NULL DEFAULT '👤',
    updated_at TEXT DEFAULT (datetime('now')),
    created_at TEXT DEFAULT (datetime('now')),
    snapshot_json TEXT
  )`,

  // --- Profile domains (was self_profile_domains, now per-profile) ---
  `CREATE TABLE IF NOT EXISTS profile_domains (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    domain TEXT NOT NULL,
    answer TEXT NOT NULL DEFAULT '',
    priority INTEGER NOT NULL DEFAULT 2 CHECK (priority BETWEEN 1 AND 3),
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(profile_id, domain)
  )`,

  // --- Question bank (seeded from JSON) ---
  `CREATE TABLE IF NOT EXISTS profile_questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    domain TEXT,
    layer TEXT NOT NULL CHECK (layer IN ('stance','scenario','tradeoff','reflection')),
    question_text TEXT NOT NULL,
    options_json TEXT NOT NULL DEFAULT '[]',
    conditional_on TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0
  )`,

  // --- Cross-cutting question → domain mapping ---
  `CREATE TABLE IF NOT EXISTS profile_question_domains (
    question_id INTEGER NOT NULL REFERENCES profile_questions(id) ON DELETE CASCADE,
    domain TEXT NOT NULL,
    PRIMARY KEY (question_id, domain)
  )`,

  // --- User answers to profile questions ---
  `CREATE TABLE IF NOT EXISTS profile_answers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    question_id INTEGER NOT NULL REFERENCES profile_questions(id) ON DELETE CASCADE,
    selected_option_index INTEGER,
    selected_option_text TEXT NOT NULL DEFAULT '',
    free_text TEXT NOT NULL DEFAULT '',
    answered_at TEXT DEFAULT (datetime('now')),
    UNIQUE(profile_id, question_id)
  )`,

  // --- Conversations (session-based, per profile) ---
  `CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    domain TEXT,
    summary TEXT NOT NULL DEFAULT '',
    started_at TEXT DEFAULT (datetime('now')),
    ended_at TEXT
  )`,

  // --- Conversation messages ---
  `CREATE TABLE IF NOT EXISTS conversation_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user','assistant')),
    content TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  )`,

  // --- Partners (now per-profile) ---
  `CREATE TABLE IF NOT EXISTS partners (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id INTEGER NOT NULL DEFAULT 1 REFERENCES profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','rejected')),
    dob TEXT,
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    deleted_at TEXT
  )`,

  `CREATE TABLE IF NOT EXISTS partner_domains (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    partner_id INTEGER NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
    domain TEXT NOT NULL,
    answer TEXT NOT NULL DEFAULT '',
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(partner_id, domain)
  )`,

  `CREATE TABLE IF NOT EXISTS analysis_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    partner_id INTEGER NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    summary TEXT NOT NULL DEFAULT '',
    composite_score REAL,
    created_at TEXT DEFAULT (datetime('now'))
  )`,

  `CREATE TABLE IF NOT EXISTS domain_assessments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id INTEGER NOT NULL REFERENCES analysis_runs(id) ON DELETE CASCADE,
    partner_id INTEGER NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
    domain TEXT NOT NULL,
    tag TEXT NOT NULL CHECK (tag IN ('green','amber','red')),
    score INTEGER NOT NULL CHECK (score BETWEEN 1 AND 10),
    reasoning TEXT NOT NULL DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  )`,

  `CREATE TABLE IF NOT EXISTS positives_negatives (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    partner_id INTEGER NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('positive','negative')),
    text TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  )`,

  // --- Prep questions (now per-profile) ---
  `CREATE TABLE IF NOT EXISTS prep_questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id INTEGER NOT NULL DEFAULT 1 REFERENCES profiles(id) ON DELETE CASCADE,
    domain TEXT NOT NULL,
    priority INTEGER NOT NULL,
    question TEXT NOT NULL,
    guide_aligned TEXT NOT NULL DEFAULT '',
    guide_watch TEXT NOT NULL DEFAULT '',
    guide_flag TEXT NOT NULL DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  )`,

  `CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS user_settings (
    user_id TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    PRIMARY KEY (user_id, key)
  )`,

  `CREATE TABLE IF NOT EXISTS allowlist (
    email TEXT PRIMARY KEY,
    added_at TEXT DEFAULT (datetime('now')),
    added_by TEXT
  )`,

  `CREATE TABLE IF NOT EXISTS access_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
    created_at TEXT DEFAULT (datetime('now')),
    reviewed_at TEXT,
    reviewed_by TEXT
  )`,

  `CREATE TABLE IF NOT EXISTS llm_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  )`,

  `CREATE TABLE IF NOT EXISTS user_limits (
    user_id TEXT PRIMARY KEY,
    daily_token_limit INTEGER NOT NULL DEFAULT 100000
  )`,

  `INSERT OR IGNORE INTO settings (key, value) VALUES ('active_provider', 'anthropic')`,
], 'write');

const DOMAINS = [
  'lifestyle', 'career', 'family', 'conflict', 'spirituality', 'finances',
  'children', 'intimacy', 'hobbies', 'health', 'social', 'history'
];

// Seed allowlisted emails from env vars
const seedEmails = [];
if (process.env.ADMIN_EMAIL) {
  seedEmails.push(process.env.ADMIN_EMAIL.toLowerCase().trim());
}
if (process.env.ALLOWLIST_EMAILS) {
  for (const e of process.env.ALLOWLIST_EMAILS.split(',')) {
    const trimmed = e.trim().toLowerCase();
    if (trimmed) seedEmails.push(trimmed);
  }
}
for (const email of [...new Set(seedEmails)]) {
  await client.execute({
    sql: 'INSERT OR IGNORE INTO allowlist (email, added_by) VALUES (?, ?)',
    args: [email, 'system'],
  });
}

// Idempotent ALTER TABLE migrations for user_id columns
const alterMigrations = [
  'ALTER TABLE profiles ADD COLUMN user_id TEXT',
  'ALTER TABLE partners ADD COLUMN user_id TEXT',
  'ALTER TABLE prep_questions ADD COLUMN user_id TEXT',
  'ALTER TABLE conversations ADD COLUMN user_id TEXT',
  `ALTER TABLE "account" ADD COLUMN issuer TEXT NOT NULL DEFAULT ''`,
];
for (const sql of alterMigrations) {
  try { await client.execute(sql); } catch {}
}

function sanitize(args) {
  return args.map(a => a === undefined ? null : a);
}

const db = {
  async get(sql, ...args) {
    const result = await client.execute({ sql, args: sanitize(args) });
    return result.rows[0];
  },
  async all(sql, ...args) {
    const result = await client.execute({ sql, args: sanitize(args) });
    return result.rows;
  },
  async run(sql, ...args) {
    const result = await client.execute({ sql, args: sanitize(args) });
    return { changes: result.rowsAffected, lastInsertRowid: Number(result.lastInsertRowid) };
  },
  async batch(stmts) {
    return client.batch(stmts.map(s =>
      typeof s === 'string' ? s : { sql: s.sql, args: sanitize(s.args || []) }
    ), 'write');
  },
  async transaction(mode = 'write') {
    const tx = await client.transaction(mode);
    return {
      async get(sql, ...args) {
        const result = await tx.execute({ sql, args: sanitize(args) });
        return result.rows[0];
      },
      async all(sql, ...args) {
        const result = await tx.execute({ sql, args: sanitize(args) });
        return result.rows;
      },
      async run(sql, ...args) {
        const result = await tx.execute({ sql, args: sanitize(args) });
        return { changes: result.rowsAffected, lastInsertRowid: Number(result.lastInsertRowid) };
      },
      commit: () => tx.commit(),
      rollback: () => tx.rollback(),
    };
  },
};

export { DOMAINS };
export default db;
