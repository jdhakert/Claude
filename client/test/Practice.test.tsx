import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AttemptReview, PracticeItem } from "../src/api/types";

const coursesMock = vi.fn();
const taxonomyMock = vi.fn();
const itemsMock = vi.fn();
const submitMock = vi.fn();
const journalMock = vi.fn().mockResolvedValue({ entry: { id: "e1" } });
const flashcardMock = vi.fn().mockResolvedValue({ flashcard: { id: "f1" } });

vi.mock("../src/api/client", () => ({
  api: {
    courses: () => coursesMock(),
    practiceTaxonomy: () => taxonomyMock(),
    practiceItems: () => itemsMock(),
    submitAttempt: (input: unknown) => submitMock(input),
    addErrorJournal: (input: unknown) => journalMock(input),
    createFlashcard: (input: unknown) => flashcardMock(input),
  },
  ApiError: class ApiError extends Error {},
}));

import { Practice } from "../src/routes/Practice";

const item: PracticeItem = {
  id: "i1",
  stem: "Is this hearsay?",
  subject: "Evidence",
  subtopic: "Hearsay",
  choices: [
    { id: "c1", label: "A", body: "Yes" },
    { id: "c2", label: "B", body: "No" },
  ],
};

const review: AttemptReview = {
  attemptId: "a1",
  isCorrect: true,
  correctChoiceId: "c1",
  confidence: "medium",
  issue: { id: "is1", name: "Present sense impression" },
  ruleTakeaway: "The rule takeaway text.",
  explanation: "The explanation.",
  choices: [
    {
      id: "c1",
      label: "A",
      body: "Yes",
      isCorrect: true,
      rationale: "Right because.",
    },
    {
      id: "c2",
      label: "B",
      body: "No",
      isCorrect: false,
      rationale: "Wrong because.",
    },
  ],
};

function renderPractice() {
  return render(
    <MemoryRouter>
      <Practice />
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("Practice flow", () => {
  it("requires confidence before answers can be selected, then shows review", async () => {
    coursesMock.mockResolvedValue({
      courses: [{ id: "course1", title: "UBE", enrolled: true }],
    });
    taxonomyMock.mockResolvedValue({
      subjects: [{ id: "s1", name: "Evidence", subtopics: [] }],
    });
    itemsMock.mockResolvedValue({ items: [item] });
    submitMock.mockResolvedValue(review);

    renderPractice();

    // Start the set.
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /start practice/i }),
      ).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: /start practice/i }));

    // Question shows; answer radios are disabled until confidence is chosen.
    await waitFor(() =>
      expect(screen.getByText("Is this hearsay?")).toBeInTheDocument(),
    );
    const answerRadios = screen.getAllByRole("radio", { name: /Yes|No/ });
    expect((answerRadios[0] as HTMLInputElement).disabled).toBe(true);

    // Choose confidence → answers enable.
    fireEvent.click(screen.getByRole("radio", { name: /Medium/i }));
    expect(
      (screen.getAllByRole("radio", { name: /Yes|No/ })[0] as HTMLInputElement)
        .disabled,
    ).toBe(false);

    // Answer and submit → review panel appears with rationale + rule takeaway.
    fireEvent.click(screen.getByRole("radio", { name: /Yes/ }));
    fireEvent.click(screen.getByRole("button", { name: /submit answer/i }));

    await waitFor(() =>
      expect(screen.getByText(/Correct/)).toBeInTheDocument(),
    );
    expect(screen.getByText(/The rule takeaway text/)).toBeInTheDocument();
    expect(screen.getByText(/Right because\./)).toBeInTheDocument();
    expect(screen.getByText(/Wrong because\./)).toBeInTheDocument();

    // Submit carried the confidence rating.
    expect(submitMock.mock.calls[0]![0]).toMatchObject({
      itemId: "i1",
      selectedChoiceId: "c1",
      confidence: "medium",
    });
  });

  it("adds to the error journal and converts to a flashcard from review", async () => {
    coursesMock.mockResolvedValue({
      courses: [{ id: "course1", title: "UBE", enrolled: true }],
    });
    taxonomyMock.mockResolvedValue({ subjects: [] });
    itemsMock.mockResolvedValue({ items: [item] });
    submitMock.mockResolvedValue({ ...review, isCorrect: false });

    renderPractice();
    fireEvent.click(
      await screen.findByRole("button", { name: /start practice/i }),
    );
    await screen.findByText("Is this hearsay?");
    fireEvent.click(screen.getByRole("radio", { name: /High/i }));
    fireEvent.click(screen.getByRole("radio", { name: /No/ }));
    fireEvent.click(screen.getByRole("button", { name: /submit answer/i }));

    await screen.findByText(/Incorrect/);
    fireEvent.click(
      screen.getByRole("button", { name: /add to error journal/i }),
    );
    await waitFor(() => expect(journalMock).toHaveBeenCalled());

    fireEvent.click(
      screen.getByRole("button", { name: /convert to flashcard/i }),
    );
    await waitFor(() => expect(flashcardMock).toHaveBeenCalled());
  });
});
