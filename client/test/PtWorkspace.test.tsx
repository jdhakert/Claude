import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PtSubmitResult, PtTaskDetail } from "../src/api/types";

const taskMock = vi.fn();
const submitMock = vi.fn();
const selfMock = vi.fn().mockResolvedValue({ submissionId: "s1" });

vi.mock("../src/api/client", () => ({
  api: {
    ptTask: () => taskMock(),
    submitPt: (id: string, input: unknown) => submitMock(id, input),
    selfAssessPt: (id: string, scores: unknown) => selfMock(id, scores),
  },
  ApiError: class ApiError extends Error {},
}));

import { PtWorkspace } from "../src/routes/pt/PtWorkspace";

const task: PtTaskDetail = {
  id: "pt1",
  title: "Persuasive Memo",
  instructions: "Draft a memo using only the File and Library.",
  expectedProduct: "Persuasive memorandum",
  timeLimitMinutes: 90,
  files: [
    { name: "f1", title: "File: Intake Memo", body: "Client facts here." },
  ],
  library: [
    { name: "l1", title: "Library: Code §80", body: "Hearsay rule text." },
  ],
  rubric: ["organization", "rule_extraction", "fact_use"],
};

const result: PtSubmitResult = {
  submissionId: "sub1",
  modelWorkProduct: "MEMORANDUM ... model product.",
  issueChecklist: [],
  rubric: task.rubric,
};

function renderWs() {
  return render(
    <MemoryRouter initialEntries={["/pt/pt1"]}>
      <Routes>
        <Route path="/pt/:taskId" element={<PtWorkspace />} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => vi.clearAllMocks());

describe("PtWorkspace", () => {
  it("renders split-screen docs + editor + timer, switches docs, and submits", async () => {
    taskMock.mockResolvedValue(task);
    submitMock.mockResolvedValue(result);
    renderWs();

    await waitFor(() =>
      expect(screen.getByText("Persuasive Memo")).toBeInTheDocument(),
    );
    expect(screen.getByRole("timer")).toBeInTheDocument();

    // Documents: File shown first; switch to Library tab.
    expect(screen.getByText("Client facts here.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /Library: Code/ }));
    expect(screen.getByText("Hearsay rule text.")).toBeInTheDocument();

    // Write and submit the work product.
    fireEvent.change(screen.getByLabelText("Work product"), {
      target: { value: "My memorandum analysis." },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /submit work product/i }),
    );

    await waitFor(() =>
      expect(screen.getByText(/model product/i)).toBeInTheDocument(),
    );
    expect(submitMock.mock.calls[0]![1]).toHaveProperty("timeSpentSeconds");

    // Self-assess across PT dimensions.
    fireEvent.click(
      screen.getByRole("button", { name: /save self-assessment/i }),
    );
    await waitFor(() => expect(selfMock).toHaveBeenCalled());
  });
});
