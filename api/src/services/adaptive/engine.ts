/**
 * Adaptive learning engine — PURE and DETERMINISTIC.
 *
 * Given a snapshot of signals it produces a prioritized, time-fit daily plan.
 * No I/O, no randomness: same inputs → same plan (Learning System §2/§9). This
 * is the unit-tested core; the planner gathers signals and persists the output.
 */

export type BlockKind =
  | "new_learning"
  | "question_set"
  | "spaced_review"
  | "flashcard_review"
  | "rule_review"
  | "remediation"
  | "error_journal_review"
  | "essay_practice"
  | "pt_practice"
  | "full_length_simulation";

export interface Signals {
  /** Null when no exam date is set. */
  daysToExam: number | null;
  /** The student's available minutes for today. */
  dailyMinutes: number;
  subjects: Array<{
    id: string;
    name: string;
    examWeight: number;
    mastery: number | null;
  }>;
  /** Weak subtopics that have an available, not-yet-completed lesson. */
  learnable: Array<{
    subtopicId: string;
    lessonId: string;
    name: string;
    subjectWeight: number;
    mastery: number | null;
  }>;
  weakIssues: Array<{
    id: string;
    name: string;
    subjectWeight: number;
    mastery: number | null;
    repeatedMisses: number;
    overconfident: boolean;
    lowConfidence: boolean;
  }>;
  srsDueCount: number;
  srsMaxOverdueDays: number;
  rulesDueCount: number;
  errorJournalCount: number;
  essay: { available: boolean; weak: boolean; promptId: string | null };
  pt: { available: boolean; weak: boolean; taskId: string | null };
  fullLength: { due: boolean; examId: string | null };
}

export interface Candidate {
  kind: BlockKind;
  refType: string | null;
  refId: string | null;
  reason: string;
  estMinutes: number;
  priority: number;
  mustDo: boolean;
}

export interface DailyPlan {
  estMinutes: number;
  blocks: Candidate[];
}

const clamp = (n: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, n));

/** Exam proximity multiplier (1 → 2 as the exam approaches). */
export function urgency(daysToExam: number | null): number {
  if (daysToExam == null) return 1;
  return clamp(1 + (45 - daysToExam) / 45, 1, 2);
}

const round = (n: number) => Math.round(n * 1000) / 1000;

