# Deployment

Status: **Beta** · Owner: Engineering · Last updated: 2026-06-14

How to deploy BarReady. Host is **Render** (managed Postgres + web service +
static site, simple IaC via `render.yaml`). The same steps map to any host that
can run a Node web service, serve a static directory, and provide Postgres 16.

> Companion docs: `docs/BETA_LAUNCH_PLAYBOOK.md` (launch checklist + rollback),
> `docs/SECURITY_AND_PRIVACY.md`, `docs/POST_BETA_BACKLOG.md`.

---

## 1. Architecture (what gets deployed)

| Component | What | Build | Runtime |
| --- | --- | --- | --- |
| `barready-api` | Fastify JSON API | `pnpm install --frozen-lockfile` | `pnpm --filter @barready/api start:prod` (`tsx src/server.ts`) |
| `barready-web` | Vite + PWA static SPA | `pnpm --filter @barready/client build` → `client/dist` | static host w/ SPA rewrite |
| `barready-db` | PostgreSQL 16 | — | managed Postgres |

> **Why `tsx`, not `node dist`:** the API imports `@barready/db` as TypeScript
> source, so the compiled `node dist/server.js` start can't resolve it without a
> bundling step (OPS-1 in the backlog). Production runs via `tsx`, which is a
> runtime dependency of the API. The build still type-checks/compiles.

---

## 2. Prerequisites
- A Render account (or equivalent host).
- The repo connected to the host; production branch = `main`.
- Node ≥ 20 and `pnpm@10` (via `corepack enable`) on the build image.
- Postgres 16.

---

## 3. Deploy on Render (Blueprint)

1. **Create the Blueprint.** In Render: *New → Blueprint* and point it at this
   repo. Render reads `render.yaml` and provisions the database, API web
   service, and static site.
2. **Set the secrets** (marked `sync: false`, so Render prompts for them):
   - `barready-api → CORS_ORIGINS` = the deployed web URL (e.g.
     `https://barready-web.onrender.com`). Comma-separated if more than one.
   - `barready-api → STRIPE_SECRET_KEY` = **leave blank** for beta (safe stub
     billing). Set only to enable live Stripe.
   - `barready-web → VITE_API_BASE_URL` = the API’s public URL (e.g.
     `https://barready-api.onrender.com`). This is a **build-time** value — a
     change requires a rebuild of the static site.
3. **First deploy.** Render runs, in order per service:
   - API: `buildCommand` → `preDeployCommand` (**migrations**) → `startCommand`.
   - Web: `buildCommand` → publish `client/dist`.
4. **Verify** (see §7).

`DATABASE_URL` is injected automatically from the managed database — never set
it by hand.

### Manual / other hosts
Run the equivalent steps:
```bash
corepack enable
pnpm install --frozen-lockfile
# API:
DATABASE_URL=... pnpm db:migrate          # apply migrations first
DATABASE_URL=... NODE_ENV=production CORS_ORIGINS=https://web.example \
  pnpm --filter @barready/api start:prod  # serves on $PORT (default 3000)
# Web (build-time API URL):
VITE_API_BASE_URL=https://api.example pnpm --filter @barready/client build
#   then serve client/dist as a static SPA (rewrite all routes to /index.html)
```

---

## 4. Production environment variables (checklist)

### API (`barready-api`)
| Variable | Required | Example / default | Notes |
| --- | --- | --- | --- |
| `NODE_ENV` | ✅ | `production` | Enables prod logging; disables test shortcuts. |
| `PORT` | ✅ | `3000` | Host usually injects this. |
| `HOST` | ✅ | `0.0.0.0` | Bind all interfaces. |
| `LOG_LEVEL` | — | `info` | `fatal`…`trace`/`silent`. |
| `DATABASE_URL` | ✅ | `postgres://…` | From the managed DB. External connections need `?sslmode=require`. |
| `CORS_ORIGINS` | ✅ | `https://barready-web.onrender.com` | Comma-separated allow-list. Must include the web origin or the PWA can’t call the API. |
| `STRIPE_SECRET_KEY` | — (optional) | _(blank)_ | **Blank = stub billing** (no charges, no committed secret). Set to go live. |

### Web (`barready-web`, build-time)
| Variable | Required | Example | Notes |
| --- | --- | --- | --- |
| `VITE_API_BASE_URL` | ✅ | `https://barready-api.onrender.com` | Baked into the bundle at build; change ⇒ rebuild. |

**Secrets policy:** secrets live only in the host’s secret manager. `.env` is
gitignored; `.env.example` documents every key with blank sensitive values.
Never commit a real `DATABASE_URL` or `STRIPE_SECRET_KEY`.

---

## 5. Database migrations & deployment

- Migrations are **forward-only**, generated from the Drizzle schema into
  `packages/db/drizzle/*.sql`, and applied by `pnpm db:migrate`
  (`packages/db/src/migrate.ts`, needs `DATABASE_URL`).
- On Render they run automatically via the API service’s **`preDeployCommand`**,
  i.e. **before** the new version receives traffic. If a migration fails, the
  deploy is aborted and the old version keeps serving.

**Workflow for a schema change**
```bash
pnpm db:generate     # author SQL from schema changes (commit the new .sql)
pnpm db:migrate      # apply locally to verify (DATABASE_URL set)
# commit schema + generated migration together; deploy applies it pre-traffic
```

**Seeding**
- Beta/demo data: `pnpm db:seed:demo` against the target `DATABASE_URL` (six
  personas, full demo course — see README). Run once, on a fresh database.
- The lean `pnpm db:seed` is for local/test only.

**Rule:** never edit an already-applied migration; add a new forward migration.

---

## 6. Monitoring & logging plan

**Logging**
- The API logs **structured JSON** (Pino) at `LOG_LEVEL` (default `info`), with
  request/response lines and timing. `authorization` and `cookie` headers are
  **redacted** (`api/src/app.ts`). No secrets or raw PII in logs.
- On Render, stdout/stderr is captured in the service log stream; pipe to a log
  drain (e.g. Logtail/Datadog) for retention and search.

**Health & uptime**
- Liveness/readiness: `GET /health` (also `/healthz`, `/readyz`) — Render polls
  `healthCheckPath: /health` and won’t shift traffic to an unhealthy instance.
- Configure an external uptime check (e.g. Render notifications or an external
  pinger) on the web URL and `…/health`.

**Metrics & alerts (beta-minimal)**
- Watch: API 5xx rate, p95 latency, instance restarts, DB CPU/connections/disk.
- Alert on: health-check failures, sustained 5xx, DB near connection cap
  (pool `max: 10`/instance) or low disk.
- Errors: API errors are logged with stack traces; add an error tracker
  (e.g. Sentry) post-beta for aggregation (tracked in the backlog).

**What to review after each deploy:** health green, error rate flat, a smoke
login + dashboard load (see playbook §verify).

---

## 7. Post-deploy verification (smoke)
1. `GET https://<api>/health` → `{"status":"ok"}`.
2. Load the web URL → landing renders; install prompt available (PWA).
3. Log in as a demo persona (if seeded) → dashboard loads with data.
4. One practice question answered end-to-end; one flashcard review.
5. Check API logs: requests logged, no unexpected 5xx, headers redacted.

---

## 8. CI gate before deploy
`pnpm check` (format + lint + typecheck + test) and `pnpm build` must be green.
Render builds from a clean checkout; a red build aborts the deploy and leaves
the current version running.
