# Data Model

> The implemented database schema for **BarReady**, in `packages/db`. Realizes
> the progress spine ([Product Design Spec](./PRODUCT_DESIGN_SPEC.md) §2),
> enforces the [Content & Licensing Policy](./CONTENT_AND_LICENSING_POLICY.md),
> and follows [Architecture](./ARCHITECTURE.md) §4 module boundaries. Tooling
> rationale: [ADR 0002](./ADR/0002-data-access.md).

## Stack
- **Drizzle ORM** (typed, SQL-first) on **PostgreSQL**.
- **drizzle-kit** for forward-only SQL migrations (generated offline).
- **PGlite** (in-process Postgres) for portable relationship tests.
- Identifiers: TS camelCase ↔ DB `snake_case`; UUID PKs (`gen_random_uuid()`);
  `created_at`/`updated_at` on most tables.

## Layout
```
packages/db/
  src/
    schema/
      enums.ts        # all pg enums
      _shared.ts      # pk() + timestamps helpers
      identity.ts     # users, profiles, roles, user_roles, sessions
      billing.ts      # subscriptions
      taxonomy.ts     # courses, enrollments, subjects, subtopics, issues, rules
      content.ts      # sources, licenses, items, choices, explanations,
                      # flashcards, essays, rubrics, PT tasks, modules, lessons, blocks
      assessment.ts   # exams, sections, exam/question attempts, submissions, scores, confidence
      learning.ts     # progress snapshots, learning events, assignments, SRS, error journal
      audit.ts        # audit_logs
      index.ts        # barrel export
    client.ts         # production postgres-js client
    migrate.ts        # apply migrations (DATABASE_URL)
    seed.ts           # reusable seed(db) + CLI; ORIGINAL demo content only
  drizzle/            # generated SQL migrations
  test/               # PGlite-backed relationship tests
```

## Entities by module

### Identity & access (`identity.ts`)
- **users** — account, email (unique), optional `password_hash` (null = OAuth-only).
- **profiles** — 1:1 with user; target exam date, weekly time budget, onboarding
  JSON; nullable `organization_id`/`cohort_id` for future school accounts.
- **roles** — catalog of role keys (student, instructor, grader, content_author,
  content_reviewer, admin).
- **user_roles** — additive RBAC assignment (composite PK).
- **sessions** — server-side sessions (hashed rotating tokens).

### Billing (`billing.ts`)
- **subscriptions** — Stripe-backed; status, plan, `entitlements[]` → course access.

### Catalog & taxonomy (`taxonomy.ts`)
- **courses** — course is *data* (UBE/CA/MBE-only/Essay-only/MPRE); MPRE present
  now, no migration to enable (Charter §1.4).
- **enrollments** — user ↔ course (unique per pair).
- **subjects → subtopics → issues** — the issue-level taxonomy with `exam_weight`
  at each grain (drives prioritization & the heatmap).
- **rules** — black-letter rule per issue (statement, `elements[]`, mnemonic) for
  the Rule Memorization engine.

### Content & licensing (`content.ts`)
- **content_sources** / **content_licenses** — provenance + license records
  (Policy §2–4).
- **`licenseColumns()`** — the required metadata applied to **every**
  content-bearing table: `source_id`, `license_id`, `provenance`,
  `license_status`, `jurisdiction`, `author_id`, `reviewer_id`, `version`
  (Policy §3). Subject/subtopic are tracked via each table's taxonomy FKs.
- **items** + **answer_choices** + **explanations** + **item_issues** — the MBE
  bank (one correct choice; per-choice rationale; multi-issue tagging).
- **flashcards** — SRS unit, linked to an issue.
- **essay_rubrics** / **essay_rubric_criteria** — reusable rubric dimensions.
- **essay_prompts** / **essay_prompt_issues** — prompt + model answer + issue
  checklist.
- **pt_tasks** — closed-universe Performance Test (instructions, file library
  JSON, model work product).
- **modules → lessons → content_blocks** — learning content (lessons carry
  licensing too).

