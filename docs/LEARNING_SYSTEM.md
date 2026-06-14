# Learning System

> The pedagogical engine of BarReady. This is the product's core differentiator
> (see [Product Brief](./PRODUCT_BRIEF.md) §6). All logic here is a hard testing
> target in the [Technical Charter](./TECHNICAL_CHARTER.md) §4.

## 0. The core loop

```
  Diagnostic ──► Adaptive Study Plan ──► Daily Assignments
      ▲                                        │
      │                                        ▼
  Re-measure ◄── Progress & Readiness ◄── Attempts + Feedback
      ▲                                        │
      └──────── Spaced Repetition ◄── Issue Tracking / Weakness Remediation
```

Everything below is a component of this loop. The loop runs continuously; the
diagnostic seeds it, daily assignments drive it, and progress scoring closes it.

## 1. Diagnostic exam flow
**Purpose:** establish a per-subject and per-subtopic baseline so the plan
concentrates effort where it pays off (critical for repeat takers).

- **Onboarding inputs:** target exam date, course type, weekly time budget,
  self-reported strengths/weaknesses, prior attempts.
- **Adaptive diagnostic:** a calibrated item set spanning every subject and the
  major subtopics. Item selection adapts within the diagnostic — getting items
  right in a subtopic reduces further sampling there; struggling triggers
  deeper probing. Goal is **maximum information per minute**, respecting the
  student's time budget.
- **Coverage guarantee:** no subject is left unmeasured; low-confidence
  estimates are flagged for early re-measurement rather than guessed.
- **Outputs:** an **ability estimate** per (subject, subtopic) with a confidence
  interval, plus an initial confidence-calibration baseline (§8).
- **Anxiety-aware framing:** diagnostic is explicitly framed as a map, not a
  grade. No pass/fail language; results presented as "where to focus."

## 2. Adaptive study plan
**Purpose:** convert the diagnostic into a finite, time-aware, prioritized path
to the exam date.

- **Inputs:** diagnostic ability estimates, exam date, weekly time budget,
  course requirements (which subjects/item types matter for that course).
- **Prioritization:** each subtopic gets a **priority score** ≈
  `exam_weight × deficit × improvability`, where:
  - `exam_weight` = how much this subtopic counts toward the exam,
  - `deficit` = gap between current ability and target mastery,
  - `improvability` = expected points-per-study-hour (so we front-load
    high-yield, fixable gaps over near-mastered or near-hopeless topics).
- **Time budgeting:** the plan fits the student's real weekly hours
  ("minimum effective dose" mode for working students); it never assembles a
  plan that mathematically can't finish before the exam without flagging it.
- **Adaptivity:** the plan is **recomputed continuously** from actual
  performance — not a fixed calendar generated once. Daily results shift
  priorities. A non-adapting plan is treated as a defect.
- **Phases:** typically Learn → Practice → Simulate, with full-length practice
  exams scheduled in the final phase to validate readiness under timed
  conditions.

## 3. Spaced repetition
**Purpose:** make remediated knowledge *stick* and stop relearning the same
rule repeatedly.

- Every missed rule/issue becomes a **review item** with a scheduling state.
- **Scheduling:** intervals expand on correct recall and contract on lapse
  (Leitner/SM-style), tuned by item difficulty and the student's history.
- **Interleaving:** reviews mix subjects to build discrimination, not blocked
  cramming.
- **Exam-aware compression:** as the exam date nears, intervals compress so
  high-priority items resurface before the test; nothing critical is left in a
  long interval past exam day.
- **Determinism:** scheduling is a pure function of (item state, response,
  clock) so it is unit-testable (Charter §4).

## 4. Issue tracking
**Purpose:** measure mastery at the level the bar actually tests — **legal
issues**, not just whole questions.

- Each item is tagged with the **issues/rules** it tests (e.g., "hearsay —
  present sense impression"). This is part of content metadata (see
  [Content & Licensing Policy](./CONTENT_AND_LICENSING_POLICY.md)).
- Attempts update a **per-issue mastery estimate**, so a student can be strong
  in Evidence overall but weak specifically on hearsay exceptions.
- For **essays/PTs**, issue tracking = **issue-spotting**: did the student
  identify the issues a model answer raises? Spotting accuracy is tracked
  separately from analysis quality.
- Issue-level data feeds prioritization (§2), spaced repetition (§3), and
  remediation (§5).

