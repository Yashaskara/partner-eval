"""Hand-rolled Google OAuth + cookie-based sessions.

Flow:
  1. GET /api/auth/google/login   → redirect to Google consent screen
  2. GET /api/auth/google/callback → exchange code for tokens, create session
  3. GET /api/auth/session         → return current user from session cookie
  4. POST /api/auth/signout        → delete session, clear cookie
  5. POST /api/dev-login           → dev-only: create user + session directly
"""
from __future__ import annotations

import base64
import json
import secrets
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, Request, Response
from fastapi.responses import RedirectResponse

from . import config
from .db import db

router = APIRouter(prefix="/api/auth")

_COOKIE_NAME = "session_token"
_SESSION_MAX_AGE = 30 * 24 * 3600  # 30 days in seconds

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"


def _redirect_uri(request: Request) -> str:
    origin = config.APP_URL.rstrip("/")
    return f"{origin}/api/auth/google/callback"


def _decode_id_token_payload(id_token: str) -> dict:
    """Decode the payload of a Google ID token (JWT) without verifying the
    signature — Google already authenticated the user during the token
    exchange, so the payload is trustworthy."""
    payload_b64 = id_token.split(".")[1]
    # Add padding
    padding = 4 - len(payload_b64) % 4
    if padding != 4:
        payload_b64 += "=" * padding
    return json.loads(base64.urlsafe_b64decode(payload_b64))


def _create_session(user_id: str, request: Request) -> str:
    token = secrets.token_urlsafe(32)
    session_id = secrets.token_urlsafe(16)
    expires_at = (datetime.now(timezone.utc) + timedelta(seconds=_SESSION_MAX_AGE)).isoformat()

    ip = request.client.host if request.client else ""
    ua = request.headers.get("user-agent", "")

    db.run(
        'INSERT INTO "session" (id, expiresAt, token, ipAddress, userAgent, userId) VALUES (?, ?, ?, ?, ?, ?)',
        session_id, expires_at, token, ip, ua, user_id,
    )
    return token


def _set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=_COOKIE_NAME,
        value=token,
        max_age=_SESSION_MAX_AGE,
        httponly=True,
        secure=config.IS_PRODUCTION,
        samesite="lax",
        path="/",
    )


def get_session_user(request: Request) -> dict | None:
    """Read the session cookie and return the user dict, or None."""
    token = request.cookies.get(_COOKIE_NAME)
    if not token:
        return None

    session = db.get(
        'SELECT s.userId, s.expiresAt FROM "session" s WHERE s.token = ?', token,
    )
    if not session:
        return None

    if session["expiresAt"] < datetime.now(timezone.utc).isoformat():
        db.run('DELETE FROM "session" WHERE token = ?', token)
        return None

    user = db.get('SELECT id, name, email, image FROM "user" WHERE id = ?', session["userId"])
    return dict(user) if user else None


# --- Routes ---

@router.get("/google/login")
def google_login(request: Request, callbackURL: str = "/"):
    state = secrets.token_urlsafe(16)
    params = {
        "client_id": config.GOOGLE_CLIENT_ID,
        "redirect_uri": _redirect_uri(request),
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "offline",
        "state": f"{state}:{callbackURL}",
        "prompt": "select_account",
    }
    url = GOOGLE_AUTH_URL + "?" + "&".join(f"{k}={httpx.URL('', params={k: v}).params[k]}" for k, v in params.items())

    response = RedirectResponse(url)
    response.set_cookie("oauth_state", state, max_age=600, httponly=True, samesite="lax", path="/")
    return response


@router.get("/google/callback")
async def google_callback(request: Request, code: str = "", state: str = ""):
    stored_state = request.cookies.get("oauth_state", "")
    state_parts = state.split(":", 1)
    returned_state = state_parts[0]
    callback_url = state_parts[1] if len(state_parts) > 1 else "/"

    if not stored_state or returned_state != stored_state:
        return RedirectResponse("/login?error=invalid_state")

    if not code:
        return RedirectResponse("/login?error=no_code")

    # Exchange code for tokens
    async with httpx.AsyncClient() as client:
        token_resp = await client.post(
            GOOGLE_TOKEN_URL,
            data={
                "code": code,
                "client_id": config.GOOGLE_CLIENT_ID,
                "client_secret": config.GOOGLE_CLIENT_SECRET,
                "redirect_uri": _redirect_uri(request),
                "grant_type": "authorization_code",
            },
        )

    if token_resp.status_code != 200:
        return RedirectResponse("/login?error=token_exchange_failed")

    tokens = token_resp.json()
    id_token = tokens.get("id_token", "")
    if not id_token:
        return RedirectResponse("/login?error=no_id_token")

    payload = _decode_id_token_payload(id_token)
    email = payload.get("email", "").lower()
    name = payload.get("name", "")
    picture = payload.get("picture")

    if not email:
        return RedirectResponse("/login?error=no_email")

    # Upsert user
    existing = db.get('SELECT id FROM "user" WHERE email = ?', email)
    if existing:
        user_id = existing["id"]
        db.run(
            'UPDATE "user" SET name = ?, image = ?, updatedAt = datetime(\'now\') WHERE id = ?',
            name, picture, user_id,
        )
    else:
        user_id = secrets.token_urlsafe(16)
        db.run(
            'INSERT INTO "user" (id, name, email, image) VALUES (?, ?, ?, ?)',
            user_id, name, email, picture,
        )

    # Upsert account link
    existing_account = db.get(
        'SELECT id FROM "account" WHERE providerId = ? AND accountId = ?',
        "google", payload.get("sub", ""),
    )
    if not existing_account:
        db.run(
            'INSERT INTO "account" (id, accountId, providerId, userId, accessToken, idToken) VALUES (?, ?, ?, ?, ?, ?)',
            secrets.token_urlsafe(16), payload.get("sub", ""), "google", user_id,
            tokens.get("access_token", ""), id_token,
        )

    session_token = _create_session(user_id, request)
    response = RedirectResponse(callback_url)
    _set_session_cookie(response, session_token)
    response.delete_cookie("oauth_state", path="/")
    return response


@router.get("/session")
def get_session(request: Request):
    user = get_session_user(request)
    if user:
        return {"user": user}
    return {"user": None}


@router.post("/signout")
def signout(request: Request, response: Response):
    token = request.cookies.get(_COOKIE_NAME)
    if token:
        db.run('DELETE FROM "session" WHERE token = ?', token)
    response.delete_cookie(_COOKIE_NAME, path="/")
    return {"ok": True}


# Dev-only login (email/password bypass)
if not config.IS_PRODUCTION:
    @router.post("/dev-login")
    def dev_login(request: Request, response: Response, body: dict | None = None):
        body = body or {}
        email = (body.get("email") or "dev@anvaya.local").lower()
        name = body.get("name") or "Dev User"

        existing = db.get('SELECT id FROM "user" WHERE email = ?', email)
        if existing:
            user_id = existing["id"]
        else:
            user_id = secrets.token_urlsafe(16)
            db.run(
                'INSERT INTO "user" (id, name, email) VALUES (?, ?, ?)',
                user_id, name, email,
            )

        # Ensure dev user is in allowlist
        db.run(
            "INSERT OR IGNORE INTO allowlist (email, added_by) VALUES (?, ?)",
            email, "dev-bypass",
        )

        session_token = _create_session(user_id, request)
        _set_session_cookie(response, session_token)
        return {"ok": True}
