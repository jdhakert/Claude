# Technical Charter

> Companion to the [Product Brief](./PRODUCT_BRIEF.md). This document defines
> *how* we build BarReady: architecture, standards, security, testing,
> accessibility, and deployment. Decisions here are defaults-with-rationale;
> changing one requires updating this charter in the same PR.

## 1. Architecture

### 1.1 Shape
A modular monolith for beta, structured so that bounded contexts can be
extracted into services later without rewrites. We favor a clear internal
module boundary over premature microservices.

```
+-------------------+        +------------------------+
|  Web client (SPA) | <----> |  API (application)     |
|  React + TS       |  HTTPS |  TypeScript/Node        |
+-------------------+  JSON  |  - auth                 |
                             |  - content/items        |
                             |  - learning engine       |
                             |  - assessment/grading    |
                             |  - progress/analytics    |
                             +-----------+------------+
                                         |
                              +----------+-----------+
                              |  PostgreSQL (primary) |
                              |  Object store (assets)|
                              |  Job queue (async)    |
                              +----------------------+
```

### 1.2 Default stack
- **Language:** TypeScript end-to-end (strict mode) — one language reduces
  context-switching and lets us share types between client and server.
- **Frontend:** React + Vite (or Next.js if SSR/SEO is later needed). State via
  a lightweight store; data fetching via a typed client generated from the API
  schema.
- **Backend:** Node.js with a typed HTTP framework; layered as
  `routes → services → repositories`. No business logic in route handlers.
- **Database:** PostgreSQL. Migrations are versioned, forward-only, reviewed.
- **Async:** A job queue for grading, spaced-repetition scheduling, and
  analytics rollups. No long work inside request handlers.
- **Object storage:** for media assets (PT files, images), never in Postgres.

> Stack choices are revisable, but the **principles** (typed end-to-end, modular
> boundaries, forward-only migrations, async for heavy work) are not.

### 1.3 Bounded contexts (modules)
- **Identity & Access** — accounts, sessions, roles.
- **Content** — items (questions), explanations, essays/PTs, licensing metadata.
  See [Content & Licensing Policy](./CONTENT_AND_LICENSING_POLICY.md).
- **Learning Engine** — diagnostics, adaptive plan, spaced repetition, issue
  tracking, daily assignments. See [Learning System](./LEARNING_SYSTEM.md).
- **Assessment** — answer capture, scoring, essay/PT feedback workflow,
  confidence calibration.
- **Progress & Analytics** — progress scoring, readiness signal, dashboards.

### 1.4 Extensibility requirements (hard constraints)
- **Course-agnostic core.** `course`, `subject`, `subtopic`, `item_type`, and
  `jurisdiction` are data, not code branches. Adding **MPRE** post-beta must
  require **no schema migration** — only new rows and content.
- **Item-type polymorphism.** MBE multiple-choice, essay, and PT share a common
  item envelope (id, subject, subtopic, jurisdiction, licensing metadata,
  difficulty) with type-specific payloads.
- **Scoring is pluggable.** Each item type registers a scorer; the learning
  engine never hardcodes "MBE".

## 2. Coding standards
- **TypeScript strict** everywhere; no implicit `any`; no unchecked `any` casts
  across module boundaries.
- **Linting & formatting** enforced in CI (ESLint + Prettier). CI fails on lint
  errors; formatting is auto-checked, not debated in review.
- **Naming:** descriptive, domain-aligned (`StudyPlan`, `ItemAttempt`,
  `LicenseStatus`), no abbreviations that aren't industry-standard.
- **Functions** do one thing; business logic lives in services, not in
  controllers or React components.
- **Errors** are typed and handled explicitly; no swallowed exceptions. User-
  facing errors never leak stack traces or internal identifiers.
- **No secrets in code.** Configuration via environment, validated at startup.
- **Comments** explain *why*, not *what*. Match surrounding style.
- **Commits** are small and descriptive; PRs include rationale and link the
  affected charter/section if a decision changes.