## 5. Weakness remediation
**Purpose:** turn an identified weak issue into a structured fix, then verify
the fix.

- A weak issue triggers a **remediation unit**: a focused explanation of the
  rule, worked examples, and targeted practice on that issue (and commonly
  confused neighbors).
- **Confusion mapping:** the system notes *which* wrong answers a student
  gravitates to (e.g., confusing two doctrines) and targets the specific
  misconception, not just "study more."
- Remediation is **verified**: the student must demonstrate recovery on fresh
  items before the issue's priority drops; the recovered item enters spaced
  repetition (§3) so it doesn't silently decay.

## 6. Essay / PT feedback workflow
**Purpose:** build issue-spotting, organization, and timed writing — the skills
essay/PT-weak students lack.

Beta workflow (human/AI grading is post-beta — see Product Brief §5):
1. **Timed write** against a prompt (essay) or closed-universe file set (PT),
   under a configurable clock that mirrors exam conditions.
2. **Structured self-assessment** against a rubric (issue-spotting, rule
   statement, application, organization, time management).
3. **Model answer + annotated rubric** reveal: the student compares their work
   to a model and an issue checklist, scoring each rubric dimension.
4. **Issue-spotting reconciliation:** spotted vs. missed issues are recorded
   into issue tracking (§4) and feed remediation (§3, §5).
5. **Trend view:** rubric-dimension scores tracked over time so a student sees,
   e.g., "issue-spotting up, time management still failing."

> Post-beta upgrades this loop with assisted grading; the data model already
> captures rubric dimensions and per-issue results so no rework is needed.

## 7. Progress scoring
**Purpose:** one honest answer to "how close am I to passing?"

- **Per-subject mastery** rolls up from issue-level estimates (§4), weighted by
  exam weight.
- **Readiness signal:** a single, course-aware indicator combining mastery,
  coverage (have we measured enough?), recency (spaced-repetition health), and
  performance on full-length timed practice. Coverage and recency *gate* the
  score so an untested or stale area can't inflate readiness.
- **Honest by design:** readiness is never softened to keep a student
  comfortable (Product Brief §2). When confidence in the estimate is low, we say
  so rather than show a falsely precise number.
- **Validation:** readiness must correlate with full-length practice-exam
  performance for the pilot cohort — a [beta acceptance criterion](./BETA_ACCEPTANCE_CRITERIA.md).

## 8. Confidence calibration
**Purpose:** fix the dangerous gap between *feeling* ready and *being* ready —
especially for repeat and high-anxiety takers.

- On MBE items the student logs **confidence** with each answer.
- The system computes **calibration**: confident-and-wrong (overconfidence) vs.
  unsure-and-right (underconfidence).
- **Overconfidence** routes items into remediation/spaced repetition even when
  occasionally answered correctly (they're guessing).
- **Underconfidence** (common in high-anxiety students) is surfaced
  supportively: "you actually know this" — reducing wasted review and anxiety.
- Calibration trend is part of progress reporting (§7) but does **not** by
  itself inflate readiness.

## 9. Daily assignments
**Purpose:** the daily contract — the single screen that answers "what do I do
today, and why?" This is the student's primary interface to the whole system.

- Each day the engine assembles a **finite, time-boxed assignment** from:
  new learning (high-priority subtopics, §2), due spaced-repetition reviews
  (§3), active remediation units (§5), and periodic essay/PT or full-length
  simulation blocks (§6).
- **Fits the budget:** respects the student's available time that day; degrades
  gracefully to a "minimum effective dose" on short days without dropping
  must-do reviews.
- **Explains itself:** every block shows *why* it's there ("due review,"
  "weak issue: hearsay," "exam in 9 days — timed simulation").
- **Closes the loop:** completing the assignment feeds attempts back into issue
  tracking, calibration, and progress, which recomputes tomorrow's assignment.
- **Anxiety-aware:** predictable shape, clear endpoint ("you're done for
  today"), no infinite-scroll pressure, honest but encouraging tone.

## 10. Cross-cutting invariants
- **Deterministic & testable:** all scoring/scheduling are pure functions of
  their inputs (Charter §4).
- **Course-agnostic:** every component operates on `(course, subject, subtopic,
  issue, item_type)` data and must work unchanged when **MPRE** is added
  (Charter §1.4).
- **Content-clean:** the engine only consumes license-cleared items
  (Content & Licensing Policy). Unverified content cannot enter a plan.
