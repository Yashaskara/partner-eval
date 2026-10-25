from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from ..db import DOMAINS, db
from ..llm.meter import log_usage
from ..llm.providers import get_provider
from ..middleware import AuthenticatedUser, require_auth, check_token_limit

router = APIRouter(prefix="/api/conversations")

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


@router.get("/")
def list_conversations(user: AuthenticatedUser = Depends(require_auth)):
    return db.all(
        "SELECT * FROM conversations WHERE profile_id = ? ORDER BY started_at DESC",
        user.profile_id,
    )


@router.post("/")
async def create_conversation(body: dict, user: AuthenticatedUser = Depends(require_auth)):
    result = db.run(
        "INSERT INTO conversations (profile_id, domain) VALUES (?, ?)",
        user.profile_id, body.get("domain"),
    )
    return {"id": result["lastInsertRowid"]}


@router.get("/{conversation_id}/messages")
def get_messages(conversation_id: int, user: AuthenticatedUser = Depends(require_auth)):
    conversation = db.get(
        "SELECT * FROM conversations WHERE id = ? AND profile_id = ?",
        conversation_id, user.profile_id,
    )
    if not conversation:
        raise HTTPException(status_code=404, detail="Not found")
    return db.all(
        "SELECT * FROM conversation_messages WHERE conversation_id = ? ORDER BY created_at",
        conversation_id,
    )


@router.post("/{conversation_id}/message")
def send_message(conversation_id: int, body: dict, user: AuthenticatedUser = Depends(check_token_limit)):
    content = body.get("content")
    if not content:
        raise HTTPException(status_code=400, detail="content required")

    conversation = db.get(
        "SELECT * FROM conversations WHERE id = ? AND profile_id = ?",
        conversation_id, user.profile_id,
    )
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    db.run(
        "INSERT INTO conversation_messages (conversation_id, role, content) VALUES (?, ?, ?)",
        conversation_id, "user", content,
    )

    profile_domains = db.all(
        "SELECT domain, answer, priority FROM profile_domains WHERE profile_id = ?",
        conversation["profile_id"],
    )
    history = db.all(
        "SELECT role, content FROM conversation_messages WHERE conversation_id = ? ORDER BY created_at",
        conversation_id,
    )

    domain_context = ""
    for d in profile_domains:
        if d.get("answer"):
            domain_context += f"{DOMAIN_LABELS.get(d['domain'], d['domain'])} (priority {d['priority']}): {d['answer']}\n"

    system = (
        "You are a thoughtful conversational partner helping someone refine what they want in a life partner. "
        "You know them well from their profile.\n\n"
        f"Here's what you know about them:\n{domain_context or 'No profile filled in yet.'}\n\n"
        "Be warm, perceptive, and natural. Ask follow-up questions that go deeper. "
        "If they share something that shifts or refines their preferences, acknowledge it. "
        "Don't summarize or update anything — just have a genuine conversation. "
        "Keep responses concise (2-4 sentences)."
    )
    messages = [{"role": m["role"], "content": m["content"]} for m in history]

    active_provider = _get_active_provider(user["id"])
    provider = get_provider(active_provider)
    result_data = provider.chat(system, messages)
    log_usage(user["id"], active_provider, provider.model, "conversation:chat", result_data["usage"])

    reply = result_data["result"]
    db.run(
        "INSERT INTO conversation_messages (conversation_id, role, content) VALUES (?, ?, ?)",
        conversation_id, "assistant", reply,
    )
    return {"role": "assistant", "content": reply}


