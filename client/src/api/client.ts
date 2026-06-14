import { env } from "../env";
import type {
  AuthUser,
  CourseSummary,
  CourseTree,
  DashboardData,
  LessonView,
} from "./types";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${env.apiBaseUrl}${path}`, {
    credentials: "include",
    headers: { "content-type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    let code = "error";
    let message = res.statusText;
    try {
      const body = await res.json();
      code = body?.error?.code ?? code;
      message = body?.error?.message ?? message;
    } catch {
      // non-JSON error response
    }
    throw new ApiError(res.status, code, message);
  }
  return (await res.json()) as T;
}

export const api = {
  me: () => apiFetch<{ user: AuthUser }>("/auth/me"),
  login: (email: string, password: string) =>
    apiFetch<{ user: AuthUser }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  logout: () => apiFetch<{ ok: boolean }>("/auth/logout", { method: "POST" }),
  dashboard: () => apiFetch<DashboardData>("/dashboard"),

  // --- Courses & lessons ---
  courses: () => apiFetch<{ courses: CourseSummary[] }>("/courses"),
  enroll: (courseId: string) =>
    apiFetch<{ courseId: string }>(`/courses/${courseId}/enroll`, {
      method: "POST",
    }),
  course: (courseId: string) => apiFetch<CourseTree>(`/courses/${courseId}`),
  lesson: (lessonId: string, preview = false) =>
    apiFetch<LessonView>(
      `/lessons/${lessonId}${preview ? "?preview=true" : ""}`,
    ),
  startLesson: (lessonId: string) =>
    apiFetch<unknown>(`/lessons/${lessonId}/start`, { method: "POST" }),
  completeLesson: (lessonId: string, timeSpentSeconds: number) =>
    apiFetch<{ status: string; timeSpentSeconds: number }>(
      `/lessons/${lessonId}/complete`,
      { method: "POST", body: JSON.stringify({ timeSpentSeconds }) },
    ),

  // --- Authoring (content author / admin) ---
  adminCourses: () => apiFetch<{ courses: CourseSummary[] }>("/admin/courses"),
  adminTree: (courseId: string) =>
    apiFetch<CourseTree>(`/admin/courses/${courseId}/tree`),
  createCourse: (input: Record<string, unknown>) =>
    apiFetch<{ course: { id: string } }>("/admin/courses", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  createModule: (courseId: string, title: string) =>
    apiFetch<{ module: { id: string } }>(`/admin/courses/${courseId}/modules`, {
      method: "POST",
      body: JSON.stringify({ title }),
    }),
  createLesson: (moduleId: string, title: string) =>
    apiFetch<{ lesson: { id: string; licenseStatus: string } }>(
      `/admin/modules/${moduleId}/lessons`,
      { method: "POST", body: JSON.stringify({ title }) },
    ),
  createBlock: (
    lessonId: string,
    kind: string,
    body: Record<string, unknown>,
  ) =>
    apiFetch<{ block: { id: string } }>(`/admin/lessons/${lessonId}/blocks`, {
      method: "POST",
      body: JSON.stringify({ kind, body }),
    }),
};
