import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CmsItem, CmsSummary } from "../src/api/types";

const dashMock = vi.fn();
const listMock = vi.fn();
const transitionMock = vi.fn().mockResolvedValue({ content: {} });

vi.mock("../src/api/client", () => ({
  api: {
    cmsDashboard: () => dashMock(),
    cmsList: (...a: unknown[]) => listMock(...a),
    cmsTransition: (...a: unknown[]) => transitionMock(...a),
  },
  ApiError: class ApiError extends Error {},
}));

import { AdminCms } from "../src/routes/admin/AdminCms";

const summary: CmsSummary[] = [
  {
    kind: "question",
    label: "Question",
    total: 3,
    byStatus: { published: 2, draft: 1 },
  },
  { kind: "lesson", label: "Lesson", total: 1, byStatus: { published: 1 } },
];

const items: CmsItem[] = [
  {
    kind: "question",
    id: "q1",
    title: "A balloon hearsay question",
    contentStatus: "approved",
    licenseStatus: "in_review",
    provenance: "original",
    jurisdiction: "ube",
    version: 1,
    authorId: "a1",
    reviewerId: "r1",
  },
];

afterEach(() => vi.clearAllMocks());

describe("AdminCms", () => {
  it("shows library status counts and offers lifecycle actions per status", async () => {
    dashMock.mockResolvedValue({ summary });
    listMock.mockResolvedValue({ items });
    render(
      <MemoryRouter>
        <AdminCms />
      </MemoryRouter>,
    );

    // Dashboard counts.
    await waitFor(() =>
      expect(screen.getByLabelText("Content dashboard")).toHaveTextContent(
        "Question",
      ),
    );

    // The approved item offers a "publish" action.
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /^publish$/i }),
      ).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: /^publish$/i }));
    await waitFor(() =>
      expect(transitionMock).toHaveBeenCalledWith("question", "q1", "publish"),
    );
  });
});
