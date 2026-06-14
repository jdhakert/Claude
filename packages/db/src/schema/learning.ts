import {
  date,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { pk, timestamps } from "./_shared";
import {
  assignmentBlockKindEnum,
  assignmentStatusEnum,
  errorCauseEnum,
  learningEventTypeEnum,
  progressLevelEnum,
  recallStageEnum,
  srsRatingEnum,
} from "./enums";
import { users } from "./identity";
import { courses, issues } from "./taxonomy";
import { flashcards } from "./content";
import { questionAttempts } from "./assessment";

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
