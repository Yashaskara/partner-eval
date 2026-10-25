# Anvaya

A personal compatibility-evaluation dashboard for structured partner assessment. Built for the Indian arranged-marriage context, where you meet multiple people and need a systematic way to track, evaluate, and compare — beyond scattered notes and gut feeling.

The app scores compatibility across **12 life domains** (lifestyle, career, family, conflict resolution, spirituality, finances, children, intimacy, hobbies, health, social life, relationship history) using LLM-powered analysis weighted by your own stated priorities.

## How it works

1. **Build your self-profile** — Answer structured questions across 12 domains and assign each a priority level (dealbreaker / matters a lot / good to know). This profile anchors every downstream score.

2. **Add people you're meeting** — Record what you've learned about each person, domain by domain. Partial data is fine — "not yet known" is a valid state.

3. **Run analysis** — The app sends your self-profile and the partner's data to the active LLM provider. It returns per-domain scores (1–10), green/amber/red marks, written reasoning, and an overall narrative read.

4. **Compare** — A matrix view shows all assessed partners side by side across the 12 domains. A head-to-head duel mode is available when comparing exactly two.

The composite score is computed deterministically (weighted average by your priorities: P1×3, P2×2, P3×1), so rankings are transparent and instantly re-sortable without new LLM calls.

## Screens

| Screen | Purpose |
|--------|---------|
| **Roster** | Card grid or ranked list of all partners, filterable by status, with composite scores and domain strips |
| **Partner Detail** | Two-column dossier — sidebar with domain strip, notes, analysis history; main area with LLM narrative and domain breakdown |
| **Compare** | Multi-partner matrix (domains × partners) and head-to-head duel view |
| **Self-Profile** | Structured Q&A across 12 domains with priority selectors, plus a conversational refinement mode |
| **Prep Questions** | LLM-generated questions calibrated to your profile, with answer-zone guides (aligned / worth watching / flag) |
| **Settings** | LLM provider selection, model provenance tracking, scoring-weight reference |
| **Admin** | User management, access control, token usage metering |

## Architecture

```
frontend/          React 19 + Vite — SPA with vanilla CSS tokens
  src/pages/       7 page components (Roster, PartnerDetail, Compare, SelfProfile, Settings, Admin, Login)
  src/components/  Shared UI (DomainStrip, DomainQA, ProfileConversation, Dialog, Nav)

backend/           Node.js + Express — REST API
  src/routes/      9 route modules (partners, selfProfile, analysis, prepQuestions, profileQA, conversations, settings, admin, accessRequests)
  src/llm/         Pluggable provider layer (Anthropic, OpenAI, Gemini) with token metering
  src/middleware/   Auth (better-auth + Google OAuth), allowlist gate, token-limit enforcement

Database:          SQLite (local dev) / Turso libsql (production)
Deployment:        Vercel (serverless functions + static frontend)
Auth:              Google OAuth via better-auth, invite-only allowlist
```

## Key design decisions

- **One active LLM provider at a time** — keeps scores comparable across partners. Every stored assessment is tagged with the provider + model that generated it.
- **Deterministic composite scoring** — the LLM produces per-domain assessments; the final rank is a transparent weighted average, not a black-box number.
- **Stale-score detection** — editing your self-profile flags all existing partner scores as stale, with manual recompute (avoids silently firing expensive LLM calls).
- **Per-user data isolation** — multi-user via Google OAuth with an invite-only allowlist. Each user has their own profile and partner data.

## Setup

### Prerequisites

- Node.js 20+
- Google OAuth credentials ([create here](https://console.cloud.google.com/apis/credentials))
- At least one LLM API key (Anthropic, OpenAI, or Google)

### Local development

```bash
# Install dependencies
npm run install:all

# Copy and fill in environment variables
cp .env.example .env
# Edit .env with your API keys, OAuth credentials, and admin email

# Start both backend and frontend
npm run dev
```

The backend runs on `http://localhost:3001`, the frontend on `http://localhost:5173`.

### Environment variables

See [`.env.example`](.env.example) for the full list. The essential ones:

| Variable | Purpose |
|----------|---------|
| `ANTHROPIC_API_KEY` | Claude API key |
| `OPENAI_API_KEY` | OpenAI API key |
| `GOOGLE_API_KEY` | Gemini API key |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth credentials |
| `BETTER_AUTH_SECRET` | Session signing secret (random 32+ chars) |
| `ADMIN_EMAIL` | Your email — gets admin access |
| `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` | Production database (optional for local dev) |

### Deploy to Vercel

The project is configured for Vercel deployment. Connect the repo and set the environment variables in the Vercel dashboard.

## Tech stack

- **Frontend**: React 19, React Router 7, Vite 6
- **Backend**: Express 4, better-auth
- **Database**: SQLite (local) / Turso libsql (production)
- **LLM**: Anthropic Claude, OpenAI GPT, Google Gemini (pluggable)
- **Deployment**: Vercel

## License

MIT
