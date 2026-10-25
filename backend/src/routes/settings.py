from __future__ import annotations

import os

from fastapi import APIRouter, Depends

from ..db import db
from .. import config
from ..middleware import AuthenticatedUser, require_auth

router = APIRouter(prefix="/api/settings")

PROVIDERS = {
    "anthropic": {
        "name": "Anthropic",
        "defaultModel": "claude-sonnet-4-5-20250514",
        "envKey": "ANTHROPIC_API_KEY",
        "envModel": "ANTHROPIC_MODEL",
    },
    "openai": {
        "name": "OpenAI",
        "defaultModel": "gpt-5.6-luna",
        "envKey": "OPENAI_API_KEY",
        "envModel": "OPENAI_MODEL",
    },
    "google": {
        "name": "Google",
        "defaultModel": "gemini-3.1-flash-lite",
        "envKey": "GOOGLE_API_KEY",
        "envModel": "GOOGLE_MODEL",
    },
}


def _mask_key(key: str | None) -> str | None:
    if not key:
        return None
    return "····" + key[-4:]


@router.get("/")
def get_settings(user: AuthenticatedUser = Depends(require_auth)):
    user_pref = db.get(
        "SELECT value FROM user_settings WHERE user_id = ? AND key = 'active_provider'",
        user["id"],
    )
    active_provider = (
        (user_pref or {}).get("value")
        or (db.get("SELECT value FROM settings WHERE key = 'active_provider'") or {}).get("value")
        or "anthropic"
    )

    providers = []
    for pid, p in PROVIDERS.items():
        raw_key = os.getenv(p["envKey"])
        model = os.getenv(p["envModel"]) or p["defaultModel"]
        providers.append({
            "id": pid,
            "name": p["name"],
            "model": model,
            "active": pid == active_provider,
            "keySet": bool(raw_key),
            "keyMasked": f"key set · {_mask_key(raw_key)}" if raw_key else "no key in .env",
        })

    provenance = db.all(
        "SELECT ar.model, COUNT(da.id) as count, MAX(da.created_at) as recent "
        "FROM domain_assessments da "
        "JOIN analysis_runs ar ON da.run_id = ar.id "
        "GROUP BY ar.model ORDER BY recent DESC"
    )
    return {"activeProvider": active_provider, "providers": providers, "provenance": provenance}


@router.put("/provider")
async def set_provider(request_body: dict, user: AuthenticatedUser = Depends(require_auth)):
    provider = request_body.get("provider")
    if provider not in PROVIDERS:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Invalid provider")
    db.run(
        "INSERT INTO user_settings (user_id, key, value) VALUES (?, 'active_provider', ?) "
        "ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value",
        user["id"], provider,
    )
    return {"ok": True}
