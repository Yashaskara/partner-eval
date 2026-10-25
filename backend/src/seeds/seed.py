import json
from pathlib import Path

from ..db import db

_SEED_FILE = Path(__file__).parent / "profile-questions.json"


def seed_profile_questions() -> None:
    existing = db.get("SELECT COUNT(*) as count FROM profile_questions")
    if existing and int(existing["count"]) > 0:
        _deduplicate_questions()
        return

    raw = json.loads(_SEED_FILE.read_text())

    stmts: list = []
    for group in raw["domain_questions"]:
        for q in group["questions"]:
            stmts.append({
                "sql": (
                    "INSERT INTO profile_questions (domain, layer, question_text, options_json, conditional_on, sort_order) "
                    "VALUES (?, ?, ?, ?, ?, ?)"
                ),
                "args": [
                    group["domain"],
                    q["layer"],
                    q["question"],
                    json.dumps(q["options"]),
                    q.get("conditional_on"),
                    q["sort_order"],
                ],
            })
    db.batch(stmts)

    for q in raw.get("cross_cutting", []):
        result = db.run(
            "INSERT INTO profile_questions (domain, layer, question_text, options_json, sort_order) VALUES (NULL, ?, ?, ?, ?)",
            q["layer"], q["question"], json.dumps(q["options"]), q["sort_order"] + 100,
        )
        q_id = result["lastInsertRowid"]
        for domain in q["domains"]:
            db.run(
                "INSERT INTO profile_question_domains (question_id, domain) VALUES (?, ?)",
                q_id, domain,
            )

    print("Seeded profile questions.")


def _deduplicate_questions() -> None:
    dupes = db.all(
        "SELECT domain, layer, question_text, MIN(id) as keep_id, COUNT(*) as cnt "
        "FROM profile_questions GROUP BY domain, layer, question_text HAVING cnt > 1"
    )
    if not dupes:
        return
    for d in dupes:
        extras = db.all(
            'SELECT id FROM profile_questions WHERE domain IS ? AND layer = ? AND question_text = ? AND id != ?',
            d["domain"], d["layer"], d["question_text"], d["keep_id"],
        )
        for e in extras:
            db.run("DELETE FROM profile_answers WHERE question_id = ?", e["id"])
            db.run("DELETE FROM profile_question_domains WHERE question_id = ?", e["id"])
            db.run("DELETE FROM profile_questions WHERE id = ?", e["id"])
    print(f"Deduplicated {len(dupes)} question groups.")
