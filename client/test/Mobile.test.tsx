import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DueCard } from "../src/api/types";

/** jsdom lets us pretend to be a given viewport width. */
function setViewport(width: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: width,
  });
}
const PHONE = 375;
const DESKTOP = 1280;

afterEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe("MobileExamNotice", () => {
  it("recommends desktop/tablet on a phone-sized screen", async () => {
    setViewport(PHONE);
    const { MobileExamNotice } =
      await import("../src/components/MobileExamNotice");
    render(<MobileExamNotice />);
    expect(screen.getByRole("note")).toHaveTextContent(/desktop or tablet/i);
  });

  it("stays out of the way on a desktop screen", async () => {
    setViewport(DESKTOP);
    const { MobileExamNotice } =
      await import("../src/components/MobileExamNotice");
    render(<MobileExamNotice />);
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });
});

describe("InstallPrompt", () => {
  beforeEach(() => setViewport(PHONE));

  it("shows iOS Add-to-Home-Screen guidance on an iPhone", async () => {
    Object.defineProperty(window.navigator, "userAgent", {
      configurable: true,
      value:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
    });
    const { InstallPrompt } = await import("../src/components/InstallPrompt");
    render(<InstallPrompt />);
    await waitFor(() =>
      expect(screen.getByText(/add to home screen/i)).toBeInTheDocument(),
    );
    // Dismissing hides it and persists the choice.
    fireEvent.click(screen.getByRole("button", { name: /not now/i }));
    expect(screen.queryByText(/add to home screen/i)).not.toBeInTheDocument();
    expect(localStorage.getItem("br_install_dismissed_v1")).toBe("1");
  });
});

// Flashcards should feel app-like on a phone: tap to flip, big rating buttons.
describe("Flashcards on mobile", () => {
  const card: DueCard = {
    reviewId: "r1",
    stage: "recognize",
    front: "Hearsay definition?",
    back: "Out-of-court statement offered for its truth.",
    isRule: false,
  };

  it("flips and rates a due card at phone width", async () => {
    setViewport(PHONE);
    const reviewCardMock = vi.fn().mockResolvedValue({ intervalDays: 3 });
    vi.doMock("../src/api/client", () => ({
      api: {
        srsDue: () => Promise.resolve({ cards: [card] }),
        srsStats: () =>
          Promise.resolve({ totalReviews: 1, accuracy: 1, history: [] }),
        reviewCard: (id: string, r: string) => reviewCardMock(id, r),
        courses: () => Promise.resolve({ courses: [] }),
        rules: () => Promise.resolve({ rules: [] }),
        outlines: () => Promise.resolve({ outlines: [] }),
      },
      ApiError: class ApiError extends Error {},
    }));
    const { Review } = await import("../src/routes/Review");
    render(
      <MemoryRouter>
        <Review />
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(screen.getByText(/hearsay definition/i)).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: /show answer/i }));
    expect(screen.getByText(/out-of-court statement/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^good$/i }));
    await waitFor(() =>
      expect(reviewCardMock).toHaveBeenCalledWith("r1", "good"),
    );
    vi.doUnmock("../src/api/client");
  });
});
