# Architecture

> Production-grade but beta-realistic architecture for **BarReady**. Implements
> the [Technical Charter](./TECHNICAL_CHARTER.md) and serves the
> [Product Design Spec](./PRODUCT_DESIGN_SPEC.md). Stack rationale lives in
> [ADR 0001](./ADR/0001-stack.md); build sequence in
> [IMPLEMENTATION_ROADMAP](./IMPLEMENTATION_ROADMAP.md).

---

## 1. System overview

A **modular monolith** (single deployable API) with a typed SPA/PWA client and
async workers. Bounded contexts have hard internal boundaries so any can be
extracted to a service later without a rewrite (Charter §1.1).

```
        ┌─────────────────────────────┐
        │   Web client (React PWA)    │  installable, offline-capable shell
        │   typed API client          │
        └──────────────┬──────────────┘
                       │ HTTPS / JSON (typed contract)
        ┌──────────────▼──────────────┐
        │        API (Node/TS)        │  routes → services → repositories
        │  ┌───────────────────────┐  │
        │  │ bounded-context modules│ │  (see §4)
        │  └───────────────────────┘  │
        └───┬──────────┬─────────┬────┘
            │          │         │
   ┌────────▼──┐  ┌────▼────┐ ┌──▼───────────┐
   │PostgreSQL │  │ Job queue│ │ Object store │
   │ (primary) │  │ + workers│ │  (assets)    │
   └───────────┘  └────┬────┘ └──────────────┘
                       │
              grading, SRS scheduling,
              analytics rollups, notifications
```

Outside the boundary: **Stripe** (payments), **email/push provider**
(notifications), **error/metrics** (observability), **analytics sink** (events).

---

## 2. Recommended final stack

| Layer | Recommendation | Why (short) |
| --- | --- | --- |
| **Web frontend** | **React + TypeScript + Vite**, component lib + design tokens, TanStack Query for server state | Typed end-to-end (Charter §2); fast DX; large talent pool |
| **App / PWA strategy** | **Installable PWA for beta** (service worker, web-app-manifest, offline shell + cached review/SRS). **Post-beta: Expo (React Native)** sharing TS domain logic; native wrapper only if store presence is needed sooner | Meets acceptance criterion exactly; one codebase to start, clean native path later |
| **Backend / API** | **Node.js + TypeScript**, typed HTTP framework, layered `routes → services → repositories`; OpenAPI/typed contract shared with client | One language across stack; testable service layer (Charter §4) |
| **Database** | **PostgreSQL** + a typed query/migration layer; forward-only migrations | Relational fit for the progress spine; JSONB for item payloads |
| **Auth** | **Own session auth** (memory-hard KDF, httpOnly+secure+SameSite rotating tokens) **+ OAuth** (Google/Apple). Roles via RBAC (§3). Option to delegate to a managed provider if it accelerates beta | Charter §3 deny-by-default; avoid lock-in while keeping speed |
| **Payments** | **Stripe** (Checkout + Billing + webhooks); plans/entitlements mapped to course access | Industry standard; PCI handled by Stripe; subscriptions + one-time |
| **Content storage** | **Postgres** for item text/metadata; **S3-compatible object store** for media/PT files/model assets; CDN in front of public assets | Charter §1.2 — never blobs in Postgres; license metadata stays relational |
| **Analytics / event tracking** | **Product analytics tool with self-host option (e.g., PostHog)** for product events; a typed internal **event bus → analytics rollups** in Postgres for learning metrics | Separate *product* analytics from *learning* analytics (the latter is first-class data, not third-party) |
| **Admin CMS** | **Custom, in-app authoring/review console** (not off-the-shelf CMS) built on the content workflow (Design §19) | Licensing enforcement is structural and bespoke — generic CMS can't enforce reviewer≠author + license states |
| **Testing** | **Unit** (Vitest/Jest), **integration** against real Postgres (testcontainers), **E2E** (Playwright) for the core loop; coverage floor on engine/assessment | Charter §4 pyramid + determinism |
| **Deployment** | **Containerized**, immutable artifacts promoted local→staging→prod; managed Postgres; CI/CD with gated prod promotion; structured logs + error tracking + metrics | Charter §6; single-region for beta, horizontal-ready API |

> These finalize the Charter's "defaults-with-rationale." Principles are fixed;
> a specific tool may still be swapped via a new ADR.

---

## 3. Roles & access model (RBAC)

Deny-by-default; every endpoint checks role **and** resource ownership
(Charter §3). Roles are additive capabilities, not a strict hierarchy.

| Role | Can do | Cannot do |
| --- | --- | --- |
| **Student** | Own learning: diagnostic, plan, practice, exams, review, SRS, own progress, own feedback | See others' data; touch content/admin |
| **Instructor / Grader** | Read assigned students' progress (read-only spine); grade/annotate essays & PTs (post-beta grading); leave feedback | Edit content; manage billing/users; see unassigned students |
| **Content Author** | Create/edit item drafts with full metadata; submit for review | Clear own items; activate content; see student PII |
| **Content Reviewer** | Review queue; verify accuracy + provenance; set `cleared`/`rejected`; manage versions | Clear items they authored (reviewer ≠ author enforced) |
| **Admin** | User/role management, content-health & licensing audit, billing oversight, system config | Bypass licensing clearing; impersonate without audit |
| **(Future) School / Cohort account** | Org owner manages a roster, assigns instructors, buys seats; cohort-level read analytics | (Post-beta) — see §3.1 |

