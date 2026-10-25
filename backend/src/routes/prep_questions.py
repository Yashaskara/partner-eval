from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from ..db import DOMAINS, db
from ..llm.meter import log_usage
from ..llm.providers import get_provider
from ..middleware import AuthenticatedUser, require_auth, check_token_limit

router = APIRouter(prefix="/api/prep-questions")

DOMAIN_LABELS = {
    "lifestyle": "Lifestyle", "career": "Career", "family": "Family",
    "conflict": "Conflict resolution", "spirituality": "Spirituality",
    "finances": "Finances", "children": "Children", "intimacy": "Physical intimacy",
    "hobbies": "Hobbies", "health": "Health", "social": "Friends & social",
    "history": "Previous relationships",
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


def _build_prep_prompt(self_domains: list[dict]) -> str:
    self_map = {d["domain"]: d for d in self_domains}

    text = (
        "You are generating preparation questions for someone about to meet potential partners "
        "in an arranged-marriage context. These questions are for the USER to ask during meetings.\n\n"
        "USER'S SELF-PROFILE:\n"
    )
    for domain in DOMAINS:
        s = self_map.get(domain)
        label = DOMAIN_LABELS[domain]
        priority = (s or {}).get("priority", 2)
        priority_word = "dealbreaker" if priority == 1 else "matters a lot" if priority == 2 else "good to know"
        text += f"\n{label} (priority: {priority} — {priority_word}):\n{(s or {}).get('answer') or 'Not specified'}\n"

    text += f"""
INSTRUCTIONS:
Generate 12-16 preparation questions, prioritized by the user's domain priorities. Focus more questions on priority-1 domains.

For each question, provide three answer-zone guides calibrated to THIS user's profile:
1. "aligned" — what a reassuring answer sounds like
2. "watch" — worth slowing down for
3. "flag" — take seriously

Return a JSON object with this structure:
{{
  "questions": [
    {{
      "domain": "<domain key>",
      "priority": <1-3>,
      "question": "The question text",
      "guide_aligned": "What a reassuring answer looks like...",
      "guide_watch": "Worth slowing down for...",
      "guide_flag": "Take seriously..."
    }}
  ]
}}

Domain keys: {', '.join(DOMAINS)}

Questions should be natural, conversational, and specific to what this user cares about. Not generic.
Return ONLY the JSON object."""
    return text


@router.get("")
def list_prep_questions(user: AuthenticatedUser = Depends(require_auth)):
    return db.all(
        "SELECT * FROM prep_questions WHERE profile_id = ? ORDER BY priority ASC, id ASC",
        user.profile_id,
    )


@router.post("/generate")
def generate_prep_questions(user: AuthenticatedUser = Depends(check_token_limit)):
    profile_id = user.profile_id
    self_domains = db.all(
        "SELECT domain, answer, priority FROM profile_domains WHERE profile_id = ?", profile_id,
    )
    if not any(d.get("answer", "").strip() for d in self_domains):
        raise HTTPException(status_code=400, detail="Fill in your self-profile first")

    active_provider = _get_active_provider(user["id"])
    provider = get_provider(active_provider)

    prompt = _build_prep_prompt(self_domains)
    result_data = provider.analyze(prompt)
    log_usage(user["id"], active_provider, provider.model, "prep:generate", result_data["usage"])

    stmts = [{"sql": "DELETE FROM prep_questions WHERE profile_id = ?", "args": [profile_id]}]
    for q in result_data["result"]["questions"]:
        stmts.append({
            "sql": "INSERT INTO prep_questions (profile_id, domain, priority, question, guide_aligned, guide_watch, guide_flag) VALUES (?, ?, ?, ?, ?, ?, ?)",
            "args": [profile_id, q["domain"], q["priority"], q["question"], q["guide_aligned"], q["guide_watch"], q["guide_flag"]],
        })
    db.batch(stmts)

    return db.all(
        "SELECT * FROM prep_questions WHERE profile_id = ? ORDER BY priority ASC, id ASC",
        profile_id,
    )


@router.delete("")
def clear_prep_questions(user: AuthenticatedUser = Depends(require_auth)):
    db.run("DELETE FROM prep_questions WHERE profile_id = ?", user.profile_id)
    return {"ok": True}
