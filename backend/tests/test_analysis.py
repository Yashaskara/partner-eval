import os

# Must run before backend imports: load_dotenv keeps existing values, so this stops .env selecting production Turso.
os.environ["TURSO_DATABASE_URL"] = ""
os.environ["TURSO_AUTH_TOKEN"] = ""

import tempfile
import threading
import unittest
from pathlib import Path
from unittest import mock

from backend.src import config
from backend.src import db as db_module
from backend.src.db import DOMAINS, db
from backend.src.middleware import AuthenticatedUser
from backend.src.routes import analysis

USER_ID = "user-1"


class FakeProvider:
    model = "fake-model"

    def __init__(self, tag="green"):
        self.tag = tag

    def analyze(self, prompt):
        return {
            "result": {
                "summary": "A summary.",
                "assessments": [
                    {"domain": d, "tag": self.tag, "score": 8, "reasoning": "Because."}
                    for d in DOMAINS
                ],
            },
            "usage": {"input_tokens": 10, "output_tokens": 20},
        }


class RunAnalysisTest(unittest.TestCase):
    def setUp(self):
        self.assertFalse(config.TURSO_DATABASE_URL, "tests must never use the remote database")
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        for patcher in (
            mock.patch.object(db_module, "_DB_PATH", Path(tmp.name) / "test.db"),
            mock.patch.object(db_module, "_local", threading.local()),
            mock.patch.object(db_module, "_schema_ready", False),
        ):
            patcher.start()
            self.addCleanup(patcher.stop)

        profile = db.run("INSERT INTO profiles (user_id, name) VALUES (?, ?)", USER_ID, "Me")
        self.profile_id = profile["lastInsertRowid"]
        partner = db.run(
            "INSERT INTO partners (profile_id, user_id, name) VALUES (?, ?, ?)",
            self.profile_id, USER_ID, "Partner",
        )
        self.partner_id = partner["lastInsertRowid"]
        self.user = AuthenticatedUser({"id": USER_ID, "profile_id": self.profile_id})

    def run_with(self, provider):
        with mock.patch.object(analysis, "get_provider", return_value=provider):
            return analysis.run_analysis(self.partner_id, user=self.user)

    def count(self, table):
        return db.get(f"SELECT COUNT(*) AS n FROM {table}")["n"]

    def test_saves_run_and_assessments(self):
        result = self.run_with(FakeProvider())

        self.assertEqual(result["composite"], 8.0)
        run = db.get("SELECT * FROM analysis_runs WHERE id = ?", result["runId"])
        self.assertEqual(run["composite_score"], 8.0)
        self.assertEqual(run["summary"], "A summary.")
        self.assertEqual(self.count("domain_assessments"), len(DOMAINS))

    def test_failed_save_rolls_back_and_leaves_connection_usable(self):
        with self.assertRaises(Exception):
            self.run_with(FakeProvider(tag="purple"))

        self.assertEqual(self.count("analysis_runs"), 0)
        self.assertEqual(self.count("domain_assessments"), 0)

        self.run_with(FakeProvider())
        self.assertEqual(self.count("analysis_runs"), 1)


if __name__ == "__main__":
    unittest.main()
