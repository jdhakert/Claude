export interface DashboardData {
  course: { id: string; title: string; type: string } | null;
  readiness: number | null;
  examCountdown: { examDate: string | null; daysRemaining: number | null };
  diagnostic: {
    status: "not_started" | "scheduled" | "completed";
    scheduledFor: string | null;
    scorePct: number | null;
  };
  todaysAssignment: {
    id: string;
    forDate: string;
    estMinutes: number;
    status: string;
    items: Array<{
      id: string;
      kind: string;
      reason: string;
      estMinutes: number;
      status: string;
    }>;
  } | null;
  progressBySubject: Array<{
    subjectId: string;
    name: string;
    mastery: number | null;
    examWeight: number;
  }>;
  weakAreas: Array<{
    issueId: string;
    name: string;
    subject: string;
    mastery: number | null;
  }>;
  recentActivity: Array<{ type: string; occurredAt: string }>;
  nextTask: { kind: string; reason: string; estMinutes: number } | null;
}

export interface AuthUser {
  id: string;
  email: string;
  roles: string[];
}

export interface CourseSummary {
  id: string;
  slug: string;
  title: string;
  type: string;
  jurisdiction: string;
  description: string | null;
  enrolled: boolean;
}

export interface ContentBlock {
  id: string;
  kind:
    | "text"
    | "checklist"
    | "rule_statement"
    | "example"
    | "mini_quiz"
    | "video"
    | "outline_download"
    | "callout";
  body: Record<string, unknown>;
}

export interface CourseTree {
  course: {
    id: string;
    title: string;
    type: string;
    description: string | null;
  };
  modules: Array<{
    id: string;
    title: string;
    lessons: Array<{
      id: string;
      title: string;
      licenseStatus: string;
      progress: "not_started" | "in_progress" | "completed";
    }>;
  }>;
}

export interface LessonView {
  lesson: {
    id: string;
    title: string;
    licenseStatus: string;
    preview: boolean;
  };
  blocks: ContentBlock[];
  progress: {
    status: "not_started" | "in_progress" | "completed";
    timeSpentSeconds: number;
    startedAt: string | null;
    completedAt: string | null;
  };
}

export interface PracticeSubject {
  id: string;
  name: string;
  subtopics: Array<{ id: string; name: string }>;
}

export interface PracticeItem {
  id: string;
  stem: string;
  subject: string;
  subtopic: string;
  choices: Array<{ id: string; label: string; body: string }>;
}

export type Confidence = "guessing" | "low" | "medium" | "high";

export interface AttemptReview {
  attemptId: string;
  isCorrect: boolean;
  correctChoiceId: string | null;
  confidence: Confidence;
  issue: { id: string; name: string } | null;
  ruleTakeaway: string | null;
  explanation: string | null;
  choices: Array<{
    id: string;
    label: string;
    body: string;
    isCorrect: boolean;
    rationale: string | null;
  }>;
}
