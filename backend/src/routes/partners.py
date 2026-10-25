from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from ..db import DOMAINS, db
from ..middleware import AuthenticatedUser, require_auth

router = APIRouter(prefix="/api/partners")


def _staleness_of(partner_id: int, profile_id: int, latest_run: dict | None) -> dict:
    if not latest_run:
        return {"stale": False, "stale_reason": None}
    profile = db.get("SELECT updated_at FROM profiles WHERE id = ?", profile_id)
    domain_edit = db.get(
        "SELECT MAX(updated_at) AS updated_at FROM partner_domains WHERE partner_id = ?", partner_id,
    )
    profile_stale = profile and profile.get("updated_at") and latest_run["created_at"] < profile["updated_at"]
    domain_stale = domain_edit and domain_edit.get("updated_at") and latest_run["created_at"] < domain_edit["updated_at"]
    if domain_stale:
        return {"stale": True, "stale_reason": "partner"}
    if profile_stale:
        return {"stale": True, "stale_reason": "profile"}
    return {"stale": False, "stale_reason": None}


@router.get("/")
def list_partners(status: str | None = None, includeDeleted: str | None = None,
                  user: AuthenticatedUser = Depends(require_auth)):
    profile_id = user.profile_id
    user_id = user["id"]

    if includeDeleted == "true":
        partners = db.all(
            "SELECT * FROM partners WHERE profile_id = ? AND user_id = ? AND deleted_at IS NOT NULL ORDER BY updated_at DESC",
            profile_id, user_id,
        )
    else:
        if status and status != "all":
            partners = db.all(
                "SELECT * FROM partners WHERE profile_id = ? AND user_id = ? AND deleted_at IS NULL AND status = ? ORDER BY updated_at DESC",
                profile_id, user_id, status,
            )
        else:
            partners = db.all(
                "SELECT * FROM partners WHERE profile_id = ? AND user_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC",
                profile_id, user_id,
            )

    enriched = []
    for p in partners:
        domains = db.all("SELECT domain, answer FROM partner_domains WHERE partner_id = ?", p["id"])
        latest_run = db.get("SELECT * FROM analysis_runs WHERE partner_id = ? ORDER BY created_at DESC LIMIT 1", p["id"])
        assessments = db.all("SELECT * FROM domain_assessments WHERE run_id = ?", latest_run["id"]) if latest_run else []
        notes = db.all("SELECT * FROM positives_negatives WHERE partner_id = ? ORDER BY created_at DESC", p["id"])
        staleness = _staleness_of(p["id"], profile_id, latest_run)
        enriched.append({**p, "domains": domains, "latestRun": latest_run, "assessments": assessments, "notes": notes, **staleness})
    return enriched


@router.get("/{partner_id}")
def get_partner(partner_id: int, user: AuthenticatedUser = Depends(require_auth)):
    partner = db.get(
        "SELECT * FROM partners WHERE id = ? AND user_id = ? AND deleted_at IS NULL",
        partner_id, user["id"],
    )
    if not partner:
        raise HTTPException(status_code=404, detail="Not found")

    domains = db.all("SELECT domain, answer FROM partner_domains WHERE partner_id = ?", partner["id"])
    runs = db.all("SELECT * FROM analysis_runs WHERE partner_id = ? ORDER BY created_at DESC", partner["id"])
    latest_run = runs[0] if runs else None
    assessments = db.all("SELECT * FROM domain_assessments WHERE run_id = ?", latest_run["id"]) if latest_run else []
    notes = db.all("SELECT * FROM positives_negatives WHERE partner_id = ? ORDER BY created_at DESC", partner["id"])
    staleness = _staleness_of(partner["id"], partner.get("profile_id", 1), latest_run)
    return {**partner, "domains": domains, "runs": runs, "assessments": assessments, "notes": notes, **staleness}


