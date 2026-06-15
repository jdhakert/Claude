# Final Beta Readiness Report

Status: **Final review** · Date: 2026-06-15 · Owner: Engineering · Phase 24

A production-grade review of the whole repo against
`docs/BETA_ACCEPTANCE_CRITERIA.md`, as if about to invite the first beta users.
Honest and specific: what's ready, what isn't, and a launch recommendation.

> **Recommendation in one line:** the **engineering platform is beta-ready**;
> **do not send invites yet** — launch is gated on a short, well-defined list of
> **content + operational** tasks (no further feature work). See §6.

---

## 1. Verdict by acceptance section

| Acceptance section | Status | Notes |
| --- | --- | --- |
| 1. Scope confirmation | ✅ Met | UBE/CA/MBE-only/Essay-only modeled; MPRE absent but schema-supported; no post-beta features in the UI. |
| 2. Core learning loop (9 MUSTs) | ✅ Met | Onboarding → diagnostic → adaptive plan → daily assignments → attempts → readiness → next-day adaptation all work end-to-end and are tested (API journey suite + deterministic engine tests). |
| 3. Content & licensing | ⚠️ Split | Enforcement **✅ met** (structural `cleared` gate, metadata, audit log, reviewer≠author — all tested). Production **content depth ❌ not met** (no provenance-reviewed 7-subject bank yet — only demo/placeholder). |
| 4. Engineering quality | ✅ Met* | CI now runs format+lint+typecheck+test+build+**dependency scan**+E2E. *Coverage **floor not enforced** (engine has dedicated deterministic tests); security review done in-phase, formal sign-off pending. |
| 5. Accessibility | ⚠️ Mostly | Keyboard, visible focus, skip link, AA-minded contrast, `prefers-reduced-motion`, jsx-a11y lint in CI all present. **Manual screen-reader pass not yet recorded.** |
| 6. Reliability & operations | ⚠️ Partial | Forward-only migrations, structured logging, health checks, documented backups ✅. **Error tracking** and a **tested restore** ❌ not yet in place. |
| 7. Pilot cohort validation | ❌ Not met | Inherent: requires the beta itself. Readiness↔exam-performance correlation must be checked **during** the controlled beta. |
| 8. Documentation | ✅ Met | Full `docs/` set + `CLAUDE.md` + 2 ADRs, internally consistent. |
| 9. Non-gates | ✅ Honored | MPRE, AI/human grading at scale, native apps, etc. correctly deferred. |

---

## 2. Beta-ready features (verified)
- **Auth & accounts:** signup/login, scrypt hashing, httpOnly hashed sessions,
  roles, onboarding, account export + deletion.
- **Core loop:** diagnostic exam, adaptive plan (deterministic/seedable), daily
  assignments with time-budget degradation, per-issue mastery, weakness
  remediation with verification, spaced repetition (SM-2), confidence
  calibration, honest readiness gated on coverage/recency.
- **Practice & assessment:** MBE practice (confidence-gated, rationale/rule/
  explanation review, error journal, flashcard conversion), diagnostic +
  periodic + full-length exam engine with pacing/fatigue, essay + PT timed
  write → self-assessment → grader workflow.
- **Content ops:** admin CMS lifecycle (draft→…→published), licensing gate,
  authoring with mandatory metadata, instructor/cohort analytics.
- **Platform:** installable PWA (offline shell, install prompt), mobile-
  responsive shell with touch targets + safe-area, billing in safe stub mode,
  invite-only beta gating.
- **Quality:** 150 unit/integration tests green; API-level E2E journey suite for
  all core flows; Playwright landing smoke; full CI gate.

## 3. Incomplete / not-yet-built
- **Production content bank** (the big one): only demo/lean placeholder content
  exists (lean seed = 2 subjects; demo = 3 subjects/56 items). Acceptance §3
  wants 7 MBE subjects at agreed per-subject depth + essays/PTs per course,
  100% provenance-reviewed. **This is authoring work, not engineering.**
- **Error tracking** (e.g. Sentry) — logging exists, aggregation does not.
- **Tested DB restore** — backups documented; a restore has not been exercised.
- **Manual screen-reader pass** — not yet recorded.
- **Enforced coverage floor** — no threshold gate (tests are strong but
  unmeasured by a hard floor).

## 4. Bugs / security / UX / mobile / content / legal / deployment

**Bugs:** none open. The Phase 22 bug bash found and fixed three (review-choice
layout regression, dashboard pill underscores, missing issue-grain demo
snapshots). No known open defects.

