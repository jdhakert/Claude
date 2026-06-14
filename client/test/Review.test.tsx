import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DueCard } from "../src/api/types";

const srsDueMock = vi.fn();
const srsStatsMock = vi
  .fn()
  .mockResolvedValue({ totalReviews: 3, accuracy: 0.67, history: [] });
const reviewCardMock = vi.fn().mockResolvedValue({ intervalDays: 3 });

vi.mock("../src/api/client", () => ({
  api: {
    srsDue: () => srsDueMock(),
    srsStats: () => srsStatsMock(),
    reviewCard: (id: string, r: string) => reviewCardMock(id, r),
    courses: () => Promise.resolve({ courses: [] }),
    rules: () => Promise.resolve({ rules: [] }),
    outlines: () => Promise.resolve({ outlines: [] }),
  },
  ApiError: class ApiError extends Error {},
}));

import { Review } from "../src/routes/Review";

const card: DueCard = {
  reviewId: "r1",
  stage: "recognize",
  front: "Elements of a present sense impression?",
  back: "Describes event; contemporaneous.",
  isRule: false,
};

function renderReview() {
  return render(
    <MemoryRouter>
      <Review />
    </MemoryRouter>,
  );
}

afterEach(() => vi.clearAllMocks());

describe("Review hub — due cards", () => {
  it("shows a due card, flips it, and records a rating", async () => {
    srsDueMock.mockResolvedValue({ cards: [card] });
    renderReview();

    await waitFor(() =>
      expect(screen.getByText(/present sense impression/i)).toBeInTheDocument(),
    );
    // Answer hidden until flipped.
    expect(screen.queryByText(/contemporaneous/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /show answer/i }));
    expect(screen.getByText(/contemporaneous/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^good$/i }));
    await waitFor(() =>
      expect(reviewCardMock).toHaveBeenCalledWith("r1", "good"),
    );
  });

  it("shows an all-caught-up state when nothing is due", async () => {
    srsDueMock.mockResolvedValue({ cards: [] });
    renderReview();
    await waitFor(() =>
      expect(screen.getByText(/all caught up/i)).toBeInTheDocument(),
    );
  });
});
