from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException

from ..db import DOMAINS, db
from ..llm.meter import log_usage
from ..llm.providers import get_provider
from ..middleware import AuthenticatedUser, require_auth, check_token_limit

router = APIRouter(prefix="/api/profile-qa")

DOMAIN_LABELS = {
    "lifestyle": "Lifestyle", "career": "Career", "family": "Family",
    "conflict": "Conflict resolution", "spirituality": "Spirituality",
    "finances": "Finances", "children": "Children", "intimacy": "Physical intimacy",
    "hobbies": "Hobbies & interests", "health": "Health",
    "social": "Friends & social life", "history": "Previous relationships",
}


def _get_active_provider(user_id: str) -> str:
    user_pref = db.get(
        "SELECT value FROM user_settings WHERE user_id = ? AND key = 'active_provider'", user_id,
    )
    return (
        (user_pref or {}).get("value")
        or (db.get("SELECT value FROM settings WHERE key = 'active_provider'") or {}).get("value")
        or "anthropic"
    )


def _parse_json_or_wrap(val):
    if val is None:
        return []
    try:
        parsed = json.loads(val)
        return parsed if isinstance(parsed, list) else [parsed]
    except (json.JSONDecodeError, TypeError):
        return [val] if val else []


@router.get("/questions/{domain}")
def get_questions(domain: str, user: AuthenticatedUser = Depends(require_auth)):
    profile_id = user.profile_id

    domain_questions = db.all(
        "SELECT * FROM profile_questions WHERE domain = ? ORDER BY sort_order", domain,
    )
    all_questions = []
    for q in domain_questions:
        options = q.get("options_json")
        if isinstance(options, str):
            try:
                options = json.loads(options)
            except json.JSONDecodeError:
                pass
        domains = q["domains"].split(",") if q.get("domains") else [q.get("domain")]
        all_questions.append({**q, "options": options, "domains": domains})

    answers = db.all(
        "SELECT question_id, selected_option_index, selected_option_text, free_text "
        "FROM profile_answers WHERE profile_id = ?",
        profile_id,
    )
    answer_map = {}
    for a in answers:
        indices = _parse_json_or_wrap(a.get("selected_option_index"))
        texts = _parse_json_or_wrap(a.get("selected_option_text"))
        answer_map[a["question_id"]] = {
            **a,
            "selected_option_indices": indices,
            "selected_option_texts": texts,
        }

    return {"questions": all_questions, "answers": answer_map}


@router.get("/progress")
def get_progress(user: AuthenticatedUser = Depends(require_auth)):
    profile_id = user.profile_id
    progress = {}

    for domain in DOMAINS:
        total = db.get(
            "SELECT COUNT(*) as count FROM profile_questions WHERE domain = ?", domain,
        )
        answered = db.get(
            "SELECT COUNT(*) as count FROM profile_answers pa "
            "JOIN profile_questions pq ON pa.question_id = pq.id "
            "WHERE pa.profile_id = ? AND pq.domain = ?",
            profile_id, domain,
        )
        t = int((total or {}).get("count", 0))
        a = int((answered or {}).get("count", 0))
        progress[domain] = {"total": t, "answered": a, "complete": a >= max(t, 1)}

    cc_total = db.get("SELECT COUNT(*) as count FROM profile_questions WHERE domain IS NULL")
    cc_answered = db.get(
        "SELECT COUNT(*) as count FROM profile_answers pa "
        "JOIN profile_questions pq ON pa.question_id = pq.id "
        "WHERE pa.profile_id = ? AND pq.domain IS NULL",
        profile_id,
    )

    completed_domains = sum(1 for p in progress.values() if p["complete"])
    progress["_crossCutting"] = {
        "total": int((cc_total or {}).get("count", 0)),
        "answered": int((cc_answered or {}).get("count", 0)),
        "unlocked": completed_domains >= 3,
    }
    return progress


@router.get("/cross-cutting")
def get_cross_cutting(user: AuthenticatedUser = Depends(require_auth)):
    profile_id = user.profile_id

    completed_domains = []
    for domain in DOMAINS:
        total = db.get("SELECT COUNT(*) as count FROM profile_questions WHERE domain = ?", domain)
        answered = db.get(
            "SELECT COUNT(*) as count FROM profile_answers pa "
            "JOIN profile_questions pq ON pa.question_id = pq.id "
            "WHERE pa.profile_id = ? AND pq.domain = ?",
            profile_id, domain,
        )
        if int((answered or {}).get("count", 0)) >= max(int((total or {}).get("count", 1)), 1):
            completed_domains.append(domain)

    questions = db.all(
        "SELECT pq.*, GROUP_CONCAT(pqd.domain) as domains "
        "FROM profile_questions pq "
        "JOIN profile_question_domains pqd ON pqd.question_id = pq.id "
        "WHERE pq.domain IS NULL "
        "GROUP BY pq.id ORDER BY pq.sort_order"
    )

    eligible = []
    for q in questions:
        needed = (q.get("domains") or "").split(",")
        if all(d in completed_domains for d in needed):
            options = q.get("options_json")
            if isinstance(options, str):
                try:
                    options = json.loads(options)
                except json.JSONDecodeError:
                    pass
            eligible.append({**q, "options": options, "domains": needed})

    answers = db.all(
        "SELECT question_id, selected_option_index, selected_option_text, free_text "
        "FROM profile_answers WHERE profile_id = ?",
        profile_id,
    )
    answer_map = {a["question_id"]: a for a in answers}
    return {"questions": eligible, "answers": answer_map}


