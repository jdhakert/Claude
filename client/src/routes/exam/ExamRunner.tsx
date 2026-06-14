import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../api/client";
import type { ExamSectionState, ExamState } from "../../api/types";
import { ErrorState, LoadingState } from "../../components/states";

function fmt(ms: number | null): string {
  if (ms == null) return "Untimed";
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

export function ExamRunner() {
  const { attemptId } = useParams();
  const navigate = useNavigate();
  const [state, setState] = useState<ExamState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setState(await api.examState(attemptId!));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [attemptId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (error)
    return <ErrorState message={error} onRetry={() => void refresh()} />;
  if (!state) return <LoadingState label="Loading exam…" />;

  const active = state.sections.find(
    (s) => s.status === "in_progress" || s.status === "paused",
  );
  const nextPending = state.sections.find((s) => s.status === "pending");
  const allDone = state.sections.every(
    (s) => s.status === "submitted" || s.status === "expired",
  );

  return (
    <div className="page exam-runner">
      <h1>{state.attempt.examTitle}</h1>
      <ol className="exam-sections">
        {state.sections.map((s) => (
          <li
            key={s.examSectionId}
            className={`exam-sections__item exam-sections__item--${s.status}`}
          >
            <span>{s.title}</span>
            <span className="muted">{s.kind}</span>
            <span
              className={`status-tag status-tag--${s.status === "submitted" ? "completed" : s.status === "expired" ? "scheduled" : "not_started"}`}
            >
              {s.status.replace("_", " ")}
            </span>
          </li>
        ))}
      </ol>

      {active ? (
        <ActiveSection
          attemptId={attemptId!}
          section={active}
          allowPause={state.attempt.allowPause}
          onChanged={refresh}
        />
      ) : nextPending ? (
        <div className="card">
          <h2>Next: {nextPending.title}</h2>
          <p className="muted">
            {nextPending.timeLimitMinutes > 0
              ? `${nextPending.timeLimitMinutes} minutes`
              : "Untimed"}
          </p>
          <button
            type="button"
            onClick={async () => {
              setState(
                await api.startExamSection(
                  attemptId!,
                  nextPending.examSectionId,
                ),
              );
            }}
          >
            Start section
          </button>
        </div>
      ) : allDone ? (
        <div className="card">
          <h2>All sections complete</h2>
          <button
            type="button"
            onClick={async () => {
              await api.submitExam(attemptId!);
              navigate(`/exam-attempts/${attemptId}/results`);
            }}
          >
            Submit exam &amp; see results
          </button>
        </div>
      ) : null}
    </div>
  );
}

function ActiveSection({
  attemptId,
  section,
  allowPause,
  onChanged,
}: {
  attemptId: string;
  section: ExamSectionState;
  allowPause: boolean;
  onChanged: () => void;
}) {
  const [remaining, setRemaining] = useState<number | null>(
    section.remainingMs,
  );
  const expiredRef = useRef(false);

  // Countdown; refetch (server auto-expiry) when it hits zero.
  useEffect(() => {
    if (section.endsAt == null) return;
    const end = new Date(section.endsAt).getTime();
    const tick = () => {
      const left = end - Date.now();
      setRemaining(left);
      if (left <= 0 && !expiredRef.current) {
        expiredRef.current = true;
        onChanged();
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [section.endsAt, onChanged]);

  if (section.kind !== "mbe") {
    return (
      <div className="card">
        <h2>{section.title}</h2>
        <p className="muted">
          This section type ({section.kind}) is written/handled separately and
          is not auto-graded in beta.
        </p>
        <button
          type="button"
          onClick={async () => {
            await api.submitExamSection(attemptId, section.examSectionId);
            onChanged();
          }}
        >
          Submit section
        </button>
      </div>
    );
  }

  return (
    <div className="card exam-section">
      <div className="exam-section__bar">
        <h2>{section.title}</h2>
        <span className="exam-timer" role="timer" aria-live="off">
          ⏱ {fmt(remaining)}
        </span>
        {allowPause && section.status === "in_progress" && (
          <button
            type="button"
            onClick={async () => {
              await api.pauseExamSection(attemptId, section.examSectionId);
              onChanged();
            }}
          >
            Pause
          </button>
        )}
        {section.status === "paused" && (
          <button
            type="button"
            onClick={async () => {
              await api.resumeExamSection(attemptId, section.examSectionId);
              onChanged();
            }}
          >
            Resume
          </button>
        )}
      </div>

      <ol className="exam-questions">
        {section.items.map((it) => (
          <li key={it.attemptItemId} className="card">
            <div className="exam-question__head">
              <span>Q{it.position}</span>
              <label className="exam-flag">
                <input
                  type="checkbox"
                  defaultChecked={it.flagged}
                  onChange={(e) =>
                    void api.answerExam(attemptId, {
                      attemptItemId: it.attemptItemId,
                      flagged: e.target.checked,
                    })
                  }
                />
                Flag
              </label>
            </div>
            <p>{it.stem}</p>
            <ul className="question__choices">
              {it.choices.map((c) => (
                <li key={c.id}>
                  <label>
                    <input
                      type="radio"
                      name={`q-${it.attemptItemId}`}
                      defaultChecked={it.selectedChoiceId === c.id}
                      onChange={() =>
                        void api.answerExam(attemptId, {
                          attemptItemId: it.attemptItemId,
                          selectedChoiceId: c.id,
                          timeMsDelta: 1000,
                        })
                      }
                    />
                    <strong>{c.label}.</strong> {c.body}
                  </label>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>

      <button
        type="button"
        onClick={async () => {
          await api.submitExamSection(attemptId, section.examSectionId);
          onChanged();
        }}
      >
        Submit section
      </button>
    </div>
  );
}
