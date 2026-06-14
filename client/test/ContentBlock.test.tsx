import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ContentBlock as Block } from "../src/api/types";
import { ContentBlock } from "../src/components/ContentBlock";

function block(kind: Block["kind"], body: Record<string, unknown>): Block {
  return { id: `b-${kind}`, kind, body };
}

describe("ContentBlock renderer", () => {
  it("renders text, rule, and callout/warning blocks", () => {
    render(<ContentBlock block={block("text", { text: "Hello text" })} />);
    expect(screen.getByText("Hello text")).toBeInTheDocument();

    render(
      <ContentBlock
        block={block("rule_statement", { statement: "The rule" })}
      />,
    );
    expect(screen.getByText(/The rule/)).toBeInTheDocument();

    render(
      <ContentBlock
        block={block("callout", { variant: "warning", text: "Careful" })}
      />,
    );
    // Warning callouts use role=alert for screen readers.
    expect(screen.getByRole("alert")).toHaveTextContent(/Careful/);
  });

  it("renders a checklist with interactive items", () => {
    render(
      <ContentBlock
        block={block("checklist", { title: "Steps", items: ["One", "Two"] })}
      />,
    );
    expect(screen.getByText("Steps")).toBeInTheDocument();
    expect(screen.getByLabelText("One")).toBeInTheDocument();
    expect(screen.getAllByRole("checkbox")).toHaveLength(2);
  });

  it("renders a mini quiz with radio choices", () => {
    render(
      <ContentBlock
        block={block("mini_quiz", {
          question: "Pick one",
          choices: ["A", "B", "C"],
          correctIndex: 0,
        })}
      />,
    );
    expect(screen.getByText("Pick one")).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(3);
  });

  it("renders video and outline-download placeholders", () => {
    render(<ContentBlock block={block("video", { title: "Lecture" })} />);
    expect(screen.getByText(/Lecture/)).toBeInTheDocument();

    render(
      <ContentBlock
        block={block("outline_download", { title: "Attack outline" })}
      />,
    );
    expect(screen.getByText(/Attack outline/)).toBeInTheDocument();
  });

  it("renders an example block", () => {
    render(
      <ContentBlock
        block={block("example", {
          prompt: "Facts here",
          analysis: "Apply law",
        })}
      />,
    );
    expect(screen.getByText("Facts here")).toBeInTheDocument();
    expect(screen.getByText("Apply law")).toBeInTheDocument();
  });
});