### Assessment (`assessment.ts`)
- **exams** + **exam_sections** — blueprint (diagnostic / full-length / periodic)
  with section timing (exam-day realism).
- **exam_attempts** — a sitting; scores + `pacing` JSON (fatigue curve /
  time-management level).
- **question_attempts** — per-item attempt; `time_ms`, `position_in_exam`,
  `flagged`; belongs to an exam attempt or is standalone practice. **Restrict**
  on item delete preserves attempt history.
- **confidence_ratings** — 1:1 with a question attempt; level + `was_correct`
  (calibration).
- **essay_submissions** / **essay_scores** (per-dimension, `is_self_assessment`)
  and **pt_submissions**.

### Learning system (`learning.ts`)
- **progress_snapshots** — mastery/confidence/coverage/recency/readiness at
  `overall | subject | subtopic | issue` (`ref_id` points at the grain).
- **learning_events** — append-only event stream for analytics rollups.
- **assignments** + **assignment_items** — the daily contract; each block carries
  a `reason` and `est_minutes`.
- **srs_reviews** — deterministic scheduling state (interval, ease, reps, lapses,
  `due_at`, recall `stage`).
- **error_journal_entries** — "why I missed it" cause taxonomy linked to attempt
  + issue.

### Audit (`audit.ts`)
- **audit_logs** — immutable trail; required for license transitions and role
  changes.

## Progress tracked at every required grain
`subject` · `subtopic` · `issue` (taxonomy + `progress_snapshots`) · `question`
(`question_attempts`) · `exam` (`exam_attempts`) · `time-management`
(`question_attempts.time_ms` + `position_in_exam`, `exam_attempts.pacing`).

## Licensing enforcement (in schema)
- Licensing columns are **non-null** where required; `license_id` is required for
  Licensed/User-supplied content.
- The learning engine and student-facing queries filter `license_status =
  'cleared'`; non-cleared content is unreachable (Policy §5).
- `reviewer_id` is separate from `author_id`; the seed and tests assert
  **reviewer ≠ author**.
- License-status transitions are written to `audit_logs`.

## Commands
```bash
pnpm db:generate     # regenerate SQL migrations from the schema
pnpm db:migrate      # apply migrations (requires DATABASE_URL)
pnpm db:seed         # seed ORIGINAL demo content (requires DATABASE_URL)
pnpm --filter @barready/db test   # run PGlite relationship tests
```

## Seed data (development only)
`seed.ts` creates a realistic demo: a student (+ author/reviewer/admin), a UBE
course with Evidence/Contracts taxonomy down to issues and a black-letter rule,
one original MBE item (4 choices + rationales + explanation), a flashcard + SRS
review, an essay rubric/prompt + self-assessed submission, a PT task + submission,
a diagnostic and a full-length exam (with MBE/essay/PT sections), a diagnostic
attempt with a confident-but-wrong question attempt (overconfidence signal) and
an error-journal entry, progress snapshots at all four grains, learning events,
today's daily assignment, and a license-transition audit entry.

> **All seed content is original, fictional placeholder material.** No real,
> released, or protected bar exam content is included (Policy §1).

## Content lifecycle (CMS, Phase 17)
Every licensed content table (`items`, `lessons`, `essay_prompts`, `pt_tasks`,
`flashcards`) carries a `content_status` editorial lifecycle —
`draft → in_review → approved → published → archived` — **distinct from** the
`license_status` student-visibility gate.

- **publish** is the only transition that sets `license_status = cleared`, and it
  requires `content_status = approved` **and** complete source/license metadata
  (source, provenance, jurisdiction, author, reviewer). Missing metadata blocks
  publication.
- **archive** un-clears the item (`license_status` → `in_review`) so students
  immediately lose access.
- **approve** requires a reviewer distinct from the author.
- Every transition is recorded in `audit_logs` (before/after, actor), and
  `publish` bumps `version` — giving audit/version history.

Because all student-facing queries filter `license_status = 'cleared'`, only
**published** content is ever visible to students. CMS endpoints live under
`/admin/cms/*` and are role-gated (authors submit; reviewers/admins approve,
publish, archive).
