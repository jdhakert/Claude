import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { schema } from "@barready/db";
import type { AppDb } from "../db.js";

const MC_KINDS = ["mbe"];

function now() {
  return new Date();
}

/** Effective remaining time for a section, accounting for pauses. */
function remainingMs(section: {
  status: string;
  endsAt: Date | null;
}): number | null {
  if (!section.endsAt) return null;
  return section.endsAt.getTime() - Date.now();
}

async function loadAttempt(db: AppDb, userId: string, attemptId: string) {
  const attempt = (
    await db
      .select()
      .from(schema.examAttempts)
      .where(eq(schema.examAttempts.id, attemptId))
      .limit(1)
  )[0];
  if (!attempt || attempt.userId !== userId) return null;
  return attempt;
}

/** Start a new attempt, or resume the existing in-progress one (idempotent). */
export async function startOrResume(db: AppDb, userId: string, examId: string) {
  const exam = (
    await db
      .select()
      .from(schema.exams)
      .where(eq(schema.exams.id, examId))
      .limit(1)
  )[0];
  if (!exam) return null;

  const existing = (
    await db
      .select()
      .from(schema.examAttempts)
      .where(
        and(
          eq(schema.examAttempts.userId, userId),
          eq(schema.examAttempts.examId, examId),
          eq(schema.examAttempts.status, "in_progress"),
        ),
      )
      .limit(1)
  )[0];
  if (existing) return getState(db, userId, existing.id);

  const attempt = (
    await db
      .insert(schema.examAttempts)
      .values({
        userId,
        examId,
        status: "in_progress",
        mode: exam.kind === "diagnostic" ? "diagnostic" : "exam",
        startedAt: now(),
      })
      .returning()
  )[0]!;

  await db.insert(schema.learningEvents).values({
    userId,
    type: "exam_started",
    payload: { examId, attemptId: attempt.id },
  });

  const sections = await db
    .select()
    .from(schema.examSections)
    .where(eq(schema.examSections.examId, examId))
    .orderBy(asc(schema.examSections.sortOrder));

  for (const section of sections) {
    await db.insert(schema.examAttemptSections).values({
      examAttemptId: attempt.id,
      examSectionId: section.id,
      status: "pending",
      sortOrder: section.sortOrder,
    });

    if (MC_KINDS.includes(section.kind)) {
      const picked = await db
        .select({ id: schema.items.id })
        .from(schema.items)
        .innerJoin(
          schema.subtopics,
          eq(schema.items.subtopicId, schema.subtopics.id),
        )
        .innerJoin(
          schema.subjects,
          eq(schema.subtopics.subjectId, schema.subjects.id),
        )
        .where(
          and(
            eq(schema.subjects.courseId, exam.courseId),
            eq(schema.items.licenseStatus, "cleared"),
          ),
        )
        .orderBy(sql`random()`)
        .limit(Math.max(1, section.itemCount));

      if (picked.length) {
        await db.insert(schema.examAttemptItems).values(
          picked.map((p, i) => ({
            examAttemptId: attempt.id,
            examSectionId: section.id,
            itemId: p.id,
            position: i + 1,
          })),
        );
      }
    }
  }

  return getState(db, userId, attempt.id);
}

/** Auto-expire any in-progress section whose time has elapsed. */
async function applyExpiry(db: AppDb, attemptId: string) {
  const sections = await db
    .select()
    .from(schema.examAttemptSections)
    .where(eq(schema.examAttemptSections.examAttemptId, attemptId));
  const t = Date.now();
  for (const s of sections) {
    if (s.status === "in_progress" && s.endsAt && s.endsAt.getTime() <= t) {
      await db
        .update(schema.examAttemptSections)
        .set({ status: "expired", submittedAt: now() })
        .where(eq(schema.examAttemptSections.id, s.id));
    }
  }
}

