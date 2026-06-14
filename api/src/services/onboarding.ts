import { eq } from "drizzle-orm";
import { z } from "zod";
import { schema } from "@barready/db";
import type { AppDb } from "../db.js";

/** Student onboarding payload (Phase 6 / Learning System §1). */
export const OnboardingSchema = z.object({
  targetJurisdiction: z.enum([
    "ube",
    "california",
    "mbe_only",
    "essay_only",
    "mpre",
  ]),
  examDate: z.string().date(),
  takerStatus: z.enum(["first_time", "repeater"]),
  studyHoursPerWeek: z.number().int().min(1).max(80),
  selfRatedSubjects: z.record(z.string(), z.number().int().min(1).max(5)),
  diagnosticScheduledFor: z.string().date().optional(),
  accommodations: z
    .object({
      extendedTime: z.boolean().default(false),
      timingPreference: z.string().optional(),
      notes: z.string().optional(),
    })
    .optional(),
  studyStyle: z.enum(["visual", "reading", "practice_heavy", "mixed"]),
});

export type OnboardingInput = z.infer<typeof OnboardingSchema>;

export async function saveOnboarding(
  db: AppDb,
  userId: string,
  data: OnboardingInput,
) {
  const patch = {
    targetExamDate: new Date(data.examDate),
    weeklyTimeBudgetMinutes: String(data.studyHoursPerWeek * 60),
    priorAttempts: data.takerStatus === "repeater" ? "1" : "0",
    onboarding: data as Record<string, unknown>,
    updatedAt: new Date(),
  };

  const updated = await db
    .update(schema.profiles)
    .set(patch)
    .where(eq(schema.profiles.userId, userId))
    .returning();
  if (updated[0]) return updated[0];

  const inserted = await db
    .insert(schema.profiles)
    .values({ userId, ...patch })
    .returning();
  return inserted[0]!;
}

export async function getProfile(db: AppDb, userId: string) {
  const rows = await db
    .select()
    .from(schema.profiles)
    .where(eq(schema.profiles.userId, userId))
    .limit(1);
  return rows[0] ?? null;
}
