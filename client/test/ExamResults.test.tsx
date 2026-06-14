import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExamResults as ExamResultsType } from "../src/api/types";

const resultsMock = vi.fn();
vi.mock("../src/api/client", () => ({
  api: { examResults: () => resultsMock() },
  ApiError: class ApiError extends Error {},
}));

import { ExamResults } from "../src/routes/exam/ExamResults";

const results: ExamResultsType = {
  attempt: {
    id: "att1",
    examTitle: "UBE Diagnostic",
    examKind: "diagnostic",
    status: "submitted",
    rawScorePct: 0.66,
    pacing: {
      totalQuestions: 3,
      answered: 3,
      unanswered: 0,
      changedAnswers: 1,
      flaggedCount: 1,
      avgSecondsPerItem: 42,
    },
    completedAt: "2026-06-14T00:00:00.000Z",
  },
  sectionResults: [
    {
      examSectionId: "s1",
      kind: "mbe",
      title: "Diagnostic — MBE",
      total: 3,
      correct: 2,
      scorePct: 0.66,
    },
  ],
  review: [
    {
      itemId: "i1",
      stem: "Is this hearsay?",
      isCorrect: false,
      flagged: true,
      selectedChoiceId: "c2",
      choices: [
        {
          id: "c1",
          label: "A",
          body: "Yes",
          isCorrect: true,
          rationale: "Right.",
        },
        {
          id: "c2",
          label: "B",
          body: "No",
          isCorrect: false,
          rationale: "Wrong.",
        },
      ],
    },
  ],
};

function renderResults() {
  return render(
    <MemoryRouter initialEntries={["/exam-attempts/att1/results"]}>
      <Routes>
        <Route
          path="/exam-attempts/:attemptId/results"
          element={<ExamResults />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => resultsMock.mockReset());

describe("ExamResults", () => {
  it("shows score, pacing analytics, section results, and review", async () => {
    resultsMock.mockResolvedValue(results);
    renderResults();

    await waitFor(() => expect(screen.getByText("66%")).toBeInTheDocument());

    const pacing = screen.getByLabelText("Pacing analytics");
    expect(pacing).toHaveTextContent("answered");
    expect(pacing).toHaveTextContent("changed");
    expect(pacing).toHaveTextContent("flagged");

    expect(screen.getByLabelText("Section results")).toHaveTextContent(
      "Diagnostic — MBE",
    );
    expect(screen.getByLabelText("Question review")).toHaveTextContent(
      "your answer",
    );
  });
});