export async function getState(db: AppDb, userId: string, attemptId: string) {
  const attempt = await loadAttempt(db, userId, attemptId);
  if (!attempt) return null;
  await applyExpiry(db, attemptId);

  const exam = (
    await db
      .select()
      .from(schema.exams)
      .where(eq(schema.exams.id, attempt.examId))
      .limit(1)
  )[0]!;

  const sectionDefs = await db
    .select()
    .from(schema.examSections)
    .where(eq(schema.examSections.examId, attempt.examId))
    .orderBy(asc(schema.examSections.sortOrder));
  const sectionDefById = new Map(sectionDefs.map((s) => [s.id, s]));

  const attemptSections = await db
    .select()
    .from(schema.examAttemptSections)
    .where(eq(schema.examAttemptSections.examAttemptId, attemptId))
    .orderBy(asc(schema.examAttemptSections.sortOrder));

  const workingItems = await db
    .select()
    .from(schema.examAttemptItems)
    .where(eq(schema.examAttemptItems.examAttemptId, attemptId))
    .orderBy(asc(schema.examAttemptItems.position));

  const itemIds = workingItems.map((w) => w.itemId);
  const itemRows = itemIds.length
    ? await db
        .select({ id: schema.items.id, stem: schema.items.stem })
        .from(schema.items)
        .where(inArray(schema.items.id, itemIds))
    : [];
  const stemById = new Map(itemRows.map((i) => [i.id, i.stem]));
  const choices = itemIds.length
    ? await db
        .select({
          id: schema.answerChoices.id,
          itemId: schema.answerChoices.itemId,
          label: schema.answerChoices.label,
          body: schema.answerChoices.body,
          sortOrder: schema.answerChoices.sortOrder,
        })
        .from(schema.answerChoices)
        .where(inArray(schema.answerChoices.itemId, itemIds))
        .orderBy(asc(schema.answerChoices.sortOrder))
    : [];

  return {
    attempt: {
      id: attempt.id,
      status: attempt.status,
      examTitle: exam.title,
      examKind: exam.kind,
      allowPause: Boolean(
        (exam.config as { allowPause?: boolean } | null)?.allowPause,
      ),
    },
    sections: attemptSections.map((s) => {
      const def = sectionDefById.get(s.examSectionId)!;
      const visible = s.status === "in_progress" || s.status === "submitted";
      return {
        attemptSectionId: s.id,
        examSectionId: s.examSectionId,
        kind: def.kind,
        title: def.title,
        status: s.status,
        timeLimitMinutes: def.timeLimitMinutes,
        endsAt: s.endsAt ? s.endsAt.toISOString() : null,
        remainingMs: remainingMs(s),
        items:
          MC_KINDS.includes(def.kind) && visible
            ? workingItems
                .filter((w) => w.examSectionId === s.examSectionId)
                .map((w) => ({
                  attemptItemId: w.id,
                  itemId: w.itemId,
                  position: w.position,
                  stem: stemById.get(w.itemId) ?? "",
                  selectedChoiceId: w.selectedChoiceId,
                  flagged: w.flagged,
                  choices: choices
                    .filter((c) => c.itemId === w.itemId)
                    .map((c) => ({ id: c.id, label: c.label, body: c.body })),
                }))
            : [],
      };
    }),
  };
}

export async function startSection(
  db: AppDb,
  userId: string,
  attemptId: string,
  examSectionId: string,
) {
  const attempt = await loadAttempt(db, userId, attemptId);
  if (!attempt) return null;
  const section = (
    await db
      .select()
      .from(schema.examAttemptSections)
      .where(
        and(
          eq(schema.examAttemptSections.examAttemptId, attemptId),
          eq(schema.examAttemptSections.examSectionId, examSectionId),
        ),
      )
      .limit(1)
  )[0];
  if (!section || section.status !== "pending")
    return getState(db, userId, attemptId);

  const def = (
    await db
      .select({ timeLimitMinutes: schema.examSections.timeLimitMinutes })
      .from(schema.examSections)
      .where(eq(schema.examSections.id, examSectionId))
      .limit(1)
  )[0]!;
  const startedAt = now();
  const endsAt =
    def.timeLimitMinutes > 0
      ? new Date(startedAt.getTime() + def.timeLimitMinutes * 60_000)
      : null;
  await db
    .update(schema.examAttemptSections)
    .set({ status: "in_progress", startedAt, endsAt })
    .where(eq(schema.examAttemptSections.id, section.id));
  return getState(db, userId, attemptId);
}

