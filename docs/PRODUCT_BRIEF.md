# Product Brief

> Working product name: **BarReady** (placeholder — final brand TBD).
> Status: Pre-beta planning. This document is the source of truth for *what* we
> are building and *for whom*. The [Technical Charter](./TECHNICAL_CHARTER.md)
> covers *how*.

## 1. One-line description

An adaptive, content-licensed bar exam preparation platform that diagnoses each
student's weaknesses and drives a personalized daily study plan toward a single
outcome: passing the bar on the next sitting.

## 2. Key product promise

> "We tell you exactly what to study today, why, and how close you are to
> passing — and we adapt every day based on what you actually got right and
> wrong."

Three commitments behind the promise:

1. **Clarity over volume.** The student always knows the single most valuable
   thing to do next. We replace "watch 500 hours of lectures" with a
   prioritized, finite daily assignment.
2. **Honest measurement.** Progress scoring and a predicted pass-readiness
   signal are grounded in performance data, not vanity metrics. We never
   inflate readiness to keep someone comfortable.
3. **Legitimate content.** Every question and explanation is original,
   licensed, public-domain, or user-supplied with rights. We do not reproduce
   protected exam content. See the
   [Content & Licensing Policy](./CONTENT_AND_LICENSING_POLICY.md).

## 3. Target users

We design for these six overlapping personas. A single student may belong to
several at once; the system blends accommodations rather than forcing one label.

| Persona | Defining need | What the product does for them |
| --- | --- | --- |
| **First-time takers** | Don't know the exam's shape or how to study for it | Structured onboarding, diagnostic, and a full-length default plan with strong defaults |
| **Repeat takers** | Already studied broadly; failed; need to find the actual gap | Diagnostic-led plan that *skips* what they've mastered and concentrates on the few things that cost them points |
| **Working students** | Severely time-constrained (job, family) | Time-budget-aware plans, short high-yield sessions, "minimum effective dose" mode |
| **High-anxiety students** | Stress degrades performance and consistency | Confidence calibration, low-stakes practice, encouraging pacing, predictable structure, no surprise difficulty spikes |
| **Students weak on MBE** | Multiple-choice reasoning and timing gaps | Issue-tracked MBE drilling, spaced repetition on missed rules, timing analytics |
| **Students weak on essays/PTs** | Cannot organize/issue-spot/write under time | Essay & Performance Test feedback workflow, issue-spotting practice, structured rubrics, self- then model-graded loops |

### Non-goals for personas
- We are **not** a law school substitute (1L–3L doctrinal teaching from zero).
- We do **not** target the JD-curriculum market or pre-law audiences in beta.

## 4. Course types

The product is organized around **courses**. Beta ships a subset; the data model
supports all of them from day one.

| Course | Scope | Beta? |
| --- | --- | --- |
| **UBE** | MBE + MEE essays + MPT performance tests (Uniform Bar Exam) | **Yes (primary beta target)** |
| **California** | CA-specific essays + Performance Test + MBE | **Yes (secondary beta target)** |
| **MBE-only** | Multistate Bar Exam multiple-choice across the 7 MBE subjects | **Yes** |
| **Essay-only** | Essay + issue-spotting + writing workflow, no MBE | **Yes** |
| **MPRE** | Multistate Professional Responsibility Exam | **Post-beta (architecture must not preclude it)** |

> "MPRE-expandable later" is an explicit architectural requirement, not a
> roadmap aspiration: subjects, item types, and scoring must generalize to MPRE
> without a schema migration. See Technical Charter §"Extensibility".

### MBE subjects (shared across UBE, California, MBE-only)
Civil Procedure, Constitutional Law, Contracts, Criminal Law & Procedure,
Evidence, Real Property, Torts.

## 5. Beta scope vs. post-beta scope

### In beta
- Courses: UBE, California, MBE-only, Essay-only.
- Diagnostic exam → adaptive study plan → daily assignments loop.
- MBE practice with issue tracking and spaced repetition.
- Essay/PT practice with structured **self-assessment + model-answer rubric**
  feedback (human/AI-assisted grading is post-beta — see below).
- Progress scoring and a single pass-readiness indicator.
- Confidence calibration on MBE answers.
- Original/licensed question bank seeded to a minimum viable depth per subject
  (target depth defined in [Beta Acceptance Criteria](./BETA_ACCEPTANCE_CRITERIA.md)).
- Accounts, single course per account, web (desktop + mobile web responsive).

### Post-beta (explicitly out of beta)
- MPRE course.
- AI-assisted or human essay/PT grading at scale; tutor marketplace.
- Native mobile apps.
- Multi-course enrollment / cross-course analytics.
- Study groups, social/leaderboard features.
- Institutional / law-school B2B dashboards.
- Localization beyond US English.
- Offline mode.

### Beta success definition
See [Beta Acceptance Criteria](./BETA_ACCEPTANCE_CRITERIA.md). Summary: the core
diagnose → plan → daily-loop → re-measure cycle works end-to-end, content is
fully license-traceable, and readiness scoring correlates with practice-exam
performance for pilot cohort.

## 6. Guiding principles
1. **Outcome over engagement.** We optimize for passing, not time-in-app.
2. **Adaptivity is the product.** A non-adaptive plan is a failure mode.
3. **Defensible content.** Licensing integrity is a launch blocker, not a
   cleanup task.
4. **Accessible by default.** High-anxiety and working students are first-class;
   so are students using assistive technology.
