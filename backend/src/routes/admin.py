from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from ..db import db
from ..middleware import AuthenticatedUser, require_admin

router = APIRouter(prefix="/api/admin")

MODEL_PRICING = {
    "claude-sonnet-4-5-20250514": {"input": 3, "output": 15},
    "claude-sonnet-4-20250514": {"input": 3, "output": 15},
    "claude-haiku-3-5-20241022": {"input": 0.80, "output": 4},
    "gpt-5.6-luna": {"input": 2.50, "output": 10},
    "gpt-4o": {"input": 2.50, "output": 10},
    "gpt-4o-mini": {"input": 0.15, "output": 0.60},
    "gemini-1.5-pro": {"input": 1.25, "output": 5},
    "gemini-2.0-flash": {"input": 0.10, "output": 0.40},
}


def _calc_cost(model: str, input_tokens: int, output_tokens: int) -> float | None:
    pricing = MODEL_PRICING.get(model)
    if not pricing:
        return None
    return (input_tokens * pricing["input"] + output_tokens * pricing["output"]) / 1_000_000


@router.get("/users")
def get_users(admin: AuthenticatedUser = Depends(require_admin)):
    users = db.all(
        'SELECT u.id, u.email, u.name, u.image, u.createdAt, '
        'COALESCE(SUM(lu.input_tokens + lu.output_tokens), 0) as total_tokens, '
        'COUNT(lu.id) as total_calls '
        'FROM "user" u LEFT JOIN llm_usage lu ON lu.user_id = u.id '
        'GROUP BY u.id ORDER BY total_tokens DESC'
    )
    usage_by_model = db.all(
        "SELECT user_id, model, SUM(input_tokens) as input_tokens, SUM(output_tokens) as output_tokens "
        "FROM llm_usage GROUP BY user_id, model"
    )
    cost_map: dict[str, float] = {}
    for row in usage_by_model:
        cost = _calc_cost(row["model"], int(row["input_tokens"]), int(row["output_tokens"]))
        if cost is not None:
            cost_map[row["user_id"]] = cost_map.get(row["user_id"], 0) + cost

    return [{**u, "estimated_cost": cost_map.get(u["id"], 0)} for u in users]


@router.get("/usage")
def get_usage(admin: AuthenticatedUser = Depends(require_admin)):
    from datetime import date
    today = date.today().isoformat()

    daily = db.all(
        "SELECT user_id, provider, model, SUM(input_tokens) as input_tokens, "
        "SUM(output_tokens) as output_tokens, COUNT(*) as calls "
        "FROM llm_usage WHERE created_at >= ? GROUP BY user_id, provider, model",
        today,
    )
    daily_with_cost = [
        {**d, "estimated_cost": _calc_cost(d["model"], int(d["input_tokens"]), int(d["output_tokens"])) or 0}
        for d in daily
    ]

    all_time = db.all(
        "SELECT model, SUM(input_tokens) as input_tokens, SUM(output_tokens) as output_tokens, COUNT(*) as calls "
        "FROM llm_usage GROUP BY model"
    )
    total_cost = 0.0
    total_input = 0
    total_output = 0
    total_calls = 0
    for row in all_time:
        total_input += int(row["input_tokens"])
        total_output += int(row["output_tokens"])
        total_calls += int(row["calls"])
        total_cost += _calc_cost(row["model"], int(row["input_tokens"]), int(row["output_tokens"])) or 0

    return {
        "daily": daily_with_cost,
        "allTime": {
            "total_input": total_input, "total_output": total_output,
            "total_calls": total_calls, "estimated_cost": total_cost,
        },
    }


@router.get("/usage/{user_id}")
def get_user_usage(user_id: str, admin: AuthenticatedUser = Depends(require_admin)):
    usage = db.all(
        "SELECT provider, model, endpoint, input_tokens, output_tokens, created_at "
        "FROM llm_usage WHERE user_id = ? ORDER BY created_at DESC LIMIT 100",
        user_id,
    )
    return [
        {**row, "estimated_cost": _calc_cost(row["model"], int(row["input_tokens"]), int(row["output_tokens"])) or 0}
        for row in usage
    ]


@router.get("/allowlist")
def get_allowlist(admin: AuthenticatedUser = Depends(require_admin)):
    return db.all("SELECT * FROM allowlist ORDER BY added_at DESC")


@router.post("/allowlist")
async def add_to_allowlist(body: dict, admin: AuthenticatedUser = Depends(require_admin)):
    email = body.get("email")
    if not email:
        raise HTTPException(status_code=400, detail="email required")
    db.run(
        "INSERT OR IGNORE INTO allowlist (email, added_by) VALUES (?, ?)",
        email.lower().strip(), admin["email"],
    )
    return {"ok": True}


@router.delete("/allowlist/{email:path}")
def remove_from_allowlist(email: str, admin: AuthenticatedUser = Depends(require_admin)):
    from .. import config
    if email.lower() == (config.ADMIN_EMAIL or "").lower():
        raise HTTPException(status_code=400, detail="Cannot remove admin")
    db.run("DELETE FROM allowlist WHERE email = ?", email)
    return {"ok": True}


@router.get("/access-requests")
def get_access_requests(admin: AuthenticatedUser = Depends(require_admin)):
    return db.all("SELECT * FROM access_requests ORDER BY created_at DESC")


@router.post("/access-requests/{request_id}/approve")
def approve_request(request_id: int, admin: AuthenticatedUser = Depends(require_admin)):
    req = db.get("SELECT * FROM access_requests WHERE id = ?", request_id)
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    db.batch([
        {"sql": "INSERT OR IGNORE INTO allowlist (email, added_by) VALUES (?, ?)",
         "args": [req["email"], admin["email"]]},
        {"sql": "UPDATE access_requests SET status = 'approved', reviewed_at = datetime('now'), reviewed_by = ? WHERE id = ?",
         "args": [admin["email"], request_id]},
    ])
    return {"ok": True}


@router.post("/access-requests/{request_id}/reject")
def reject_request(request_id: int, admin: AuthenticatedUser = Depends(require_admin)):
    result = db.run(
        "UPDATE access_requests SET status = 'rejected', reviewed_at = datetime('now'), reviewed_by = ? WHERE id = ?",
        admin["email"], request_id,
    )
    if not result["changes"]:
        raise HTTPException(status_code=404, detail="Request not found")
    return {"ok": True}


@router.delete("/access-requests/{request_id}")
def delete_request(request_id: int, admin: AuthenticatedUser = Depends(require_admin)):
    db.run("DELETE FROM access_requests WHERE id = ?", request_id)
    return {"ok": True}


@router.put("/user-limits/{user_id}")
async def set_user_limit(user_id: str, body: dict, admin: AuthenticatedUser = Depends(require_admin)):
    limit = body.get("dailyTokenLimit")
    if not limit or limit < 0:
        raise HTTPException(status_code=400, detail="Valid dailyTokenLimit required")
    db.run(
        "INSERT INTO user_limits (user_id, daily_token_limit) VALUES (?, ?) "
        "ON CONFLICT(user_id) DO UPDATE SET daily_token_limit = excluded.daily_token_limit",
        user_id, limit,
    )
    return {"ok": True}
