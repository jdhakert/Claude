# Implementation Roadmap

> Phased build sequence for **BarReady**. Every phase is scoped to fit **one
> focused Claude Code session** (a coherent, independently reviewable, testable
> increment). Implements [Architecture](./ARCHITECTURE.md) and
> [ADR 0001](./ADR/0001-stack.md); targets the
> [Beta Acceptance Criteria](./BETA_ACCEPTANCE_CRITERIA.md).

## How to use
- Phases are ordered by dependency. Do them in order unless marked parallel-safe.
- Each phase lists: **Goal · Deliverables · Depends on · Exit criteria**.
- A phase is "done" only when its tests pass and CI is green (Charter §4).
- Keep PRs small; one phase ≈ one PR. Record material decisions as new ADRs.

---

## Milestone 0 — Foundations (repo can build, test, deploy)

### Phase 0.1 — Repo & toolchain scaffold
- **Goal:** monorepo skeleton that builds and lints.
- **Deliverables:** workspace layout (`client/`, `api/`, `packages/shared`),
  TypeScript strict config, ESLint+Prettier, package scripts.
- **Depends on:** planning docs (done).
- **Exit:** `lint` + `typecheck` pass on empty scaffold; README dev setup.

### Phase 0.2 — CI pipeline
- **Goal:** CI gate from day one.
- **Deliverables:** CI running lint + typecheck + test + dependency scan; failing
  build blocks merge.
- **Depends on:** 0.1.
- **Exit:** CI green on a trivial test; PR template links charter sections.

### Phase 0.3 — Database & migrations baseline
- **Goal:** Postgres connection + forward-only migration runner.
- **Deliverables:** typed data-access layer, migration tooling, a health-check
  table, testcontainers integration harness.
- **Depends on:** 0.1.
- **Exit:** migrate up/down in CI against a real Postgres container.

### Phase 0.4 — App shell + PWA baseline
- **Goal:** React PWA that installs.
- **Deliverables:** Vite app, design tokens, base accessible component set, web
  manifest + service worker (offline shell), typed API client stub.
- **Depends on:** 0.1.
- **Exit:** Lighthouse PWA installable; axe a11y check passes on shell.

### Phase 0.5 — Deploy pipeline (staging)
- **Goal:** push-to-staging works.
- **Deliverables:** container builds, immutable artifact promotion, staging
  Postgres, structured logging + error tracking + basic metrics wired.
- **Depends on:** 0.2, 0.3, 0.4.
- **Exit:** a commit deploys to staging; health endpoint green; logs visible.

---

## Milestone 1 — Identity & access

### Phase 1.1 — Auth module
- **Goal:** sign-up/in with sessions.
- **Deliverables:** credential storage (memory-hard KDF), rotating httpOnly
  sessions, rate limiting on auth.
- **Depends on:** 0.3.
- **Exit:** auth integration tests (incl. negative paths) pass.

### Phase 1.2 — RBAC + roles
- **Goal:** role model and deny-by-default checks.
- **Deliverables:** roles (student, instructor/grader, author, reviewer, admin),
  service-layer authz, ownership scoping, audit log for role/permission changes.
- **Depends on:** 1.1.
- **Exit:** authz tests prove cross-user/role denial; audit entries written.

### Phase 1.3 — Users/profiles + org/cohort stubs
- **Goal:** profiles and future-proof org/cohort associations.
- **Deliverables:** User/Profile/Enrollment; nullable Organization/Cohort;
  onboarding-input fields.
- **Depends on:** 1.2.
- **Exit:** profile CRUD scoped to owner; org/cohort columns present, unused.

### Phase 1.4 — OAuth (Google/Apple)
- **Goal:** social sign-in.
- **Deliverables:** OAuth flows linked to accounts.
- **Depends on:** 1.1. *(parallel-safe with 1.3)*
- **Exit:** OAuth login E2E happy path passes.

---

## Milestone 2 — Course & content taxonomy

### Phase 2.1 — Courses + taxonomy
- **Goal:** course-agnostic backbone.
- **Deliverables:** Course, Subject, Subtopic, Issue, exam Blueprint, exam
  weights — as **data** (MPRE-ready, no code branches).
- **Depends on:** 0.3.
- **Exit:** seed UBE/CA/MBE-only/Essay-only taxonomy; queries by
  course/subject/subtopic/issue.

### Phase 2.2 — Item model + licensing metadata
- **Goal:** the licensing-first item envelope.
- **Deliverables:** Item + type-specific payloads, **required** licensing fields
  (source, license_status, jurisdiction, subject, subtopic, author, reviewer,
  version) non-null/enforced; issue tags.
