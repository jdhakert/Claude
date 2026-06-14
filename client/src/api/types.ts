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
