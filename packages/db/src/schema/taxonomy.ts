import {
  boolean,
  integer,
  pgTable,
  real,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { pk, timestamps } from "./_shared";
import {
  courseTypeEnum,
  enrollmentStatusEnum,
  jurisdictionEnum,
} from "./enums";
import { users } from "./identity";

/**
 * Course catalog. Course is DATA, not code — adding MPRE later needs no
 * migration (Charter §1.4, Product Brief §4).
 */
export const courses = pgTable(
  "courses",
  {
    id: pk(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    type: courseTypeEnum("type").notNull(),
    jurisdiction: jurisdictionEnum("jurisdiction").notNull(),
    description: text("description"),
    isBeta: boolean("is_beta").notNull().default(true),
    ...timestamps,
  },
  (t) => [uniqueIndex("courses_slug_unique").on(t.slug)],
);

/** User ↔ course enrollment (a student studies one course in beta). */
export const enrollments = pgTable(
  "enrollments",
  {
    id: pk(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    status: enrollmentStatusEnum("status").notNull().default("active"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("enrollments_user_course_unique").on(t.userId, t.courseId),
  ],
);

/** Top-level subject, e.g. Evidence. `examWeight` drives prioritization. */
export const subjects = pgTable(
  "subjects",
  {
    id: pk(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    examWeight: real("exam_weight").notNull().default(1),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (t) => [uniqueIndex("subjects_course_slug_unique").on(t.courseId, t.slug)],
);

/** Subtopic within a subject, e.g. Hearsay (Learning System §2). */
export const subtopics = pgTable(
  "subtopics",
  {
    id: pk(),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => subjects.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    examWeight: real("exam_weight").notNull().default(1),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (t) => [uniqueIndex("subtopics_subject_slug_unique").on(t.subjectId, t.slug)],
);

/** Legal issue / testable rule-point, e.g. "present sense impression". */
export const issues = pgTable(
  "issues",
  {
    id: pk(),
    subtopicId: uuid("subtopic_id")
      .notNull()
      .references(() => subtopics.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    examWeight: real("exam_weight").notNull().default(1),
    ...timestamps,
  },
  (t) => [uniqueIndex("issues_subtopic_slug_unique").on(t.subtopicId, t.slug)],
);

/**
 * Black-letter rule attached to an issue (Rule Memorization, Design §12).
 * Licensing columns live on `rules` too via the content workflow when authored;
 * here we keep the structured rule body and link to the issue.
 */
export const rules = pgTable("rules", {
  id: pk(),
  issueId: uuid("issue_id")
    .notNull()
    .references(() => issues.id, { onDelete: "cascade" }),
  statement: text("statement").notNull(),
  // Ordered elements of the rule, used for cloze / free-recall staging.
  elements: text("elements").array(),
  mnemonic: text("mnemonic"),
  ...timestamps,
});