- **Dependencies** are added deliberately: prefer the standard library and
  existing deps; justify each new dependency in the PR.

## 3. Security baseline
- **Transport:** HTTPS only; HSTS; no mixed content.
- **AuthN:** salted+hashed passwords (memory-hard KDF) or delegated OAuth;
  session tokens are httpOnly, secure, SameSite; short-lived access + rotation.
- **AuthZ:** deny-by-default; every endpoint checks ownership/role. No
  client-trusted authorization.
- **Input validation:** validate and type every external input at the boundary
  (schema validation); reject unknown fields.
- **Injection:** parameterized queries only; no string-built SQL; output
  encoding to prevent XSS; CSRF protection on state-changing requests.
- **Secrets:** stored in a secret manager, never committed; rotation supported.
- **PII minimization:** collect only what the learning system needs; encrypt
  sensitive data at rest; documented retention and deletion.
- **Dependencies:** automated vulnerability scanning in CI; no known-critical
  CVEs shipped.
- **Logging:** no secrets or full PII in logs; audit trail for
  content-licensing changes and grading.
- **Rate limiting & abuse protection** on auth and write endpoints.
- **OWASP Top 10** is the minimum review checklist for any security-relevant PR.

## 4. Testing requirements
- **Pyramid:** many unit tests, focused integration tests, few end-to-end tests.
- **Unit:** all learning-engine logic (diagnostic scoring, plan generation,
  spaced-repetition scheduling, progress/readiness math, confidence
  calibration) must be unit-tested. This logic is the product — it is not
  shippable untested.
- **Integration:** API endpoints tested against a real Postgres (test
  container), including authz and validation paths.
- **E2E:** the core loop — onboard → diagnostic → plan → daily assignment →
  attempt → re-scored readiness — has at least one automated happy-path E2E.
- **Coverage:** CI enforces a coverage floor on the learning engine and
  assessment modules specifically (not just a global average that can hide
  untested core logic).
- **Determinism:** scheduling and scoring functions are pure/deterministic given
  inputs (seedable randomness), so tests are stable.
- **CI gate:** lint + typecheck + tests + dependency scan must pass before merge.

## 5. Accessibility requirements
- **Target:** WCAG 2.1 **AA** for all student-facing flows. This is a launch
  requirement, motivated directly by the high-anxiety and broad-audience
  personas in the Product Brief.
- **Keyboard:** every interaction operable without a mouse; visible focus.
- **Screen readers:** semantic HTML, ARIA only where needed, labeled controls,
  meaningful reading order; timed exams expose time remaining accessibly.
- **Color & contrast:** AA contrast; never encode meaning by color alone
  (correct/incorrect must have text/icon, not just red/green).
- **Motion & anxiety:** respect `prefers-reduced-motion`; no surprise
  countdowns or flashing; calm, predictable layouts.
- **Responsive:** usable on mobile web; tap targets meet minimum size.
- **Testing:** automated a11y checks in CI plus a manual screen-reader pass on
  the core loop before beta.

## 6. Deployment assumptions
- **Environments:** local → staging → production, with parity in stack and
  migrations. No "works on my machine" config drift.
- **Build:** reproducible, containerized; immutable artifacts promoted between
  environments (no rebuild per environment).
- **Migrations:** run as a gated, forward-only step in deploy; reversible by
  roll-forward, not destructive rollback.
- **Config:** 12-factor; all config via environment; validated at boot.
- **Observability:** structured logs, error tracking, basic metrics (latency,
  error rate, queue depth) from day one.
- **Backups:** automated Postgres backups with tested restore; object store
  versioned.
- **CI/CD:** merge to main triggers build + test; promotion to production is
  gated (manual approval acceptable in beta).
- **Scale assumption (beta):** single-region, modest pilot cohort. Designed to
  scale horizontally at the API tier later; no premature multi-region work.

## 7. Decision log
Material architectural decisions are recorded as short ADR entries under
`docs/ADR/` once code begins. The first, [ADR 0001 — Stack](./ADR/0001-stack.md),
is recorded.
