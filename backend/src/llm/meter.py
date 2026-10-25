from datetime import date

from ..db import db


def log_usage(user_id: str, provider: str, model: str, endpoint: str, usage: dict) -> None:
    db.run(
        "INSERT INTO llm_usage (user_id, provider, model, endpoint, input_tokens, output_tokens) VALUES (?, ?, ?, ?, ?, ?)",
        user_id, provider, model, endpoint, usage["input_tokens"], usage["output_tokens"],
    )


def check_daily_limit(user_id: str) -> dict:
    today = date.today().isoformat()
    used_row = db.get(
        "SELECT COALESCE(SUM(input_tokens + output_tokens), 0) as total FROM llm_usage WHERE user_id = ? AND created_at >= ?",
        user_id, today,
    )
    limit_row = db.get(
        "SELECT daily_token_limit FROM user_limits WHERE user_id = ?", user_id,
    )
    used = int(used_row["total"]) if used_row else 0
    daily_limit = int(limit_row["daily_token_limit"]) if limit_row else 100000
    return {
        "used": used,
        "limit": daily_limit,
        "remaining": daily_limit - used,
        "exceeded": used >= daily_limit,
    }
