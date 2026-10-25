"""Public + session-only access request routes."""
from __future__ import annotations

import re
import time
from collections import defaultdict

from fastapi import APIRouter, HTTPException, Request

from ..auth import get_session_user
from ..db import db

router = APIRouter(prefix="/api/access-requests")

_EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")

# In-memory rate limiter
_submit_hits: dict[str, list[float]] = defaultdict(list)
_WINDOW_S = 3600
_MAX_PER_WINDOW = 5


def _throttled(ip: str) -> bool:
    now = time.time()
    hits = [t for t in _submit_hits[ip] if now - t < _WINDOW_S]
    if len(hits) >= _MAX_PER_WINDOW:
        return True
    hits.append(now)
    _submit_hits[ip] = hits
    return False


@router.post("/")
async def submit_request(request: Request):
    body = await request.json()
    email = str(body.get("email", "")).lower().strip()
    name = str(body.get("name", "")).strip()[:120]
    note = str(body.get("note", "")).strip()[:500]

    if not _EMAIL_RE.match(email) or len(email) > 254:
        raise HTTPException(status_code=400, detail="Enter a valid email address")

    ip = request.client.host if request.client else ""
    if _throttled(ip):
        raise HTTPException(status_code=429, detail="Too many requests. Try again later.")

    allowed = db.get("SELECT email FROM allowlist WHERE email = ?", email)
    if allowed:
        return {"ok": True, "status": "approved", "alreadyAllowed": True}

    existing = db.get("SELECT id, status FROM access_requests WHERE email = ?", email)
    if existing:
        if existing["status"] != "pending":
            db.run(
                "UPDATE access_requests SET status = 'pending', name = ?, note = ?, "
                "created_at = datetime('now'), reviewed_at = NULL, reviewed_by = NULL WHERE id = ?",
                name, note, existing["id"],
            )
            return {"ok": True, "status": "pending"}
        return {"ok": True, "status": existing["status"], "alreadyRequested": True}

    db.run(
        "INSERT INTO access_requests (email, name, note) VALUES (?, ?, ?)",
        email, name, note,
    )
    return {"ok": True, "status": "pending"}


@router.get("/me")
async def my_request(request: Request):
    user = get_session_user(request)
    if not user:
        return {"authenticated": False}

    email = user["email"].lower()
    allowed = db.get("SELECT email FROM allowlist WHERE email = ?", email)
    req = db.get(
        "SELECT status, created_at FROM access_requests WHERE email = ?", email,
    )
    return {
        "authenticated": True,
        "email": user["email"],
        "name": user.get("name", ""),
        "allowed": bool(allowed),
        "request": req,
    }
