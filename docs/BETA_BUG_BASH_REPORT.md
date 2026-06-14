# Beta Bug Bash Report

Status: **Complete** · Date: 2026-06-14 · Owner: Engineering · Phase 22

A full product QA pass over the core student and admin journeys: automated
end-to-end tests through the HTTP layer, plus hands-on inspection of the running
app (real API + client + Postgres seeded with the demo dataset, driven in a
headless Chromium browser). Bugs found were fixed in the same pass and
re-verified live.

## How it was tested
- **Automated E2E (CI-safe):** `api/test/journey.test.ts` walks each flow
  through Fastify (`app.inject`) against a real Postgres (PGlite) — the closest
  CI-safe thing to a user session. Titles map 1:1 to the flow checklist below.
- **Browser smoke (CI-safe):** `e2e/landing.spec.ts` (Playwright/Chromium) for
  the unauthenticated shell.
- **Manual inspection (this pass):** started Postgres 16 + the API + the Vite
  client, seeded the full demo dataset (`pnpm db:seed:demo`), and drove the live
  app in Chromium as `active.student@example.com` and `admin@example.com`,
  capturing full-page screenshots of every primary screen and exercising the
  interactive practice question → review path.

## Tested flows

| # | Flow | Method | Result |
| --- | --- | --- | --- |
| 1 | Signup / login | journey E2E + browser | ✅ Pass |
| 2 | Onboarding | journey E2E | ✅ Pass |
| 3 | Course enrollment | journey E2E | ✅ Pass |
| 4 | Lesson completion | journey E2E + browser | ✅ Pass |
| 5 | Practice question set | journey E2E + browser (interactive) | ✅ Pass |
| 6 | Diagnostic exam (end-to-end) | journey E2E + browser | ✅ Pass |
| 7 | Essay submission | journey E2E + browser | ✅ Pass |
| 8 | Flashcard review (SRS) | journey E2E + browser | ✅ Pass |
| 9 | Progress dashboard + analytics | journey E2E + browser | ✅ Pass |
| 10 | Admin content creation → student visibility | journey E2E + browser | ✅ Pass |
| 11 | Admin student review (cohort / at-risk / content) | journey E2E + browser | ✅ Pass |
| — | Authz floor: student blocked from admin analytics | journey E2E | ✅ Pass (403) |

All core student-journey and admin-journey flows pass.

## Issues found & fixed (this pass)

| ID | Severity | Area | Issue | Fix | Verified |
| --- | --- | --- | --- | --- | --- |
| BB-1 | **Medium** | Practice review (UI regression) | The post-answer review choice list rendered as collapsed flex columns — label, body, and rationale were squashed onto one row with missing spaces (e.g. "(incorrect)Assault…"). Introduced in Phase 20 when a 44px touch-target rule was applied too broadly to `.review__choices li` (a non-interactive list). | Removed `.review__choices li` from the flex/min-height rule so the review list keeps normal block flow; tap-target sizing now only targets interactive choices (`.question__choices label`) and exam section rows. | ✅ Live |
| BB-2 | Low | Dashboard | Daily-plan and "do this next" pills showed raw enum values with underscores ("Spaced_review", "Question_set"). | Humanize the kind label (`kind.replace(/_/g, " ")`) in both pill spots. | ✅ Live |
| BB-3 | Low | Demo data | "Weakest issues" (Stats) and "Weak areas" (dashboard) showed empty/"No issue data yet" despite many attempts, because the demo seed only wrote overall/subject/subtopic progress snapshots — the analytics weakest-issues view requires **issue-grain** snapshots. | Added issue-level snapshots to `seedDemo` (`snapshotsFor`); both panels now populate with a ranked weakest-issues list and "Focus next". | ✅ Live |

All three were caught by the live browser inspection (the automated journey
tests were green), reinforcing the value of the manual pass.

## Verified-good (no issues)
- Dashboard: readiness, days-to-exam, daily plan, diagnostic card, progress by
  subject, recent activity.
- Practice: setup (course/subject/count/mixed/timed), confidence-gated answering
  (confidence required before answering — by design), correct/incorrect verdict,
  per-choice rationales, rule takeaway, explanation, error-journal tagging,
  convert-to-flashcard, next question.
- Exams: lists diagnostic + periodic + full-length with the red-flag pre-exam
  panel; diagnostic taken end-to-end via the API.
- Essays / PT: prompt list + detail + submission.
- Review: due flashcards (flip + rate), rule drills, attack outlines, error
  patterns tabs.
- Analytics (student): readiness, subject performance, confidence calibration,
  weakest issues, MBE accuracy trend, timing.
- Admin: CMS content library with status counts + lifecycle actions; instructor
  analytics (cohort, at-risk, students, commonly-missed issues, item difficulty);
  content creation requires license metadata and reviewer-clears-before-student-
  visible (enforced).

## Remaining known issues

| ID | Severity | Area | Note |
| --- | --- | --- | --- |
| KI-1 | Low | Demo realism | The demo's confidence-calibration table looks near-perfect for the strong persona (correct→medium/high, wrong→low). Intentional artifact of the deterministic seed; the MBE-weak persona still shows overconfidence. Not a product defect. |
| KI-2 | Low | Mobile E2E | No real-browser E2E for the full authenticated journey is committed to CI (the committed Playwright suite is the unauthenticated shell; authenticated coverage is the API journey suite + this manual pass). Browser-journey automation needs the API+DB wired into the Playwright `webServer`. Tracked for post-beta. |
| KI-3 | Low | Packaging | API runs live via `tsx` (consumes `@barready/db` as TS source); a compiled `node dist` start needs a bundling step. Documented in the README; does not affect beta dev/run. |

No **critical** or **high** severity issues remain. There are **no known beta
blockers**. These and other deferred items are consolidated in
[docs/POST_BETA_BACKLOG.md](POST_BETA_BACKLOG.md).

## Test suite
- Full gate green: format, lint, typecheck, **build**, and tests.
- Suite total after this phase: **api 96**, **db 22**, **client 32** (+ the new
  10-flow journey suite). See CI / `pnpm check`.

## Reproducing the manual pass
```bash
export DATABASE_URL=postgres://postgres@localhost:5432/barready
pnpm db:migrate && pnpm db:seed:demo
pnpm dev            # API :3000 + client :5173
# log in as active.student@example.com or admin@example.com (pw: demo-password-123)
```
