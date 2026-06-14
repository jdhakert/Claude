import { useParams } from "react-router-dom";
import { api } from "../../api/client";
import { useAsync } from "../../hooks/useAsync";
import { ErrorState, LoadingState } from "../../components/states";

function pct(n: number | null): string {
  return n == null ? "—" : `${Math.round(n * 100)}%`;
}

export function ExamResults() {
  const { attemptId } = useParams();
  const { status, data, error, reload } = useAsync(
    () => api.examResults(attemptId!),
    [attemptId],
  );

  if (status === "loading") return <LoadingState label="Scoring…" />;
  if (status === "error")
    return <ErrorState message={error.message} onRetry={reload} />;

  const { attempt, sectionResults, review } = data;
  const p = attempt.pacing;

  return (
    <div className="page">
      <h1>{attempt.examTitle} — results</h1>

      <section className="card card--hero">
        <div>
          <h2>Score</h2>
          <p className="hero__readiness">{pct(attempt.rawScorePct)}</p>
        </div>
      </section>

      {/* Pacing analytics */}
      {p && (
        <section className="card" aria-label="Pacing analytics">
          <h2>Pacing</h2>
          <ul className="pacing">
            <li>
              <span>{p.totalQuestions}</span> questions
            </li>
            <li>
              <span>{p.answered}</span> answered
            </li>
            <li>
              <span>{p.unanswered}</span> unanswered
            </li>
            <li>
              <span>{p.changedAnswers}</span> changed
            </li>
            <li>
              <span>{p.flaggedCount}</span> flagged
            </li>
            <li>
              <span>{p.avgSecondsPerItem}s</span> avg / question
            </li>
          </ul>
        </section>
      )}

      {/* Section completion */}
      <section className="card" aria-label="Section results">
        <h2>By section</h2>
        <ul className="lesson-list">
          {sectionResults.map((s) => (
            <li key={s.examSectionId}>
              <span>{s.title}</span>
              <span className="muted">{s.kind}</span>
              <span>
                {s.total > 0
                  ? `${s.correct}/${s.total} (${pct(s.scorePct)})`
                  : "—"}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* Post-exam review */}
      <section className="card" aria-label="Question review">
        <h2>Review</h2>
        {review.map((q, i) => (
          <div key={q.itemId} className="exam-review__q">
            <p>
              <strong>Q{i + 1}.</strong> {q.stem}{" "}
              <span
                className={`status-tag status-tag--${q.isCorrect ? "completed" : "scheduled"}`}
              >
                {q.isCorrect ? "Correct" : "Incorrect"}
              </span>
              {q.flagged && (
                <span className="badge badge--preview">flagged</span>
              )}
            </p>
            <ul className="review__choices">
              {q.choices.map((c) => (
                <li
                  key={c.id}
                  className={c.isCorrect ? "review__choice--correct" : ""}
                >
                  <strong>{c.label}.</strong> {c.body}
                  {c.id === q.selectedChoiceId && " ← your answer"}
                  {c.rationale && <p className="muted">{c.rationale}</p>}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
}
