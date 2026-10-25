from __future__ import annotations

import libsql_experimental as libsql
from pathlib import Path

from . import config

DOMAINS = [
    "lifestyle", "career", "family", "conflict", "spirituality", "finances",
    "children", "intimacy", "hobbies", "health", "social", "history",
]

_DB_PATH = Path(__file__).resolve().parent.parent.parent / "partner-eval.db"


def _connect() -> libsql.Connection:
    url = config.TURSO_DATABASE_URL
    if url:
        return libsql.connect(url, auth_token=config.TURSO_AUTH_TOKEN or "")
    return libsql.connect(str(_DB_PATH))


_conn: libsql.Connection | None = None


def _get_conn() -> libsql.Connection:
    global _conn
    if _conn is None:
        _conn = _connect()
        _init_schema(_conn)
    return _conn


def _init_schema(conn: libsql.Connection) -> None:
    conn.execute("PRAGMA foreign_keys = ON")

    # --- better-auth tables (kept for compatibility with existing data) ---
    conn.execute('''CREATE TABLE IF NOT EXISTS "user" (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        emailVerified INTEGER NOT NULL DEFAULT 0,
        image TEXT,
        createdAt TEXT NOT NULL DEFAULT (datetime('now')),
        updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    )''')
    conn.execute('''CREATE TABLE IF NOT EXISTS "session" (
        id TEXT PRIMARY KEY,
        expiresAt TEXT NOT NULL,
        token TEXT NOT NULL UNIQUE,
        createdAt TEXT NOT NULL DEFAULT (datetime('now')),
        updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
        ipAddress TEXT,
        userAgent TEXT,
        userId TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE
    )''')
    conn.execute('''CREATE TABLE IF NOT EXISTS "account" (
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
    )''')
    conn.execute('''CREATE TABLE IF NOT EXISTS "verification" (
        id TEXT PRIMARY KEY,
        identifier TEXT NOT NULL,
        value TEXT NOT NULL,
        expiresAt TEXT NOT NULL,
        createdAt TEXT DEFAULT (datetime('now')),
        updatedAt TEXT DEFAULT (datetime('now'))
    )''')

    # --- App tables ---
    conn.execute('''CREATE TABLE IF NOT EXISTS profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL DEFAULT 'Default',
        avatar_emoji TEXT NOT NULL DEFAULT '👤',
        updated_at TEXT DEFAULT (datetime('now')),
        created_at TEXT DEFAULT (datetime('now')),
        snapshot_json TEXT
    )''')
    conn.execute('''CREATE TABLE IF NOT EXISTS profile_domains (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        domain TEXT NOT NULL,
        answer TEXT NOT NULL DEFAULT '',
        priority INTEGER NOT NULL DEFAULT 2 CHECK (priority BETWEEN 1 AND 3),
        updated_at TEXT DEFAULT (datetime('now')),
        UNIQUE(profile_id, domain)
    )''')
    conn.execute('''CREATE TABLE IF NOT EXISTS profile_questions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        domain TEXT,
        layer TEXT NOT NULL CHECK (layer IN ('stance','scenario','tradeoff','reflection')),
        question_text TEXT NOT NULL,
        options_json TEXT NOT NULL DEFAULT '[]',
        conditional_on TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0
    )''')
    conn.execute('''CREATE TABLE IF NOT EXISTS profile_question_domains (
        question_id INTEGER NOT NULL REFERENCES profile_questions(id) ON DELETE CASCADE,
        domain TEXT NOT NULL,
        PRIMARY KEY (question_id, domain)
    )''')
    conn.execute('''CREATE TABLE IF NOT EXISTS profile_answers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        question_id INTEGER NOT NULL REFERENCES profile_questions(id) ON DELETE CASCADE,
        selected_option_index INTEGER,
        selected_option_text TEXT NOT NULL DEFAULT '',
        free_text TEXT NOT NULL DEFAULT '',
        answered_at TEXT DEFAULT (datetime('now')),
        UNIQUE(profile_id, question_id)
    )''')
    conn.execute('''CREATE TABLE IF NOT EXISTS conversations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        domain TEXT,
        summary TEXT NOT NULL DEFAULT '',
        started_at TEXT DEFAULT (datetime('now')),
        ended_at TEXT
    )''')
    conn.execute('''CREATE TABLE IF NOT EXISTS conversation_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK (role IN ('user','assistant')),
        content TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
    )''')
    conn.execute('''CREATE TABLE IF NOT EXISTS partners (
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
    )''')
    conn.execute('''CREATE TABLE IF NOT EXISTS partner_domains (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        partner_id INTEGER NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
        domain TEXT NOT NULL,
        answer TEXT NOT NULL DEFAULT '',
        updated_at TEXT DEFAULT (datetime('now')),
        UNIQUE(partner_id, domain)
    )''')
    conn.execute('''CREATE TABLE IF NOT EXISTS analysis_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        partner_id INTEGER NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        summary TEXT NOT NULL DEFAULT '',
        composite_score REAL,
        created_at TEXT DEFAULT (datetime('now'))
    )''')
    conn.execute('''CREATE TABLE IF NOT EXISTS domain_assessments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id INTEGER NOT NULL REFERENCES analysis_runs(id) ON DELETE CASCADE,
        partner_id INTEGER NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
        domain TEXT NOT NULL,
        tag TEXT NOT NULL CHECK (tag IN ('green','amber','red')),
        score INTEGER NOT NULL CHECK (score BETWEEN 1 AND 10),
        reasoning TEXT NOT NULL DEFAULT '',
        created_at TEXT DEFAULT (datetime('now'))
    )''')
    conn.execute('''CREATE TABLE IF NOT EXISTS positives_negatives (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        partner_id INTEGER NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
        type TEXT NOT NULL CHECK (type IN ('positive','negative')),
        text TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
    )''')
    conn.execute('''CREATE TABLE IF NOT EXISTS prep_questions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        profile_id INTEGER NOT NULL DEFAULT 1 REFERENCES profiles(id) ON DELETE CASCADE,
        domain TEXT NOT NULL,
        priority INTEGER NOT NULL,
        question TEXT NOT NULL,
        guide_aligned TEXT NOT NULL DEFAULT '',
        guide_watch TEXT NOT NULL DEFAULT '',
        guide_flag TEXT NOT NULL DEFAULT '',
        created_at TEXT DEFAULT (datetime('now'))
    )''')
    conn.execute('''CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    )''')
    conn.execute('''CREATE TABLE IF NOT EXISTS user_settings (
        user_id TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        PRIMARY KEY (user_id, key)
    )''')
    conn.execute('''CREATE TABLE IF NOT EXISTS allowlist (
        email TEXT PRIMARY KEY,
        added_at TEXT DEFAULT (datetime('now')),
        added_by TEXT
    )''')
    conn.execute('''CREATE TABLE IF NOT EXISTS access_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL DEFAULT '',
        note TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
        created_at TEXT DEFAULT (datetime('now')),
        reviewed_at TEXT,
        reviewed_by TEXT
    )''')
    conn.execute('''CREATE TABLE IF NOT EXISTS llm_usage (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        endpoint TEXT NOT NULL,
        input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
    )''')
    conn.execute('''CREATE TABLE IF NOT EXISTS user_limits (
        user_id TEXT PRIMARY KEY,
        daily_token_limit INTEGER NOT NULL DEFAULT 100000
    )''')

    conn.execute("INSERT OR IGNORE INTO settings (key, value) VALUES ('active_provider', 'anthropic')")

    # Idempotent ALTER TABLE migrations
    for sql in [
        'ALTER TABLE profiles ADD COLUMN user_id TEXT',
        'ALTER TABLE partners ADD COLUMN user_id TEXT',
        'ALTER TABLE prep_questions ADD COLUMN user_id TEXT',
        'ALTER TABLE conversations ADD COLUMN user_id TEXT',
        "ALTER TABLE \"account\" ADD COLUMN issuer TEXT NOT NULL DEFAULT ''",
    ]:
        try:
            conn.execute(sql)
        except Exception:
            pass

    # Seed allowlisted emails from env
    seed_emails: set[str] = set()
    if config.ADMIN_EMAIL:
        seed_emails.add(config.ADMIN_EMAIL.lower().strip())
    if config.ALLOWLIST_EMAILS:
        for e in config.ALLOWLIST_EMAILS.split(","):
            trimmed = e.strip().lower()
            if trimmed:
                seed_emails.add(trimmed)
    for email in seed_emails:
        conn.execute(
            "INSERT OR IGNORE INTO allowlist (email, added_by) VALUES (?, ?)",
            (email, "system"),
        )

    conn.commit()


