import {
  boolean,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { pk, timestamps } from "./_shared";
import {
  contentBlockKindEnum,
  contentStatusEnum,
  itemKindEnum,
  jurisdictionEnum,
  licenseStatusEnum,
  provenanceEnum,
} from "./enums";
import { users } from "./identity";
import { courses, issues, subjects, subtopics } from "./taxonomy";

/**
 * Where a piece of content came from (Content & Licensing Policy §2).
 * Even "original" content points at a source row (e.g. "BarReady Original").
 */
export const contentSources = pgTable("content_sources", {
  id: pk(),
  name: text("name").notNull(),
  provenance: provenanceEnum("provenance").notNull(),
  url: text("url"),
  notes: text("notes"),
  ...timestamps,
});

/** A license/affirmation record governing use of a source (Policy §3–4). */
export const contentLicenses = pgTable("content_licenses", {
  id: pk(),
  sourceId: uuid("source_id")
    .notNull()
    .references(() => contentSources.id, { onDelete: "restrict" }),
  status: licenseStatusEnum("status").notNull().default("unverified"),
  // Pointer to the agreement / public-domain basis / user rights affirmation.
  licenseRef: text("license_ref"),
  terms: text("terms"),
  jurisdictionScope: jurisdictionEnum("jurisdiction_scope"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  ...timestamps,
});

/**
 * The required per-item licensing metadata applied to EVERY content-bearing
 * table (Content & Licensing Policy §3): source, license_status, jurisdiction,
 * author, reviewer, version. Subject/subtopic are tracked via each table's own
 * taxonomy FKs. The learning engine serves only `cleared` items.
 */
export const licenseColumns = () => ({
  sourceId: uuid("source_id")
    .notNull()
    .references(() => contentSources.id, { onDelete: "restrict" }),
  licenseId: uuid("license_id").references(() => contentLicenses.id, {
    onDelete: "restrict",
  }),
  provenance: provenanceEnum("provenance").notNull(),
  licenseStatus: licenseStatusEnum("license_status")
    .notNull()
    .default("unverified"),
  jurisdiction: jurisdictionEnum("jurisdiction").notNull(),
  authorId: uuid("author_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  // Null until a reviewer (≠ author) clears it (Policy §4).
  reviewerId: uuid("reviewer_id").references(() => users.id, {
    onDelete: "restrict",
  }),
  version: integer("version").notNull().default(1),
  // Editorial lifecycle (CMS). Publishing requires `approved` + metadata and is
  // the only transition that sets license_status = cleared (student-visible).
  contentStatus: contentStatusEnum("content_status").notNull().default("draft"),
});

// --- MBE question bank ---

/** A multiple-choice question bank item (Design §6). */
export const items = pgTable("items", {
  id: pk(),
  kind: itemKindEnum("kind").notNull().default("mbe_single_best_answer"),
  subtopicId: uuid("subtopic_id")
    .notNull()
    .references(() => subtopics.id, { onDelete: "restrict" }),
  primaryIssueId: uuid("primary_issue_id").references(() => issues.id, {
    onDelete: "set null",
  }),
  stem: text("stem").notNull(),
  difficulty: real("difficulty").notNull().default(0.5),
  ...licenseColumns(),
  ...timestamps,
});

/** Answer choices for an item; exactly one isCorrect; each has a rationale. */
export const answerChoices = pgTable(
  "answer_choices",
  {
    id: pk(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    label: text("label").notNull(), // "A".."D"
    body: text("body").notNull(),
    isCorrect: boolean("is_correct").notNull().default(false),
    rationale: text("rationale"), // why this choice is right/wrong
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [
    uniqueIndex("answer_choices_item_label_unique").on(t.itemId, t.label),
  ],
);

/** Full explanation for an item (1:1). */
export const explanations = pgTable(
  "explanations",
  {
    id: pk(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("explanations_item_unique").on(t.itemId)],
);

/** Multi-issue tagging for an item (issue tracking, Learning System §4). */
export const itemIssues = pgTable(
  "item_issues",
  {
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    issueId: uuid("issue_id")
      .notNull()
      .references(() => issues.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.itemId, t.issueId] })],
);

// --- Flashcards (SRS unit, Design §9/§12) ---

export const flashcards = pgTable("flashcards", {
  id: pk(),
  issueId: uuid("issue_id").references(() => issues.id, {
    onDelete: "set null",
  }),
  front: text("front").notNull(),
  back: text("back").notNull(),
  ...licenseColumns(),
  ...timestamps,
});

// --- Essays ---

/** Reusable rubric (essays + PTs), Design §7–8. */
export const essayRubrics = pgTable("essay_rubrics", {
  id: pk(),
  name: text("name").notNull(),
  description: text("description"),
  ...timestamps,
});

export const essayRubricCriteria = pgTable("essay_rubric_criteria", {
  id: pk(),
  rubricId: uuid("rubric_id")
    .notNull()
    .references(() => essayRubrics.id, { onDelete: "cascade" }),
  dimension: text("dimension").notNull(), // e.g. issue_spotting, organization
  description: text("description"),
  maxScore: integer("max_score").notNull().default(5),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const essayPrompts = pgTable("essay_prompts", {
  id: pk(),
  courseId: uuid("course_id")
    .notNull()
    .references(() => courses.id, { onDelete: "cascade" }),
  subjectId: uuid("subject_id").references(() => subjects.id, {
    onDelete: "set null",
  }),
  rubricId: uuid("rubric_id").references(() => essayRubrics.id, {
    onDelete: "set null",
  }),
  prompt: text("prompt").notNull(),
  modelAnswer: text("model_answer"),
  timeLimitMinutes: integer("time_limit_minutes").notNull().default(30),
  ...licenseColumns(),
  ...timestamps,
});

/** Issue checklist for the model answer (issue-spotting reconciliation). */
export const essayPromptIssues = pgTable(
  "essay_prompt_issues",
  {
    essayPromptId: uuid("essay_prompt_id")
      .notNull()
      .references(() => essayPrompts.id, { onDelete: "cascade" }),
    issueId: uuid("issue_id")
      .notNull()
      .references(() => issues.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.essayPromptId, t.issueId] })],
);

// --- Performance Tests ---

export const ptTasks = pgTable("pt_tasks", {
  id: pk(),
  courseId: uuid("course_id")
    .notNull()
    .references(() => courses.id, { onDelete: "cascade" }),
  rubricId: uuid("rubric_id").references(() => essayRubrics.id, {
    onDelete: "set null",
  }),
  title: text("title").notNull(),
  instructions: text("instructions").notNull(),
  // Expected work product, e.g. "persuasive memorandum", "client letter".
  expectedProduct: text("expected_product"),
  // Closed-universe file/library references or object-store asset pointers.
  fileLibrary: jsonb("file_library").$type<Record<string, unknown>>(),
  modelWorkProduct: text("model_work_product"),
  timeLimitMinutes: integer("time_limit_minutes").notNull().default(90),
  ...licenseColumns(),
  ...timestamps,
});

/** Issue checklist for a PT's model work product (issue-spotting). */
export const ptTaskIssues = pgTable(
  "pt_task_issues",
  {
    ptTaskId: uuid("pt_task_id")
      .notNull()
      .references(() => ptTasks.id, { onDelete: "cascade" }),
    issueId: uuid("issue_id")
      .notNull()
      .references(() => issues.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.ptTaskId, t.issueId] })],
);

// --- Lessons / learning content (belongs to a course; Design §2) ---

export const modules = pgTable("modules", {
  id: pk(),
  courseId: uuid("course_id")
    .notNull()
    .references(() => courses.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  ...timestamps,
});

export const lessons = pgTable("lessons", {
  id: pk(),
  moduleId: uuid("module_id")
    .notNull()
    .references(() => modules.id, { onDelete: "cascade" }),
  subtopicId: uuid("subtopic_id").references(() => subtopics.id, {
    onDelete: "set null",
  }),
  title: text("title").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  ...licenseColumns(),
  ...timestamps,
});

export const contentBlocks = pgTable("content_blocks", {
  id: pk(),
  lessonId: uuid("lesson_id")
    .notNull()
    .references(() => lessons.id, { onDelete: "cascade" }),
  kind: contentBlockKindEnum("kind").notNull().default("text"),
  body: jsonb("body").$type<Record<string, unknown>>().notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  ...timestamps,
});
