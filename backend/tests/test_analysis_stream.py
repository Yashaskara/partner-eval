import os

# Must run before backend imports: load_dotenv keeps existing values, so this stops .env selecting production Turso.
os.environ["TURSO_DATABASE_URL"] = ""
os.environ["TURSO_AUTH_TOKEN"] = ""

import json
import queue
import tempfile
import threading
import unittest
from pathlib import Path
from unittest import mock

from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.src import config
from backend.src import db as db_module
from backend.src.db import DOMAINS, db
from backend.src.middleware import AuthenticatedUser, check_token_limit, require_auth
from backend.src.routes import analysis

USER_ID = "user-1"
REQUEST_ID = "11111111-2222-3333-4444-555555555555"

RESULT = {
    "summary": "A summary.",
    "assessments": [{"domain": d, "tag": "green", "score": 8, "reasoning": "Because."} for d in DOMAINS],
}
TEXT = json.dumps(RESULT)
USAGE = {"input_tokens": 10, "output_tokens": 20}


class StreamingProvider:
    model = "fake-model"

    def __init__(self, text=TEXT, fail_after=None):
        self.text = text
        self.fail_after = fail_after
        self.stream_calls = 0
        self.analyze_calls = 0

    def stream_analyze(self, prompt):
        self.stream_calls += 1
        for i in range(0, len(self.text), 20):
            if self.fail_after is not None and i >= self.fail_after:
                raise RuntimeError("provider dropped")
            yield {"text": self.text[i:i + 20]}
        yield {"usage": USAGE}

    def analyze(self, prompt):
        self.analyze_calls += 1
        return {"result": RESULT, "usage": USAGE}


class NonStreamingProvider:
    model = "fake-model"

    def analyze(self, prompt):
        raise AssertionError("must not be called")


def parse_events(body: str) -> list[dict]:
    return [json.loads(line[len("data: "):]) for line in body.splitlines() if line.startswith("data: ")]


