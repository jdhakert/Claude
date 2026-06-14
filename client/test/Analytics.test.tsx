import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { StudentAnalytics } from "../src/api/types";

const analyticsMock = vi.fn();
vi.mock("../src/api/client", () => ({
  api: { myAnalytics: () => analyticsMock() },
  ApiError: class ApiError extends Error {},
}));
vi.mock("../src/auth/AuthContext", () => ({
  useAuth: () => ({ user: { id: "u1", email: "s@x.com", roles: ["student"] } }),
}));

import { Analytics } from "../src/routes/Analytics";

const data: StudentAnalytics = {
  readiness: 0.55,
  coverage: 0.7,
  recency: 0.8,
  nextFocus: "Present sense impression",
  subjects: [{ id: "s1", name: "Evidence", mastery: 0.5, examWeight: 1 }],
  subtopics: [],
  issues: [
    {
      id: "i1",
      name: "Present sense impression",
      subjectName: "Evidence",
      mastery: 0.35,
    },
  ],
  timing: { avgSecondsPerQuestion: 88 },
  calibration: [
    { level: "guessing", count: 0, accuracy: null, flag: null },
    { level: "low", count: 0, accuracy: null, flag: null },
    { level: "medium", count: 0, accuracy: null, flag: null },
    { level: "high", count: 1, accuracy: 0, flag: "overconfident" },
  ],
  essayTrend: [],
  ptTrend: [],
  mbeAccuracyTrend: [{ date: "2026-06-13", accuracy: 0.5, count: 2 }],
  completionTrend: [{ date: "2026-06-13", count: 3 }],
};

function renderAnalytics() {
  return render(
    <MemoryRouter>
      <Analytics />
    </MemoryRouter>,
  );
}

afterEach(() => vi.clearAllMocks());

describe("Analytics page", () => {
  it("renders readiness, next focus, subject table, and the overconfidence flag", async () => {
    analyticsMock.mockResolvedValue(data);
    renderAnalytics();

    await waitFor(() => expect(screen.getByText("55%")).toBeInTheDocument());
    // "What to do next" is surfaced.
    expect(
      screen.getAllByText(/present sense impression/i).length,
    ).toBeGreaterThanOrEqual(1);

    // Subject performance table (accessible fallback).
    expect(screen.getByLabelText("Subject performance")).toHaveTextContent(
      "Evidence",
    );

    // Confidence calibration surfaces the overconfidence flag.
    const cal = screen.getByLabelText("Confidence calibration");
    expect(cal).toHaveTextContent(/overconfident/i);

    // MBE trend table present.
    expect(screen.getByLabelText("MBE accuracy trend")).toBeInTheDocument();
  });
});