**Security risks:**
- **CVE-2026-39356 — drizzle-orm SQL injection (high), `< 0.45.2`.** Exploitable
  only when *untrusted input is passed to identifier/alias construction*
  (`sql.identifier()`, dynamic `.as()`). **Verified non-exploitable here:** the
  codebase uses the typed static-schema query builder exclusively; `grep`
  confirms **no `sql.identifier()`** and the only raw `sql` is static literals
  (`random()`, `gen_random_uuid()`) — i.e. the advisory's documented "safe"
  category. **Action:** deliberate upgrade to `drizzle-orm@0.45.2` + full
  re-test before public launch (major-ish jump; not a safe in-session bump).
  Scan ignores this GHSA with a documented reason so CI still catches *new*
  issues.
- Dev-tooling advisories (esbuild/vitest/drizzle-kit) are **dev-only**, not in
  the shipped runtime; the CI scan is scoped to `--prod`.
- Baseline otherwise solid: helmet headers, auth rate limiting, deny-by-default
  authz (verified by a 403 test), parameterized queries only, secrets in the
  host manager, header redaction. Formal external review = backlog SEC-5.

**UX problems:** none blocking. Confidence-before-answer gating is intentional.

**Mobile problems:** none blocking. Full exams/PT/long-essays are supported but
flagged "desktop recommended"; icons are placeholders (MOB-1, pre-store).

**Content gaps:** the production content bank (see §3) — the primary launch gate.

**Legal/licensing risks:** **low** — enforcement is structural and tested; all
seeded content is original/cleared. Residual: a lawyer-reviewed privacy policy
(currently a beta draft) and a published terms before any public launch (SEC-5).

**Deployment blockers:** none structural — `render.yaml` blueprint, documented
env vars, pre-traffic migrations, verified `start:prod`, green build. Operational
gates (error tracking, tested restore) are in §6 of the acceptance criteria.

## 5. Fixes applied this session
- **Added the missing CI dependency scan** (Charter §4 MUST): `pnpm audit:prod`
  (`--prod --audit-level high`) as a CI step + script; verified green.
- **Documented-ignore for CVE-2026-39356** (`pnpm.auditConfig.ignoreGhsas`) with
  the non-exploitability evidence above, so the scan gates on *new* prod
  advisories without falsely blocking on a verified-safe one.
- (Phase 23 carryover used here) API `start:prod` via `tsx` confirmed working.

No risky changes were made: the drizzle major upgrade and content authoring are
explicitly deferred as they cannot be done *safely* in this session.

---

## 6. Launch recommendation

**Platform: GO. Controlled beta invites: CONDITIONAL — hold until the blocker
list below is cleared.** None require further feature development.

### Pre-invite blockers (must clear)
1. **Load a production content bank** meeting acceptance §3 (7 MBE subjects at
   agreed depth + essays/PTs per course), 100% provenance-reviewed and
   `cleared`. *(Content — largest item.)*
2. **Wire error tracking** (e.g. Sentry) and **run a tested DB restore** from a
   snapshot into a scratch DB. *(Ops — acceptance §6.)*
3. **Record a manual screen-reader pass** on the core loop. *(A11y — §5.)*

### Strongly recommended before/early in beta
4. **Upgrade `drizzle-orm` → 0.45.2** and re-run the full gate (clears
   CVE-2026-39356 even though it's non-exploitable today).
5. **Sign off the security review** of auth + content-clearing paths (§4).
6. Stand up **staging mirroring prod** and dry-run the launch playbook.

### During the controlled beta (the §7 honesty check)
7. With the pilot cohort, verify **readiness correlates with full-length
   practice-exam performance**, and that no persona is blocked from the loop.

### Why this shape
Every code-gated MUST that can be satisfied by engineering **is** satisfied and
tested; the holds are content authoring and operational hardening — exactly the
things that *should* gate real users, and exactly the things this report refuses
to paper over. Once items 1–3 are done, a small, monitored, invite-only cohort
is appropriate; expand in waves per `docs/BETA_LAUNCH_PLAYBOOK.md`.

---

## 7. Test status
- `pnpm check` (format + lint + typecheck + test) green; `pnpm build` green;
  `pnpm audit:prod` green; Playwright landing smoke green.
- Totals: **client 32 · db 22 · api 96 = 150** unit/integration, plus the
  API-level E2E journey suite and the browser smoke. No failing or skipped
  tests.
