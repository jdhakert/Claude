# Product Design Spec

> The buildable design for **BarReady**. Sits between the
> [Product Brief](./PRODUCT_BRIEF.md) (what/who) and implementation. Honors the
> [Technical Charter](./TECHNICAL_CHARTER.md), [Learning System](./LEARNING_SYSTEM.md),
> [Content & Licensing Policy](./CONTENT_AND_LICENSING_POLICY.md), and
> [Beta Acceptance Criteria](./BETA_ACCEPTANCE_CRITERIA.md).

---

## 0. How this is read
Every surface and feature below uses the same template:

- **User story** — who/what/why.
- **Core UI** — the screens and key interactions.
- **Data needed** — what must be captured/queried.
- **Success metric** — how we know it works.
- **Failure risk** — the most likely way it goes wrong.
- **Complexity** — Low / Medium / High build effort.
- **Phase** — `beta must-have` / `beta nice-to-have` / `post-beta`.

Personas referenced (Product Brief §3): first-time, repeat, working,
high-anxiety, MBE-weak, essay/PT-weak.

---

## 1. Design philosophy — why this beats incumbents

Incumbents fail in recognizable ways. BARBRI/Themis = linear, video-heavy,
one-size-fits-all calendars. Adaptibar/UWorld = excellent MBE drilling but
narrow (little essay/PT, weak whole-student picture). None of them honestly
answer *"am I ready, and what do I do today?"* and none treat **anxiety,
calibration, and the actual exam-day grind** as design problems.

BarReady's bets:

1. **The daily contract, not the calendar.** One screen: today's finite,
   explained, time-fit assignment (Learning System §9). We sell *clarity*.
2. **Issue-level truth.** We measure mastery at the legal-issue level and make
   it visible (heatmap, §14). Competitors stop at subject %.
3. **Calibration as a first-class signal.** We fight the gap between feeling
   ready and being ready (§13) — the #1 silent killer for repeat takers.
4. **Exam-day realism.** We rehearse fatigue, pacing, and section transitions
   (§15), not just untimed questions.
5. **Honest readiness.** A readiness number gated by coverage + recency that we
   refuse to inflate (Learning System §7).
6. **Legitimate, traceable content.** Differentiation through quality + explained
   reasoning, never scraped banks (Content Policy).

These map to the **Differentiated Features Catalog** (§20), which classifies 12
creative features by phase.

---

## 2. Cross-cutting: the progress model (build this first)

Every surface reads/writes one shared progress spine. Acceptance criterion:
track progress at **subject, subtopic, issue, question, exam, and
time-management** levels.

| Level | Grain | What we store | Drives |
| --- | --- | --- | --- |
| **Subject** | e.g., Evidence | rolled-up mastery, exam weight | dashboard, readiness |
| **Subtopic** | e.g., Hearsay | ability estimate + confidence interval | plan prioritization |
| **Issue/rule** | e.g., present-sense impression | per-issue mastery, confusion links | heatmap, remediation, SRS |
| **Question/item** | a single item | attempts, correctness, time, confidence | error journal, calibration |
| **Exam** | a full-length sitting | section scores, pacing, fatigue curve | readiness validation |
| **Time-management** | per item & per section | seconds/item, pace vs. budget, overtime flags | exam-day coaching, pacing analytics |

Shared entities: `Item`, `ItemAttempt` (correct, selected, time_ms, confidence,
flagged, timestamp), `Issue`, `IssueMastery`, `ExamSession`, `SectionResult`,
`StudyPlan`, `Assignment`, `ReviewItem` (SRS state). All keyed by
`(course, subject, subtopic, issue, item_type, jurisdiction)` so the model is
course-agnostic and MPRE-ready (Charter §1.4).

---

# Part A — Core surfaces (the 18)

## 3. (1) Student dashboard
- **User story:** As any student, I want one screen that tells me my readiness,
  what to do today, and where I'm weak, so I don't have to plan my own prep.
- **Core UI:** Top: a single **Readiness gauge** (honest, with confidence band
  + "exam in N days"). Center: **"Today" card** (entry to daily assignment, §5)
  with estimated minutes. Right/below: **weak-issue spotlight** (top 3 from
  heatmap), streak/consistency (calm, not gamified guilt), upcoming full-length
  exam. Persona-aware: high-anxiety users see encouragement + a "you're done"
  state; working students see time-budget front-and-center.
- **Data needed:** readiness signal + confidence, days-to-exam, today's
  assignment summary, top weak issues, SRS due count, next scheduled exam.
