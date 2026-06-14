import { env } from "../env";
import type {
  AttemptReview,
  AuthUser,
  Confidence,
  CourseSummary,
  CourseTree,
  DashboardData,
  EssayAnalytics,
  EssayPromptDetail,
  EssayPromptSummary,
  EssaySubmission,
  EssaySubmitResult,
  ExamResults,
  ExamState,
  ExamSummary,
  LessonView,
  PracticeItem,
  PracticeSubject,
  PtSubmitResult,
  PtTaskDetail,
  PtTaskSummary,
  AttackOutline,
  AttackOutlineEntry,
  DueCard,
  RuleEntry,
  SrsRating,
  StudentAnalytics,
  AdminStudent,
  CohortOverview,
  ContentPerformance,
  WrongAnswerPatterns,
  RedFlags,
  RemediationSet,
  CmsKind,
  CmsSummary,
  CmsItem,
  CmsHistoryEntry,
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
  // Only send a JSON content-type when there's a body — Fastify rejects an
  // empty JSON body, which would break bodyless POSTs (enroll, start, etc.).
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string>),
  };
  if (init?.body != null) headers["content-type"] = "application/json";
  const res = await fetch(`${env.apiBaseUrl}${path}`, {
    credentials: "include",
    ...init,
    headers,
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

  // --- Practice ---
  practiceTaxonomy: (courseId: string) =>
    apiFetch<{ subjects: PracticeSubject[] }>(
      `/practice/taxonomy?courseId=${courseId}`,
    ),
  practiceItems: (params: {
    courseId: string;
    subjectId?: string;
    subtopicId?: string;
    mixed?: boolean;
    limit?: number;
  }) => {
    const q = new URLSearchParams({ courseId: params.courseId });
    if (params.subjectId) q.set("subjectId", params.subjectId);
    if (params.subtopicId) q.set("subtopicId", params.subtopicId);
    if (params.mixed) q.set("mixed", "true");
    if (params.limit) q.set("limit", String(params.limit));
    return apiFetch<{ items: PracticeItem[] }>(
      `/practice/items?${q.toString()}`,
    );
  },
  submitAttempt: (input: {
    itemId: string;
    selectedChoiceId: string;
    confidence: Confidence;
    timeMs: number;
    mode: "tutor" | "timed";
  }) =>
    apiFetch<AttemptReview>("/practice/attempts", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  addErrorJournal: (input: {
    questionAttemptId: string;
    cause: string;
    note?: string;
  }) =>
    apiFetch<{ entry: { id: string } }>("/error-journal", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  createFlashcard: (input: { front: string; back: string }) =>
    apiFetch<{ flashcard: { id: string } }>("/flashcards", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  // --- Exams ---
  exams: (courseId: string) =>
    apiFetch<{ exams: ExamSummary[] }>(`/exams?courseId=${courseId}`),
  startExam: (examId: string) =>
    apiFetch<ExamState>(`/exams/${examId}/attempts`, { method: "POST" }),
  examState: (attemptId: string) =>
    apiFetch<ExamState>(`/exam-attempts/${attemptId}`),
  startExamSection: (attemptId: string, examSectionId: string) =>
    apiFetch<ExamState>(`/exam-attempts/${attemptId}/sections/start`, {
      method: "POST",
      body: JSON.stringify({ examSectionId }),
    }),
  submitExamSection: (attemptId: string, examSectionId: string) =>
    apiFetch<ExamState>(`/exam-attempts/${attemptId}/sections/submit`, {
      method: "POST",
      body: JSON.stringify({ examSectionId }),
    }),
  pauseExamSection: (attemptId: string, examSectionId: string) =>
    apiFetch<ExamState>(`/exam-attempts/${attemptId}/sections/pause`, {
      method: "POST",
      body: JSON.stringify({ examSectionId }),
    }),
  resumeExamSection: (attemptId: string, examSectionId: string) =>
    apiFetch<ExamState>(`/exam-attempts/${attemptId}/sections/resume`, {
      method: "POST",
      body: JSON.stringify({ examSectionId }),
    }),
  answerExam: (
    attemptId: string,
    input: {
      attemptItemId: string;
      selectedChoiceId?: string;
      flagged?: boolean;
      timeMsDelta?: number;
    },
  ) =>
    apiFetch<{ selectedChoiceId: string | null; flagged: boolean }>(
      `/exam-attempts/${attemptId}/answer`,
      { method: "POST", body: JSON.stringify(input) },
    ),
  submitExam: (attemptId: string) =>
    apiFetch<ExamResults>(`/exam-attempts/${attemptId}/submit`, {
      method: "POST",
    }),
  examResults: (attemptId: string) =>
    apiFetch<ExamResults>(`/exam-attempts/${attemptId}/results`),

  // --- Essays ---
  essays: (courseId: string) =>
    apiFetch<{ prompts: EssayPromptSummary[] }>(`/essays?courseId=${courseId}`),
  essay: (id: string) => apiFetch<EssayPromptDetail>(`/essays/${id}`),
  essayAnalytics: () => apiFetch<EssayAnalytics>("/essays/analytics"),
  submitEssay: (
    id: string,
    input: { responseText: string; timeSpentSeconds: number },
  ) =>
    apiFetch<EssaySubmitResult>(`/essays/${id}/submissions`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  selfAssessEssay: (
    submissionId: string,
    input: {
      scores: Array<{ dimension: string; score: number }>;
      spottedIssueIds: string[];
    },
  ) =>
    apiFetch<{ missedIssueIds: string[] }>(
      `/essay-submissions/${submissionId}/self-assessment`,
      { method: "POST", body: JSON.stringify(input) },
    ),
  graderQueue: () =>
    apiFetch<{
      submissions: Array<{
        id: string;
        submittedAt: string | null;
        gradedAt: string | null;
      }>;
    }>("/grader/essay-submissions"),
  graderSubmission: (id: string) =>
    apiFetch<{ submission: EssaySubmission }>(`/essay-submissions/${id}`),
  gradeEssay: (
    id: string,
    input: {
      scores: Array<{ dimension: string; score: number; notes?: string }>;
      comment?: string;
      ruleWeaknesses?: string[];
    },
  ) =>
    apiFetch<{ submission: EssaySubmission }>(
      `/grader/essay-submissions/${id}/grade`,
      { method: "POST", body: JSON.stringify(input) },
    ),

  // --- Performance Tests ---
  ptTasks: (courseId: string) =>
    apiFetch<{ tasks: PtTaskSummary[] }>(`/pt-tasks?courseId=${courseId}`),
  ptTask: (id: string) => apiFetch<PtTaskDetail>(`/pt-tasks/${id}`),
  submitPt: (
    id: string,
    input: { responseText: string; timeSpentSeconds: number },
  ) =>
    apiFetch<PtSubmitResult>(`/pt-tasks/${id}/submissions`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  selfAssessPt: (
    submissionId: string,
    scores: Array<{ dimension: string; score: number }>,
  ) =>
    apiFetch<{ submissionId: string }>(
      `/pt-submissions/${submissionId}/self-assessment`,
      { method: "POST", body: JSON.stringify({ scores }) },
    ),

  // --- Retention: SRS, rules, outlines ---
  srsDue: () => apiFetch<{ cards: DueCard[] }>("/srs/due"),
  srsStats: () =>
    apiFetch<{
      totalReviews: number;
      accuracy: number | null;
      history: Array<{
        rating: string;
        wasCorrect: boolean;
        reviewedAt: string;
      }>;
    }>("/srs/stats"),
  reviewCard: (reviewId: string, rating: SrsRating) =>
    apiFetch<{ intervalDays: number }>(`/srs/${reviewId}/review`, {
      method: "POST",
      body: JSON.stringify({ rating }),
    }),
  createCard: (input: { front: string; back: string; issueId?: string }) =>
    apiFetch<{ card: { id: string } }>("/srs/cards", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  rules: (courseId: string) =>
    apiFetch<{ rules: RuleEntry[] }>(`/rules?courseId=${courseId}`),
  drillRule: (ruleId: string, rating: SrsRating) =>
    apiFetch<{ intervalDays: number }>(`/rules/${ruleId}/drill`, {
      method: "POST",
      body: JSON.stringify({ rating }),
    }),
  outlines: () => apiFetch<{ outlines: AttackOutline[] }>("/outlines"),
  createOutline: (title: string, subjectId?: string) =>
    apiFetch<{ outline: AttackOutline }>("/outlines", {
      method: "POST",
      body: JSON.stringify({ title, subjectId }),
    }),
  outline: (id: string) =>
    apiFetch<{ outline: AttackOutline; entries: AttackOutlineEntry[] }>(
      `/outlines/${id}`,
    ),
  // --- Creative features ---
  wrongAnswerPatterns: () =>
    apiFetch<WrongAnswerPatterns>("/insights/patterns"),
  redFlags: () => apiFetch<RedFlags>("/insights/red-flags"),
  remediationSet: (issueId?: string) =>
    apiFetch<RemediationSet>(
      `/remediation/set${issueId ? `?issueId=${issueId}` : ""}`,
    ),

  // --- Admin CMS ---
  cmsDashboard: () =>
    apiFetch<{ summary: CmsSummary[] }>("/admin/cms/dashboard"),
  cmsList: (kind: CmsKind, opts: { status?: string; q?: string } = {}) => {
    const q = new URLSearchParams();
    if (opts.status) q.set("status", opts.status);
    if (opts.q) q.set("q", opts.q);
    const qs = q.toString();
    return apiFetch<{ items: CmsItem[] }>(
      `/admin/cms/${kind}${qs ? `?${qs}` : ""}`,
    );
  },
  cmsTransition: (kind: CmsKind, id: string, action: string) =>
    apiFetch<{ content: CmsItem }>(`/admin/cms/${kind}/${id}/transition`, {
      method: "POST",
      body: JSON.stringify({ action }),
    }),
  cmsHistory: (kind: CmsKind, id: string) =>
    apiFetch<{ history: CmsHistoryEntry[] }>(
      `/admin/cms/${kind}/${id}/history`,
    ),

  // --- Analytics ---
  myAnalytics: () => apiFetch<StudentAnalytics>("/analytics/me"),
  adminStudents: () =>
    apiFetch<{ students: AdminStudent[] }>("/admin/analytics/students"),
  adminCohort: () => apiFetch<CohortOverview>("/admin/analytics/cohort"),
  adminAtRisk: () =>
    apiFetch<{ students: AdminStudent[] }>("/admin/analytics/at-risk"),
  adminContent: (courseId: string) =>
    apiFetch<ContentPerformance>(
      `/admin/analytics/content?courseId=${courseId}`,
    ),
  addOutlineEntry: (
    outlineId: string,
    input: {
      rule?: string;
      triggerFacts?: string;
      commonTraps?: string;
      checklist?: string[];
    },
  ) =>
    apiFetch<{ entry: AttackOutlineEntry }>(`/outlines/${outlineId}/entries`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
};