@router.post("/answer")
async def submit_answer(body: dict, user: AuthenticatedUser = Depends(require_auth)):
    profile_id = user.profile_id
    question_id = body.get("questionId")
    if question_id is None:
        raise HTTPException(status_code=400, detail="questionId required")

    indices = body.get("selectedOptionIndices") or (
        [body["selectedOptionIndex"]] if body.get("selectedOptionIndex") is not None else []
    )
    texts = body.get("selectedOptionTexts") or (
        [body["selectedOptionText"]] if body.get("selectedOptionText") else []
    )

    db.run(
        "INSERT INTO profile_answers (profile_id, question_id, selected_option_index, selected_option_text, free_text) "
        "VALUES (?, ?, ?, ?, ?) "
        "ON CONFLICT(profile_id, question_id) DO UPDATE SET "
        "selected_option_index = excluded.selected_option_index, "
        "selected_option_text = excluded.selected_option_text, "
        "free_text = excluded.free_text, answered_at = datetime('now')",
        profile_id, question_id, json.dumps(indices), json.dumps(texts), body.get("freeText", ""),
    )
    return {"ok": True}


@router.post("/summarize/{domain}")
def summarize_domain(domain: str, user: AuthenticatedUser = Depends(check_token_limit)):
    profile_id = user.profile_id
    if domain not in DOMAINS:
        raise HTTPException(status_code=400, detail="Invalid domain")

    domain_answers = db.all(
        "SELECT pq.question_text, pq.layer, pa.selected_option_text, pa.free_text "
        "FROM profile_answers pa "
        "JOIN profile_questions pq ON pa.question_id = pq.id "
        "WHERE pa.profile_id = ? AND pq.domain = ? ORDER BY pq.sort_order",
        profile_id, domain,
    )
    cc_answers = db.all(
        "SELECT pq.question_text, pq.layer, pa.selected_option_text, pa.free_text "
        "FROM profile_answers pa "
        "JOIN profile_questions pq ON pa.question_id = pq.id "
        "JOIN profile_question_domains pqd ON pqd.question_id = pq.id "
        "WHERE pa.profile_id = ? AND pqd.domain = ? AND pq.domain IS NULL",
        profile_id, domain,
    )

    all_answers = domain_answers + cc_answers
    if not all_answers:
        raise HTTPException(status_code=400, detail="No answers to summarize")

    active_provider = _get_active_provider(user["id"])
    provider = get_provider(active_provider)

    prompt = (
        f'You are analyzing someone\'s answers about the "{DOMAIN_LABELS[domain]}" domain '
        f"of their life to build their relationship profile.\n\nHere are their answers:\n\n"
    )
    for a in all_answers:
        prompt += f"Q ({a['layer']}): {a['question_text']}\n"
        texts = _parse_json_or_wrap(a.get("selected_option_text"))
        prompt += f"Selected: {'; '.join(str(t) for t in texts)}\n"
        if a.get("free_text"):
            prompt += f"Additional thoughts: {a['free_text']}\n"
        prompt += "\n"

    prompt += f"""Based on these answers, produce a JSON response with:
{{
  "summary": "A 2-4 sentence first-person summary (use 'I want...', 'I value...', 'I need...') that captures what matters most to this person in {DOMAIN_LABELS[domain]}. Be specific and concrete — not generic. Pay attention to contradictions between stated preferences and scenario choices.",
  "priority": <1, 2, or 3>,
  "priority_reasoning": "One sentence explaining why you chose this priority level based on the intensity of their answers."
}}

Priority guide:
- 1 (Dealbreaker territory): Strong, non-negotiable positions. Scenario answers show rigidity or intensity.
- 2 (Matters a lot): Clear preferences but some flexibility. Willing to compromise in scenarios.
- 3 (Good to know): Relaxed or uncertain. Scenarios show adaptability.

Return ONLY the JSON object."""

    result_data = provider.analyze(prompt)
    log_usage(user["id"], active_provider, provider.model, "profileQA:summarize", result_data["usage"])

    result = result_data["result"]
    return {
        "summary": result["summary"],
        "priority": result["priority"],
        "priority_reasoning": result["priority_reasoning"],
    }


@router.post("/save-summary/{domain}")
async def save_summary(domain: str, body: dict, user: AuthenticatedUser = Depends(require_auth)):
    if domain not in DOMAINS:
        raise HTTPException(status_code=400, detail="Invalid domain")

    db.run(
        "UPDATE profile_domains SET answer = ?, priority = ?, updated_at = datetime('now') "
        "WHERE profile_id = ? AND domain = ?",
        body.get("summary", ""), body.get("priority", 2), user.profile_id, domain,
    )
    db.run("UPDATE profiles SET updated_at = datetime('now') WHERE id = ?", user.profile_id)
    return {"ok": True}
