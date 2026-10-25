# Partner Evaluation Dashboard — Plan (v1)

## 1. What this is

A personal, local web app for tracking and evaluating potential partners (arranged-marriage-style meetings), built on the concepts from the `partner-eval` skill: a self-profile across 12 life domains, per-domain compatibility assessment, and green/amber/red judgment calls. The app extends that into a persistent repository: multiple partners, structured ratings, editable records, and a ranked comparison dashboard — all self-sufficient, with no need to go back to a Claude conversation to get an evaluation.

Single user, no login, runs locally. Login and multi-profile support are explicitly Phase 2.

## 2. Architecture

- **Backend**: Node/Express + SQLite (local file, `partner-eval.db`, lives in the repo).
- **Frontend**: React (Vite), talks to the local backend.
- **Run model**: one command starts both; opens in your browser. Everything lives in this repo — yours to keep, inspect, back up.
- **LLM integration**: pluggable provider layer supporting Anthropic (Claude), OpenAI, and Google (Gemini).
  - One **active provider** at a time, selected in a Settings screen — not chosen per-analysis, so scores stay comparable across partners.
  - API keys stored in a local `.env` file, never sent anywhere but directly to the chosen provider's API from your machine.
  - Sensible default model per provider (e.g. Claude Sonnet, GPT-4o, Gemini 1.5 Pro), configurable in `.env`, not a per-call UI dropdown.
  - Every stored score/assessment is tagged with the provider + model that generated it, so a provider switch is visible in the data, not silent.

## 3. Core workflow philosophy

Everything happens in the app itself — no dependency on a live Claude conversation for evaluation. Data entry is **structured forms**, not an embedded chat. You fill in what you know (partial/unknown allowed), hit analyze, and the app calls the active LLM provider in a single pass to produce assessments. (An embedded adaptive-chat intake, closer to how `partner-eval` works in conversation, is a possible future enhancement — not v1.)

## 4. Data model

**`self_profile`** — one row (singular in v1; multi-profile is Phase 2).
- 12 domains (lifestyle, career, family, conflict resolution, spirituality, finances, children, physical intimacy, hobbies, health, friends/social, previous relationships).
- Per domain: your answers (structured + free text) and a **priority (1-3)** you assign yourself — 1 = hard dealbreaker territory, 3 = good-to-know. This priority drives weighting everywhere downstream (prep question priority and composite scoring).
- Editable at any time.

**`partners`**
- Name, source/how you met, status (`active` / `paused` / `rejected` / other — filterable, none hidden by default), DOB (optional, for Phase 2 horoscope matching), created/updated timestamps.

**`partner_domains`**
- Same 12 domains as the self-profile, per partner.
- Per domain: what you've learned/observed (structured + free text — "unknown" is valid), editable any time.
- This is where meeting notes live in v1 — as the free-text field per domain (or a general notes field) rather than a separate subsystem.

**`domain_assessments`** — LLM-generated, one set per analysis run.
- Per domain: qualitative tag (green/amber/red), numeric score (1-10), and **written reasoning** (always required from the LLM, not just a bare score).
- Tagged with provider/model and timestamp used to generate it.

**`analysis_runs`**
- One row per time you run/re-run analysis for a partner: timestamp, provider/model used, overall LLM narrative summary (a holistic written read, separate from the deterministic score below).

**`positives_negatives`**
- Freeform running list per partner: type (positive/negative), text, timestamp.

**`prep_questions`**
- Generated from the self-profile once it exists (partner-eval style): domain, priority, question text, and three answer-zone guides (aligned/reassuring, worth watching, flag) written to calibrate to your own profile. Regeneratable on demand.

## 5. Scoring & recompute logic

