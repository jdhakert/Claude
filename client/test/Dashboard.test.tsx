import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DashboardData } from "../src/api/types";
import { Dashboard } from "../src/routes/Dashboard";

// Mock the API client so the dashboard renders from controlled, seed-shaped data.
const dashboardMock = vi.fn();
vi.mock("../src/api/client", () => ({
  api: { dashboard: () => dashboardMock() },
  ApiError: class ApiError extends Error {},
}));

const seedLike: DashboardData = {
  course: { id: "c1", title: "Uniform Bar Exam — 2026", type: "ube" },
  readiness: 0.55,
  examCountdown: { examDate: "2026-07-28T00:00:00.000Z", daysRemaining: 44 },
  diagnostic: { status: "completed", scheduledFor: null, scorePct: 0.62 },
  todaysAssignment: {
    id: "a1",
    forDate: "2026-06-14",
    estMinutes: 75,
    status: "pending",
    items: [
      {
        id: "i1",
        kind: "spaced_review",
        reason: "Due review",
        estMinutes: 10,
        status: "pending",
      },
      {
        id: "i2",
        kind: "remediation",
        reason: "Weak issue: present sense impression",
        estMinutes: 25,
        status: "pending",
      },
    ],
  },
  progressBySubject: [
    { subjectId: "s1", name: "Evidence", mastery: 0.5, examWeight: 1 },
  ],
  weakAreas: [
    {
      issueId: "is1",
      name: "Present sense impression",
      subject: "Evidence",
      mastery: 0.35,
    },
  ],
  recentActivity: [
    { type: "diagnostic_completed", occurredAt: "2026-06-13T00:00:00.000Z" },
  ],
  nextTask: {
    kind: "remediation",
    reason: "Weak issue: present sense impression",
    estMinutes: 25,
  },
};

function renderDashboard() {
  return render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>,
  );
}

afterEach(() => {
  dashboardMock.mockReset();
});

describe("Dashboard", () => {
  it("shows a loading state first", () => {
    dashboardMock.mockReturnValue(new Promise(() => {}));
    renderDashboard();
    expect(screen.getByRole("status")).toHaveTextContent(/loading/i);
  });

  it("renders all key widgets from database-backed data", async () => {
    dashboardMock.mockResolvedValue(seedLike);
    renderDashboard();

    // Readiness + course + countdown
    await waitFor(() => expect(screen.getByText("55%")).toBeInTheDocument());
    expect(screen.getByText(/Uniform Bar Exam/)).toBeInTheDocument();
    expect(screen.getByText("44")).toBeInTheDocument();

    // Today's assignment, weak areas, progress, recent activity, next task
    expect(screen.getByLabelText("Today's assignments")).toBeInTheDocument();
    expect(
      screen.getAllByText(/present sense impression/i).length,
    ).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Evidence").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByLabelText("Progress by subject")).toHaveTextContent(
      "Evidence",
    );
    expect(screen.getByLabelText("Recent activity")).toHaveTextContent(
      /diagnostic completed/i,
    );
    expect(screen.getByLabelText("Next recommended task")).toBeInTheDocument();

    // Diagnostic status reflects real data
    expect(screen.getByLabelText("Diagnostic status")).toHaveTextContent(
      /completed/i,
    );
  });

  it("renders graceful empty states when the student has no data", async () => {
    dashboardMock.mockResolvedValue({
      course: null,
      readiness: null,
      examCountdown: { examDate: null, daysRemaining: null },
      diagnostic: { status: "not_started", scheduledFor: null, scorePct: null },
      todaysAssignment: null,
      progressBySubject: [],
      weakAreas: [],
      recentActivity: [],
      nextTask: null,
    } satisfies DashboardData);
    renderDashboard();

    await waitFor(() =>
      expect(
        screen.getByText(/not enrolled in a course yet/i),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText(/Nothing scheduled yet/i)).toBeInTheDocument();
    expect(
      screen.getByText(/No weak areas identified yet/i),
    ).toBeInTheDocument();
  });

  it("renders an error state with retry when the request fails", async () => {
    dashboardMock.mockRejectedValue(new Error("network down"));
    renderDashboard();
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/network down/i),
    );
    expect(
      screen.getByRole("button", { name: /try again/i }),
    ).toBeInTheDocument();
  });
});
