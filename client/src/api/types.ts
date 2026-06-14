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

export interface ExamSummary {
  id: string;
  kind: string;
  title: string;
}

export interface ExamSectionState {
  attemptSectionId: string;
  examSectionId: string;
  kind: string;
  title: string;
  status: "pending" | "in_progress" | "paused" | "submitted" | "expired";
  timeLimitMinutes: number;
  endsAt: string | null;
  remainingMs: number | null;
  items: Array<{
    attemptItemId: string;
    itemId: string;
    position: number;
    stem: string;
    selectedChoiceId: string | null;
    flagged: boolean;
    choices: Array<{ id: string; label: string; body: string }>;
  }>;
}

export interface ExamState {
  attempt: {
    id: string;
    status: string;
    examTitle: string;
    examKind: string;
    allowPause: boolean;
  };
  sections: ExamSectionState[];
}

export interface ExamResults {
  attempt: {
    id: string;
    examTitle: string;
    examKind: string;
    status: string;
    rawScorePct: number | null;
    pacing: {
      totalQuestions: number;
      answered: number;
      unanswered: number;
      changedAnswers: number;
      flaggedCount: number;
      avgSecondsPerItem: number;
    } | null;
    completedAt: string | null;
  };
  sectionResults: Array<{
    examSectionId: string;
    kind: string;
    title: string;
    total: number;
    correct: number;
    scorePct: number | null;
  }>;
  review: Array<{
    itemId: string;
    stem: string;
    isCorrect: boolean | null;
    flagged: boolean;
    selectedChoiceId: string | null;
    choices: Array<{
      id: string;
      label: string;
      body: string;
      isCorrect: boolean;
      rationale: string | null;
    }>;
  }>;
}

export interface EssayPromptSummary {
  id: string;
  prompt: string;
  timeLimitMinutes: number;
  subjectId: string | null;
}
export interface EssayRubricCriterion {
  id: string;
  dimension: string;
  description: string | null;
  maxScore: number;
}
export interface EssayPromptDetail {
  id: string;
  prompt: string;
  timeLimitMinutes: number;
  rubric: EssayRubricCriterion[];
}
export interface EssaySubmitResult {
  submissionId: string;
  modelAnswer: string | null;
  issueChecklist: Array<{ id: string; name: string }>;
  rubric: EssayRubricCriterion[];
}
export interface EssaySubmission {
  id: string;
  userId: string;
  essayPromptId: string;
  responseText: string;
  timeSpentSeconds: number | null;
  status: string;
  feedback: string | null;
  gradedAt: string | null;
  graderMeta: Record<string, unknown>;
  selfScores: Array<{ dimension: string; score: number }>;
  graderScores: Array<{
    dimension: string;
    score: number;
    notes: string | null;
  }>;
}
export interface EssayAnalytics {
  dimensions: Array<{ dimension: string; average: number | null }>;
  trend: Array<{
    submissionId: string;
    submittedAt: string | null;
    overall: number | null;
    timeSpentSeconds: number | null;
  }>;
}

export interface PtDoc {
  name: string;
  title: string;
  body: string;
}
export interface PtTaskSummary {
  id: string;
  title: string;
  expectedProduct: string | null;
  timeLimitMinutes: number;
}
export interface PtTaskDetail {
  id: string;
  title: string;
  instructions: string;
  expectedProduct: string | null;
  timeLimitMinutes: number;
  files: PtDoc[];
  library: PtDoc[];
  rubric: string[];
}
export interface PtSubmitResult {
  submissionId: string;
  modelWorkProduct: string | null;
  issueChecklist: Array<{ id: string; name: string }>;
  rubric: string[];
}

export type SrsRating = "again" | "hard" | "good" | "easy";
export interface DueCard {
  reviewId: string;
  stage: string;
  front: string;
  back: string;
  isRule: boolean;
}
export interface RuleEntry {
  id: string;
  statement: string;
  elements: string[] | null;
  mnemonic: string | null;
  issueId: string;
  issueName: string;
}
export interface AttackOutline {
  id: string;
  title: string;
  subjectId: string | null;
}
export interface AttackOutlineEntry {
  id: string;
  issueId: string | null;
  rule: string | null;
  triggerFacts: string | null;
  commonTraps: string | null;
  checklist: string[] | null;
  sortOrder: number;
}
