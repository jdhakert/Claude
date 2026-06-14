import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

// Avoid the network call AuthProvider would make; provide a fixed user.
vi.mock("../src/auth/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "u1", email: "demo.student@example.com", roles: ["student"] },
    loading: false,
    login: vi.fn(),
    logout: vi.fn(),
  }),
}));

import { AppLayout } from "../src/components/AppLayout";

function renderLayout() {
  return render(
    <MemoryRouter>
      <AppLayout>
        <p>content</p>
      </AppLayout>
    </MemoryRouter>,
  );
}

describe("AppLayout responsive shell", () => {
  it("renders the brand, the signed-in user, and a logout control", () => {
    renderLayout();
    expect(screen.getByText("BarReady")).toBeInTheDocument();
    expect(screen.getByText("demo.student@example.com")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /log out/i }),
    ).toBeInTheDocument();
  });

  it("renders BOTH navigation regions (desktop sidebar + mobile bottom bar)", () => {
    renderLayout();
    // Two <nav aria-label="Primary"> regions exist; CSS shows one per breakpoint.
    const navs = screen.getAllByRole("navigation", { name: /primary/i });
    expect(navs).toHaveLength(2);
    // The active "Today" destination is present in the nav.
    expect(screen.getAllByText("Today").length).toBeGreaterThanOrEqual(2);
  });
});