export class SectionExpiredError extends Error {}

export async function saveAnswer(
  db: AppDb,
  userId: string,
  attemptId: string,
  attemptItemId: string,
  patch: { selectedChoiceId?: string; flagged?: boolean; timeMsDelta?: number },
) {
  const attempt = await loadAttempt(db, userId, attemptId);
  if (!attempt) return null;
  const working = (
    await db
      .select()
      .from(schema.examAttemptItems)
      .where(eq(schema.examAttemptItems.id, attemptItemId))
      .limit(1)
  )[0];
  if (!working || working.examAttemptId !== attemptId) return null;

  const section = (
    await db
      .select()
      .from(schema.examAttemptSections)
      .where(
        and(
          eq(schema.examAttemptSections.examAttemptId, attemptId),
          eq(schema.examAttemptSections.examSectionId, working.examSectionId),
        ),
      )
      .limit(1)
  )[0]!;
  if (section.endsAt && section.endsAt.getTime() <= Date.now()) {
    await applyExpiry(db, attemptId);
    throw new SectionExpiredError("This section's time has expired.");
  }
  if (section.status !== "in_progress") {
    throw new SectionExpiredError("Section is not active.");
  }

  let changeCount = working.changeCount;
  if (
    patch.selectedChoiceId !== undefined &&
    working.selectedChoiceId &&
    working.selectedChoiceId !== patch.selectedChoiceId
  ) {
    changeCount += 1;
  }

  const updated = (
    await db
      .update(schema.examAttemptItems)
      .set({
        selectedChoiceId: patch.selectedChoiceId ?? working.selectedChoiceId,
        flagged: patch.flagged ?? working.flagged,
        changeCount,
        timeMs: working.timeMs + Math.max(0, patch.timeMsDelta ?? 0),
        answeredAt: now(),
      })
      .where(eq(schema.examAttemptItems.id, attemptItemId))
      .returning()
  )[0]!;
  return {
    attemptItemId: updated.id,
    selectedChoiceId: updated.selectedChoiceId,
    flagged: updated.flagged,
    changeCount: updated.changeCount,
  };
}

export async function submitSection(
  db: AppDb,
  userId: string,
  attemptId: string,
  examSectionId: string,
) {
  const attempt = await loadAttempt(db, userId, attemptId);
  if (!attempt) return null;
  await db
    .update(schema.examAttemptSections)
    .set({ status: "submitted", submittedAt: now() })
    .where(
      and(
        eq(schema.examAttemptSections.examAttemptId, attemptId),
        eq(schema.examAttemptSections.examSectionId, examSectionId),
      ),
    );
  return getState(db, userId, attemptId);
}

export async function pauseSection(
  db: AppDb,
  userId: string,
  attemptId: string,
  examSectionId: string,
) {
  const attempt = await loadAttempt(db, userId, attemptId);
  if (!attempt) return null;
  await db
    .update(schema.examAttemptSections)
    .set({ status: "paused", pausedAt: now() })
    .where(
      and(
        eq(schema.examAttemptSections.examAttemptId, attemptId),
        eq(schema.examAttemptSections.examSectionId, examSectionId),
        eq(schema.examAttemptSections.status, "in_progress"),
      ),
    );
  return getState(db, userId, attemptId);
}

export async function resumeSection(
  db: AppDb,
  userId: string,
  attemptId: string,
  examSectionId: string,
) {
  const attempt = await loadAttempt(db, userId, attemptId);
  if (!attempt) return null;
  const section = (
    await db
      .select()
      .from(schema.examAttemptSections)
      .where(
        and(
          eq(schema.examAttemptSections.examAttemptId, attemptId),
          eq(schema.examAttemptSections.examSectionId, examSectionId),
        ),
      )
      .limit(1)
  )[0];
  if (!section || section.status !== "paused" || !section.pausedAt)
    return getState(db, userId, attemptId);

  const pausedFor = Date.now() - section.pausedAt.getTime();
  await db
    .update(schema.examAttemptSections)
    .set({
      status: "in_progress",
      pausedAt: null,
      pausedMs: section.pausedMs + pausedFor,
      endsAt: section.endsAt
        ? new Date(section.endsAt.getTime() + pausedFor)
        : null,
    })
    .where(eq(schema.examAttemptSections.id, section.id));
  return getState(db, userId, attemptId);
}

