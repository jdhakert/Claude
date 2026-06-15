# Known Issues

Candid, severity-labelled list for reviewers. **Nothing is hidden.** This
supersedes/consolidates the scattered notes; see also
`docs/POST_BETA_BACKLOG.md` (deferred work) and
`docs/FINAL_BETA_READINESS_REPORT.md` (launch decision).

Severity: **Critical** (blocks any use) · **High** (fix before public launch) ·
**Medium** (should fix post-beta) · **Low** (cosmetic/minor) · **Future**
(enhancement, out of beta scope by design).

As of this checkpoint there are **no open Critical or High _code_ defects**. The
High items below are a non-exploitable dependency advisory and non-code launch
gates (content, ops).

---

## Critical
- _None._

## High
| ID | Area | Issue | Status / plan |
| --- | --- | --- | --- |
| H-1 | Security (dep) | **CVE-2026-39356** — `drizzle-orm < 0.45.2` SQL-injection via `sql.identifier()` / dynamic aliases. | **Verified non-exploitable here**: we use the static-schema typed query builder only; no `sql.identifier()`, only static raw `sql` (`random()`, `gen_random_uuid()`). CI scan ignores this GHSA with a documented reason. **Plan:** deliberate upgrade to `0.45.2` + full re-test before public launch. |
| H-2 | Content | No production content bank. Only demo/placeholder exists (lean seed = 2 subjects; demo seed = 3 subjects / 56 items). Acceptance §3 wants 7 MBE subjects at agreed depth + essays/PTs, 100% provenance-reviewed. | Authoring task (not engineering). Gates real beta invites. |
| H-3 | Ops | No error tracking (e.g. Sentry) and no **tested** DB restore. | Wire error aggregation; exercise a restore from snapshot before invites. |
| H-4 | A11y | Manual screen-reader pass on the core loop not yet recorded (automated jsx-a11y lint + keyboard/focus/reduced-motion are in place). | Record a screen-reader pass; fix anything found. |

## Medium
| ID | Area | Issue | Status / plan |
| --- | --- | --- | --- |
| M-1 | Ops/packaging | API ships via `tsx` (consumes `@barready/db` as TS source); `node dist` start can't resolve the workspace dep without bundling. | `start:prod` (`tsx`) works and is documented; bundle/compile post-beta. |
| M-2 | Security | Auth rate limiter is in-memory/per-process → per-instance, not global, behind multiple instances. | Move to a shared store (Redis). |
| M-3 | Testing | No enforced coverage **floor** (suite is strong: 150 tests + E2E, engine is deterministic-tested, but no threshold gate). | Add a coverage threshold for the engine/services. |
| M-4 | Privacy/legal | Privacy policy is a beta **draft**; no published terms; no external security sign-off. | Lawyer review + formal sign-off before public launch. |
| M-5 | Analytics perf | Student/admin analytics compute on read (no materialized rollups/cache). | Fine at beta scale; add rollups if cohorts grow. |

## Low
| ID | Area | Issue | Status / plan |
| --- | --- | --- | --- |
| L-1 | Mobile/assets | App icons are placeholder SVGs. | Replace with designed PNG set (192/512 + maskable + iOS) before any store listing. |
| L-2 | Demo realism | Strong demo persona's confidence-calibration looks near-perfect (deterministic-seed artifact); weak persona still shows overconfidence. | Tune seed spread if desired; not a product defect. |
| L-3 | Dev tooling | `pnpm audit` (full) reports advisories in **dev-only** tooling (esbuild/vitest/drizzle-kit), not shipped at runtime. | CI scan is scoped to `--prod`; revisit on tooling upgrades. |
| L-4 | Content blocks | `video` / `outline_download` lesson blocks render as labelled placeholders (no media pipeline in beta). | Intentional; wire media post-beta. |

## Future (out of beta scope by design)
- MPRE course, at-scale AI/human grading, native mobile apps, multi-course
  analytics, social features, B2B dashboards, localization, offline writes.
  Tracked in `docs/POST_BETA_BACKLOG.md` / `BETA_ACCEPTANCE_CRITERIA.md §9`.

---

## Resolved (recent, for context)
- Phase 22 bug bash: practice-review layout regression, dashboard pill
  underscores, and missing issue-grain demo snapshots — all fixed.
- Phase 24: added the missing CI dependency scan (Charter §4).
