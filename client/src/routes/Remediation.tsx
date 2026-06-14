import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { AttemptReview, Confidence, RemediationSet } from "../api/types";
import { useAsync } from "../hooks/useAsync";
import { EmptyState, ErrorState, LoadingState } from "../components/states";

const CONFIDENCE: Confidence[] = ["guessing", "low", "medium", "high"];

/** Smart Remediation Set runner — targeted practice on the student's weak issues. */
export function Remediation() {
  const { status, data, error, reload } = useAsync<RemediationSet>(
    () => api.remediationSet(),
    [],
  );
  if (status === "loading") return <LoadingState label="Building your set…" />;
  if (status === "error")
    return <ErrorState message={error.message} onRetry={reload} />;
  if (!data.items.length)
    return (
      <EmptyState
        title="Nothing to remediate right now."
        hint="Answer some questions so we can find your weak spots."
      />
    );

  return (
    <div className="page">
      <h1>Smart remediation</h1>
      <p className="muted">
        Targeted at your weakest issues:{" "}
        {data.issues.map((i) => i.name).join(", ")}
      </p>
      {data.items.map((item, i) => (
        <RemediationItem key={item.id} item={item} index={i + 1} />
      ))}
      <Link className="cta" to="/dashboard">
        Back to today
      </Link>
    </div>
  );
}

function RemediationItem({
  item,
  index,
}: {
  item: RemediationSet["items"][number];
  index: number;
}) {
  const [confidence, setConfidence] = useState<Confidence | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [review, setReview] = useState<AttemptReview | null>(null);

  async function submit() {
    if (!confidence || !selected) return;
    setReview(
      await api.submitAttempt({
        itemId: item.id,
        selectedChoiceId: selected,
        confidence,
        timeMs: 0,
        mode: "tutor",
      }),
    );
  }

  return (
    <section className="card">
      <p className="question__stem">
        <strong>Q{index}.</strong> {item.stem}
      </p>
      {!review ? (
        <>
          <fieldset className="question__confidence">
            <legend>Confidence</legend>
            {CONFIDENCE.map((c) => (
              <label key={c}>
                <input
                  type="radio"
                  name={`c-${item.id}`}
                  checked={confidence === c}
                  onChange={() => setConfidence(c)}
                />
                {c}
              </label>
            ))}
          </fieldset>
          <ul className="question__choices">
            {item.choices.map((c) => (
              <li key={c.id}>
                <label className={selected === c.id ? "selected" : ""}>
                  <input
                    type="radio"
                    name={`q-${item.id}`}
                    disabled={!confidence}
                    checked={selected === c.id}
                    onChange={() => setSelected(c.id)}
                  />
                  <strong>{c.label}.</strong> {c.body}
                </label>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!selected}
          >
            Submit
          </button>
        </>
      ) : (
        <div className="review">
          <p
            className={`review__verdict ${review.isCorrect ? "review__verdict--ok" : "review__verdict--no"}`}
          >
            {review.isCorrect ? "✓ Correct" : "✗ Incorrect"}
          </p>
          {review.ruleTakeaway && (
            <blockquote className="block block--rule">
              {review.ruleTakeaway}
            </blockquote>
          )}
          {review.explanation && <p>{review.explanation}</p>}
        </div>
      )}
    </section>
  );
}