export async function submitExam(db: AppDb, userId: string, attemptId: string) {
  const attempt = await loadAttempt(db, userId, attemptId);
  if (!attempt) return null;
  if (attempt.status !== "in_progress")
    return getResults(db, userId, attemptId);

  const exam = (
    await db
      .select()
      .from(schema.exams)
      .where(eq(schema.exams.id, attempt.examId))
      .limit(1)
  )[0]!;

  const working = await db
    .select()
    .from(schema.examAttemptItems)
    .where(eq(schema.examAttemptItems.examAttemptId, attemptId));

  // Grade MC items against the correct choice.
  const itemIds = working.map((w) => w.itemId);
  const correctByItem = new Map<string, string>();
  const subjectByItem = new Map<string, string>();
  if (itemIds.length) {
    const correctChoices = await db
      .select({
        itemId: schema.answerChoices.itemId,
        id: schema.answerChoices.id,
      })
      .from(schema.answerChoices)
      .where(
        and(
          inArray(schema.answerChoices.itemId, itemIds),
          eq(schema.answerChoices.isCorrect, true),
        ),
      );
    for (const c of correctChoices) correctByItem.set(c.itemId, c.id);

    const subj = await db
      .select({ itemId: schema.items.id, subjectId: schema.subjects.id })
      .from(schema.items)
      .innerJoin(
        schema.subtopics,
        eq(schema.items.subtopicId, schema.subtopics.id),
      )
      .innerJoin(
        schema.subjects,
        eq(schema.subtopics.subjectId, schema.subjects.id),
      )
      .where(inArray(schema.items.id, itemIds));
    for (const s of subj) subjectByItem.set(s.itemId, s.subjectId);
  }

  let totalCorrect = 0;
  let unanswered = 0;
  let changedAnswers = 0;
  let flaggedCount = 0;
  let totalTimeMs = 0;
  const perSubject = new Map<string, { correct: number; total: number }>();

  for (const w of working) {
    const correctId = correctByItem.get(w.itemId) ?? null;
    const isCorrect =
      w.selectedChoiceId != null && w.selectedChoiceId === correctId;
    if (!w.selectedChoiceId) unanswered += 1;
    if (isCorrect) totalCorrect += 1;
    changedAnswers += w.changeCount;
    if (w.flagged) flaggedCount += 1;
    totalTimeMs += w.timeMs;

    await db
      .update(schema.examAttemptItems)
      .set({ isCorrect })
      .where(eq(schema.examAttemptItems.id, w.id));

    // Materialize a canonical question attempt (feeds progress analytics).
    await db.insert(schema.questionAttempts).values({
      userId,
      itemId: w.itemId,
      examAttemptId: attemptId,
      examSectionId: w.examSectionId,
      selectedChoiceId: w.selectedChoiceId,
      isCorrect,
      timeMs: w.timeMs,
      mode: attempt.mode,
      positionInExam: w.position,
      flagged: w.flagged,
      answeredAt: now(),
    });

    const subjectId = subjectByItem.get(w.itemId);
    if (subjectId) {
      const agg = perSubject.get(subjectId) ?? { correct: 0, total: 0 };
      agg.total += 1;
      if (isCorrect) agg.correct += 1;
      perSubject.set(subjectId, agg);
    }
  }

  const totalMc = working.length;
  const rawScorePct = totalMc > 0 ? totalCorrect / totalMc : 0;
  const answered = totalMc - unanswered;
  const pacing = {
    totalQuestions: totalMc,
    answered,
    unanswered,
    changedAnswers,
    flaggedCount,
    avgSecondsPerItem:
      answered > 0 ? Math.round(totalTimeMs / answered / 1000) : 0,
  };

  await db
    .update(schema.examAttempts)
    .set({
      status: "submitted",
      completedAt: now(),
      rawScorePct,
      pacing,
    })
    .where(eq(schema.examAttempts.id, attemptId));

  await db
    .update(schema.examAttemptSections)
    .set({ status: "submitted", submittedAt: now() })
    .where(eq(schema.examAttemptSections.examAttemptId, attemptId));

  // Results update student progress: overall + per-subject snapshots.
  const totalSubjects = (
    await db
      .select({ id: schema.subjects.id })
      .from(schema.subjects)
      .where(eq(schema.subjects.courseId, exam.courseId))
  ).length;
  const coverage = totalSubjects > 0 ? perSubject.size / totalSubjects : null;

  await db.insert(schema.progressSnapshots).values({
    userId,
    courseId: exam.courseId,
    level: "overall",
    mastery: rawScorePct,
    coverage,
    recency: 1,
    readiness: coverage != null ? rawScorePct * coverage : rawScorePct,
  });
  for (const [subjectId, agg] of perSubject) {
    await db.insert(schema.progressSnapshots).values({
      userId,
      courseId: exam.courseId,
      level: "subject",
      refId: subjectId,
      mastery: agg.total > 0 ? agg.correct / agg.total : 0,
      coverage: 1,
      recency: 1,
    });
  }

  await db.insert(schema.learningEvents).values({
    userId,
    type:
      exam.kind === "diagnostic" ? "diagnostic_completed" : "exam_completed",
    payload: { attemptId, rawScorePct },
  });

  return getResults(db, userId, attemptId);
}

