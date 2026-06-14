import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AttemptReview, RemediationSet } from "../src/api/types";

const setMock = vi.fn();
const submitMock = vi.fn();
vi.mock("../src/api/client", () => ({
  api: {
    remediationSet: () => setMock(),
    submitAttempt: (input: unknown) => submitMock(input),
  },
  ApiError: class ApiError extends Error {},
}));

import { Remediation } from "../src/routes/Remediation";

const set: RemediationSet = {
  issues: [{ id: "i1", name: "Present sense impression" }],
  items: [
    {
      id: "it1",
      stem: "Is the bystander statement admissible?",
      choices: [
        { id: "c1", label: "A", body: "Yes" },
        { id: "c2", label: "B", body: "No" },
      ],
    },
  ],
};

const review: AttemptReview = {
  attemptId: "a1",
  isCorrect: true,
  correctChoiceId: "c1",
  confidence: "medium",
  issue: { id: "i1", name: "Present sense impression" },
  ruleTakeaway: "PSI admits a contemporaneous description.",
  explanation: "Because it was contemporaneous.",
  choices: [],
};

function renderRemediation() {
  return render(
    <MemoryRouter>
      <Remediation />
    </MemoryRouter>,
  );
}

afterEach(() => vi.clearAllMocks());

describe("Smart Remediation runner", () => {
  it("targets weak issues and answers a question through graded practice", async () => {
    setMock.mockResolvedValue(set);
    submitMock.mockResolvedValue(review);
    renderRemediation();

    await waitFor(() =>
      expect(screen.getByText(/Smart remediation/i)).toBeInTheDocument(),
    );
    // Shows the targeted weak issue.
    expect(
      screen.getByText(/Targeted at your weakest issues/i),
    ).toHaveTextContent("Present sense impression");

    // Answer requires confidence first, then submits + shows the rule takeaway.
    fireEvent.click(screen.getByRole("radio", { name: /medium/i }));
    fireEvent.click(screen.getByRole("radio", { name: /Yes/ }));
    fireEvent.click(screen.getByRole("button", { name: /^submit$/i }));

    await waitFor(() => expect(submitMock).toHaveBeenCalled());
    expect(
      screen.getByText(/contemporaneous description/i),
    ).toBeInTheDocument();
  });

  it("shows an empty state when there's nothing to remediate", async () => {
    setMock.mockResolvedValue({ issues: [], items: [] });
    renderRemediation();
    await waitFor(() =>
      expect(
        screen.getByText(/Nothing to remediate right now/i),
      ).toBeInTheDocument(),
    );
  });
});