class StreamEndpointTest(unittest.TestCase):
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

        profile_id = db.run("INSERT INTO profiles (user_id, name) VALUES (?, ?)", USER_ID, "Me")["lastInsertRowid"]
        self.partner_id = db.run(
            "INSERT INTO partners (profile_id, user_id, name) VALUES (?, ?, ?)", profile_id, USER_ID, "Partner",
        )["lastInsertRowid"]
        self.user = AuthenticatedUser({"id": USER_ID, "profile_id": profile_id})

        app = FastAPI()
        app.include_router(analysis.router)
        app.dependency_overrides[check_token_limit] = lambda: self.user
        app.dependency_overrides[require_auth] = lambda: self.user
        self.client = TestClient(app)

    def use(self, provider):
        patcher = mock.patch.object(analysis, "get_provider", return_value=provider)
        patcher.start()
        self.addCleanup(patcher.stop)
        return provider

    def stream(self, request_id=REQUEST_ID, partner_id=None):
        return self.client.post(
            f"/api/analysis/{partner_id or self.partner_id}/stream", json={"requestId": request_id},
        )

    def count(self, table):
        return db.get(f"SELECT COUNT(*) AS n FROM {table}")["n"]

    def test_streams_events_and_saves(self):
        self.use(StreamingProvider())
        response = self.stream()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["content-type"].split(";")[0], "text/event-stream")
        events = parse_events(response.text)
        self.assertEqual(events[0], {"type": "started"})
        self.assertEqual(events[-1]["type"], "done")
        self.assertEqual(events[-1]["composite"], 8.0)
        self.assertEqual("".join(e["text"] for e in events if e["type"] == "summary"), "A summary.")
        self.assertEqual(len([e for e in events if e["type"] == "assessment"]), len(DOMAINS))

        self.assertEqual(self.count("analysis_runs"), 1)
        self.assertEqual(self.count("domain_assessments"), len(DOMAINS))
        usage = db.get("SELECT * FROM llm_usage")
        self.assertEqual(usage["endpoint"], "analysis:stream")
        self.assertEqual(usage["input_tokens"], 10)

    def test_repeating_a_saved_request_does_not_call_the_llm_again(self):
        provider = self.use(StreamingProvider())
        first = parse_events(self.stream().text)[-1]
        second = parse_events(self.stream().text)

        self.assertEqual(provider.stream_calls, 1)
        self.assertEqual(second[-1]["runId"], first["runId"])
        self.assertEqual(len(second[-1]["assessments"]), len(DOMAINS))
        self.assertEqual(self.count("analysis_runs"), 1)

    def test_fallback_post_returns_the_run_the_stream_saved(self):
        provider = self.use(StreamingProvider())
        run_id = parse_events(self.stream().text)[-1]["runId"]

        response = self.client.post(f"/api/analysis/{self.partner_id}", json={"requestId": REQUEST_ID})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["runId"], run_id)
        self.assertEqual(provider.analyze_calls, 0)
        self.assertEqual(self.count("analysis_runs"), 1)

    def test_fallback_post_runs_analysis_when_nothing_saved(self):
        provider = self.use(StreamingProvider())
        response = self.client.post(f"/api/analysis/{self.partner_id}", json={"requestId": REQUEST_ID})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(provider.analyze_calls, 1)
        self.assertEqual(self.count("analysis_runs"), 1)

    def test_post_still_works_without_a_body(self):
        self.use(StreamingProvider())
        self.assertEqual(self.client.post(f"/api/analysis/{self.partner_id}").status_code, 200)

    def test_run_lookup(self):
        self.use(StreamingProvider())
        url = f"/api/analysis/{self.partner_id}/runs/{REQUEST_ID}"
        self.assertEqual(self.client.get(url).status_code, 404)

        run_id = parse_events(self.stream().text)[-1]["runId"]

        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["runId"], run_id)

    def test_job_finishes_and_saves_when_nobody_reads_the_stream(self):
        provider = self.use(StreamingProvider())
        analysis._run_stream_job(
            queue.Queue(), user_id=USER_ID, partner_id=self.partner_id, provider_name="fake",
            provider=provider, prompt="p", self_domains=[], request_id=REQUEST_ID,
        )

        self.assertEqual(self.client.get(f"/api/analysis/{self.partner_id}/runs/{REQUEST_ID}").status_code, 200)

    def test_racing_saves_for_one_request_keep_a_single_run(self):
        first = analysis._save_run(self.partner_id, "fake", "m", RESULT, [], REQUEST_ID)
        second = analysis._save_run(self.partner_id, "fake", "m", RESULT, [], REQUEST_ID)

        self.assertEqual(first["runId"], second["runId"])
        self.assertEqual(self.count("analysis_runs"), 1)
        self.assertEqual(self.count("domain_assessments"), len(DOMAINS))

    def test_failure_before_any_text_is_retryable(self):
        self.use(StreamingProvider(fail_after=0))
        events = parse_events(self.stream().text)

        self.assertEqual(events[-1], {"type": "error", "retryable": True})
        self.assertEqual(self.count("analysis_runs"), 0)

    def test_failure_after_text_is_not_retried_automatically(self):
        self.use(StreamingProvider(fail_after=40))
        events = parse_events(self.stream().text)

        self.assertEqual(events[-1], {"type": "error", "retryable": False})
        self.assertEqual(self.count("analysis_runs"), 0)

    def test_invalid_output_logs_usage_and_saves_nothing(self):
        self.use(StreamingProvider(text='{"summary": "cut off'))
        events = parse_events(self.stream().text)

        self.assertEqual(events[-1], {"type": "error", "retryable": False})
        self.assertEqual(self.count("analysis_runs"), 0)
        self.assertEqual(self.count("llm_usage"), 1)

    def test_invalid_assessment_rolls_back(self):
        bad = {**RESULT, "assessments": [{"domain": "career", "tag": "purple", "score": 8, "reasoning": "x"}]}
        self.use(StreamingProvider(text=json.dumps(bad)))
        events = parse_events(self.stream().text)

        self.assertEqual(events[-1]["type"], "error")
        self.assertEqual(self.count("analysis_runs"), 0)

    def test_provider_without_streaming_returns_501(self):
        self.use(NonStreamingProvider())
        self.assertEqual(self.stream().status_code, 501)

    def test_rejects_invalid_request_id(self):
        self.use(StreamingProvider())
        self.assertEqual(self.stream(request_id="short").status_code, 400)
        self.assertEqual(self.stream(request_id="x" * 8 + "'; DROP").status_code, 400)
        response = self.client.post(f"/api/analysis/{self.partner_id}/stream", json={})
        self.assertEqual(response.status_code, 400)

    def test_other_users_partner_is_not_found(self):
        provider = self.use(StreamingProvider())
        other = db.run(
            "INSERT INTO partners (profile_id, user_id, name) VALUES (?, ?, ?)", 1, "someone-else", "Other",
        )["lastInsertRowid"]

        self.assertEqual(self.stream(partner_id=other).status_code, 404)
        self.assertEqual(self.client.get(f"/api/analysis/{other}/runs/{REQUEST_ID}").status_code, 404)
        self.assertEqual(provider.stream_calls, 0)


if __name__ == "__main__":
    unittest.main()
