import {
  boolean,
  date,
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
  assignmentBlockKindEnum,
  assignmentStatusEnum,
  errorCauseEnum,
  learningEventTypeEnum,
  lessonProgressStatusEnum,
  progressLevelEnum,
  recallStageEnum,
  srsRatingEnum,
} from "./enums";
import { users } from "./identity";
import { courses, issues, rules, subjects } from "./taxonomy";
import { flashcards, lessons } from "./content";
import { questionAttempts } from "./assessment";

/**
 * Per-student lesson progress: start, completion, and accumulated time spent
 * (Course Content Engine, Phase 8). One row per (user, lesson).
 */
export const lessonProgress = pgTable(
  "lesson_progress",
  {
    id: pk(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    lessonId: uuid("lesson_id")
      .notNull()
      .references(() => lessons.id, { onDelete: "cascade" }),
    status: lessonProgressStatusEnum("status").notNull().default("not_started"),
    timeSpentSeconds: integer("time_spent_seconds").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    lastViewedAt: timestamp("last_viewed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("lesson_progress_user_lesson_unique").on(t.userId, t.lessonId),
  ],
);

/**
 * Progress at every required grain (Design §2): overall / subject / subtopic /
 * issue. `refId` points at the subject/subtopic/issue id for that level
 * (null for `overall`). Readiness gated by coverage + recency (Learning §7).
 */
export const progressSnapshots = pgTable("progress_snapshots", {
  id: pk(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  courseId: uuid("course_id")
    .notNull()
    .references(() => courses.id, { onDelete: "cascade" }),
  level: progressLevelEnum("level").notNull(),
  refId: uuid("ref_id"),
  mastery: real("mastery"),
  confidence: real("confidence"),
  coverage: real("coverage"),
  recency: real("recency"),
  readiness: real("readiness"),
  capturedAt: timestamp("captured_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** Append-only learning event stream feeding analytics rollups (Arch §5). */
export const learningEvents = pgTable("learning_events", {
  id: pk(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  type: learningEventTypeEnum("type").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>(),
  occurredAt: timestamp("occurred_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** The daily contract (Design §5/§9) — one finite, time-fit assignment. */
export const assignments = pgTable("assignments", {
  id: pk(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  courseId: uuid("course_id")
    .notNull()
    .references(() => courses.id, { onDelete: "cascade" }),
  forDate: date("for_date").notNull(),
  status: assignmentStatusEnum("status").notNull().default("pending"),
  estMinutes: integer("est_minutes").notNull().default(0),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  ...timestamps,
});

/** A block within a daily assignment, each with a `reason` it's there. */
export const assignmentItems = pgTable("assignment_items", {
  id: pk(),
  assignmentId: uuid("assignment_id")
    .notNull()
    .references(() => assignments.id, { onDelete: "cascade" }),
  kind: assignmentBlockKindEnum("kind").notNull(),
  // Polymorphic pointer to the work (item set, review, lesson, exam, etc.).
  refType: text("ref_type"),
  refId: uuid("ref_id"),
  reason: text("reason").notNull(),
  estMinutes: integer("est_minutes").notNull().default(0),
  status: assignmentStatusEnum("status").notNull().default("pending"),
  sortOrder: integer("sort_order").notNull().default(0),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

/**
 * Spaced-repetition scheduling state (Learning §3). The SRS unit is a flashcard;
 * `issueId` ties the review to issue-level mastery. Scheduler is deterministic.
 */
export const srsReviews = pgTable("srs_reviews", {
  id: pk(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  flashcardId: uuid("flashcard_id").references(() => flashcards.id, {
    onDelete: "cascade",
  }),
  // SRS unit may instead be a black-letter rule (rule card).
  ruleId: uuid("rule_id").references(() => rules.id, { onDelete: "cascade" }),
  issueId: uuid("issue_id").references(() => issues.id, {
    onDelete: "set null",
  }),
  stage: recallStageEnum("stage").notNull().default("recognize"),
  intervalDays: real("interval_days").notNull().default(0),
  ease: real("ease").notNull().default(2.5),
  reps: integer("reps").notNull().default(0),
  lapses: integer("lapses").notNull().default(0),
  dueAt: timestamp("due_at", { withTimezone: true }).notNull().defaultNow(),
  lastRating: srsRatingEnum("last_rating"),
  lastReviewedAt: timestamp("last_reviewed_at", { withTimezone: true }),
  ...timestamps,
});

/** "Why I missed it" error journal (Design §12) — diagnoses error patterns. */
export const errorJournalEntries = pgTable("error_journal_entries", {
  id: pk(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  questionAttemptId: uuid("question_attempt_id").references(
    () => questionAttempts.id,
    { onDelete: "set null" },
  ),
  issueId: uuid("issue_id").references(() => issues.id, {
    onDelete: "set null",
  }),
  cause: errorCauseEnum("cause").notNull(),
  note: text("note"),
  ...timestamps,
});

/** Per-review log — review history + recall accuracy (Phase 14 §5). */
export const srsReviewLogs = pgTable("srs_review_logs", {
  id: pk(),
  srsReviewId: uuid("srs_review_id")
    .notNull()
    .references(() => srsReviews.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  rating: srsRatingEnum("rating").notNull(),
  // Recall counts as correct when the rating is not "again".
  wasCorrect: boolean("was_correct").notNull(),
  intervalDays: real("interval_days").notNull(),
  stage: recallStageEnum("stage").notNull().default("recognize"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Personal attack outline — a per-subject, issue-by-issue analysis scaffold
 * (Design §13). Editable and tied to subjects/issues.
 */
export const attackOutlines = pgTable("attack_outlines", {
  id: pk(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  courseId: uuid("course_id")
    .notNull()
    .references(() => courses.id, { onDelete: "cascade" }),
  subjectId: uuid("subject_id").references(() => subjects.id, {
    onDelete: "set null",
  }),
  title: text("title").notNull(),
  ...timestamps,
});

/** An ordered entry within an attack outline. */
export const attackOutlineEntries = pgTable("attack_outline_entries", {
  id: pk(),
  outlineId: uuid("outline_id")
    .notNull()
    .references(() => attackOutlines.id, { onDelete: "cascade" }),
  issueId: uuid("issue_id").references(() => issues.id, {
    onDelete: "set null",
  }),
  rule: text("rule"),
  triggerFacts: text("trigger_facts"),
  commonTraps: text("common_traps"),
  checklist: text("checklist").array(),
  sortOrder: integer("sort_order").notNull().default(0),
  ...timestamps,
});
