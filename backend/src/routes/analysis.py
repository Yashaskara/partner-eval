from __future__ import annotations

import json
import logging
import queue
import re
import threading
from typing import Annotated

from fastapi import APIRouter, Body, Depends, HTTPException
from fastapi.responses import StreamingResponse

from ..db import DOMAINS, db
from ..llm.meter import log_usage
from ..llm.providers import get_provider
from ..llm.stream_parser import AnalysisStreamParser, parse_analysis_text
from ..middleware import AuthenticatedUser, require_auth, check_token_limit

router = APIRouter(prefix="/api/analysis")
logger = logging.getLogger(__name__)

_REQUEST_ID = re.compile(r"[A-Za-z0-9-]{8,64}")
_KEEPALIVE_SECONDS = 10

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


def _request_id(value) -> str:
    if not isinstance(value, str) or not _REQUEST_ID.fullmatch(value):
        raise HTTPException(status_code=400, detail="Invalid requestId")
    return value


def _load_partner(partner_id: int, user_id: str) -> dict:
    partner = db.get(
        "SELECT * FROM partners WHERE id = ? AND user_id = ? AND deleted_at IS NULL",
        partner_id, user_id,
    )
    if not partner:
        raise HTTPException(status_code=404, detail="Partner not found")
    return partner


def _build_analysis_input(partner: dict) -> tuple[str, list[dict]]:
    partner_domains = db.all(
        "SELECT domain, answer FROM partner_domains WHERE partner_id = ?", partner["id"],
    )
    self_domains = db.all(
        "SELECT domain, answer, priority FROM profile_domains WHERE profile_id = ?",
        partner["profile_id"],
    )
    return _build_prompt(partner, partner_domains, self_domains), self_domains


def _find_run(partner_id: int, request_id: str) -> dict | None:
    run = db.get(
        "SELECT * FROM analysis_runs WHERE partner_id = ? AND request_id = ?", partner_id, request_id,
    )
    if not run:
        return None
    assessments = db.all(
        "SELECT domain, tag, score, reasoning FROM domain_assessments WHERE run_id = ?", run["id"],
    )
    return {
        "runId": run["id"], "composite": run["composite_score"],
        "summary": run["summary"], "assessments": assessments,
    }


def _save_run(partner_id: int, provider_name: str, model: str, result: dict,
              self_domains: list[dict], request_id: str | None) -> dict:
    try:
        with db.transaction() as tx:
            run = tx.run(
                "INSERT INTO analysis_runs (partner_id, provider, model, summary, composite_score, request_id) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                partner_id, provider_name, model, result["summary"], 0, request_id,
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
    except Exception:
        # The stream and its fallback can race on one requestId; the unique index lets only one win.
        existing = _find_run(partner_id, request_id) if request_id else None
        if existing:
            return existing
        raise

    return {"runId": run_id, "composite": composite, "summary": result["summary"], "assessments": result["assessments"]}


def _run_stream_job(events: queue.Queue, *, user_id: str, partner_id: int, provider_name: str, provider,
                    prompt: str, self_domains: list[dict], request_id: str) -> None:
    received_text = False
    try:
        events.put({"type": "started"})
        parser = AnalysisStreamParser()
        chunks: list[str] = []
        usage = None
        for item in provider.stream_analyze(prompt):
            if "usage" in item:
                usage = item["usage"]
                continue
            received_text = True
            chunks.append(item["text"])
            for event in parser.feed(item["text"]):
                events.put(event)

        if usage:
            log_usage(user_id, provider_name, provider.model, "analysis:stream", usage)
        result = parse_analysis_text("".join(chunks))
        saved = _save_run(partner_id, provider_name, provider.model, result, self_domains, request_id)
        events.put({"type": "done", **saved})
    except Exception:
        logger.exception("Streaming analysis failed for partner %s", partner_id)
        events.put({"type": "error", "retryable": not received_text})
    finally:
        events.put(None)


def _sse(events: queue.Queue):
    while True:
        try:
            event = events.get(timeout=_KEEPALIVE_SECONDS)
        except queue.Empty:
            yield ": keep-alive\n\n"
            continue
        if event is None:
            return
        yield f"data: {json.dumps(event)}\n\n"


@router.post("/{partner_id}")
def run_analysis(partner_id: int, body: Annotated[dict | None, Body()] = None,
                 user: AuthenticatedUser = Depends(check_token_limit)):
    request_id = _request_id(body["requestId"]) if body and body.get("requestId") is not None else None
    partner = _load_partner(partner_id, user["id"])

    if request_id:
        existing = _find_run(partner_id, request_id)
        if existing:
            return existing

    prompt, self_domains = _build_analysis_input(partner)
    active_provider = _get_active_provider(user["id"])
    provider = get_provider(active_provider)

    result_data = provider.analyze(prompt)
    log_usage(user["id"], active_provider, provider.model, "analysis:run", result_data["usage"])

    return _save_run(partner_id, active_provider, provider.model, result_data["result"], self_domains, request_id)


@router.post("/{partner_id}/stream")
def stream_analysis(partner_id: int, body: dict, user: AuthenticatedUser = Depends(check_token_limit)):
    request_id = _request_id(body.get("requestId"))
    partner = _load_partner(partner_id, user["id"])

    events: queue.Queue = queue.Queue()
    existing = _find_run(partner_id, request_id)
    if existing:
        events.put({"type": "done", **existing})
        events.put(None)
    else:
        active_provider = _get_active_provider(user["id"])
        provider = get_provider(active_provider)
        if not hasattr(provider, "stream_analyze"):
            raise HTTPException(status_code=501, detail="Streaming is not available for this provider")

        prompt, self_domains = _build_analysis_input(partner)
        # Runs outside the response so a closed tab still finishes and saves the paid LLM call.
        threading.Thread(
            target=_run_stream_job,
            args=(events,),
            kwargs={
                "user_id": user["id"], "partner_id": partner_id, "provider_name": active_provider,
                "provider": provider, "prompt": prompt, "self_domains": self_domains, "request_id": request_id,
            },
            daemon=True,
        ).start()

    return StreamingResponse(
        _sse(events),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/{partner_id}/runs/{request_id}")
def get_run(partner_id: int, request_id: str, user: AuthenticatedUser = Depends(require_auth)):
    _load_partner(partner_id, user["id"])
    run = _find_run(partner_id, _request_id(request_id))
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return run
