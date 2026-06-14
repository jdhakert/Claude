/**
 * Spaced-repetition scheduler — PURE and DETERMINISTIC (SM-2 style).
 * Given the current card state and a rating, returns the next state. No I/O.
 */
export type Rating = "again" | "hard" | "good" | "easy";

export interface CardState {
  intervalDays: number;
  ease: number;
  reps: number;
  lapses: number;
}

export interface ScheduledState extends CardState {
  /** Minutes until the card is next due (callers convert to a timestamp). */
  dueInMinutes: number;
  wasCorrect: boolean;
}

const MIN_EASE = 1.3;
const clampEase = (e: number) => Math.max(MIN_EASE, Math.round(e * 100) / 100);
const DAY = 24 * 60;

export function schedule(state: CardState, rating: Rating): ScheduledState {
  let { intervalDays, ease } = state;
  const { reps, lapses } = state;

  if (rating === "again") {
    return {
      intervalDays: 0,
      ease: clampEase(ease - 0.2),
      reps: 0,
      lapses: lapses + 1,
      dueInMinutes: 10, // relearn shortly
      wasCorrect: false,
    };
  }

  if (rating === "hard") {
    ease = clampEase(ease - 0.15);
    intervalDays = Math.max(1, Math.round((intervalDays || 1) * 1.2));
  } else if (rating === "good") {
    intervalDays =
      reps === 0 ? 1 : reps === 1 ? 3 : Math.round(intervalDays * ease);
  } else {
    // easy
    ease = clampEase(ease + 0.15);
    intervalDays =
      reps === 0 ? 2 : Math.round((intervalDays || 1) * ease * 1.3);
  }
  intervalDays = Math.max(1, intervalDays);

  return {
    intervalDays,
    ease,
    reps: reps + 1,
    lapses,
    dueInMinutes: intervalDays * DAY,
    wasCorrect: true,
  };
}