- **Depends on:** 2.1.
- **Exit:** cannot persist an active item missing metadata (test-proven).

### Phase 2.3 — Content authoring/review workflow + audit
- **Goal:** the licensing state machine.
- **Deliverables:** draft→in_review→cleared/rejected→expired states; reviewer ≠
  author enforced; version history; license-transition audit log; bulk import
  that refuses incomplete records and never auto-clears.
- **Depends on:** 2.2, 1.2.
- **Exit:** workflow tests cover every transition; reviewer≠author enforced.

---

## Milestone 3 — Question bank & attempts spine

### Phase 3.1 — MBE question bank + runner
- **Goal:** answer MBE items.
- **Deliverables:** Item/Option/rationale, question runner UI (confidence
  selector, timer, flag, strike-out), tutor + timed modes.
- **Depends on:** 2.3, 0.4.
- **Exit:** a student answers items; explanations render; a11y pass.

### Phase 3.2 — Attempt capture (the spine)
- **Goal:** record everything the progress model needs.
- **Deliverables:** `ItemAttempt` (correct, selected, time_ms, confidence,
  flagged, ts) persisted; foundations for subject/subtopic/issue/question/
  time-management levels.
- **Depends on:** 3.1.
- **Exit:** attempts queryable at all required grains.

---

## Milestone 4 — Progress analytics

### Phase 4.1 — Issue/subtopic/subject mastery
- **Goal:** derive mastery from attempts.
- **Deliverables:** IssueMastery + rollups to subtopic/subject with confidence;
  deterministic, unit-tested.
- **Depends on:** 3.2.
- **Exit:** mastery math unit-tested above coverage floor; stable given inputs.

### Phase 4.2 — Readiness signal
- **Goal:** one honest readiness number.
- **Deliverables:** readiness gated by coverage + recency; never inflated;
  ReadinessSnapshot.
- **Depends on:** 4.1.
- **Exit:** coverage/recency gating proven; low-confidence reported honestly.

### Phase 4.3 — Heatmap, calibration, error journal
- **Goal:** the differentiated analytics surfaces.
- **Deliverables:** issue-spotting heatmap (text+color, never color alone),
  confidence calibration (over/under buckets), "why I missed it" cause taxonomy +
  aggregation.
- **Depends on:** 4.1, 3.2.
- **Exit:** each surface renders from real attempts; a11y pass.

---

## Milestone 5 — Spaced repetition & rules

### Phase 5.1 — SRS engine + review queue
- **Goal:** schedule and resurface missed items.
- **Deliverables:** ReviewItem state, deterministic scheduler (interval/ease,
  exam-aware compression), daily review queue UI.
- **Depends on:** 4.1.
- **Exit:** scheduler unit-tested/seedable; queue renders due items.

### Phase 5.2 — Rule memorization (Black-Letter Engine)
- **Goal:** progressive recall on rules.
- **Deliverables:** RuleEntry, recognize→cloze stages (free-recall/apply behind a
  flag), SRS integration.
- **Depends on:** 5.1, 2.1.
- **Exit:** rule cards advance through stages; mastery links to issues.

---

## Milestone 6 — Learning engine (the loop)

### Phase 6.1 — Diagnostic flow
- **Goal:** adaptive diagnostic → ability estimates.
- **Deliverables:** onboarding wizard, adaptive item selection (max-info,
  coverage guarantee), results map.
- **Depends on:** 3.2, 4.1, 1.3.
- **Exit:** completion produces per-(subject,subtopic) estimates + confidence.

### Phase 6.2 — Adaptive study plan
- **Goal:** prioritized, time-fit plan.
- **Deliverables:** priority scoring (exam_weight × deficit × improvability),
  time-budget fitting, continuous recompute, un-finishable-plan flagging.
- **Depends on:** 6.1, 4.2, 5.1.
- **Exit:** plan changes when results change (test-proven); deterministic.

### Phase 6.3 — Daily assignment assembly + dashboard
- **Goal:** the daily contract + home screen.
- **Deliverables:** assignment assembler (new learning + due SRS + remediation +
  periodic exam blocks), minimum-effective-dose mode, "done for today",
  dashboard with readiness gauge + Today card + weak-issue spotlight.
- **Depends on:** 6.2, 4.2, 4.3.
- **Exit:** daily loop usable end-to-end; budget control recomputes safely.

### Phase 6.4 — Weakness remediation loop
- **Goal:** verified remediation.
- **Deliverables:** RemediationUnit, confusion mapping, re-prove-before-priority-
  drops, recovered item → SRS.
