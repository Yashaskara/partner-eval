# Partner Intake — Plan

Supersedes the "structured forms" section of [PLAN.md](PLAN.md) §3/§4 for the partner side.

## 1. The problem

Two problems, one root cause.

**Editing was impossible after a run.** `PartnerDetail` rendered the domain entry form only as the
fallback for "no analysis yet" — `assessments.length > 0 ? <readOnly> : <form>`. The first
successful analysis permanently removed the only path to `partner_domains`. Fixed (see §6, Phase 0),
but it points at the real issue: data entry was treated as a one-time setup step, not the ongoing
activity it actually is.

**Entry is 12 blank textareas.** There is no prompt about *what* to write in each. So the user writes
vague prose, and the analysis comes back with every domain at amber 5 and reasoning that reads
"you have not discussed this yet" — which is what the deployed `Test 1` partner looks like today.

Meanwhile the app already generates 12–16 sharp, personalised questions with three calibrated
answer-zone guides each (`prep_questions`) — and they live on a *different page*
(Self profile → Prep), attached to no partner, feeding nothing. The instrument exists. It just
isn't wired to the record.

## 2. The idea

**Prep questions become the partner intake form.**

You answer them per partner. Each answer is a piece of evidence, tagged to a domain. The free-text
domain boxes stop being the primary input and become "anything else that didn't fit a question."

## 3. Data model

### New: `partner_answers`

```sql
CREATE TABLE IF NOT EXISTS partner_answers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  partner_id INTEGER NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  prep_question_id INTEGER,           -- soft link, deliberately no FK (see below)
  question_text TEXT NOT NULL,        -- snapshot; survives question regeneration
  domain TEXT NOT NULL,
  answer TEXT NOT NULL DEFAULT '',
  zone TEXT CHECK (zone IN ('aligned','watch','flag')),  -- your own gut call, optional
  asked_at TEXT,
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(partner_id, prep_question_id)
);
```

Two things to get right:

**No cascading FK to `prep_questions`.** `POST /prep-questions/generate` currently does
`DELETE FROM prep_questions WHERE profile_id = ?` ([prepQuestions.js:51](backend/src/routes/prepQuestions.js:51))
and reinserts. With a cascading FK, one regeneration wipes every partner's recorded answers. So:
snapshot `question_text` and `domain` into the answer row, and keep `prep_question_id` as a plain
integer.

**Make regeneration non-destructive anyway.** Add `archived_at` to `prep_questions`; on regenerate,
archive the old set instead of deleting it. Preserves the audit trail, keeps old answers resolvable
to their question, and lets you see that the instrument changed mid-stream.

**Ad-hoc per-partner questions fall out for free.** `prep_question_id = NULL` plus a user-written
`question_text` = "something I specifically want to ask this person." Same table, no extra schema.

### Changed: `partner_domains`

Keeps its shape. Its *role* narrows: no longer the sole input, now the per-domain remainder —
context that isn't an answer to any particular question.

## 4. Analysis prompt

`buildPrompt` ([analysis.js:91](backend/src/routes/analysis.js:91)) composes each domain from the
Q&A pairs first, then the free-text remainder. Instead of:

```
Family:
Unknown / not discussed
```

it gets:

```
Family:
Q: How much do you expect to see your parents once married?
A: Weekly dinners, parents 20 min away. Non-negotiable but relaxed about it. [your read: watch]
Q: Where would you want to live in five years?
A: (not asked)
```

This is the real payoff. The model currently cannot distinguish three very different states —
*not asked*, *asked and evasive*, *asked and clear* — because they all arrive as the same blob. The
scoring guide should then split them explicitly:

- not asked → amber 5, reasoning notes the gap (current behaviour, now correctly scoped)
- asked, vague/evasive, **priority-1 domain** → that is a signal, not an unknown; score it
- asked, clear → score on content

## 5. UX

Partner page splits into two modes, as tabs — never a hidden fallback again:

- **The read** — the analysis output. What the page shows today.
- **What you know** — intake.

Intake, grouped by domain, ordered by *your* priority (P1 first):

- domain header carries a coverage meter — "3 of 5 asked"
- each question shows its three answer-zone guides, collapsed (that's the calibration you already
  wrote for yourself — surfacing it at the moment of recording is the whole point)
- textarea for what they said
- 4-way chip: not asked / aligned / watch / flag
- per-domain "anything else" box at the bottom

Coverage replaces the score as the driving affordance while a partner is new. The roster should read
"Test 1 · 2 of 16 asked" rather than a confident-looking, meaningless 5.0.

### Three ways in

1. **Checklist** — the above. Deliberate, at your desk.
2. **Meeting mode** — one question at a time over unanswered P1 questions, reusing the existing
   `DomainQA` stepper ([DomainQA.jsx](frontend/src/components/DomainQA.jsx)). For dumping fast right
   after a meeting.
3. **Braindump → extraction** — paste raw notes; a model maps them onto the prep questions and
   drafts answers; you review a diff and accept or edit field by field. Biggest ease win, one LLM
   call. It must never write directly — always propose, you confirm. This shape already exists in
   the codebase for the self-profile: `classify` → `updatePreferences` → `applyUpdates`
   ([conversations.js](backend/src/routes/conversations.js)). Reuse it.

## 6. Sequencing

| Phase | What | LLM cost |
|---|---|---|
| 0 | Unbreak editing: domain form always reachable; staleness tracks partner edits | none |
| 1 | `partner_answers` schema, per-partner Q&A intake UI, coverage meters | none |
| 2 | Analysis prompt reads Q&A pairs; three-state scoring guide | none extra |
| 3 | Braindump → extraction, with review-before-apply | 1 call per paste |
| 4 | Meeting-mode stepper; ad-hoc per-partner questions | none |

Phase 0 is done. Phases 1–2 are the substance and are worth doing together — Phase 1 without
Phase 2 collects better data and then throws it away at the prompt boundary.

## 7. Open question

Prep questions are per-profile, shared across all partners. Keep it that way: one instrument for
everyone is what makes composite scores comparable, which is the premise of the ranked roster
(PLAN.md §5). Per-partner ad-hoc questions are the escape hatch, and they should be excluded from
the comparison view for the same reason. Archiving rather than deleting on regenerate is what keeps
this honest when the instrument does change.
