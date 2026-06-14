import { eq } from "drizzle-orm";
import { schema } from "@barready/db";
import type { AppDb } from "../db.js";
import { getSubscription } from "./billing/subscriptions.js";

const DEFAULT_PREFS: Record<string, boolean> = {
  dailyReminder: true,
  examCountdown: true,
  weeklyProgress: true,
};

/** Composite account view: profile, subscription, enrollment, schedule, prefs. */
export async function getAccount(db: AppDb, userId: string) {
  const user = (
    await db
      .select({
        id: schema.users.id,
        email: schema.users.email,
        betaAccess: schema.users.betaAccess,
      })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1)
  )[0];
  if (!user) return null;

  const profile = (
    await db
      .select()
      .from(schema.profiles)
      .where(eq(schema.profiles.userId, userId))
      .limit(1)
  )[0];

  const enrollments = await db
    .select({ id: schema.courses.id, title: schema.courses.title })
    .from(schema.enrollments)
    .innerJoin(
      schema.courses,
      eq(schema.enrollments.courseId, schema.courses.id),
    )
    .where(eq(schema.enrollments.userId, userId));

  return {
    user,
    profile: {
      displayName: profile?.displayName ?? null,
      examDate: profile?.targetExamDate
        ? profile.targetExamDate.toISOString()
        : null,
      weeklyTimeBudgetMinutes: profile?.weeklyTimeBudgetMinutes ?? null,
      notificationPrefs: profile?.notificationPrefs ?? DEFAULT_PREFS,
    },
    subscription: await getSubscription(db, userId),
    enrollments,
  };
}

async function ensureProfile(db: AppDb, userId: string) {
  const existing = (
    await db
      .select({ id: schema.profiles.id })
      .from(schema.profiles)
      .where(eq(schema.profiles.userId, userId))
      .limit(1)
  )[0];
  if (!existing) await db.insert(schema.profiles).values({ userId });
}

export async function updateProfile(
  db: AppDb,
  userId: string,
  patch: {
    displayName?: string;
    examDate?: string;
    studyHoursPerWeek?: number;
  },
) {
  await ensureProfile(db, userId);
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.displayName !== undefined) set.displayName = patch.displayName;
  if (patch.examDate !== undefined)
    set.targetExamDate = patch.examDate ? new Date(patch.examDate) : null;
  if (patch.studyHoursPerWeek !== undefined)
    set.weeklyTimeBudgetMinutes = String(patch.studyHoursPerWeek * 60);
  await db
    .update(schema.profiles)
    .set(set)
    .where(eq(schema.profiles.userId, userId));
  return getAccount(db, userId);
}

export async function updateNotifications(
  db: AppDb,
  userId: string,
  prefs: Record<string, boolean>,
) {
  await ensureProfile(db, userId);
  await db
    .update(schema.profiles)
    .set({ notificationPrefs: prefs, updatedAt: new Date() })
    .where(eq(schema.profiles.userId, userId));
  return { notificationPrefs: prefs };
}

/** Full personal-data export (privacy / data portability). */
export async function exportAccount(db: AppDb, userId: string) {
  const account = await getAccount(db, userId);
  if (!account) return null;
  const [
    questionAttempts,
    essaySubmissions,
    ptSubmissions,
    errorJournal,
    srsReviews,
  ] = await Promise.all([
    db
      .select()
      .from(schema.questionAttempts)
      .where(eq(schema.questionAttempts.userId, userId)),
    db
      .select()
      .from(schema.essaySubmissions)
      .where(eq(schema.essaySubmissions.userId, userId)),
    db
      .select()
      .from(schema.ptSubmissions)
      .where(eq(schema.ptSubmissions.userId, userId)),
    db
      .select()
      .from(schema.errorJournalEntries)
      .where(eq(schema.errorJournalEntries.userId, userId)),
    db
      .select()
      .from(schema.srsReviews)
      .where(eq(schema.srsReviews.userId, userId)),
  ]);
  return {
    exportedAt: new Date().toISOString(),
    account,
    performance: {
      questionAttempts,
      essaySubmissions,
      ptSubmissions,
      errorJournal,
      srsReviews,
    },
  };
}

/** Permanently delete the account and all owned data (cascades). */
export async function deleteAccount(db: AppDb, userId: string) {
  const existing = (
    await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1)
  )[0];
  if (!existing) return false;
  // Owned rows cascade on user delete (sessions, profile, enrollments,
  // attempts, submissions, reviews, journal, assignments, subscriptions).
  await db.delete(schema.users).where(eq(schema.users.id, userId));
  return true;
}
