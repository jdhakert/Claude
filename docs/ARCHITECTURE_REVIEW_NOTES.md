# Architecture Review Notes

For an external reviewer. A map of how BarReady is built so you can evaluate it
without reverse-engineering. Companion to `docs/ARCHITECTURE.md` (design intent)
and `docs/DATA_MODEL.md` (schema). File paths are clickable anchors.

---

## 1. App structure (monorepo)

pnpm workspace, TypeScript strict end-to-end, ESM.

```
api/        Fastify 5 JSON API (modular monolith)
client/     React 18 + Vite 6 PWA (SPA)
packages/db/  Drizzle ORM schema, migrations, seeds, PGlite test harness
docs/       Planning set + review packet (this set)
e2e/        Playwright browser smoke
```

- **Build/run:** API via `tsc` (typecheck/build) but **runs** via `tsx`
  (`api/src/server.ts`) because it imports `@barready/db` as TS source; client
  via Vite. See OPS note in `KNOWN_ISSUES.md`.
- **Layering rule (enforced by convention + review):** logic lives in
  `api/src/services/**`; routes (`api/src/routes/**`) are thin (parse → call
  service → shape response); React components render and call the typed API
  client (`client/src/api/client.ts`). Controllers/components hold no business
  logic.

## 2. Backend structure (`api/src`)

- `server.ts` — entrypoint: load+validate env, create DB (if `DATABASE_URL`),
  `buildApp`, listen, graceful shutdown.
- `app.ts` — `buildApp({env, db, authRateLimitMax})`: registers helmet → CORS →
  cookie → error handler → health, then (only if `db` present) all feature
  routes. Returns a Fastify instance; tests drive it via `app.inject` (no port).
- `env.ts` — Zod-validated environment; fails fast on invalid config.
- `errors.ts` — `AppError(status, code, message)` + a central error handler that
  maps to `{ error: { code, message } }`.
- `auth/` — `password.ts` (scrypt), `session.ts` (create/destroy, hashed
  tokens), `cookies.ts`, `guards.ts` (`requireAuth`/`requireRole`),
  `rateLimit.ts` (in-memory fixed-window limiter).
- `routes/` — one module per domain (auth, onboarding, courses, lessons,
  practice, exam, essays, pt, plan, retention, outlines, analytics, features,
  cms, billing, account, admin, authoring, itemsAdmin, dashboard, health).
- `services/` — the product. Notable: `adaptive/{engine,planner}` (pure,
  deterministic, seedable), `retention/{srs,scheduler,rules,outlines}`
  (SM-2), `analytics/{student,admin}`, `exam`, `essays`, `pt`, `cms`,
  `insights`, `remediation`, `billing/*`, `grading/aiFeedback` (lightweight
  heuristic feedback — **not** AI-graded scoring; human/self grading is the beta
  path).

## 3. Database structure (`packages/db/src`)

- **Driver:** `postgres-js` + Drizzle; `client.ts` (`createDb`, pool max 10),
  `migrate.ts` (forward-only, applies `drizzle/*.sql`), `index.ts` exports
  `schema`.
- **Schema modules** (`schema/`): `identity` (users, roles, userRoles,
  sessions, profiles), `taxonomy` (courses, subjects, subtopics, issues, rules,
  enrollments), `content` (contentSources, contentLicenses, items,
  answerChoices, explanations, flashcards, essayRubrics(+criteria),
  essayPrompts, ptTasks, modules, lessons, contentBlocks), `assessment`
  (exams, examSections, examAttempts, examAttemptSections, examAttemptItems,
  questionAttempts, confidenceRatings, essaySubmissions, essayScores,
  ptSubmissions, ptScores), `learning` (progressSnapshots, learningEvents,
  assignments(+items), srsReviews(+logs), errorJournalEntries, attackOutlines
  (+entries)), `billing` (subscriptions, betaInvites), `audit` (auditLogs),
  `enums`, `_shared` (pk/timestamps).
- **Course-agnostic core:** `course/subject/subtopic/issue/item_type/
  jurisdiction` are data, not code — adding MPRE needs no migration.
- **Tests** run on **PGlite** (in-process Postgres) via `testing.ts` —
  real Postgres semantics, no Docker.

## 4. Auth / role model

- **Sessions:** scrypt-hashed passwords; login issues an opaque token in an
  httpOnly (`Secure` in prod, `SameSite`) cookie `br_session`; only a **hash**
  of the token is stored in `sessions`. Logout destroys server-side + clears
  cookie.
- **Roles:** `student`, `instructor`, `grader`, `content_author`,
  `content_reviewer`, `admin` (a user may hold several).