- **Depends on:** 6.3, 5.1.
- **Exit:** weak issue → remediation → verified recovery flow tested.

---

## Milestone 7 — Essays, PTs, exams

### Phase 7.1 — Essay training + self-assessment workflow
- **Goal:** timed essays with rubric/model-answer loop.
- **Deliverables:** prompt + timed editor (autosave), structured self-assessment,
  model answer + issue checklist, issue reconciliation into tracking.
- **Depends on:** 2.3, 4.1.
- **Exit:** essay attempt records rubric scores + spotted issues; trend view.

### Phase 7.2 — Performance Test training
- **Goal:** closed-universe PT practice.
- **Deliverables:** split file/library + drafting UI, timer, model work product +
  process rubric; assets from object store.
- **Depends on:** 7.1, 0.5.
- **Exit:** a PT packet is completable; self-assessment recorded.

### Phase 7.3 — Full-length timed exam mode
- **Goal:** periodic realistic sittings (acceptance-required).
- **Deliverables:** sectioned timed ExamSession per blueprint, locked nav, break
  screens, score + pacing report feeding readiness.
- **Depends on:** 3.2, 7.1, 7.2, 4.2.
- **Exit:** a full-length runs; results update readiness; E2E core-loop passes.

### Phase 7.4 — Review mode (post-set/exam)
- **Goal:** review + route to SRS/remediation/journal.
- **Deliverables:** filtered review list (incl. "confident-and-wrong"), one-tap
  actions, rationale display.
- **Depends on:** 7.3, 4.3, 5.1, 6.4.
- **Exit:** missed items actionable into all three sinks.

---

## Milestone 8 — Monetization, ops, beta hardening

### Phase 8.1 — Billing (Stripe) + entitlements
- **Goal:** sell course access.
- **Deliverables:** Stripe Checkout/Billing, webhooks (idempotent), plan →
  entitlement → course-access mapping.
- **Depends on:** 1.3.
- **Exit:** purchase grants access; webhook replay-safe; tests pass.

### Phase 8.2 — Notifications
- **Goal:** nudges and reminders.
- **Deliverables:** email/push provider, daily-assignment + exam reminders +
  feedback-loop-close messages, per-user preferences.
- **Depends on:** 6.3.
- **Exit:** notifications send via worker; preferences honored.

### Phase 8.3 — Admin/instructor dashboard
- **Goal:** ops + monitoring.
- **Deliverables:** admin content-health + licensing-audit view (must-have);
  instructor read-only cohort/student progress (nice-to-have).
- **Depends on:** 2.3, 4.2, 1.2.
- **Exit:** role-gated; content gaps + license states visible.

### Phase 8.4 — Beta feedback collection
- **Goal:** structured beta signal.
- **Deliverables:** in-context "report this item" tied to item+attempt, periodic
  in-app survey, feedback triage feeding admin content-health.
- **Depends on:** 3.1, 8.3.
- **Exit:** item reports route to triage; loop visibly closeable.

### Phase 8.5 — Accessibility & security audit pass
- **Goal:** clear launch blockers.
- **Deliverables:** WCAG 2.1 AA manual SR pass on core loop + CI axe checks;
  security review of auth + content-clearing paths; dependency scan clean.
- **Depends on:** all core-loop phases.
- **Exit:** Beta Acceptance Criteria §4–§5 satisfied.

### Phase 8.6 — Pilot readiness validation
- **Goal:** prove the honesty claim.
- **Deliverables:** instrumentation comparing readiness vs. full-length exam
  performance; minimum content-depth gate check; persona walkthroughs.
- **Depends on:** 7.3, 4.2, 8.4.
- **Exit:** Beta Acceptance Criteria §3, §7 satisfied → beta gate.

---

## Phase nice-to-haves (schedule when must-haves are green)
- Attack-outline builder w/ weak-issue overlay (Design §13) — after 6.3.
- Exam-day fatigue analytics + endurance builder (Design §17) — after 7.3.
- Free-recall rule grading (Design §12) — after 5.2.
- Calibrated essay self-grading analytics (Design §11) — after 7.1.

## Post-beta (out of this roadmap)
MPRE course · assisted/human grading at scale · Expo native app · multi-course ·
school/cohort accounts (flows on the existing org/cohort columns) · social ·
localization · offline beyond cached review.

---

## Mapping to acceptance criteria
- **Production-grade but beta-realistic:** Milestones 0 + 8 (CI, deploy,
  security, a11y, billing, ops) wrap a bounded core (1–7).
- **App-access strategy clear:** PWA from Phase 0.4; Expo native path post-beta
  (ADR 0001).
- **Small phases:** every phase above is one focused session / one PR.
