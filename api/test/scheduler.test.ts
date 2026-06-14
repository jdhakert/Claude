import { describe, expect, it } from "vitest";
import { schedule } from "../src/services/retention/scheduler.js";

const fresh = { intervalDays: 0, ease: 2.5, reps: 0, lapses: 0 };

describe("SRS scheduler (pure/deterministic)", () => {
  it("is deterministic for identical inputs", () => {
    expect(schedule(fresh, "good")).toEqual(schedule({ ...fresh }, "good"));
  });

  it("'again' lapses the card and reschedules it shortly", () => {
    const next = schedule(
      { intervalDays: 10, ease: 2.5, reps: 4, lapses: 0 },
      "again",
    );
    expect(next.wasCorrect).toBe(false);
    expect(next.reps).toBe(0);
    expect(next.lapses).toBe(1);
    expect(next.intervalDays).toBe(0);
    expect(next.dueInMinutes).toBeLessThanOrEqual(60);
    expect(next.ease).toBeLessThan(2.5);
  });

  it("expands intervals on successive 'good' recalls", () => {
    const r1 = schedule(fresh, "good");
    expect(r1.intervalDays).toBe(1);
    const r2 = schedule(r1, "good");
    expect(r2.intervalDays).toBe(3);
    const r3 = schedule(r2, "good");
    expect(r3.intervalDays).toBeGreaterThan(3);
    expect(r3.reps).toBe(3);
  });

  it("'easy' grows the interval faster and raises ease; 'hard' lowers ease", () => {
    const easy = schedule(fresh, "easy");
    const hard = schedule(fresh, "hard");
    expect(easy.ease).toBeGreaterThan(2.5);
    expect(hard.ease).toBeLessThan(2.5);
    expect(easy.intervalDays).toBeGreaterThanOrEqual(hard.intervalDays);
  });

  it("never drops ease below the floor (1.3)", () => {
    let s = { intervalDays: 1, ease: 1.3, reps: 1, lapses: 0 };
    for (let i = 0; i < 5; i++) s = schedule(s, "again");
    expect(s.ease).toBeGreaterThanOrEqual(1.3);
  });
});