@router.post("/{conversation_id}/classify")
def classify_conversation(conversation_id: int, user: AuthenticatedUser = Depends(check_token_limit)):
    conversation = db.get(
        "SELECT * FROM conversations WHERE id = ? AND profile_id = ?",
        conversation_id, user.profile_id,
    )
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    messages = db.all(
        "SELECT role, content FROM conversation_messages WHERE conversation_id = ? ORDER BY created_at",
        conversation_id,
    )
    transcript = "\n".join(f"{m['role']}: {m['content']}" for m in messages)

    active_provider = _get_active_provider(user["id"])
    provider = get_provider(active_provider)

    prompt = f"""Analyze this conversation and determine which life domains were discussed or revealed preferences about.

Conversation:
{transcript}

The 12 domains are: {', '.join(f"{d} ({DOMAIN_LABELS[d]})" for d in DOMAINS)}

Return a JSON object:
{{
  "domains": ["domain1", "domain2"],
  "reasoning": "Brief explanation of what was revealed about each domain"
}}

Only include domains where the conversation revealed meaningful new information or a shift in preferences. Return ONLY the JSON."""

    result_data = provider.analyze(prompt)
    log_usage(user["id"], active_provider, provider.model, "conversation:classify", result_data["usage"])
    return result_data["result"]


@router.post("/{conversation_id}/update-preferences")
def update_preferences(conversation_id: int, body: dict, user: AuthenticatedUser = Depends(check_token_limit)):
    target_domains = body.get("domains")
    if not isinstance(target_domains, list) or not target_domains:
        raise HTTPException(status_code=400, detail="domains array required")

    conversation = db.get(
        "SELECT * FROM conversations WHERE id = ? AND profile_id = ?",
        conversation_id, user.profile_id,
    )
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    messages = db.all(
        "SELECT role, content FROM conversation_messages WHERE conversation_id = ? ORDER BY created_at",
        conversation_id,
    )
    transcript = "\n".join(f"{m['role']}: {m['content']}" for m in messages)

    current_summaries = {}
    for domain in target_domains:
        row = db.get(
            "SELECT answer, priority FROM profile_domains WHERE profile_id = ? AND domain = ?",
            conversation["profile_id"], domain,
        )
        current_summaries[domain] = row

    active_provider = _get_active_provider(user["id"])
    provider = get_provider(active_provider)

    prompt = "Based on a recent conversation, update the user's profile summaries for the following domains.\n\nCurrent summaries:\n"
    for domain in target_domains:
        s = current_summaries.get(domain)
        prompt += f"\n{DOMAIN_LABELS.get(domain, domain)} (priority {(s or {}).get('priority', 2)}):\n{(s or {}).get('answer') or 'Empty — no summary yet'}\n"

    prompt += f"\nRecent conversation:\n{transcript}\n"
    prompt += """
Return a JSON object with updated summaries for ONLY the domains that should change:
{
  "updates": [
    {
      "domain": "<domain key>",
      "old_summary": "the current summary",
      "new_summary": "Updated first-person summary incorporating new insights from the conversation. Keep it 2-4 sentences, concrete and specific.",
      "priority": <1, 2, or 3>,
      "change_reason": "One sentence explaining what changed and why"
    }
  ]
}

If a domain's summary doesn't need to change based on this conversation, omit it. Use first person ("I want...", "I value..."). Return ONLY the JSON."""

    result_data = provider.analyze(prompt)
    log_usage(user["id"], active_provider, provider.model, "conversation:update", result_data["usage"])

    db.run(
        "UPDATE conversations SET summary = ?, ended_at = datetime('now') WHERE id = ?",
        transcript[:500], conversation_id,
    )
    return result_data["result"]


@router.post("/{conversation_id}/apply-updates")
async def apply_updates(conversation_id: int, body: dict, user: AuthenticatedUser = Depends(require_auth)):
    updates = body.get("updates")
    if not isinstance(updates, list):
        raise HTTPException(status_code=400, detail="updates array required")

    conversation = db.get(
        "SELECT * FROM conversations WHERE id = ? AND profile_id = ?",
        conversation_id, user.profile_id,
    )
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    stmts = []
    for u in updates:
        if u.get("domain") not in DOMAINS:
            continue
        stmts.append({
            "sql": "UPDATE profile_domains SET answer = ?, priority = ?, updated_at = datetime('now') WHERE profile_id = ? AND domain = ?",
            "args": [u["new_summary"], u["priority"], conversation["profile_id"], u["domain"]],
        })
    stmts.append({
        "sql": "UPDATE profiles SET updated_at = datetime('now') WHERE id = ?",
        "args": [conversation["profile_id"]],
    })
    db.batch(stmts)
    return {"ok": True}
