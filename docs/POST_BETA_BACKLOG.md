# Post-Beta Backlog & Known Issues

Status: **Living document** · Last updated: 2026-06-14 · Owner: Engineering

A single, consolidated home for known issues, deferred work, and notes that are
intentionally out of beta scope. Items here were surfaced during build phases
and the QA/bug-bash pass; each links back to its source-of-truth doc. Nothing in
this list is a **critical beta blocker** — see `docs/BETA_BUG_BASH_REPORT.md` for
the blocker assessment.

Severity key: **High** (fix before public launch) · **Medium** (should do
post-beta) · **Low** (nice-to-have / cosmetic / realism).

---

## 1. Security & privacy hardening
Source: `docs/SECURITY_AND_PRIVACY.md §4`.

| ID | Sev | Item | Notes |
| --- | --- | --- | --- |
| SEC-1 | Medium | Distributed rate limiting | Auth rate limiter is per-process / in-memory; behind multiple instances it throttles per-instance, not globally. Move to a shared store (Redis). |
| SEC-2 | Medium | PWA CSP + Subresource Integrity | API tier intentionally runs no CSP (JSON only); add CSP + SRI at the static/PWA hosting layer. |
| SEC-3 | Medium | Audit logging for CMS transitions | Record admin/CMS content-state transitions (draft→…→published/archived) in the audit log. |
| SEC-4 | Medium | Data-retention automation | Add automated retention expiry + configurable retention windows (today: retained for account life, removed on deletion). |
| SEC-5 | High | External review + legal privacy policy | Formal third-party security review and a lawyer-reviewed, published privacy policy before any public (non-invite) launch. Current policy is a **beta draft**, not legal copy. |

## 2. Mobile / PWA
Source: `docs/MOBILE_APP_STRATEGY.md`.

| ID | Sev | Item | Notes |
| --- | --- | --- | --- |
| MOB-1 | High | Real app icons | Replace placeholder SVG icons with a designed PNG set (192/512 + maskable safe-zone + iOS sizes) before any store submission. |
| MOB-2 | Low | Offline writes (outbox) | Beta requires network for mutations; add an offline queue for practice answers later (server stays authoritative). |
| MOB-3 | Low | Native app (Expo/RN) | Deferred until usage/demand triggers are met; shared API/data layer keeps this cheap. |
| MOB-4 | Low | Small-screen-unsuitable flows | Full-length timed exams, PT/MPT two-pane, long essay writing, and admin CMS are supported but not optimized on phones (desktop/tablet recommended). |

## 3. QA / test coverage
Source: `docs/BETA_BUG_BASH_REPORT.md` (KI-2), Phase 20/22.

| ID | Sev | Item | Notes |
| --- | --- | --- | --- |
| QA-1 | Low | Authenticated browser E2E in CI | Committed Playwright is the unauthenticated shell; authenticated journeys are covered by the API journey suite (`api/test/journey.test.ts`) + manual browser pass. Wiring API+Postgres into Playwright's `webServer` would add real-browser journey coverage. |
| QA-2 | Low | Flaky DB-suite timeouts | Occasional PGlite timeouts under parallel pre-push load; re-running passes. Not a code defect — revisit test concurrency/timeouts if it worsens. |

## 4. Packaging / ops
Source: `docs/BETA_BUG_BASH_REPORT.md` (KI-3), README.

| ID | Sev | Item | Notes |
| --- | --- | --- | --- |
| OPS-1 | Medium | Compiled API start | API runs live via `tsx` (consumes `@barready/db` as TS source). A `node dist` production start needs a bundling/transpile step for the workspace dependency. |
| OPS-2 | Low | Pre-push lint visibility | Run `pnpm lint` explicitly and read its tail; the `pnpm check` convenience can truncate/hide `prefer-const`-style errors. Process note for contributors. |

## 5. Demo data realism
Source: `docs/BETA_BUG_BASH_REPORT.md` (KI-1), Phase 21.

| ID | Sev | Item | Notes |
| --- | --- | --- | --- |
| DEMO-1 | Low | Calibration looks too clean | The strong demo persona's confidence-calibration is near-perfect (deterministic-seed artifact); the MBE-weak persona still shows overconfidence. Tune the seed for more realistic spread if desired. Not a product defect. |

---

## Resolved during the bug bash (for reference)
Fixed in Phase 22 (`docs/BETA_BUG_BASH_REPORT.md`):
- **BB-1 (Medium):** practice review choice list rendered as collapsed flex
  columns — Phase 20 touch-target rule scoped too broadly. Fixed.
- **BB-2 (Low):** dashboard plan pills showed raw enum underscores. Fixed.
- **BB-3 (Low):** "Weakest issues"/"Weak areas" empty — demo seed lacked
  issue-grain progress snapshots. Fixed.

## Out of beta scope (by design, not a defect)
Per `CLAUDE.md` / `docs/BETA_ACCEPTANCE_CRITERIA.md`: MPRE, AI/human grading at
scale, native apps, multi-course, social, B2B, localization, offline. Tracked
there, not here.
