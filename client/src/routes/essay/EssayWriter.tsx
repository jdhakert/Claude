import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../../api/client";
import type { EssayPromptDetail, EssaySubmitResult } from "../../api/types";
import { useAsync } from "../../hooks/useAsync";
import { ErrorState, LoadingState } from "../../components/states";

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  return `${m}:${String(sec % 60).padStart(2, "0")}`;
}

export function EssayWriter() {
  const { essayId } = useParams();
  const { status, data, error, reload } = useAsync<EssayPromptDetail>(
    () => api.essay(essayId!),
    [essayId],
  );
  if (status === "loading") return <LoadingState label="Loading prompt…" />;
  if (status === "error")
    return <ErrorState message={error.message} onRetry={reload} />;
  if (!data) return null;
  return <Writer prompt={data} />;
}

function Writer({ prompt }: { prompt: EssayPromptDetail }) {
  const [text, setText] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<EssaySubmitResult | null>(null);
  const [saving, setSaving] = useState(false);
  const startedAt = useRef(Date.now());

  // Timed mode: count up; show remaining against the limit.
  useEffect(() => {
    if (result) return;
    const id = setInterval(
      () => setElapsed(Math.floor((Date.now() - startedAt.current) / 1000)),
      1000,
    );
    return () => clearInterval(id);
  }, [result]);

  const remaining = prompt.timeLimitMinutes * 60 - elapsed;

  async function submit() {
    setSaving(true);
    try {
      setResult(
        await api.submitEssay(prompt.id, {
          responseText: text,
          timeSpentSeconds: elapsed,
        }),
      );
    } finally {
      setSaving(false);
    }
  }

  if (result) return <SelfAssess result={result} answer={text} />;

  return (
    <div className="page essay-writer">
      <div className="essay-writer__bar">
        <h1>Essay</h1>
        <span
          className={`exam-timer ${remaining <= 60 ? "exam-timer--low" : ""}`}
          role="timer"
        >
          ⏱ {remaining >= 0 ? fmt(remaining) : `-${fmt(-remaining)}`}
        </span>
      </div>
      <blockquote className="block block--rule">{prompt.prompt}</blockquote>
      <textarea
        className="essay-input"
        value={text}
        rows={16}
        placeholder="Write your answer…"
        onChange={(e) => setText(e.target.value)}
        aria-label="Essay answer"
      />
      <button
        type="button"
        onClick={() => void submit()}
        disabled={saving || !text.trim()}
      >
        {saving ? "Submitting…" : "Submit essay"}
      </button>
    </div>
  );
}

function SelfAssess({
  result,
  answer,
}: {
  result: EssaySubmitResult;
  answer: string;
}) {
  const [scores, setScores] = useState<Record<string, number>>({});
  const [spotted, setSpotted] = useState<Set<string>>(new Set());
  const [done, setDone] = useState<string[] | null>(null);

  async function save() {
    const res = await api.selfAssessEssay(result.submissionId, {
      scores: result.rubric.map((c) => ({
        dimension: c.dimension,
        score: scores[c.dimension] ?? 0,
      })),
      spottedIssueIds: [...spotted],
    });
    setDone(res.missedIssueIds);
  }

  return (
    <div className="page">
      <h1>Self-assessment</h1>

      <section className="card">
        <h2>Your answer</h2>
        <p className="muted essay-answer">{answer}</p>
      </section>

      <section className="card">
        <h2>Model answer</h2>
        <p>{result.modelAnswer ?? "No model answer provided."}</p>
      </section>

      <section className="card">
        <h2>Issue checklist — which did you spot?</h2>
        <ul className="task-list">
          {result.issueChecklist.map((i) => (
            <li key={i.id}>
              <label>
                <input
                  type="checkbox"
                  checked={spotted.has(i.id)}
                  onChange={(e) => {
                    const next = new Set(spotted);
                    if (e.target.checked) next.add(i.id);
                    else next.delete(i.id);
                    setSpotted(next);
                  }}
                />{" "}
                {i.name}
              </label>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2>Rate yourself on the rubric</h2>
        {result.rubric.map((c) => (
          <div key={c.id} className="rubric-row">
            <span>{c.dimension.replace(/_/g, " ")}</span>
            <select
              aria-label={c.dimension}
              value={scores[c.dimension] ?? 0}
              onChange={(e) =>
                setScores({ ...scores, [c.dimension]: Number(e.target.value) })
              }
            >
              {[0, 1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}/{c.maxScore}
                </option>
              ))}
            </select>
          </div>
        ))}
        {done ? (
          <p className="status-tag status-tag--completed">
            ✓ Saved. {done.length} checklist issue(s) missed → added to your
            weak areas.
          </p>
        ) : (
          <button type="button" onClick={() => void save()}>
            Save self-assessment
          </button>
        )}
      </section>
    </div>
  );
}