- **Success metric:** ≥80% of active days start from the Today card; users can
  state their #1 weakness unprompted.
- **Failure risk:** dashboard becomes a vanity wall; readiness feels arbitrary
  or anxiety-inducing. Mitigation: minimal, explained numbers; no red walls.
- **Complexity:** Medium. **Phase:** beta must-have.

## 4. (2) Diagnostic onboarding
- **User story:** As a new student (esp. repeat taker), I want a short, smart
  diagnostic that maps my real strengths/gaps so my plan skips what I know.
- **Core UI:** Onboarding wizard (exam date, course, weekly time budget,
  prior attempts, self-rated strengths). Then an **adaptive diagnostic** —
  item-by-item, adapts difficulty/coverage live, shows a calm progress bar
  ("mapping Evidence…"), framed as *a map, not a grade*. Ends with a
  **results map**: subject/subtopic mastery + "here's where we'll start."
- **Data needed:** onboarding inputs, diagnostic item bank with difficulty &
  issue tags, per-response correctness/time, resulting ability estimates +
  confidence (Learning System §1).
- **Success metric:** ≥85% diagnostic completion; resulting estimates predict
  early practice performance within tolerance.
- **Failure risk:** too long (drop-off) or too shallow (bad estimates).
  Mitigation: max-information item selection, time-budget aware, coverage
  guarantee with flagged low-confidence areas.
- **Complexity:** High (adaptive selection). **Phase:** beta must-have.

## 5. (3) Adaptive daily study plan
- **User story:** As a time-pressed student, I want today's tasks chosen and
  ordered for me, fit to the time I have, and explained.