@router.post("/")
async def create_partner(body: dict, user: AuthenticatedUser = Depends(require_auth)):
    name = body.get("name")
    if not name:
        raise HTTPException(status_code=400, detail="Name is required")

    result = db.run(
        "INSERT INTO partners (profile_id, user_id, name, source, status, dob, notes) VALUES (?, ?, ?, ?, ?, ?, ?)",
        user.profile_id, user["id"], name,
        body.get("source", ""), body.get("status", "active"),
        body.get("dob"), body.get("notes", ""),
    )
    db.batch([
        {"sql": "INSERT INTO partner_domains (partner_id, domain, answer) VALUES (?, ?, ?)",
         "args": [result["lastInsertRowid"], d, ""]}
        for d in DOMAINS
    ])
    return {"id": result["lastInsertRowid"]}


@router.put("/{partner_id}")
async def update_partner(partner_id: int, body: dict, user: AuthenticatedUser = Depends(require_auth)):
    db.run(
        "UPDATE partners SET name = COALESCE(?, name), source = COALESCE(?, source), "
        "status = COALESCE(?, status), dob = COALESCE(?, dob), notes = COALESCE(?, notes), "
        "updated_at = datetime('now') WHERE id = ? AND user_id = ? AND deleted_at IS NULL",
        body.get("name"), body.get("source"), body.get("status"),
        body.get("dob"), body.get("notes"), partner_id, user["id"],
    )
    return {"ok": True}


@router.put("/{partner_id}/domains")
async def update_partner_domains(partner_id: int, body: dict, user: AuthenticatedUser = Depends(require_auth)):
    domains = body.get("domains")
    if not isinstance(domains, list):
        raise HTTPException(status_code=400, detail="domains array required")
    partner = db.get("SELECT id FROM partners WHERE id = ? AND user_id = ?", partner_id, user["id"])
    if not partner:
        raise HTTPException(status_code=404, detail="Not found")

    stmts = [
        {
            "sql": "INSERT INTO partner_domains (partner_id, domain, answer) VALUES (?, ?, ?) "
                   "ON CONFLICT(partner_id, domain) DO UPDATE SET answer = excluded.answer, updated_at = datetime('now')",
            "args": [partner_id, d["domain"], d.get("answer", "")],
        }
        for d in domains
    ]
    stmts.append({
        "sql": "UPDATE partners SET updated_at = datetime('now') WHERE id = ?",
        "args": [partner_id],
    })
    db.batch(stmts)
    return {"ok": True}


@router.delete("/{partner_id}")
def soft_delete_partner(partner_id: int, user: AuthenticatedUser = Depends(require_auth)):
    db.run(
        "UPDATE partners SET deleted_at = datetime('now') WHERE id = ? AND user_id = ?",
        partner_id, user["id"],
    )
    return {"ok": True}


@router.post("/{partner_id}/restore")
def restore_partner(partner_id: int, user: AuthenticatedUser = Depends(require_auth)):
    db.run("UPDATE partners SET deleted_at = NULL WHERE id = ? AND user_id = ?", partner_id, user["id"])
    return {"ok": True}


@router.delete("/{partner_id}/permanent")
def permanent_delete_partner(partner_id: int, user: AuthenticatedUser = Depends(require_auth)):
    db.run("DELETE FROM partners WHERE id = ? AND user_id = ?", partner_id, user["id"])
    return {"ok": True}


@router.post("/{partner_id}/notes")
async def add_note(partner_id: int, body: dict, user: AuthenticatedUser = Depends(require_auth)):
    note_type = body.get("type")
    text = body.get("text")
    if not note_type or not text:
        raise HTTPException(status_code=400, detail="type and text required")
    partner = db.get("SELECT id FROM partners WHERE id = ? AND user_id = ?", partner_id, user["id"])
    if not partner:
        raise HTTPException(status_code=404, detail="Not found")
    result = db.run(
        "INSERT INTO positives_negatives (partner_id, type, text) VALUES (?, ?, ?)",
        partner_id, note_type, text,
    )
    return {"id": result["lastInsertRowid"]}


@router.delete("/{partner_id}/notes/{note_id}")
def delete_note(partner_id: int, note_id: int, user: AuthenticatedUser = Depends(require_auth)):
    partner = db.get("SELECT id FROM partners WHERE id = ? AND user_id = ?", partner_id, user["id"])
    if not partner:
        raise HTTPException(status_code=404, detail="Not found")
    db.run("DELETE FROM positives_negatives WHERE id = ? AND partner_id = ?", note_id, partner_id)
    return {"ok": True}
