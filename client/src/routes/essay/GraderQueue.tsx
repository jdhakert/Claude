import { useState } from "react";
import { api } from "../../api/client";
import type { EssaySubmission } from "../../api/types";
import { useAsync } from "../../hooks/useAsync";
import { EmptyState, ErrorState, LoadingState } from "../../components/states";

const DIMENSIONS = [
  "issue_spotting",
  "rule_statement",
  "application",
  "organization",
  "time_management",
];

export function GraderQueue() {
  const queue = useAsync(() => api.graderQueue(), []);
  const [openId, setOpenId] = useState<string | null>(null);

  if (queue.status === "loading") return <LoadingState />;
  if (queue.status === "error")
    return <ErrorState message={queue.error.message} onRetry={queue.reload} />;
  if (!queue.data.submissions.length)
    return <EmptyState title="No submissions awaiting grading." />;

  return (
    <div className="page">
      <h1>Grading queue</h1>
      <ul className="lesson-list">
        {queue.data.submissions.map((s) => (
          <li key={s.id}>
            <span>Submission {s.id.slice(0, 8)}</span>
            <span className="muted">{s.gradedAt ? "graded" : "awaiting"}</span>
            <button type="button" onClick={() => setOpenId(s.id)}>
              Open
            </button>
          </li>
        ))}
      </ul>
      {openId && (
        <GradeForm
          submissionId={openId}
          onGraded={() => {
            setOpenId(null);
            queue.reload();
          }}
        />
      )}
    </div>
  );
}

function GradeForm({
  submissionId,
  onGraded,
}: {
  submissionId: string;
  onGraded: () => void;
}) {
  const sub = useAsync<{ submission: EssaySubmission }>(
    () => api.graderSubmission(submissionId),
    [submissionId],
  );
  const [scores, setScores] = useState<Record<string, number>>({});
  const [comment, setComment] = useState("");
  const [rule, setRule] = useState("");
  const [saving, setSaving] = useState(false);

  if (sub.status === "loading") return <LoadingState />;
  if (sub.status === "error")
    return <ErrorState message={sub.error.message} onRetry={sub.reload} />;

  async function grade() {
    setSaving(true);
    try {
      await api.gradeEssay(submissionId, {
        scores: DIMENSIONS.map((d) => ({
          dimension: d,
          score: scores[d] ?? 0,
        })),
        comment,
        ruleWeaknesses: rule ? rule.split(",").map((r) => r.trim()) : [],
      });
      onGraded();
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="card">
      <h2>Grade submission</h2>
      <p className="muted essay-answer">{sub.data.submission.responseText}</p>
      {DIMENSIONS.map((d) => (
        <div key={d} className="rubric-row">
          <span>{d.replace(/_/g, " ")}</span>
          <select
            aria-label={d}
            value={scores[d] ?? 0}
            onChange={(e) =>
              setScores({ ...scores, [d]: Number(e.target.value) })
            }
          >
            {[0, 1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}/5
              </option>
            ))}
          </select>
        </div>
      ))}
      <label className="grade-field">
        Comment
        <textarea
          value={comment}
          rows={3}
          onChange={(e) => setComment(e.target.value)}
        />
      </label>
      <label className="grade-field">
        Rule weaknesses (comma-separated)
        <input value={rule} onChange={(e) => setRule(e.target.value)} />
      </label>
      <button type="button" onClick={() => void grade()} disabled={saving}>
        {saving ? "Saving…" : "Return feedback"}
      </button>
    </section>
  );
}
