# BarReady

> Working name. An adaptive, content-licensed bar exam preparation platform:
> diagnose each student's weaknesses, drive a personalized daily study plan, and
> measure honest readiness to pass.

An installable **PWA** (React + Vite) backed by a typed **Fastify** API and
**PostgreSQL** (Drizzle ORM), organized as a pnpm monorepo. See
[Architecture](docs/ARCHITECTURE.md) and [ADR 0001 — Stack](docs/ADR/0001-stack.md).

## Repository layout

```
api/            Fastify + TypeScript API (health route, env validation,
                error-handling & logging baseline)
client/         React + Vite installable PWA (landing page, routing)
packages/db/    Drizzle schema, migrations, seed, PGlite-backed tests
e2e/            Playwright end-to-end tests
docs/           Product + technical planning docs (source of truth)
.github/        CI workflow (lint, typecheck, test, build, e2e)
```

## Prerequisites
- **Node.js ≥ 20** (CI uses 22)
- **pnpm 10** (`corepack enable` or `npm i -g pnpm`)
- **PostgreSQL** — only needed to run migrations/seed against a real DB; unit and
  integration tests use in-process PGlite, so they need no database.

## Setup

```bash
pnpm install
cp .env.example .env   # then edit values as needed
```

Environment variables are documented in [`.env.example`](.env.example) and are
**validated at startup** (`api/src/env.ts`); the API refuses to boot on invalid
config.

## Development

```bash
pnpm dev          # run API + client together
pnpm dev:api      # API only  → http://localhost:3000  (GET /health)
pnpm dev:client   # client only → http://localhost:5173
```

- API health check: `GET /health` (also `/healthz`, `/readyz`).
- Client landing page: `http://localhost:5173/`.

## Database

```bash
pnpm db:generate   # regenerate SQL migrations from the Drizzle schema
pnpm db:migrate    # apply migrations              (requires DATABASE_URL)
pnpm db:seed       # seed the LEAN dev dataset     (requires DATABASE_URL)
pnpm db:seed:demo  # seed the FULL beta demo set   (requires DATABASE_URL)
```

Schema and entities are documented in [docs/DATA_MODEL.md](docs/DATA_MODEL.md).
All seed content is **original, fictional placeholder material** — no protected
bar exam content (see [Content & Licensing Policy](docs/CONTENT_AND_LICENSING_POLICY.md)).

### Seed datasets

Run either against a fresh, migrated database (set `DATABASE_URL` first):

| Command | Purpose | Contents |
| --- | --- | --- |
| `pnpm db:seed` | Minimal data the **test suite** relies on | 1 demo student, a small course, a few items/exams |
| `pnpm db:seed:demo` | **Full beta walkthrough** dataset | 3 subjects · 5 modules · 10 lessons · 56 MBE items · 3 essays · 1 PT · diagnostic + periodic + full-length exams · 6 personas with populated analytics |

**Demo personas** (all share the password `demo-password-123`, all beta-enabled):

| Email | Role / persona | What it demonstrates |
| --- | --- | --- |
| `new.student@example.com` | Fresh student | Empty-state onboarding / first-day experience |
| `active.student@example.com` | Engaged student | Balanced progress, graded essay + PT, due reviews, daily plan |
| `mbe.weak@example.com` | Struggling on MBE | Low MBE accuracy, error patterns, overconfidence signal |
| `essay.weak@example.com` | Struggling on essays | Strong-ish MBE but low grader essay scores |
| `admin@example.com` | Admin (+ content reviewer) | Admin CMS, content operations, analytics |
| `grader@example.com` | Grader | Essay/PT grading queue and feedback |

> The demo seed is independent of the lean `db:seed` (different course slug and
> emails). Run it on a **fresh** database — re-running on the same DB will
> conflict on unique emails. Every item is `provenance = original` and
> `license_status = cleared`; there is **no protected content**.

Example:

```bash
export DATABASE_URL=postgres://postgres@localhost:5432/barready
pnpm db:migrate && pnpm db:seed:demo
# then `pnpm dev` and log in as any persona above (password: demo-password-123)
```

## Quality gates

```bash
pnpm typecheck      # tsc --noEmit across all packages
pnpm lint           # ESLint (TS + React hooks + jsx-a11y)
pnpm format         # Prettier write   (pnpm format:check to verify)
pnpm test           # unit + integration (Vitest; db tests use PGlite)
pnpm test:e2e       # Playwright E2E (installs a browser on first run)
pnpm check          # format:check + lint + typecheck + test (the full gate)
pnpm build          # production build of api (tsc) and client (vite/PWA)
```

A **pre-push** git hook (husky) runs `lint + typecheck + test`. The same gate
runs in [CI](.github/workflows/ci.yml) on every push and pull request, plus a
production build and the Playwright E2E suite.

### Testing layers (Charter §4 pyramid)
- **Unit/integration:** Vitest. `packages/db` applies the real migrations to an
  in-process Postgres (PGlite) and asserts schema relationships; `api` exercises
  routes via Fastify `inject` (no network); `client` uses Testing Library + jsdom.
- **E2E:** Playwright drives the client dev server (landing + routing smoke).

## Deployment

- **Build artifacts:** `pnpm build` produces `api/dist` (Node ESM) and
  `client/dist` (static PWA assets + service worker).
- **API:** provide validated env (`DATABASE_URL`, `PORT`, `LOG_LEVEL`,
  `CORS_ORIGINS`) behind TLS; structured logs via pino. In dev/staging the API
  runs via `tsx` (`pnpm dev:api`). _Packaging note:_ the workspace `@barready/db`
  is consumed as TypeScript source, so a plain `node api/dist/server.js`
  production artifact still needs workspace deps built/bundled (esbuild bundle or
  a `db` build step) — tracked for the deploy phase in the roadmap.
- **Client:** serve `client/dist` from a static host/CDN; it's an installable PWA.
- **Migrations:** run `pnpm db:migrate` as a gated, forward-only deploy step.
- **Environments:** local → staging → production with parity; immutable artifacts
  promoted between them. See [Technical Charter §6](docs/TECHNICAL_CHARTER.md) and
  [Implementation Roadmap](docs/IMPLEMENTATION_ROADMAP.md).

## Planning docs
- [Product Brief](docs/PRODUCT_BRIEF.md) — users, course types, promise, beta scope.
- [Technical Charter](docs/TECHNICAL_CHARTER.md) — standards, security, testing, a11y, deployment.
- [Learning System](docs/LEARNING_SYSTEM.md) — diagnostic, adaptive plan, spaced repetition, scoring.
- [Content & Licensing Policy](docs/CONTENT_AND_LICENSING_POLICY.md) — provenance and licensing rules.
- [Product Design Spec](docs/PRODUCT_DESIGN_SPEC.md) — buildable design for all surfaces + differentiated features.
- [Architecture](docs/ARCHITECTURE.md) — system shape, stack, roles, module boundaries.
- [Data Model](docs/DATA_MODEL.md) — implemented schema reference.
- [ADR 0001 — Stack](docs/ADR/0001-stack.md) · [ADR 0002 — Data access](docs/ADR/0002-data-access.md)
- [Implementation Roadmap](docs/IMPLEMENTATION_ROADMAP.md) — phased build plan (one phase ≈ one session).
- [Beta Acceptance Criteria](docs/BETA_ACCEPTANCE_CRITERIA.md) — definition of done.
- [CLAUDE.md](CLAUDE.md) — persistent rules for coding sessions.
