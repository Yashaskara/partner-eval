from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException

from ..db import DOMAINS, db
from ..middleware import AuthenticatedUser, require_auth

router = APIRouter(prefix="/api/self-profile")


@router.get("")
def get_self_profile(user: AuthenticatedUser = Depends(require_auth)):
    profile = db.get("SELECT * FROM profiles WHERE id = ?", user.profile_id)
    domains = db.all(
        "SELECT domain, answer, priority, updated_at FROM profile_domains WHERE profile_id = ? ORDER BY rowid",
        user.profile_id,
    )
    return {**(profile or {}), "domains": domains}


@router.put("/domains/{domain}")
async def update_domain(domain: str, body: dict, user: AuthenticatedUser = Depends(require_auth)):
    if domain not in DOMAINS:
        raise HTTPException(status_code=400, detail="Invalid domain")
    db.run(
        "UPDATE profile_domains SET answer = COALESCE(?, answer), priority = COALESCE(?, priority), "
        "updated_at = datetime('now') WHERE profile_id = ? AND domain = ?",
        body.get("answer"), body.get("priority"), user.profile_id, domain,
    )
    db.run("UPDATE profiles SET updated_at = datetime('now') WHERE id = ?", user.profile_id)
    return {"ok": True}


@router.put("/domains")
async def update_domains(body: dict, user: AuthenticatedUser = Depends(require_auth)):
    domains = body.get("domains")
    if not isinstance(domains, list):
        raise HTTPException(status_code=400, detail="domains array required")

    stmts = []
    for d in domains:
        if d.get("domain") not in DOMAINS:
            continue
        stmts.append({
            "sql": "UPDATE profile_domains SET answer = COALESCE(?, answer), priority = COALESCE(?, priority), "
                   "updated_at = datetime('now') WHERE profile_id = ? AND domain = ?",
            "args": [d.get("answer"), d.get("priority"), user.profile_id, d["domain"]],
        })
    stmts.append({
        "sql": "UPDATE profiles SET updated_at = datetime('now') WHERE id = ?",
        "args": [user.profile_id],
    })
    db.batch(stmts)
    return {"ok": True}


@router.post("/reset")
def reset_profile(user: AuthenticatedUser = Depends(require_auth)):
    current = db.all(
        "SELECT domain, answer, priority FROM profile_domains WHERE profile_id = ?",
        user.profile_id,
    )
    stmts = [
        {"sql": "UPDATE profiles SET snapshot_json = ?, updated_at = datetime('now') WHERE id = ?",
         "args": [json.dumps(current), user.profile_id]},
    ]
    for d in DOMAINS:
        stmts.append({
            "sql": "UPDATE profile_domains SET answer = '', priority = 2, updated_at = datetime('now') WHERE profile_id = ? AND domain = ?",
            "args": [user.profile_id, d],
        })
    db.batch(stmts)
    return {"ok": True}


@router.post("/restore")
def restore_profile(user: AuthenticatedUser = Depends(require_auth)):
    profile = db.get("SELECT snapshot_json FROM profiles WHERE id = ?", user.profile_id)
    if not profile or not profile.get("snapshot_json"):
        raise HTTPException(status_code=404, detail="No snapshot to restore")

    snapshot = json.loads(profile["snapshot_json"])
    stmts = []
    for item in snapshot:
        stmts.append({
            "sql": "UPDATE profile_domains SET answer = ?, priority = ?, updated_at = datetime('now') WHERE profile_id = ? AND domain = ?",
            "args": [item["answer"], item["priority"], user.profile_id, item["domain"]],
        })
    stmts.append({
        "sql": "UPDATE profiles SET snapshot_json = NULL, updated_at = datetime('now') WHERE id = ?",
        "args": [user.profile_id],
    })
    db.batch(stmts)
    return {"ok": True}
