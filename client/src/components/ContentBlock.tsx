import type { ContentBlock as Block } from "../api/types";

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

/** Renders a single structural content block by its kind (Phase 8 §3). */
export function ContentBlock({ block }: { block: Block }) {
  const b = block.body;
  switch (block.kind) {
    case "text":
      return <p className="block block--text">{asString(b.text)}</p>;

    case "rule_statement":
      return (
        <blockquote className="block block--rule">
          <strong>Rule. </strong>
          {asString(b.statement)}
        </blockquote>
      );

    case "checklist":
      return (
        <div className="block block--checklist">
          {b.title ? <h3>{asString(b.title)}</h3> : null}
          <ul>
            {asArray(b.items).map((it, i) => (
              <li key={i}>
                <input type="checkbox" id={`${block.id}-${i}`} />
                <label htmlFor={`${block.id}-${i}`}>{asString(it)}</label>
              </li>
            ))}
          </ul>
        </div>
      );

    case "example":
      return (
        <div className="block block--example">
          <h3>Example</h3>
          <p className="block--example__prompt">{asString(b.prompt)}</p>
          <p>{asString(b.analysis)}</p>
        </div>
      );

    case "mini_quiz":
      return (
        <fieldset className="block block--quiz">
          <legend>Quick check</legend>
          <p>{asString(b.question)}</p>
          <ul>
            {asArray(b.choices).map((c, i) => (
              <li key={i}>
                <label>
                  <input type="radio" name={`quiz-${block.id}`} /> {asString(c)}
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      );

    case "video":
      return (
        <div
          className="block block--video"
          role="img"
          aria-label="Video placeholder"
        >
          <span aria-hidden="true">▶</span>
          <span>{asString(b.title) || "Video"} (placeholder)</span>
        </div>
      );

    case "outline_download":
      return (
        <div className="block block--download">
          <span aria-hidden="true">⬇</span>
          <span>{asString(b.title) || "Outline"}</span>
          <span className="muted"> (download placeholder)</span>
        </div>
      );

    case "callout": {
      const variant = asString(b.variant) || "info";
      return (
        <div
          className={`block block--callout block--callout--${variant}`}
          role={variant === "warning" ? "alert" : "note"}
        >
          <strong>{variant === "warning" ? "⚠ Warning" : "Note"}: </strong>
          {asString(b.text)}
        </div>
      );
    }

    default:
      return null;
  }
}