- **Authorization:** deny-by-default — `requireAuth` then `requireRole(...)` on
  protected routes; **ownership-scoped** queries filter by `userId`. Verified by
  a 403 test (student → admin analytics) in the journey suite.
- **Beta gate:** `users.beta_access` (+ `beta_invites`); enrollment requires it.

## 5. Data flow — practice questions

1. `GET /practice/items?courseId&subjectId?&limit` → `services/practice` returns
   only `license_status='cleared'` items with choices **stripped of
   `isCorrect`/`rationale`** (no answer leakage; verified by test).
2. User picks **confidence first** (gating), then an answer.
3. `POST /practice/attempts` → records `questionAttempts` + `confidenceRatings`,
   grades server-side, returns a **review** (correct choice, per-choice
   rationale, rule takeaway, explanation, issue).
4. Optional: `POST /error-journal` (tag why missed) and `POST /flashcards`
   (convert to an SRS card; user content is `user_supplied`/cleared for self).
5. Attempts + confidence feed analytics and the adaptive engine.

## 6. Data flow — full-length exams

1. `POST /exams/:id/attempts` → `services/exam` creates an `examAttempt` and
   per-section `examAttemptSections`.
2. `POST …/sections/start` → materializes `examAttemptItems` (random selection
   of cleared items for MBE sections), sets `endsAt` from the time limit.
3. `POST …/answer` → persists working answer/flag/time deltas (resume-safe).
4. Section submit, or **server auto-expiry** once `now > endsAt`.
5. `POST …/submit` → scores, computes pacing/fatigue, writes
   `progressSnapshots` and canonical `questionAttempts` for analytics; results
   via `GET …/results`. Diagnostic uses the same machinery (short MBE section).

## 7. Data flow — essays / performance tests

1. `GET /essays?courseId` / `GET /pt-tasks?courseId` → cleared prompts/tasks
   (PT carries a closed-universe File/Library).
2. `POST …/submissions` → timed `essaySubmissions`/`ptSubmissions`.
3. **Self-assessment:** `POST …/self-assessment` (rubric scores +
   `spottedIssueIds`) → reconciles **missed issues** vs the prompt's tagged
   issues; feeds remediation.
4. **Grader workflow (optional):** `grader` role lists a queue and scores
   per-dimension (`essayScores`/`ptScores` with `isSelfAssessment=false`) +
   feedback. (Human/self grading; no at-scale AI grading in beta.)

## 8. Analytics pipeline

- **Inputs:** `questionAttempts`, `confidenceRatings`, `essay/ptScores`,
  `progressSnapshots` (grains: overall/subject/subtopic/issue), `learningEvents`.
- **Student** (`analytics/student`, `GET /analytics/me` + `/dashboard`):
  readiness (gated on coverage+recency), subject mastery, confidence
  calibration, weakest issues (needs issue-grain snapshots), MBE accuracy trend,
  timing.
- **Admin/instructor** (`analytics/admin`): cohort overview, at-risk students,
  commonly-missed issues, item difficulty (lowest correct-rate first).
- **Computed on read** (no materialized rollups/cache) — fine at beta scale; a
  scaling item (see `KNOWN_ISSUES.md`).

## 9. Admin / content workflow (licensing)

- Authoring requires full metadata (`source`, `jurisdiction`, etc.) or the
  create is rejected (`missing_license_metadata`).
- **Editorial lifecycle** (`content_status`): draft → in_review → approved →
  **published** → archived. **`publish` is the only transition that sets
  `license_status='cleared'`** and requires approved + complete metadata +
  **reviewer ≠ author**; archive un-clears.
- The engine serves **only** `cleared` content — enforced structurally and
  covered by tests. Transitions are **audit-logged**.

## 10. PWA / mobile strategy

- **PWA:** `vite-plugin-pwa` (Workbox) — precached app shell, `NetworkFirst`
  navigations, `StaleWhileRevalidate` assets, bounded `CacheFirst` media;
  `/api|/auth|/health` denylisted from the navigation fallback; manifest +
  shortcuts + maskable icon; `InstallPrompt` (Chromium one-tap + iOS guidance).
- **Mobile:** responsive shell (bottom-nav < 768px), ≥44px touch targets,
  16px inputs (no iOS zoom), `viewport-fit=cover` + safe-area insets, `100dvh`;
  `MobileExamNotice` recommends desktop/tablet for timed full-lengths.
- **Native:** deferred; the shared server-side API/data layer keeps an
  Expo/React Native path cheap (`docs/MOBILE_APP_STRATEGY.md`).

---

### Where to start reading
`api/src/app.ts` → `api/src/services/adaptive/engine.ts` (the core product
logic) → `api/test/journey.test.ts` (the whole loop, end-to-end) →
`packages/db/src/schema/*` → `client/src/routes/*`.
