import { describe, expect, it } from "vitest";
import {
  buildCandidates,
  generatePlan,
  packPlan,
  urgency,
  type Signals,
} from "../src/services/adaptive/engine.js";

function baseSignals(over: Partial<Signals> = {}): Signals {
  return {
    daysToExam: 60,
    dailyMinutes: 120,
    subjects: [
      { id: "s1", name: "Evidence", examWeight: 1.5, mastery: 0.4 },
      { id: "s2", name: "Contracts", examWeight: 1, mastery: 0.8 },
    ],
    learnable: [],
    weakIssues: [],
    srsDueCount: 0,
    srsMaxOverdueDays: 0,
    rulesDueCount: 0,
    errorJournalCount: 0,
    essay: { available: true, weak: false, promptId: "e1" },
    pt: { available: true, weak: false, taskId: "p1" },
    fullLength: { due: false, examId: null },
    ...over,
  };
}

describe("adaptive engine: determinism", () => {
  it("produces identical plans for identical inputs", () => {
    const s = baseSignals({
      weakIssues: [
        {
          id: "i1",
          name: "Hearsay",
          subjectWeight: 1.5,
          mastery: 0.3,
          repeatedMisses: 2,
          overconfident: true,
          lowConfidence: false,
        },
      ],
    });
    const a = generatePlan(s);
    const b = generatePlan(structuredClone(s));
    expect(a).toEqual(b);
  });
});

describe("adaptive engine: prioritization", () => {
  it("ranks a high-weight, low-mastery, overconfident issue above an easy subject", () => {
    const s = baseSignals({
      weakIssues: [
        {
          id: "i1",
          name: "Hearsay",
          subjectWeight: 1.5,
          mastery: 0.2,
          repeatedMisses: 3,
          overconfident: true,
          lowConfidence: true,
        },
      ],
    });
    const cands = buildCandidates(s).sort((a, b) => b.priority - a.priority);
    const remediation = cands.find((c) => c.kind === "remediation")!;
    const contractsSet = cands.find(
      (c) => c.kind === "question_set" && c.refId === "s2",
    )!;
    expect(remediation.priority).toBeGreaterThan(contractsSet.priority);
    // The reason explains *why* (overconfidence, repeated misses).
    expect(remediation.reason).toMatch(/overconfident/);
    expect(remediation.reason).toMatch(/repeated misses/);
  });

  it("scales urgency up as the exam approaches", () => {
    expect(urgency(null)).toBe(1);
    expect(urgency(45)).toBeCloseTo(1, 5);
    expect(urgency(0)).toBeCloseTo(2, 5);
    expect(urgency(-100)).toBe(2); // clamped
  });

  it("schedules a full-length simulation only when due", () => {
    const without = buildCandidates(baseSignals());
    expect(without.some((c) => c.kind === "full_length_simulation")).toBe(
      false,
    );
    const withDue = buildCandidates(
      baseSignals({ daysToExam: 7, fullLength: { due: true, examId: "x1" } }),
    );
    expect(withDue.some((c) => c.kind === "full_length_simulation")).toBe(true);
  });
});

describe("adaptive engine: time-budget packing", () => {
  it("always includes must-do reviews even on a tiny budget (minimum effective dose)", () => {
    const s = baseSignals({
      dailyMinutes: 10,
      srsDueCount: 12,
      srsMaxOverdueDays: 3,
      weakIssues: [
        {
          id: "i1",
          name: "Hearsay",
          subjectWeight: 1.5,
          mastery: 0.3,
          repeatedMisses: 1,
          overconfident: false,
          lowConfidence: false,
        },
      ],
    });
    const plan = generatePlan(s);
    const review = plan.blocks.find((b) => b.kind === "flashcard_review");
    expect(review).toBeDefined();
    expect(review!.mustDo).toBe(true);
  });

  it("does not exceed the budget with optional blocks", () => {
    const s = baseSignals({
      dailyMinutes: 40,
      weakIssues: Array.from({ length: 6 }, (_, i) => ({
        id: `i${i}`,
        name: `Issue ${i}`,
        subjectWeight: 1,
        mastery: 0.2,
        repeatedMisses: 0,
        overconfident: false,
        lowConfidence: false,
      })),
    });
    const plan = packPlan(buildCandidates(s), 40);
    const optionalMinutes = plan.blocks
      .filter((b) => !b.mustDo)
      .reduce((a, b) => a + b.estMinutes, 0);
    expect(optionalMinutes).toBeLessThanOrEqual(40);
  });
});