- **Core UI:** The **Today** view — an ordered, checkable list of blocks (new
  learning, due reviews, remediation, periodic essay/PT or simulation), each
  with minutes and a one-line *why* ("due review", "weak: hearsay", "exam in 9
  days — timed set"). A time-budget control ("I only have 30 min today")
  recomputes to a minimum effective dose without dropping must-do reviews.
  Clear **"done for today"** end-state.
- **Data needed:** prioritization inputs (exam_weight, deficit, improvability),
  SRS due items, active remediation units, daily time budget, completion events
  (Learning System §2, §9).
- **Success metric:** daily assignment completion rate; plan demonstrably
  changes after results change.
- **Failure risk:** plan feels static or impossible to finish. Mitigation:
  continuous recompute; never assemble an un-finishable plan without flagging.
- **Complexity:** High. **Phase:** beta must-have.

## 6. (4) MBE question bank
- **User story:** As an MBE-weak student, I want to drill realistic
  multiple-choice with explanations that teach the *reasoning*, tagged to issues.
- **Core UI:** Question runner — stem, 4 options, **confidence selector**
  (required, §13), timer (visible or hidden per mode), flag, strike-through
  distractors. After answer (in untimed/practice): full explanation, *why each
  distractor is wrong*, the tested issue, and "add to error journal / SRS"
  actions. Filters by subject/subtopic/issue/difficulty; modes: tutor (immediate
  feedback), timed set, simulation.
- **Data needed:** licensed/original items with issue tags, difficulty,
  per-option rationale (Content Policy §3); `ItemAttempt` with time + confidence.
- **Success metric:** improvement on re-tested issues; explanation engagement;
  accuracy gains on weak subtopics.
- **Failure risk:** thin bank or shallow explanations. Mitigation: minimum
  depth gate (Beta Criteria §3); explanation-quality review in authoring.
- **Complexity:** Medium. **Phase:** beta must-have.

## 7. (5) Essay training
- **User story:** As an essay-weak student, I want timed essay practice with a
  rubric and model answer so I learn to issue-spot and write under pressure.
- **Core UI:** Prompt + timed writing area (autosave, word/char + timer).
  On submit: **structured self-assessment** against rubric dimensions
  (issue-spotting, rule, application, organization, time mgmt), then
  **model answer + annotated issue checklist** reveal; student scores each
  dimension. Spotted vs. missed issues reconciled into issue tracking.
  Trend view of rubric dimensions over time.
- **Data needed:** essay prompts + model answers + issue checklist + rubric
  (licensed/original), student submissions, rubric scores, spotted-issue set
  (Learning System §6).
- **Success metric:** rising issue-spotting accuracy and rubric scores over
  attempts.
- **Failure risk:** self-grading is unreliable. Mitigation: tight rubrics,
  explicit issue checklists, calibration of self-score vs. later assisted
  grading (post-beta).
- **Complexity:** Medium. **Phase:** beta must-have.

## 8. (6) Performance Test (PT) training
- **User story:** As a student, I want realistic closed-universe PT practice to
  learn to extract a work product from a file under time.
- **Core UI:** Split view — **File library + Library (cases/statutes)** pane and
  a drafting pane; instruction memo pinned; timer. On submit: model work-product
  + a process rubric (task comprehension, fact use, organization, format) for
  structured self-assessment.
- **Data needed:** PT packets (instructions, file, library), model work product,
  process rubric, submissions + scores. Assets in object store (Charter §1.2).
- **Success metric:** improved process-rubric scores; better time-to-first-draft.
- **Failure risk:** PT authoring is heavy; few packets. Mitigation: seed a small
  high-quality set for beta; reuse the essay feedback workflow.
- **Complexity:** High (authoring + split UI). **Phase:** beta must-have (UBE/CA);
  reduced packet count acceptable.

## 9. (7) Full-length timed exam mode
- **User story:** As any student, I want periodic realistic full-length exams to
  validate readiness under true conditions.
- **Core UI:** Sectioned, timed sitting matching the course format (MBE AM/PM,
  essays, PT). Locked navigation per section, section timers, break screens.
  No feedback until complete. Produces a full **score + pacing + fatigue report**
  feeding readiness.
- **Data needed:** exam blueprint per course (section counts, weights, timing),
  `ExamSession`, `SectionResult`, per-item time, fatigue curve (§15).
- **Success metric:** exam scores correlate with readiness signal (Beta Criteria
  §7) — the central honesty check.
- **Failure risk:** under-realistic format reduces predictive value. Mitigation:
  course blueprints reviewed against real exam structure.
- **Complexity:** High. **Phase:** beta must-have (this is required by acceptance
  criteria).

## 10. (8) Review mode
- **User story:** After any set/exam, I want to review what I missed and *why*,
  and push items into remediation/SRS.
- **Core UI:** Post-set review list (correct/incorrect/flagged, time-per-item),
  drill into each: my answer vs. correct, rationale, tested issue, confidence vs.
  outcome, one-tap "→ error journal", "→ SRS", "→ remediation". Filter "show only
  confident-and-wrong."
- **Data needed:** attempts, rationales, issue tags, calibration data, SRS hooks.
- **Success metric:** % of missed items actioned into SRS/remediation; repeat-miss
  rate falls.
- **Failure risk:** review feels like a chore and is skipped. Mitigation: fast,
  filtered, one-tap actions; surface the highest-leverage misses first.
- **Complexity:** Medium. **Phase:** beta must-have.

## 11. (9) Flashcard / spaced repetition system (SRS)
- **User story:** As a student, I want missed rules to resurface on a schedule so
  I stop relearning the same thing.
- **Core UI:** Daily **review queue** (folded into the daily plan), card front
  (prompt/rule cue) → reveal → self-rate recall; interleaves subjects; "due now"
  count on dashboard. Cards auto-created from misses; manual cards allowed.
- **Data needed:** `ReviewItem` scheduling state (interval, ease, last/next due),
  link to issue, deterministic scheduler (Learning System §3, Charter §4).
- **Success metric:** review adherence; recall improvement on lapsed cards;
  exam-eve compression leaves no critical item in a long interval.
- **Failure risk:** queue overload → abandonment. Mitigation: budget-aware caps,
  exam-aware compression, prioritize high-yield issues.
- **Complexity:** Medium. **Phase:** beta must-have.

## 12. (10) Rule memorization system ("Black-Letter Engine")
- **User story:** As a student, I must commit core black-letter rules and
  elements to memory, not just recognize them.
- **Core UI:** Rule cards with **progressive recall**: recognize → cloze
  (fill-the-blank elements) → free-recall ("state the rule") → apply (mini-hypo).
  A rule isn't "known" until free-recall + apply pass. Plugs into SRS.
- **Data needed:** structured rule entries (rule text, elements, mnemonic,
  linked issues, jurisdiction), recall-stage state per user.
- **Success metric:** free-recall pass rate; correlation between rule mastery and
  issue mastery on items.
- **Failure risk:** rule library incomplete/inaccurate. Mitigation: authored +
  reviewed under content workflow; map every rule to issues.
- **Complexity:** Medium. **Phase:** beta must-have (recognize+cloze); free-recall
  grading = beta nice-to-have.

## 13. (11) Attack outline builder
- **User story:** As a student, I want condensed, personal **issue-attack
  outlines** (how to analyze a fact pattern step-by-step) that adapt to my gaps.
- **Core UI:** Per-subject attack outline = ordered checklist of issues/triggers
  ("see a confession? → run Miranda → 6th Am → voluntariness"). Editable; the
  system **auto-highlights the student's weak issues** inside the outline and can
  pre-seed a starter outline from the issue taxonomy. Printable/exam-eve view.
- **Data needed:** issue taxonomy + canonical attack templates, user edits,
  weak-issue overlay from heatmap.
- **Success metric:** outline usage before essay practice; better issue-spotting
  on essays after building one.
- **Failure risk:** becomes a static doc nobody updates. Mitigation: auto-seed +
  weak-issue highlighting keep it live; integrate into essay prep flow.
- **Complexity:** Medium. **Phase:** beta nice-to-have (auto-seed templates;
  personalization can phase in).

## 14. (12) "Why I missed it" error journal
- **User story:** As a student, when I miss something I want to capture *why* so I
  can see and break my patterns.
- **Core UI:** On any miss, a quick **cause tag** picker: `didn't know rule` /
  `misread facts` / `wrong issue spotted` / `rule known, misapplied` / `timing/
  rushed` / `careless` / `trap distractor`. Optional note. A **journal view**
  groups misses by cause and by issue, surfacing patterns ("48% of your misses =
  misread facts"). Causes feed remediation targeting.
- **Data needed:** miss-cause taxonomy, per-attempt cause tag + note, aggregation
  by cause/issue/subject.
- **Success metric:** % misses tagged; reduction in the dominant error category
  over time.
- **Failure risk:** friction → low tagging. Mitigation: one-tap defaults, optional
  note, smart pre-selection (e.g., overtime → "timing").
- **Complexity:** Medium. **Phase:** beta must-have (this is core differentiation).

## 15. (13) Confidence calibration
- **User story:** As a repeat/high-anxiety student, I want to know where my
  confidence and accuracy diverge so I stop trusting wrong instincts (or distrust
  right ones).
- **Core UI:** Confidence captured on every MBE answer (required). A
  **calibration view**: scatter/curve of confidence vs. accuracy, with two callouts
  — "Overconfident: these issues you *feel* sure about but miss" (→ remediation)
  and "Underconfident: you actually know this" (→ reassurance, less review).
- **Data needed:** confidence per attempt, accuracy per confidence bucket per
  issue (Learning System §8).
- **Success metric:** calibration error shrinks over time; overconfident issues
  get remediated.
- **Failure risk:** users skip confidence input or game it. Mitigation: required +
  frictionless selector; never let calibration alone inflate readiness.
- **Complexity:** Medium. **Phase:** beta must-have.

## 16. (14) Issue-spotting heatmap
- **User story:** As any student, I want a single visual of exactly which issues
  I'm strong/weak on across the whole exam.
- **Core UI:** Grid/treemap: subjects → subtopics → issues, colored by mastery
  with **text/icon labels (never color alone**, Charter §5). Cell size = exam
  weight; color = mastery; a badge = "stale" (SRS overdue). Click an issue →
  drill to attempts, remediation, related cards. Doubles as the master navigation
  to weakness.
- **Data needed:** issue taxonomy, IssueMastery + recency, exam weights.
- **Success metric:** students navigate study via the heatmap; weak cells warm up
  over time.
- **Failure risk:** overwhelming/illegible at issue grain. Mitigation: progressive
  zoom (subject → subtopic → issue), focus on top-N weak.
- **Complexity:** Medium. **Phase:** beta must-have.

## 17. (15) Exam-day mode (fatigue, pacing, timed sections)
- **User story:** As any student, I want to rehearse the *physical/mental grind*
  of exam day — full length, real pacing, section transitions, breaks — so test
  day holds no surprises.
- **Core UI:** A true-to-format full sitting with **pacing coach** (live
  pace-vs-budget, overtime nudges in practice / silent in simulation), realistic
  breaks, section lockouts, and a post-exam **fatigue curve** (accuracy & speed by
  position in the exam) showing where the student fades. Optional "endurance
  builder" that schedules progressively longer sittings approaching exam day.
- **Data needed:** exam blueprint + timing, per-item position & time, accuracy by
  exam-position (fatigue curve), pacing deltas (time-management level of progress
  model §2).
- **Success metric:** narrowing fatigue drop-off across successive full-lengths;
  fewer sections run out of time.
- **Failure risk:** "fatigue simulation" feels gimmicky or punishing for
  high-anxiety users. Mitigation: it's *measurement + pacing*, opt-in endurance;
  calm framing; honest data, not artificial stress.
- **Complexity:** High. **Phase:** beta nice-to-have (basic timed full-length is
  must-have via §9; fatigue analytics + endurance builder layer on top).

## 18. (16) Instructor / admin dashboard
- **User story:** As an instructor/admin, I want to see cohort and individual
  progress, content health, and licensing status.
- **Core UI:** Cohort view (readiness distribution, at-risk students, common weak
  issues), student drill-down (read-only progress spine), content health
  (coverage gaps, items by license status), licensing audit log view. Role-gated
  (Charter §3 deny-by-default).
- **Data needed:** aggregated progress, roster, content/licensing metadata + audit
  log, role/permission model.
- **Success metric:** instructors identify at-risk students earlier; content gaps
  surfaced and filled.
- **Failure risk:** scope creep into full LMS/B2B (post-beta). Mitigation: beta =
  read-only monitoring + content health only.
- **Complexity:** Medium. **Phase:** beta nice-to-have (admin content/licensing
  view is must-have for ops; instructor cohort analytics nice-to-have).

## 19. (17) Content authoring / review workflow
- **User story:** As an author/reviewer, I need to create items and move them
  through review with full licensing metadata before students ever see them.
- **Core UI:** Authoring forms per item type (MBE/essay/PT/rule) with **required**
  metadata fields (source, license_status, jurisdiction, subject, subtopic,
  author, reviewer, version + issue tags); a review queue where a reviewer
  (≠ author) verifies legal accuracy + provenance and sets `cleared`; version
  history; bulk-import that **refuses** records missing metadata and never
  auto-clears (Content Policy §4–5).
- **Data needed:** item drafts, metadata, review state machine, audit log.
- **Success metric:** 100% of active items `cleared` with reviewer ≠ author; zero
  metadata-incomplete items active.
- **Failure risk:** authoring friction slows content; or clearing gets bypassed.
  Mitigation: good forms + templates; clearing is structurally enforced, not
  optional.
- **Complexity:** High. **Phase:** beta must-have (it's a launch blocker).

## 20-bis. (18) Beta feedback collection
- **User story:** As a beta student, I want to flag confusing items/bugs and share
  experience in-context; as the team, we need structured signal.
- **Core UI:** In-context **"report this item"** (wrong answer? typo? unclear?)
  tied to the exact item+attempt; lightweight periodic in-app survey (NPS-style +
  open text); feature/bug feedback widget. Feeds the admin content-health view.
- **Data needed:** feedback records linked to item/screen/attempt, survey
  responses, status (triage/resolved).
- **Success metric:** feedback volume + resolution rate; item-level reports drive
  content fixes.
- **Failure risk:** feedback goes into a void → users stop. Mitigation: visible
  triage; close the loop ("fixed the item you reported").
- **Complexity:** Low–Medium. **Phase:** beta must-have.

---

# Part B

## 20. Differentiated features catalog (creative, classified)

At least 10 features that are *not* in the incumbent playbook. Each is detailed
in Part A; summarized here with phase.

| # | Differentiated feature | Why it's different | Phase |
| --- | --- | --- | --- |
| D1 | **The Daily Contract** (§5) — one explained, time-fit assignment, with a "done for today" end-state | Replaces the fixed multi-week calendar; respects real time budgets | beta must-have |
| D2 | **Issue-spotting heatmap** (§16) — mastery at the *issue* grain, weighted by exam weight | Incumbents stop at subject %; we navigate study by issue | beta must-have |
| D3 | **"Why I missed it" error journal** (§14) — cause taxonomy + pattern analytics | Turns misses into *diagnosed error patterns*, not just a wrong tally | beta must-have |
| D4 | **Confidence calibration** (§15) — over/under-confidence routing | Directly fixes the feel-ready vs. be-ready gap | beta must-have |
| D5 | **Black-Letter Engine** (§12) — progressive recognize→cloze→free-recall→apply | Forces production, not recognition; competitors mostly flip-cards | beta must-have (early stages) |
| D6 | **Honest readiness signal** (§3, LS §7) — gated by coverage + recency, never inflated | A trustworthy "am I ready" number, not a motivation metric | beta must-have |
| D7 | **Adaptive attack-outline builder** (§13) — auto-seeded, weak-issue-highlighted | Personalized analytical scaffolding that stays live | beta nice-to-have |
| D8 | **Exam-day fatigue mode** (§17) — fatigue curve + pacing coach + endurance builder | Rehearses the grind, not just the questions | beta nice-to-have |
| D9 | **Verified remediation loop** (LS §5) — weakness must be *re-proven* before priority drops, then enters SRS | Closes the "studied it once" leak | beta must-have |
| D10 | **Minimum-effective-dose mode** (§5) — short-day recompute that protects must-do reviews | Built for working students; incumbents assume full-time prep | beta must-have |
| D11 | **Calibrated self-grading for essays/PT** (§7–8 hybrid) — rubric + issue-checklist + self-score-vs-truth tracking | Scales essay feedback pre-AI-grading while measuring self-grading accuracy | beta nice-to-have |
| D12 | **Close-the-loop beta feedback** (§20-bis) — item-level reports that visibly drive fixes | Treats content quality as a live, student-driven process | beta must-have |

> 12 differentiated features, ≥10 as required, each classified and each fully
> specified via its Part A entry.

## 21. Beta scope summary

**Beta must-have (the spine):** dashboard (§3), diagnostic (§4), daily plan (§5),
MBE bank (§6), essay (§7), PT (§8), full-length exam (§9), review (§10), SRS (§11),
rule engine early stages (§12), error journal (§14), calibration (§15), heatmap
(§16), authoring/review (§17), beta feedback (§20-bis); plus D1–D6, D9, D10, D12.

**Beta nice-to-have:** attack-outline personalization (§13/D7), exam-day fatigue
analytics + endurance (§17/D8), free-recall grading (§12), instructor cohort
analytics (§18), calibrated essay self-grading analytics (§11/D11).

**Post-beta:** MPRE course; AI/human grading at scale; native apps; multi-course;
social/study-groups; B2B/institutional LMS; localization; offline.

This matches the Product Brief §5 and Beta Acceptance Criteria scope — the beta
must-have set is intentionally bounded to the diagnose→plan→daily-loop→re-measure
cycle plus its required surfaces, which is realistic for a pilot.

## 22. Acceptance check (this doc)
- [x] Specific enough to build from — every surface has UI, data, metric, risk,
      complexity, phase.
- [x] Beta scope realistic — bounded must-have set; creative features triaged.
- [x] Includes **diagnostic** (§4) and **periodic full-length practice exams**
      (§9, §17).
- [x] Tracks progress at **subject, subtopic, issue, question, exam, and
      time-management** levels (§2).

---

## 23. Shipped differentiators (beta build status)

Beyond the catalog above, the beta build implements these differentiated,
data-driven features end-to-end (all use real student data; none are cosmetic):

| Feature | Status | Where it lives | Improves |
| --- | --- | --- | --- |
| Daily Contract / adaptive plan (D1) | ✅ shipped | Dashboard, `/plan` | recommendations |
| "Why I missed it" error journal (D3) | ✅ shipped | Practice review, `/error-journal` | review |
| Confidence calibration (D4) | ✅ shipped | Analytics (`/analytics/me`) | review + readiness |
| Honest readiness (D6) | ✅ shipped | progress engine | readiness |
| Verified remediation loop (D9) | ✅ shipped | adaptive engine | recommendations |
| Minimum-effective-dose (D10) | ✅ shipped | adaptive packer | recommendations |
| Black-Letter Engine / rule drills (D5) | ✅ shipped | Review › Rule drills | retention |
| Attack outline builder (D7) | ✅ shipped | Review › Attack outlines | review |
| **Wrong Answer Pattern Detector** | ✅ shipped | Review › Error patterns, `/insights/patterns` | review |
| **Smart Remediation Sets** | ✅ shipped | `/remediation`, `/remediation/set` | recommendations |
| **Red Flag Review** (pre-exam) | ✅ shipped | Exams page, `/insights/red-flags` | exam prep |
| Instructor/admin analytics | ✅ shipped | `/admin/analytics`, AdminAnalytics | content + at-risk |

The last three (Phase 16) are new this build:

- **Wrong Answer Pattern Detector** — aggregates the error journal into a
  dominant error pattern ("48% of your misses = misread facts") and surfaces the
  distractors the student gravitates toward, so review targets *how* they fail.
- **Smart Remediation Sets** — assembles a targeted, license-cleared practice set
  drawn from the student's weakest issues; the adaptive plan's remediation blocks
  link to it, giving recommendations real content.
- **Red Flag Review** — a pre-full-length briefing listing the student's weak +
  overconfident issues and outstanding reviews, so they don't sit cold.
