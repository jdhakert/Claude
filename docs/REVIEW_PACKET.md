# Review Packet

Entry point for an external senior engineer / product reviewer. Goal: run the
app locally and evaluate it efficiently. Pair with
`docs/ARCHITECTURE_REVIEW_NOTES.md` (how it works) and `docs/KNOWN_ISSUES.md`
(what's wrong). Honest by design — see "Weakest areas" and "Caveats" below.

---

## 1. Branch & commit history

- **Branch under review:** `claude/project-planning-docs-3114e2`
- **Build approach:** delivered as numbered phases (planning docs first, then a
  beta-ready monorepo build). Recent history:

| Phase | Summary |
| --- | --- |
| 4–8 | DB schema/domain model, repo scaffold + CI + quality gates, auth/roles/onboarding, dashboard/PWA, course content engine |
| 9–13 | MBE practice, diagnostic + full-length exam engine, essay training/grading, PT/MPT, adaptive learning engine |
| 14–18 | Spaced repetition + rules + attack outlines, analytics, creative features, admin CMS, billing/beta access/account |
| 19 | Production-readiness audit (security, privacy, a11y) |
| 20 | Mobile/app experience + PWA hardening |
| 21 | Full-length beta demo dataset |
| 22 | End-to-end QA pass + bug bash |
| 23 | Deployment + beta launch playbook |
| 24 | Final beta readiness review + CI dependency scan |
| 25 | This review packet |

`git log --oneline -10` shows the latest commits; each phase is one focused
commit with a descriptive body.

## 2. Stack summary

- **Monorepo:** pnpm workspace, TypeScript **strict** end-to-end, ESM.
- **API:** Fastify 5 (modular monolith) — `api/`. Runs via `tsx`.
- **Client:** React 18 + Vite 6 + installable PWA + react-router-dom 6 —
  `client/`.
- **DB:** PostgreSQL 16 + Drizzle ORM + `postgres-js`; forward-only SQL
  migrations (drizzle-kit) — `packages/db/`.
- **Tests:** Vitest (unit/integration on **PGlite** in-process Postgres) +
  Playwright (browser smoke).
- **Tooling:** ESLint (+ jsx-a11y, react-hooks), Prettier, husky pre-push, CI on
  GitHub Actions.
- **Versions used in dev:** Node 22, pnpm 10 (repo requires Node ≥ 20, pnpm 10).

## 3. Local setup

```bash
corepack enable                 # provides pnpm 10
pnpm install --frozen-lockfile
cp .env.example .env            # fill values as needed (see §4)
```

Run **without a database** (health-only API + client):
```bash
pnpm dev        # API :3000 + client :5173
```

Run **with data** (recommended for a real walkthrough) — needs Postgres 16:
```bash
createdb barready
export DATABASE_URL=postgres://<user>@localhost:5432/barready
pnpm db:migrate
pnpm db:seed:demo               # full demo dataset (see §9)
pnpm dev                        # then open http://localhost:5173
```

## 4. Environment variables

From `.env.example` (no secrets committed; `.env*` is gitignored):

| Variable | Scope | Required | Default / example | Notes |
| --- | --- | --- | --- | --- |
| `NODE_ENV` | API | — | `development` | `production` in deploy. |
| `PORT` | API | — | `3000` | |
| `HOST` | API | — | `0.0.0.0` | |
| `LOG_LEVEL` | API | — | `info` | Pino levels. |
| `DATABASE_URL` | API | for DB routes/migrate/seed | `postgres://postgres:postgres@localhost:5432/barready` | Without it the API runs health-only. External conns: add `?sslmode=require`. |
| `CORS_ORIGINS` | API | — | `http://localhost:5173` | Comma-separated allow-list. |
| `STRIPE_SECRET_KEY` | API | optional | _(blank)_ | **Blank = safe stub billing**, no charges, no committed secret. |
| `VITE_API_BASE_URL` | client | build-time | `http://localhost:3000` | Baked into the bundle. |

## 5. Database: setup / migrate / seed

```bash
pnpm db:generate    # regenerate SQL migrations from the Drizzle schema
pnpm db:migrate     # apply forward-only migrations          (needs DATABASE_URL)
pnpm db:seed        # LEAN dev/test seed (1 student, small course)
pnpm db:seed:demo   # FULL demo dataset (6 personas, 3 subjects/56 items, exams)
```
Migrations are forward-only and reviewed; never edit an applied migration.
Tests don't need a real DB — they use PGlite.

## 6. Test & check commands

```bash
pnpm check        # format:check + lint + typecheck + test  (the gate)
pnpm test         # Vitest: client 32 + db 22 + api 96 = 150
pnpm build        # api (tsc) + client (vite/PWA)
pnpm audit:prod   # production dependency scan (--prod --audit-level high)
pnpm test:e2e     # Playwright browser smoke (installs Chromium on first run)
```
**Checkpoint result (this packet):** `git status` clean; lint, typecheck,
test (150), build, `audit:prod`, and E2E (2) **all green**. No failing or
skipped tests.

## 7. Deployment status

- **Not yet deployed.** Target host is **Render**; a `render.yaml` Blueprint
  (API web service + static PWA + managed Postgres 16) is committed.
- Full instructions: `docs/DEPLOYMENT.md`; launch runbook + rollback:
  `docs/BETA_LAUNCH_PLAYBOOK.md`.
- Pre-traffic migrations via `preDeployCommand`; health check `/health`.

## 8. Demo account credentials (intentionally seeded)

Created by `pnpm db:seed:demo`. **All share password `demo-password-123`** and
are beta-enabled. These are dev/demo accounts only — not secrets.

| Email | Role / persona |
| --- | --- |
| `new.student@example.com` | Fresh student (empty-state) |
| `active.student@example.com` | Engaged student (full data) |
| `mbe.weak@example.com` | Weak on MBE |
| `essay.weak@example.com` | Weak on essays |
| `admin@example.com` | Admin (+ content reviewer) |
| `grader@example.com` | Grader |

Lean seed (`pnpm db:seed`) creates `demo.student@example.com` /
`demo-password-123`.

## 9. Caveats & candor

**Known limitations** — see `docs/KNOWN_ISSUES.md` (severity-labelled) and
`docs/POST_BETA_BACKLOG.md`. Highlights:
- No production content bank yet (only demo/placeholder) — **H-2**.
- No error tracking / tested DB restore yet — **H-3**.
- API runs via `tsx`, not a compiled bundle — **M-1**.
- Rate limiter is in-memory/per-process — **M-2**.

**Known bugs:** none open. Three were found+fixed in the Phase 22 bug bash
(`docs/BETA_BUG_BASH_REPORT.md`).

**Incomplete features:** production content authoring (H-2); error
tracking/tested restore (H-3); recorded screen-reader pass (H-4). All
post-beta/non-gates (MPRE, AI grading at scale, native apps, multi-course,
social, B2B, localization, offline) are intentionally **not** built —
`BETA_ACCEPTANCE_CRITERIA.md §9`.

**Security / privacy caveats:** baseline is solid (scrypt, hashed httpOnly
sessions, deny-by-default authz, parameterized queries, helmet, auth rate
limiting, secrets in host manager, log redaction; export + delete implemented).
Open: **CVE-2026-39356** in `drizzle-orm` — **verified non-exploitable** in our
usage (no `sql.identifier()`/dynamic aliases), upgrade planned (**H-1**);
privacy policy is a beta **draft** pending legal review (**M-4**). See
`docs/SECURITY_AND_PRIVACY.md`.

**Content / licensing caveats:** enforcement is **structural and tested** — the
engine serves only `license_status='cleared'` content, every item requires full
metadata, `publish` requires reviewer ≠ author, transitions are audit-logged,
and all seeded content is **original/fictional** (no protected material). The
gap is depth/volume of real cleared content, not the controls
(`docs/CONTENT_AND_LICENSING_POLICY.md`).

## 10. Where the code is likely weakest (review focus)

1. **Adaptive engine calibration** (`services/adaptive/*`): logic is clean,
   deterministic, and tested, but the heuristics (ability estimates, plan
   weighting, readiness gating) are **not yet validated against a real cohort** —
   the central honesty check (`LEARNING_SYSTEM.md §7`) happens during the beta.
   Worth scrutinizing the formulas/assumptions.
2. **Analytics computed on read** (no rollups/cache) — correctness is fine;
   scaling is the question (**M-5**).
3. **Exam timing/auto-expiry** (`services/exam`): server-enforced section expiry
   and resume logic are the trickiest stateful paths — good place to probe edge
   cases (pause/resume, clock skew, concurrent answers).
4. **`grading/aiFeedback`**: lightweight heuristic feedback only; not a scoring
   model. Confirm it isn't mistaken for graded scores.
5. **Dependency currency**: `drizzle-orm` pinned below the patched version
   (H-1).

## 11. Recommended next improvements (priority order)

1. Upgrade `drizzle-orm` → 0.45.2 and re-run the gate (**H-1**).
2. Author + provenance-review the production content bank (**H-2**).
3. Add error tracking (Sentry) and run a tested DB restore (**H-3**).
4. Record a manual screen-reader pass on the core loop (**H-4**).
5. Add an enforced coverage floor for the engine/services (**M-3**).
6. Move rate limiting to a shared store; add analytics rollups as cohorts grow
   (**M-2**, **M-5**).
7. Bundle the API for a compiled `node` start (**M-1**); finalize app icons +
   legal copy before any public launch (**L-1**, **M-4**).
