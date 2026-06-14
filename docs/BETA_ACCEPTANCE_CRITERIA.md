# Beta Acceptance Criteria

> Definition of done for the BarReady beta. Derived from the
> [Product Brief](./PRODUCT_BRIEF.md) (beta scope), the
> [Learning System](./LEARNING_SYSTEM.md) (core loop), the
> [Technical Charter](./TECHNICAL_CHARTER.md) (engineering bars), and the
> [Content & Licensing Policy](./CONTENT_AND_LICENSING_POLICY.md). Beta ships
> only when every **MUST** below is met.

## 1. Scope confirmation
- [ ] Courses available: **UBE, California, MBE-only, Essay-only** (MPRE
      explicitly absent but architecturally supported — Charter §1.4).
- [ ] No post-beta features (native apps, multi-course, social, B2B, AI/human
      grading at scale) are shipped or implied in the UI.

## 2. Core learning loop (MUST)
- [ ] A new user can: onboard → take the **diagnostic** → receive an **adaptive
      study plan** → get **daily assignments** → complete attempts → see
      **progress/readiness** update → and have the **next day's plan adapt** to
      those results. End-to-end, no dead ends.
- [ ] Diagnostic produces per-(subject, subtopic) ability estimates with
      confidence; no subject left unmeasured (Learning System §1).
- [ ] Study plan is **recomputed from actual performance**, not a static
      calendar; demonstrably changes when results change (Learning System §2).
- [ ] **Spaced repetition** schedules missed items and resurfaces them; intervals
      compress as exam date nears (Learning System §3).
- [ ] **Issue tracking** records per-issue mastery and drives prioritization
      (Learning System §4).
- [ ] **Weakness remediation** triggers on weak issues and is verified before
      priority drops (Learning System §5).
- [ ] **Essay/PT feedback workflow** supports timed write → self-assessment →
      model-answer/rubric → issue reconciliation (Learning System §6).
- [ ] **Progress scoring** yields one honest readiness signal that is gated by
      coverage and recency (Learning System §7).
- [ ] **Confidence calibration** captured on MBE items and reflected in
      remediation/reporting (Learning System §8).
- [ ] **Daily assignment** fits the user's time budget, explains each block, and
      degrades to a minimum effective dose on short days (Learning System §9).

## 3. Content & licensing (MUST — launch blocker)
- [ ] Every active item carries all required metadata: `source`,
      `license_status`, `jurisdiction`, `subject`, `subtopic`, `author`,
      `reviewer`, `version` (Content Policy §3).
- [ ] No item reaches students without `license_status = cleared` and a
      reviewer distinct from the author (Content Policy §4).
- [ ] The learning engine is **structurally incapable** of serving non-`cleared`
      content (verified by test).
- [ ] License-status transitions are audit-logged.
- [ ] Zero scraped or unlicensed protected content in the bank (provenance
      review passed for 100% of active items).
- [ ] **Minimum content depth** per beta course meets the seeded targets:
  - [ ] MBE: each of the 7 subjects seeded to the agreed per-subject item count
        with subtopic coverage.
  - [ ] Essay/PT: agreed number of prompts with model answers and rubrics per
        beta course.
  > Exact counts are set in the content plan before the beta gate; this checklist
  > enforces that they are met, not skipped.

## 4. Engineering quality (MUST)
- [ ] CI gate green: lint + typecheck + tests + dependency scan
      (Charter §4).
- [ ] Learning-engine and assessment logic unit-tested above the enforced
      coverage floor; scoring/scheduling are deterministic/seedable.
- [ ] At least one automated **E2E** covering the full core loop passes.
- [ ] Security baseline met: HTTPS/HSTS, deny-by-default authz, validated
      inputs, parameterized queries, secrets in a manager, no critical CVEs
      (Charter §3); a security review of auth + content-clearing paths is signed
      off.

## 5. Accessibility (MUST)
- [ ] Core loop meets **WCAG 2.1 AA**: full keyboard operability, visible focus,
      screen-reader pass, AA contrast, meaning never by color alone,
      `prefers-reduced-motion` respected (Charter §5).
- [ ] Automated a11y checks in CI plus a manual screen-reader pass on the core
      loop recorded.

## 6. Reliability & operations (MUST)
- [ ] Staging mirrors production; forward-only migrations run cleanly in deploy.
- [ ] Structured logging, error tracking, and basic metrics in place.
- [ ] Automated Postgres backups with a **tested restore**.

## 7. Validation with pilot cohort (MUST)
- [ ] A pilot cohort completes the loop over a real study period.
- [ ] **Readiness correlates with full-length practice-exam performance** for
      the cohort (Learning System §7) — the central honesty check.
- [ ] No persona is blocked from the core loop (first-time, repeat, working,
      high-anxiety, MBE-weak, essay/PT-weak — Product Brief §3).

## 8. Documentation (MUST)
- [ ] `docs/` planning set and `CLAUDE.md` exist and are internally consistent.
- [ ] ADRs recorded for material architectural decisions made during build.

## 9. Explicit non-gates (SHOULD NOT block beta)
- MPRE course, assisted/human grading at scale, native mobile apps,
  multi-course analytics, social features, B2B dashboards, localization, offline
  mode. Tracked for post-beta (Product Brief §5).