- The **LLM's job**: produce per-domain green/amber/red + numeric score + reasoning, plus an overall narrative summary. It does not directly set the final rank.
- The **app's job**: compute the composite score deterministically — weighted average of domain numeric scores, weighted by your self-profile priorities (P1×3, P2×2, P3×1). This keeps ranking transparent, auditable, and instantly re-sortable without new LLM calls whenever only priorities change.
- **Recompute triggers**:
  - Editing a single partner's domain data → auto-recompute that partner only (one LLM call) on save.
  - Editing your self-profile (answers or priorities) → does **not** auto-recompute everyone (avoids silently firing many paid calls). Instead, every partner is flagged "stale — self-profile changed since last score" on the roster, with manual recompute per partner or a bulk "recompute all" action.

## 6. Screens

UI mockups were produced and reviewed (Kindred Dashboard prototype) covering every screen below; the choices made against that prototype are locked in here.

1. **Roster** (home): all partners, status filter (All/Active/Paused/Closed), composite score, domain strip, latest analysis date, stale-score badge, red-flag indicator if any domain is red. **View toggle between card grid and ranked list** — both layouts are kept as a persistent user preference, not a one-time design choice.
2. **Partner detail**: two-column dossier layout — sidebar with at-a-glance domain strip, positives/negatives (with add-note action), and analysis-run history (date, model, score); main column with the overall LLM narrative summary and domain-by-domain breakdown (mark, label, priority, written reasoning, score). "Recompute" action, stale-score explanation banner naming which self-profile change made it stale.
3. **Compare**: select 2+ partners. Default view is a 12-row matrix (domains as rows, partners as columns, priority/weight shown per row). When exactly two partners are selected, a head-to-head duel view is also available as a more narrative side-by-side read.
4. **Self-profile**: two tabs — "Your answers" (12 domains, each with your answer text and a 1/2/3 priority selector) and "Prep questions" (generated question set, grouped by domain/priority, each with three answer-zone guides: aligned/reassuring, worth watching, flag — with regenerate and print actions).
5. **Settings**: active LLM provider selection (radio-style, one active at a time), API key status per provider read from `.env` (masked, never the raw key), default model shown per provider. Provenance table showing assessment counts and most-recent-use per model, so a provider switch stays visible in the data. Scoring-weight reference (P1×3, P2×2, P3×1, unknown domains excluded). Data controls: reveal the SQLite file in Finder, export all data as JSON.

## 7. Deletion & reset

Three distinct actions, each with graduated confirmation matched to how destructive/recoverable it is:

- **Delete a partner** — soft delete. Removing a partner hides them from the roster/compare/etc. immediately and stamps `deleted_at`, but all underlying data (domain answers, assessments, analysis runs, positives/negatives) stays intact in a **Trash** view. Single confirm ("Move to trash?"). Auto-purged (hard, cascading delete) after 30 days, or sooner via manual "delete permanently" / "empty trash" — both of which require a stronger, explicit "this cannot be undone" confirmation, since this is the actual point of no return.
- **Reset self-profile** — a rare, deliberate, strongly-confirmed action (distinct from routine per-domain edits, which just overwrite one domain's answer/priority via the normal edit flow). Full reset clears all 12 domains and priorities back to unanswered. Before wiping, the app automatically saves a **single one-shot snapshot** of the profile as it was (not full version history) so a mistaken reset can be restored once. Following the same rule as any self-profile edit, existing partner assessments are not deleted — every partner is flagged stale, recomputable once the profile is redone.
- **Reset prep questions** — light confirmation only, since it's a cheap, frequent action. Discards the current prep-question set entirely (no history/versioning kept) rather than archiving it; "Reset" and "Regenerate" are the same action in the UI.

## 8. Phase 2 (explicitly deferred)

- Login/logout via phone number (OTP-based), enabling multi-device or multi-user access.
- Multiple self-profiles, with all v1 features per profile.
- Horoscope/guna matching using DOB (and likely birth time/place, to be collected when this phase starts).
- Richer meeting-notes handling (structured per-meeting records rather than a free-text field within domains), feeding into analysis alongside questionnaire answers.

## 9. Explicitly out of scope for v1

- No embedded adaptive chat intake (forms only).
- No live multi-provider side-by-side comparison (one active provider at a time).
- No auth/accounts.
- No hosted/remote deployment — local only.
