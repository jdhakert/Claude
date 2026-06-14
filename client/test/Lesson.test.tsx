import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LessonView } from "../src/api/types";

const lessonMock = vi.fn();
const startMock = vi.fn().mockResolvedValue({});
const completeMock = vi
  .fn()
  .mockResolvedValue({ status: "completed", timeSpentSeconds: 5 });

vi.mock("../src/api/client", () => ({
  api: {
    lesson: () => lessonMock(),
    startLesson: () => startMock(),
    completeLesson: (id: string, secs: number) => completeMock(id, secs),
  },
  ApiError: class ApiError extends Error {},
}));

import { Lesson } from "../src/routes/Lesson";

const view: LessonView = {
  lesson: {
    id: "L1",
    title: "Hearsay Basics",
    licenseStatus: "cleared",
    preview: false,
  },
  blocks: [
    { id: "b1", kind: "text", body: { text: "Hearsay is..." } },
    { id: "b2", kind: "checklist", body: { title: "Steps", items: ["A"] } },
  ],
  progress: {
    status: "not_started",
    timeSpentSeconds: 0,
    startedAt: null,
    completedAt: null,
  },
};

function renderLesson() {
  return render(
    <MemoryRouter initialEntries={["/lessons/L1"]}>
      <Routes>
        <Route path="/lessons/:lessonId" element={<Lesson />} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  lessonMock.mockReset();
  startMock.mockClear();
  completeMock.mockClear();
});

describe("Lesson page", () => {
  it("renders blocks and records a start", async () => {
    lessonMock.mockResolvedValue(view);
    renderLesson();
    await waitFor(() =>
      expect(screen.getByText("Hearsay Basics")).toBeInTheDocument(),
    );
    expect(screen.getByText("Hearsay is...")).toBeInTheDocument();
    await waitFor(() => expect(startMock).toHaveBeenCalled());
  });

  it("completes the lesson, sending time spent", async () => {
    lessonMock.mockResolvedValue(view);
    renderLesson();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /mark complete/i }),
      ).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: /mark complete/i }));
    await waitFor(() => expect(completeMock).toHaveBeenCalled());
    expect(completeMock.mock.calls[0]![0]).toBe("L1");
    expect(typeof completeMock.mock.calls[0]![1]).toBe("number");
    expect(screen.getByText(/lesson completed/i)).toBeInTheDocument();
  });
});
