import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EssayPromptDetail, EssaySubmitResult } from "../src/api/types";

const essayMock = vi.fn();
const submitMock = vi.fn();
const selfAssessMock = vi.fn().mockResolvedValue({ missedIssueIds: ["x"] });

vi.mock("../src/api/client", () => ({
  api: {
    essay: () => essayMock(),
    submitEssay: (id: string, input: unknown) => submitMock(id, input),
    selfAssessEssay: (id: string, input: unknown) => selfAssessMock(id, input),
  },
  ApiError: class ApiError extends Error {},
}));

import { EssayWriter } from "../src/routes/essay/EssayWriter";

const prompt: EssayPromptDetail = {
  id: "e1",
  prompt: "Discuss whether the statement is admissible.",
  timeLimitMinutes: 30,
  rubric: [
    { id: "r1", dimension: "issue_spotting", description: null, maxScore: 5 },
    { id: "r2", dimension: "organization", description: null, maxScore: 5 },
  ],
};

const submitResult: EssaySubmitResult = {
  submissionId: "sub1",
  modelAnswer: "Define hearsay, then analyze the exception.",
  issueChecklist: [{ id: "i1", name: "Present sense impression" }],
  rubric: prompt.rubric,
};

function renderWriter() {
  return render(
    <MemoryRouter initialEntries={["/essays/e1"]}>
      <Routes>
        <Route path="/essays/:essayId" element={<EssayWriter />} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => vi.clearAllMocks());

describe("EssayWriter", () => {
  it("shows the prompt + timer, submits a timed essay, then reveals the model answer", async () => {
    essayMock.mockResolvedValue(prompt);
    submitMock.mockResolvedValue(submitResult);
    renderWriter();

    await waitFor(() =>
      expect(
        screen.getByText(/whether the statement is admissible/i),
      ).toBeInTheDocument(),
    );
    expect(screen.getByRole("timer")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Essay answer"), {
      target: { value: "My analysis of the hearsay issue." },
    });
    fireEvent.click(screen.getByRole("button", { name: /submit essay/i }));

    // Reveal: model answer + issue checklist + rubric self-assessment.
    await waitFor(() =>
      expect(screen.getByText(/Define hearsay/)).toBeInTheDocument(),
    );
    expect(screen.getByText("Present sense impression")).toBeInTheDocument();

    // Submit carried elapsed time.
    expect(submitMock.mock.calls[0]![1]).toHaveProperty("timeSpentSeconds");

    // Self-assess and save.
    fireEvent.click(
      screen.getByRole("button", { name: /save self-assessment/i }),
    );
    await waitFor(() => expect(selfAssessMock).toHaveBeenCalled());
    expect(screen.getByText(/issue\(s\) missed/i)).toBeInTheDocument();
  });
});
