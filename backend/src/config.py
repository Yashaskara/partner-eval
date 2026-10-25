import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env")

TURSO_DATABASE_URL = os.getenv("TURSO_DATABASE_URL")
TURSO_AUTH_TOKEN = os.getenv("TURSO_AUTH_TOKEN")

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-5-20250514")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-5.6-luna")
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY", "")
GOOGLE_MODEL = os.getenv("GOOGLE_MODEL", "gemini-1.5-pro")

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")

SESSION_SECRET = os.getenv("SESSION_SECRET") or os.getenv("BETTER_AUTH_SECRET", "")
APP_URL = os.getenv("APP_URL") or os.getenv("BETTER_AUTH_URL", "http://localhost:3001")

ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "")
ALLOWLIST_EMAILS = os.getenv("ALLOWLIST_EMAILS", "")
VITE_ADMIN_EMAIL = os.getenv("VITE_ADMIN_EMAIL", "")

NODE_ENV = os.getenv("NODE_ENV", "development")
IS_PRODUCTION = NODE_ENV == "production"
BACKEND_PORT = int(os.getenv("BACKEND_PORT", "3001"))
