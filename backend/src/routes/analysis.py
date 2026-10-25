from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from ..db import DOMAINS, db
from ..llm.meter import log_usage
from ..llm.providers import get_provider
from ..middleware import AuthenticatedUser, require_auth, check_token_limit

router = APIRouter(prefix="/api/analysis")

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


def _compute_composite(assessments: list[dict], self_domains: list[dict]) -> float:
    priority_map = {d["domain"]: d.get("priority", 2) for d in self_domains}
    num = 0.0
    den = 0.0
    for a in assessments:
        p = priority_map.get(a["domain"], 2)
        w = 3 if p == 1 else 2 if p == 2 else 1
        num += a["score"] * w
        den += w
    return round(num / den, 1) if den > 0 else 0


def _build_prompt(partner: dict, partner_domains: list[dict], self_domains: list[dict]) -> str:
    self_map = {d["domain"]: d for d in self_domains}
    partner_map = {d["domain"]: d for d in partner_domains}

    text = "You are evaluating compatibility between a user and a potential partner for an arranged-marriage-style meeting.\n\nUSER'S SELF-PROFILE:\n"
    for domain in DOMAINS:
        s = self_map.get(domain)
        label = DOMAIN_LABELS[domain]
        priority = (s or {}).get("priority", 2)
        priority_word = "dealbreaker" if priority == 1 else "matters a lot" if priority == 2 else "good to know"
        text += f"\n{label} (priority: {priority} — {priority_word}):\n{(s or {}).get('answer') or 'Not specified'}\n"

    text += f"\nPARTNER: {partner['name']}"
    if partner.get("source"):
        text += f" ({partner['source']})"
    text += "\n"
    if partner.get("notes"):
        text += f"General notes: {partner['notes']}\n"

    text += "\nPARTNER'S DOMAIN INFORMATION:\n"
    for domain in DOMAINS:
        p = partner_map.get(domain)
        label = DOMAIN_LABELS[domain]
        text += f"\n{label}:\n{(p or {}).get('answer') or 'Unknown / not discussed'}\n"

    text += f"""
INSTRUCTIONS:
Produce a JSON object with exactly this structure:
{{
  "summary": "A holistic 150-250 word narrative assessment of the compatibility. Write in second person ('you'). Be honest and specific, not generic.",
  "assessments": [
    {{
      "domain": "<domain key>",
      "tag": "green|amber|red",
      "score": <1-10 integer>,
      "reasoning": "2-3 sentences explaining this score, written in second person."
    }}
  ]
}}

The domain keys are: {', '.join(DOMAINS)}

Scoring guide:
- green (7-10): aligned or better than expected
- amber (5-6): worth watching, not yet clear, or minor friction
- red (1-4): meaningful gap or flag

If a domain has no information, still assess it — give it an amber 5 with reasoning noting that it hasn't been discussed yet.

Return ONLY the JSON object, no markdown fences or other text."""
    return text


@router.post("/{partner_id}")
def run_analysis(partner_id: int, user: AuthenticatedUser = Depends(check_token_limit)):
    partner = db.get(
        "SELECT * FROM partners WHERE id = ? AND user_id = ? AND deleted_at IS NULL",
        partner_id, user["id"],
    )
    if not partner:
        raise HTTPException(status_code=404, detail="Partner not found")

    partner_domains = db.all(
        "SELECT domain, answer FROM partner_domains WHERE partner_id = ?", partner_id,
    )
    self_domains = db.all(
        "SELECT domain, answer, priority FROM profile_domains WHERE profile_id = ?",
        partner["profile_id"],
    )

    active_provider = _get_active_provider(user["id"])
    provider = get_provider(active_provider)

    prompt = _build_prompt(partner, partner_domains, self_domains)
    result_data = provider.analyze(prompt)
    log_usage(user["id"], active_provider, provider.model, "analysis:run", result_data["usage"])

    result = result_data["result"]

    tx = db.transaction()
    try:
        run = tx.run(
            "INSERT INTO analysis_runs (partner_id, provider, model, summary, composite_score) VALUES (?, ?, ?, ?, ?)",
            partner_id, active_provider, provider.model, result["summary"], 0,
        )
        run_id = run["lastInsertRowid"]

        for a in result["assessments"]:
            tx.run(
                "INSERT INTO domain_assessments (run_id, partner_id, domain, tag, score, reasoning) VALUES (?, ?, ?, ?, ?, ?)",
                run_id, partner_id, a["domain"], a["tag"], a["score"], a["reasoning"],
            )

        composite = _compute_composite(result["assessments"], self_domains)
        tx.run("UPDATE analysis_runs SET composite_score = ? WHERE id = ?", composite, run_id)
        tx.commit()

        return {"runId": run_id, "composite": composite, "summary": result["summary"], "assessments": result["assessments"]}
    except Exception:
        tx.rollback()
        raise