### 3.1 Future school/cohort design (built-for, not built-now)
The data model carries an optional **`organization`** and **`cohort`**
association from day one (nullable on user/enrollment). Beta ignores them; the
post-beta school account = an `organization` with seat-based entitlements,
instructors scoped to its cohorts, and aggregate (never per-student-PII-leaking)
analytics. No migration required to enable — only new flows. (Mirrors the
MPRE-without-migration constraint, Charter §1.4.)

### 3.2 Enforcement
- RBAC checks in the **service layer**, not the client (client-trusted authz is
  forbidden, Charter §3).
- Resource ownership scoping on every query (a student query is always
  `WHERE user_id = :me`).
- Role/permission changes and all content-license transitions are **audit-logged**.

---

## 4. Module boundaries (bounded contexts)

Each module owns its tables, exposes a typed service interface, and never reaches
into another module's tables directly — only via that module's services. This is
what makes later extraction cheap.

| Module | Owns | Key entities | Depends on |
| --- | --- | --- | --- |
| **auth** | Authentication, sessions, RBAC, OAuth | Credential, Session, Role, Permission | — |
| **users/profiles** | Account, profile, onboarding inputs, persona signals, org/cohort assoc | User, Profile, Enrollment, Organization?, Cohort? | auth |
| **courses** | Course catalog, blueprints, subject/subtopic/issue taxonomy, exam weights | Course, Subject, Subtopic, Issue, Blueprint | — |
| **lessons** | Learning content units, rule entries, attack-outline templates | Lesson, RuleEntry, OutlineTemplate | courses, content |
| **question bank** | MBE items + per-option rationales, issue tags, licensing metadata | Item, ItemOption, ItemLicense | courses, content workflow |
| **exams** | Diagnostic + full-length sessions, sectioning, pacing/fatigue, timing | ExamSession, SectionResult, ItemAttempt | question bank, essays/PTs, courses |
| **essays/PTs** | Prompts, PT packets, model answers, rubrics, submissions | EssayPrompt, PTPacket, Submission, RubricScore | courses, content |
| **grading** | Self-assessment workflow now; assisted/human grading later; rubric scoring | GradingTask, RubricResult, GraderAssignment | essays/PTs, users |
| **progress analytics** | The progress spine (subject→subtopic→issue→item→exam→time-mgmt), readiness, heatmap, calibration, error journal | IssueMastery, ReadinessSnapshot, CalibrationStat, ErrorJournalEntry | exams, question bank, essays/PTs |
| **spaced repetition** | SRS scheduling, review queue, rule-recall stages | ReviewItem, ReviewLog | progress analytics, lessons |
| **learning engine** (orchestrator) | Diagnostic flow, adaptive plan, daily assignment assembly, remediation | StudyPlan, Assignment, RemediationUnit | progress analytics, SRS, exams, question bank, essays/PTs |
| **admin** | Authoring/review console, content health, licensing audit, role mgmt | (reads across content modules), AuditLog | auth, courses, content modules |
| **billing** | Stripe integration, plans, entitlements, course access | Subscription, Entitlement, Invoice | users, auth |
| **notifications** | Email/push, daily nudges, exam reminders, feedback-loop closes | Notification, Channel, Preference | users, learning engine |

> "content workflow" is a cross-cutting concern owned by **admin** + the content
> modules (question bank, lessons, essays/PTs), enforcing the
> [Content & Licensing Policy](./CONTENT_AND_LICENSING_POLICY.md).

### 4.1 Dependency rules
- Dependencies point **inward** toward `courses`/`progress`; no cycles.
- The **learning engine** orchestrates but stays pure/deterministic where it
  computes (Charter §4); side-effecting work (notifications, rollups, grading)
  is dispatched to **workers** via the job queue.
- Cross-module reads go through service interfaces + shared read models, never
  foreign SQL joins across module table boundaries (allows future split).

---

## 5. Data & flow highlights
- **Progress spine** (Design §2) is the integration point: exams, bank, and
  essays/PTs write attempts; progress analytics derives mastery/readiness; the
  learning engine reads it to build plans.
- **Determinism:** scoring/scheduling functions are pure and seedable; workers
  persist results. Same inputs → same plan (testable).
- **Async boundaries:** grading dispatch, SRS recompute, analytics rollups,
  notification sends, Stripe webhook handling — all via queue, idempotent.
- **Licensing gate:** the learning engine and all student-facing queries filter
  `license_status = cleared`; non-cleared content is structurally unreachable
  (Content Policy §5).

---

## 6. Cross-cutting concerns
- **Security:** Charter §3 — HTTPS/HSTS, validated boundary input, parameterized
  queries, secrets manager, rate limiting, audit logging.
- **Accessibility:** Charter §5 — WCAG 2.1 AA baked into the component library
  and verified in CI + manual SR pass.
- **Observability:** structured logs, error tracking, metrics (latency, error
  rate, queue depth) from day one.
- **PWA specifics:** app manifest, service-worker caching of shell + read-only
  study assets (review, SRS cards) for offline; mutations queue and sync on
  reconnect (bounded to safe, idempotent actions in beta).

---

## 7. Beta-realism guardrails
- One deployable API + workers + Postgres + object store. **No microservices,
  no multi-region, no event-sourcing** in beta.
- Off-the-shelf where it doesn't touch core differentiation (Stripe, email/push,
  error tracking, analytics). **Custom only** where it's the product (learning
  engine, progress spine, content/licensing workflow).
- Every module is independently testable; the build sequence (Roadmap) never
  exceeds one focused session per phase.