/** Build the scored candidate blocks (deterministic). */
export function buildCandidates(s: Signals): Candidate[] {
  const u = urgency(s.daysToExam);
  const out: Candidate[] = [];

  // 1) Spaced repetition — must-do; protected even on short days.
  if (s.srsDueCount > 0) {
    out.push({
      kind: "flashcard_review",
      refType: "srs_queue",
      refId: null,
      reason: `${s.srsDueCount} flashcard review(s) due`,
      estMinutes: clamp(s.srsDueCount * 1, 5, 30),
      priority: 1000 + s.srsMaxOverdueDays,
      mustDo: true,
    });
  }
  if (s.rulesDueCount > 0) {
    out.push({
      kind: "rule_review",
      refType: "rule_queue",
      refId: null,
      reason: `${s.rulesDueCount} black-letter rule(s) due`,
      estMinutes: clamp(s.rulesDueCount * 2, 5, 20),
      priority: 950,
      mustDo: true,
    });
  }

  // 2) Error journal review — break recurring mistake patterns.
  if (s.errorJournalCount > 0) {
    out.push({
      kind: "error_journal_review",
      refType: "error_journal",
      refId: null,
      reason: `Review ${s.errorJournalCount} logged mistake(s)`,
      estMinutes: 10,
      priority: 300 + s.errorJournalCount * 5,
      mustDo: false,
    });
  }

  // 3) Weak-issue remediation — exam_weight × deficit, boosted by repeated
  //    misses, overconfidence, and low confidence.
  for (const issue of s.weakIssues) {
    const deficit = 1 - (issue.mastery ?? 0);
    let priority =
      issue.subjectWeight * deficit * 100 +
      issue.repeatedMisses * 20 +
      (issue.overconfident ? 40 : 0) +
      (issue.lowConfidence ? 15 : 0);
    priority *= u;
    const tags = [
      issue.overconfident ? "overconfident" : null,
      issue.repeatedMisses > 1 ? "repeated misses" : null,
      issue.lowConfidence ? "low confidence" : null,
    ].filter(Boolean);
    out.push({
      kind: "remediation",
      refType: "issue",
      refId: issue.id,
      reason: `Weak issue: ${issue.name}${tags.length ? ` (${tags.join(", ")})` : ""}`,
      estMinutes: 15,
      priority: round(priority),
      mustDo: false,
    });
  }

  // 4) New learning — lessons for weak subtopics.
  for (const l of s.learnable) {
    const deficit = 1 - (l.mastery ?? 0);
    out.push({
      kind: "new_learning",
      refType: "lesson",
      refId: l.lessonId,
      reason: `Learn: ${l.name}`,
      estMinutes: 20,
      priority: round(l.subjectWeight * deficit * 80),
      mustDo: false,
    });
  }

  // 5) Question sets — high-yield weak subjects.
  for (const subj of s.subjects) {
    const deficit = 1 - (subj.mastery ?? 0.5);
    if (deficit <= 0) continue;
    out.push({
      kind: "question_set",
      refType: "subject",
      refId: subj.id,
      reason: `Practice ${subj.name} (high-yield)`,
      estMinutes: 20,
      priority: round(subj.examWeight * deficit * 90 * u),
      mustDo: false,
    });
  }

  // 6) Essay practice.
  if (s.essay.available && (s.essay.weak || (s.daysToExam ?? 99) <= 30)) {
    out.push({
      kind: "essay_practice",
      refType: "essay_prompt",
      refId: s.essay.promptId,
      reason: s.essay.weak
        ? "Build essay writing (weak)"
        : "Timed essay practice",
      estMinutes: 40,
      priority: round((s.essay.weak ? 120 : 60) * u),
      mustDo: false,
    });
  }

  // 7) Performance test practice.
  if (s.pt.available && (s.pt.weak || (s.daysToExam ?? 99) <= 21)) {
    out.push({
      kind: "pt_practice",
      refType: "pt_task",
      refId: s.pt.taskId,
      reason: s.pt.weak ? "Build PT skills (weak)" : "Timed PT practice",
      estMinutes: 60,
      priority: round((s.pt.weak ? 100 : 50) * u),
      mustDo: false,
    });
  }

  // 8) Full-length simulation — near the exam.
  if (s.fullLength.due) {
    out.push({
      kind: "full_length_simulation",
      refType: "exam",
      refId: s.fullLength.examId,
      reason: "Full-length simulation (exam approaching)",
      estMinutes: 180,
      priority: 500 * u,
      mustDo: false,
    });
  }

  return out;
}

/** Deterministic stable sort: priority desc, then kind, then refId. */
function order(a: Candidate, b: Candidate): number {
  if (b.priority !== a.priority) return b.priority - a.priority;
  if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1;
  return (a.refId ?? "") < (b.refId ?? "") ? -1 : 1;
}

/**
 * Pack candidates into the day's time budget. Must-do blocks (due reviews) are
 * always included — "minimum effective dose" on short days — then the highest-
 * priority remaining blocks fill the rest of the budget.
 */
export function packPlan(
  candidates: Candidate[],
  dailyMinutes: number,
): DailyPlan {
  const sorted = [...candidates].sort(order);
  const mustDo = sorted.filter((c) => c.mustDo);
  const optional = sorted.filter((c) => !c.mustDo);

  const blocks: Candidate[] = [...mustDo];
  let total = mustDo.reduce((acc, c) => acc + c.estMinutes, 0);

  for (const c of optional) {
    if (total + c.estMinutes > dailyMinutes) continue;
    blocks.push(c);
    total += c.estMinutes;
  }
  // Guarantee at least one actionable block even on a tiny budget.
  if (blocks.length === 0 && optional[0]) {
    blocks.push(optional[0]);
    total += optional[0].estMinutes;
  }

  return { estMinutes: total, blocks };
}

export function generatePlan(signals: Signals): DailyPlan {
  return packPlan(buildCandidates(signals), signals.dailyMinutes);
}