def _sanitize(args: tuple) -> tuple:
    return tuple(None if a is None else a for a in args)


class Database:
    def get(self, sql: str, *args) -> dict | None:
        conn = _get_conn()
        result = conn.execute(sql, _sanitize(args))
        row = result.fetchone()
        if row is None:
            return None
        desc = [d[0] for d in result.description]
        return dict(zip(desc, row))

    def all(self, sql: str, *args) -> list[dict]:
        conn = _get_conn()
        result = conn.execute(sql, _sanitize(args))
        desc = [d[0] for d in result.description]
        return [dict(zip(desc, row)) for row in result.fetchall()]

    def run(self, sql: str, *args) -> dict:
        conn = _get_conn()
        conn.execute(sql, _sanitize(args))
        conn.commit()
        last_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        changes = conn.execute("SELECT changes()").fetchone()[0]
        return {"changes": changes, "lastInsertRowid": last_id}

    def batch(self, stmts: list) -> None:
        conn = _get_conn()
        for s in stmts:
            if isinstance(s, str):
                conn.execute(s)
            else:
                conn.execute(s["sql"], _sanitize(tuple(s.get("args", []))))
        conn.commit()

    def transaction(self):
        return _Transaction()


class _Transaction:
    def __enter__(self):
        self._conn = _get_conn()
        self._conn.execute("BEGIN")
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if exc_type:
            self._conn.execute("ROLLBACK")
        return False

    def get(self, sql: str, *args) -> dict | None:
        result = self._conn.execute(sql, _sanitize(args))
        desc = [d[0] for d in result.description]
        row = result.fetchone()
        if row is None:
            return None
        return dict(zip(desc, row))

    def all(self, sql: str, *args) -> list[dict]:
        result = self._conn.execute(sql, _sanitize(args))
        desc = [d[0] for d in result.description]
        return [dict(zip(desc, row)) for row in result.fetchall()]

    def run(self, sql: str, *args) -> dict:
        self._conn.execute(sql, _sanitize(args))
        last_id = self._conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        changes = self._conn.execute("SELECT changes()").fetchone()[0]
        return {"changes": changes, "lastInsertRowid": last_id}

    def commit(self):
        self._conn.execute("COMMIT")

    def rollback(self):
        self._conn.execute("ROLLBACK")


db = Database()
