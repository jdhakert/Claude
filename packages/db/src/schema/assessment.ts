import {
  boolean,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { pk, timestamps } from "./_shared";
import {
  attemptStatusEnum,
  confidenceLevelEnum,
  examKindEnum,
  examSectionKindEnum,
  practiceModeEnum,
} from "./enums";
import { users } from "./identity";
import { courses } from "./taxonomy";
import {
  answerChoices,
  essayPrompts,
  essayRubricCriteria,
  items,
  ptTasks,
} from "./content";

/**
 * Exam blueprint/definition — diagnostic, full-length, periodic (Design §7, §9).
 * The same structure covers diagnostics and periodic full-lengths.
 */
export const exams = pgTable("exams", {
  id: pk(),
  courseId: uuid("course_id")
    .notNull()
    .references(() => courses.id, { onDelete: "cascade" }),
  kind: examKindEnum("kind").notNull(),
  title: text("title").notNull(),
  config: jsonb("config").$type<Record<string, unknown>>(),
  ...timestamps,
});

/** Ordered sections of an exam blueprint with timing (exam-day realism §15). */
export const examSections = pgTable("exam_sections", {
  id: pk(),
  examId: uuid("exam_id")
    .notNull()
    .references(() => exams.id, { onDelete: "cascade" }),
  kind: examSectionKindEnum("kind").notNull(),
  title: text("title").notNull(),
  itemCount: integer("item_count").notNull().default(0),
  timeLimitMinutes: integer("time_limit_minutes").notNull().default(0),
  sortOrder: integer("sort_order").notNull().default(0),
});

/** A user's sitting of an exam; holds scores + pacing/fatigue report. */
export const examAttempts = pgTable("exam_attempts", {
  id: pk(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  examId: uuid("exam_id")
    .notNull()
    .references(() => exams.id, { onDelete: "restrict" }),
  status: attemptStatusEnum("status").notNull().default("in_progress"),
  mode: practiceModeEnum("mode").notNull().default("exam"),
  startedAt: timestamp("started_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  rawScorePct: real("raw_score_pct"),
  scaledScore: real("scaled_score"),
  // Pacing + fatigue curve (time-management progress level, Design §2/§17).
  pacing: jsonb("pacing").$type<Record<string, unknown>>(),
  ...timestamps,
});

/**
 * A single item attempt. Belongs to an exam attempt OR is standalone practice
 * (examAttemptId null). Captures time + exam position (fatigue) + correctness.
 */
export const questionAttempts = pgTable("question_attempts", {
  id: pk(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  itemId: uuid("item_id")
    .notNull()
    .references(() => items.id, { onDelete: "restrict" }),
  examAttemptId: uuid("exam_attempt_id").references(() => examAttempts.id, {
    onDelete: "cascade",
  }),
  examSectionId: uuid("exam_section_id").references(() => examSections.id, {
    onDelete: "set null",
  }),
  selectedChoiceId: uuid("selected_choice_id").references(
    () => answerChoices.id,
    { onDelete: "set null" },
  ),
  isCorrect: boolean("is_correct").notNull().default(false),
  timeMs: integer("time_ms"),
  mode: practiceModeEnum("mode").notNull().default("tutor"),
  // Position within the exam, for the fatigue curve.
  positionInExam: integer("position_in_exam"),
  flagged: boolean("flagged").notNull().default(false),
  answeredAt: timestamp("answered_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  ...timestamps,
});

/**
 * Confidence rating per question attempt (1:1) — the calibration record
 * (Design §13). Kept normalized so calibration analytics has a clean home.
 */
export const confidenceRatings = pgTable(
  "confidence_ratings",
  {
    id: pk(),
    questionAttemptId: uuid("question_attempt_id")
      .notNull()
      .references(() => questionAttempts.id, { onDelete: "cascade" }),
    level: confidenceLevelEnum("level").notNull(),
    wasCorrect: boolean("was_correct").notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("confidence_ratings_attempt_unique").on(t.questionAttemptId),
  ],
);

// --- Essay / PT submissions & scores ---

export const essaySubmissions = pgTable("essay_submissions", {
  id: pk(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  essayPromptId: uuid("essay_prompt_id")
    .notNull()
    .references(() => essayPrompts.id, { onDelete: "restrict" }),
  examAttemptId: uuid("exam_attempt_id").references(() => examAttempts.id, {
    onDelete: "cascade",
  }),
  responseText: text("response_text").notNull().default(""),
  timeSpentSeconds: integer("time_spent_seconds"),
  status: attemptStatusEnum("status").notNull().default("in_progress"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  ...timestamps,
});

/**
 * Per-rubric-dimension score for a submission. `isSelfAssessment` distinguishes
 * the beta self-grading loop from later human/AI grading (Design §7–8).
 */
export const essayScores = pgTable("essay_scores", {
  id: pk(),
  essaySubmissionId: uuid("essay_submission_id")
    .notNull()
    .references(() => essaySubmissions.id, { onDelete: "cascade" }),
  criterionId: uuid("criterion_id").references(() => essayRubricCriteria.id, {
    onDelete: "set null",
  }),
  dimension: text("dimension").notNull(),
  score: integer("score").notNull(),
  isSelfAssessment: boolean("is_self_assessment").notNull().default(true),
  graderId: uuid("grader_id").references(() => users.id, {
    onDelete: "set null",
  }),
  notes: text("notes"),
  ...timestamps,
});

export const ptSubmissions = pgTable("pt_submissions", {
  id: pk(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  ptTaskId: uuid("pt_task_id")
    .notNull()
    .references(() => ptTasks.id, { onDelete: "restrict" }),
  examAttemptId: uuid("exam_attempt_id").references(() => examAttempts.id, {
    onDelete: "cascade",
  }),
  responseText: text("response_text").notNull().default(""),
  timeSpentSeconds: integer("time_spent_seconds"),
  status: attemptStatusEnum("status").notNull().default("in_progress"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  ...timestamps,
});
