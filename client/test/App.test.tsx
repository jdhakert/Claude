import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { App } from "../src/App";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe("App routing", () => {
  it("renders the landing page at /", () => {
    renderAt("/");
    expect(
      screen.getByRole("heading", { name: /barready/i, level: 1 }),
    ).toBeInTheDocument();
  });

  it("renders a not-found page for unknown routes", () => {
    renderAt("/does-not-exist");
    expect(
      screen.getByRole("heading", { name: /page not found/i }),
    ).toBeInTheDocument();
  });
});
