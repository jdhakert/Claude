import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../../api/client";
import type { PtDoc, PtSubmitResult, PtTaskDetail } from "../../api/types";
import { useAsync } from "../../hooks/useAsync";
import { ErrorState, LoadingState } from "../../components/states";

function fmt(sec: number): string {
  const m = Math.floor(Math.abs(sec) / 60);
  const s = Math.abs(sec) % 60;
  return `${sec < 0 ? "-" : ""}${m}:${String(s).padStart(2, "0")}`;
}

export function PtWorkspace() {
  const { taskId } = useParams();
  const { status, data, error, reload } = useAsync<PtTaskDetail>(
    () => api.ptTask(taskId!),
    [taskId],
  );
  if (status === "loading") return <LoadingState label="Loading task…" />;
  if (status === "error")
    return <ErrorState message={error.message} onRetry={reload} />;
  if (!data) return null;
  return <Workspace task={data} />;
}

function DocPanel({ docs }: { docs: { files: PtDoc[]; library: PtDoc[] } }) {
  const all = [...docs.files, ...docs.library];
  const [active, setActive] = useState(0);
  const doc = all[active];
  return (
    <div className="pt-docs">
      <div className="pt-docs__tabs" role="tablist">
        {all.map((d, i) => (
          <button
            key={d.name}
            type="button"
            role="tab"
            aria-selected={i === active}
            className={i === active ? "active" : ""}
            onClick={() => setActive(i)}
          >
            {d.title}
          </button>
        ))}
      </div>
      <div className="pt-docs__body">
        {doc ? <p>{doc.body}</p> : <p className="muted">No documents.</p>}
      </div>
    </div>
  );
}

function Workspace({ task }: { task: PtTaskDetail }) {
  const [text, setText] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<PtSubmitResult | null>(null);
  const [saving, setSaving] = useState(false);
  const startedAt = useRef(Date.now());

  useEffect(() => {
    if (result) return;
    const id = setInterval(
      () => setElapsed(Math.floor((Date.now() - startedAt.current) / 1000)),
      1000,
    );
    return () => clearInterval(id);
  }, [result]);

  const remaining = task.timeLimitMinutes * 60 - elapsed;

  async function submit() {
    setSaving(true);
    try {
      setResult(
        await api.submitPt(task.id, {
          responseText: text,
          timeSpentSeconds: elapsed,
        }),
      );
    } finally {
      setSaving(false);
    }
  }

  if (result) return <SelfAssess task={task} result={result} answer={text} />;

  return (
    <div className="page pt-page">
      <div className="essay-writer__bar">
        <h1>{task.title}</h1>
        <span
          className={`exam-timer ${remaining <= 60 ? "exam-timer--low" : ""}`}
          role="timer"
        >
          ⏱ {fmt(remaining)}
        </span>
      </div>
      <p className="muted">Expected product: {task.expectedProduct}</p>
      <blockquote className="block block--rule">{task.instructions}</blockquote>

      {/* Split-screen: documents (left) + answer editor (right) */}
      <div className="pt-split">
        <DocPanel docs={{ files: task.files, library: task.library }} />
        <div className="pt-editor">
          <textarea
            className="essay-input"
            value={text}
            rows={20}
            placeholder="Draft your work product…"
            onChange={(e) => setText(e.target.value)}
            aria-label="Work product"
          />
          <button
            type="button"
            onClick={() => void submit()}
            disabled={saving || !text.trim()}
          >
            {saving ? "Submitting…" : "Submit work product"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SelfAssess({
  task,
  result,
  answer,
}: {
  task: PtTaskDetail;
  result: PtSubmitResult;
  answer: string;
}) {
  const [scores, setScores] = useState<Record<string, number>>({});
  const [done, setDone] = useState(false);
  return (
    <div className="page">
      <h1>PT self-assessment</h1>
      <section className="card">
        <h2>Your work product</h2>
        <p className="muted essay-answer">{answer}</p>
      </section>
      <section className="card">
        <h2>Model work product</h2>
        <p className="essay-answer">{result.modelWorkProduct ?? "—"}</p>
      </section>
      <section className="card">
        <h2>Rate yourself</h2>
        {task.rubric.map((d) => (
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
        {done ? (
          <p className="status-tag status-tag--completed">
            ✓ Self-assessment saved
          </p>
        ) : (
          <button
            type="button"
            onClick={async () => {
              await api.selfAssessPt(
                result.submissionId,
                task.rubric.map((d) => ({
                  dimension: d,
                  score: scores[d] ?? 0,
                })),
              );
              setDone(true);
            }}
          >
            Save self-assessment
          </button>
        )}
      </section>
    </div>
  );
}