export async function getResults(db: AppDb, userId: string, attemptId: string) {
  const attempt = await loadAttempt(db, userId, attemptId);
  if (!attempt) return null;

  const exam = (
    await db
      .select()
      .from(schema.exams)
      .where(eq(schema.exams.id, attempt.examId))
      .limit(1)
  )[0]!;

  const working = await db
    .select()
    .from(schema.examAttemptItems)
    .where(eq(schema.examAttemptItems.examAttemptId, attemptId))
    .orderBy(asc(schema.examAttemptItems.position));

  const sections = await db
    .select()
    .from(schema.examSections)
    .where(eq(schema.examSections.examId, attempt.examId))
    .orderBy(asc(schema.examSections.sortOrder));

  const sectionResults = sections.map((s) => {
    const items = working.filter((w) => w.examSectionId === s.id);
    const correct = items.filter((w) => w.isCorrect).length;
    return {
      examSectionId: s.id,
      kind: s.kind,
      title: s.title,
      total: items.length,
      correct,
      scorePct: items.length ? correct / items.length : null,
    };
  });

  // Per-question review (item stem, your answer, correct answer, explanation).
  const itemIds = working.map((w) => w.itemId);
  const choices = itemIds.length
    ? await db
        .select()
        .from(schema.answerChoices)
        .where(inArray(schema.answerChoices.itemId, itemIds))
        .orderBy(asc(schema.answerChoices.sortOrder))
    : [];
  const stems = itemIds.length
    ? await db
        .select({ id: schema.items.id, stem: schema.items.stem })
        .from(schema.items)
        .where(inArray(schema.items.id, itemIds))
    : [];
  const stemById = new Map(stems.map((s) => [s.id, s.stem]));

  const review = working.map((w) => {
    const itemChoices = choices.filter((c) => c.itemId === w.itemId);
    return {
      itemId: w.itemId,
      stem: stemById.get(w.itemId) ?? "",
      isCorrect: w.isCorrect,
      flagged: w.flagged,
      selectedChoiceId: w.selectedChoiceId,
      choices: itemChoices.map((c) => ({
        id: c.id,
        label: c.label,
        body: c.body,
        isCorrect: c.isCorrect,
        rationale: c.rationale,
      })),
    };
  });

  return {
    attempt: {
      id: attempt.id,
      examTitle: exam.title,
      examKind: exam.kind,
      status: attempt.status,
      rawScorePct: attempt.rawScorePct,
      pacing: attempt.pacing,
      completedAt: attempt.completedAt?.toISOString() ?? null,
    },
    sectionResults,
    review,
  };
}
