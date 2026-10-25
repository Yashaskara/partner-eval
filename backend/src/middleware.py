"""FastAPI dependencies replacing Express middleware."""
from __future__ import annotations

import os

from fastapi import Depends, HTTPException, Request

from . import config
from .auth import get_session_user
from .db import DOMAINS, db
from .llm.meter import check_daily_limit


class AuthenticatedUser(dict):
    """Thin dict subclass so type hints read clearly."""
    @property
    def profile_id(self) -> int:
        return self["profile_id"]


async def require_auth(request: Request) -> AuthenticatedUser:
    user = get_session_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    email = user["email"].lower()
    allowed = db.get("SELECT email FROM allowlist WHERE email = ?", email)
    if not allowed:
        raise HTTPException(status_code=403, detail="Not authorized. Contact admin for access.")

    # Auto-claim legacy profile_id=1 data for admin on first login
    admin_email = config.ADMIN_EMAIL.lower() if config.ADMIN_EMAIL else ""
    if email == admin_email:
        orphan = db.get("SELECT id FROM profiles WHERE id = 1 AND user_id IS NULL")
        if orphan:
            db.batch([
                {"sql": "UPDATE profiles SET user_id = ? WHERE id = 1", "args": [user["id"]]},
                {"sql": "UPDATE partners SET user_id = ? WHERE profile_id = 1 AND user_id IS NULL", "args": [user["id"]]},
                {"sql": "UPDATE conversations SET user_id = ? WHERE profile_id = 1 AND user_id IS NULL", "args": [user["id"]]},
                {"sql": "UPDATE prep_questions SET user_id = ? WHERE profile_id = 1 AND user_id IS NULL", "args": [user["id"]]},
            ])

    # Find or create profile
    profile = db.get("SELECT id FROM profiles WHERE user_id = ?", user["id"])
    if not profile:
        result = db.run(
            "INSERT INTO profiles (user_id, name) VALUES (?, ?)",
            user["id"], user.get("name") or "Default",
        )
        profile_id = result["lastInsertRowid"]
        db.batch([
            {
                "sql": "INSERT OR IGNORE INTO profile_domains (profile_id, domain) VALUES (?, ?)",
                "args": [profile_id, d],
            }
            for d in DOMAINS
        ])
    else:
        profile_id = profile["id"]

    return AuthenticatedUser({**user, "profile_id": profile_id})


async def require_admin(user: AuthenticatedUser = Depends(require_auth)) -> AuthenticatedUser:
    admin_email = config.ADMIN_EMAIL.lower() if config.ADMIN_EMAIL else ""
    if user["email"].lower() != admin_email:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


async def check_token_limit(user: AuthenticatedUser = Depends(require_auth)) -> AuthenticatedUser:
    status = check_daily_limit(user["id"])
    if status["exceeded"]:
        raise HTTPException(
            status_code=429,
            detail={
                "error": "Daily token limit exceeded. Try again tomorrow.",
                "used": status["used"],
                "limit": status["limit"],
            },
        )
    return user
