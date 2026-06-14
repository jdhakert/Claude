import { asc, eq, inArray } from "drizzle-orm";
import { schema } from "@barready/db";
import type { AppDb } from "../db.js";

/** Browse all courses, flagged with whether the user is enrolled. */
export async function listCourses(db: AppDb, userId: string) {
  const courses = await db
    .select({
      id: schema.courses.id,
      slug: schema.courses.slug,
      title: schema.courses.title,
      type: schema.courses.type,
      jurisdiction: schema.courses.jurisdiction,
      description: schema.courses.description,
    })
    .from(schema.courses)
    .orderBy(asc(schema.courses.title));

  const enrolled = await db
    .select({ courseId: schema.enrollments.courseId })
    .from(schema.enrollments)
    .where(eq(schema.enrollments.userId, userId));
  const enrolledIds = new Set(enrolled.map((e) => e.courseId));

  return courses.map((c) => ({ ...c, enrolled: enrolledIds.has(c.id) }));
}

export async function enroll(db: AppDb, userId: string, courseId: string) {
  const course = (
    await db
      .select({ id: schema.courses.id })
      .from(schema.courses)
      .where(eq(schema.courses.id, courseId))
      .limit(1)
  )[0];
  if (!course) return null;

  await db
    .insert(schema.enrollments)
    .values({ userId, courseId })
    .onConflictDoNothing();
  return { courseId, enrolled: true };
}

export interface CourseTreeOptions {
  /** Authoring/preview: include lessons that are not yet license-cleared. */
  includeUncleared?: boolean;
}

/** Course → modules → lessons, with the user's per-lesson progress. */
export async function getCourseTree(
  db: AppDb,
  courseId: string,
  userId: string,
  opts: CourseTreeOptions = {},
) {
  const course = (
    await db
      .select()
      .from(schema.courses)
      .where(eq(schema.courses.id, courseId))
      .limit(1)
  )[0];
  if (!course) return null;

  const modules = await db
    .select()
    .from(schema.modules)
    .where(eq(schema.modules.courseId, courseId))
    .orderBy(asc(schema.modules.sortOrder));

  const moduleIds = modules.map((m) => m.id);
  const lessons = moduleIds.length
    ? await db
        .select({
          id: schema.lessons.id,
          moduleId: schema.lessons.moduleId,
          title: schema.lessons.title,
          sortOrder: schema.lessons.sortOrder,
          licenseStatus: schema.lessons.licenseStatus,
        })
        .from(schema.lessons)
        .where(inArray(schema.lessons.moduleId, moduleIds))
        .orderBy(asc(schema.lessons.sortOrder))
    : [];

  const visibleLessons = opts.includeUncleared
    ? lessons
    : lessons.filter((l) => l.licenseStatus === "cleared");

  const progressRows = await db
    .select({
      lessonId: schema.lessonProgress.lessonId,
      status: schema.lessonProgress.status,
      timeSpentSeconds: schema.lessonProgress.timeSpentSeconds,
    })
    .from(schema.lessonProgress)
    .where(eq(schema.lessonProgress.userId, userId));
  const progressByLesson = new Map(progressRows.map((p) => [p.lessonId, p]));

  return {
    course: {
      id: course.id,
      title: course.title,
      type: course.type,
      description: course.description,
    },
    modules: modules.map((m) => ({
      id: m.id,
      title: m.title,
      lessons: visibleLessons
        .filter((l) => l.moduleId === m.id)
        .map((l) => ({
          id: l.id,
          title: l.title,
          licenseStatus: l.licenseStatus,
          progress: progressByLesson.get(l.id)?.status ?? "not_started",
        })),
    })),
  };
}
