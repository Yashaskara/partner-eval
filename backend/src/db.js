import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.resolve(__dirname, '../../partner-eval.db');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS self_profile (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    updated_at TEXT DEFAULT (datetime('now')),
    snapshot_json TEXT
  );

  CREATE TABLE IF NOT EXISTS self_profile_domains (
    domain TEXT PRIMARY KEY,
    answer TEXT NOT NULL DEFAULT '',
    priority INTEGER NOT NULL DEFAULT 2 CHECK (priority BETWEEN 1 AND 3),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS partners (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','rejected')),
    dob TEXT,
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    deleted_at TEXT
  );

  CREATE TABLE IF NOT EXISTS partner_domains (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    partner_id INTEGER NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
    domain TEXT NOT NULL,
    answer TEXT NOT NULL DEFAULT '',
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(partner_id, domain)
  );

  CREATE TABLE IF NOT EXISTS analysis_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    partner_id INTEGER NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    summary TEXT NOT NULL DEFAULT '',
    composite_score REAL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS domain_assessments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id INTEGER NOT NULL REFERENCES analysis_runs(id) ON DELETE CASCADE,
    partner_id INTEGER NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
    domain TEXT NOT NULL,
    tag TEXT NOT NULL CHECK (tag IN ('green','amber','red')),
    score INTEGER NOT NULL CHECK (score BETWEEN 1 AND 10),
    reasoning TEXT NOT NULL DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS positives_negatives (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    partner_id INTEGER NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('positive','negative')),
    text TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS prep_questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    domain TEXT NOT NULL,
    priority INTEGER NOT NULL,
    question TEXT NOT NULL,
    guide_aligned TEXT NOT NULL DEFAULT '',
    guide_watch TEXT NOT NULL DEFAULT '',
    guide_flag TEXT NOT NULL DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  INSERT OR IGNORE INTO settings (key, value) VALUES ('active_provider', 'anthropic');
  INSERT OR IGNORE INTO self_profile (id) VALUES (1);
`);

const DOMAINS = [
  'lifestyle', 'career', 'family', 'conflict', 'spirituality', 'finances',
  'children', 'intimacy', 'hobbies', 'health', 'social', 'history'
];

const ensureDomains = db.prepare(
  'INSERT OR IGNORE INTO self_profile_domains (domain) VALUES (?)'
);
for (const d of DOMAINS) ensureDomains.run(d);

export { DOMAINS };
export default db;
