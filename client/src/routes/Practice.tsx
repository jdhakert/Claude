import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import type {
  AttemptReview,
  Confidence,
  CourseSummary,
  PracticeItem,
  PracticeSubject,
} from "../api/types";
import { useAsync } from "../hooks/useAsync";
import { EmptyState, ErrorState, LoadingState } from "../components/states";

const CONFIDENCE: Array<{ value: Confidence; label: string }> = [
  { value: "guessing", label: "Guessing" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

interface Config {
  courseId: string;
  subjectId?: string;
  subtopicId?: string;
  mixed: boolean;
  timed: boolean;
  mode: "tutor" | "timed";
  limit: number;
}

export function Practice() {
  const courses = useAsync(() => api.courses(), []);
  const [config, setConfig] = useState<Config | null>(null);

  if (courses.status === "loading") return <LoadingState />;
  if (courses.status === "error")
    return (
      <ErrorState message={courses.error.message} onRetry={courses.reload} />
    );

  const enrolled = courses.data.courses.filter((c) => c.enrolled);
  if (!enrolled.length)
    return (
      <EmptyState
        title="Enroll in a course first."
        hint="Practice draws from your enrolled course's question bank."
      />
    );

  if (!config) return <Setup courses={enrolled} onStart={setConfig} />;
  return <Runner config={config} onExit={() => setConfig(null)} />;
}

function Setup({
  courses,
  onStart,
}: {
  courses: CourseSummary[];
  onStart: (c: Config) => void;
}) {
  const [courseId, setCourseId] = useState(courses[0]!.id);
  const tax = useAsync<{ subjects: PracticeSubject[] }>(
    () => api.practiceTaxonomy(courseId),
    [courseId],
  );
  const [subjectId, setSubjectId] = useState("");
  const [subtopicId, setSubtopicId] = useState("");
  const [mixed, setMixed] = useState(true);
  const [timed, setTimed] = useState(false);
  const [limit, setLimit] = useState(10);

  const subjects = tax.status === "success" ? tax.data.subjects : [];
  const subtopics = subjects.find((s) => s.id === subjectId)?.subtopics ?? [];

  return (
    <div className="page">
      <h1>Practice</h1>
      <form
        className="card practice-setup"
        onSubmit={(e) => {
          e.preventDefault();
          onStart({
            courseId,
            subjectId: subjectId || undefined,
            subtopicId: subtopicId || undefined,
            mixed,
            timed,
            mode: timed ? "timed" : "tutor",
            limit,
          });
        }}
      >
        <label>
          Course
          <select
            value={courseId}
            onChange={(e) => setCourseId(e.target.value)}
          >
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </label>

        <label>
          Subject
          <select
            value={subjectId}
            onChange={(e) => {
              setSubjectId(e.target.value);
              setSubtopicId("");
            }}
          >
            <option value="">All subjects (mixed)</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        {subjectId && (
          <label>
            Subtopic
            <select
              value={subtopicId}
              onChange={(e) => setSubtopicId(e.target.value)}
            >
              <option value="">All subtopics</option>
              {subtopics.map((st) => (
                <option key={st.id} value={st.id}>
                  {st.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <label>
          Questions
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
          >
            {[5, 10, 20].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>

        <label className="practice-setup__check">
          <input
            type="checkbox"
            checked={mixed}
            onChange={(e) => setMixed(e.target.checked)}
          />
          Mixed (random order)
        </label>

        <label className="practice-setup__check">
          <input
            type="checkbox"
            checked={timed}
            onChange={(e) => setTimed(e.target.checked)}
          />
          Timed mode (hide feedback until the end)
        </label>

        <button type="submit">Start practice</button>
      </form>
    </div>
  );
}

function Runner({ config, onExit }: { config: Config; onExit: () => void }) {
  const { status, data, error, reload } = useAsync(
    () =>
      api.practiceItems({
        courseId: config.courseId,
        subjectId: config.subjectId,
        subtopicId: config.subtopicId,
        mixed: config.mixed,
        limit: config.limit,
      }),
    [],
  );
  const [index, setIndex] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [done, setDone] = useState(false);

  if (status === "loading") return <LoadingState label="Building your set…" />;
  if (status === "error")
    return <ErrorState message={error.message} onRetry={reload} />;
  if (!data || !data.items.length)
    return <EmptyState title="No questions match those filters yet." />;
  const items = data.items;

  if (done) {
    return (
      <div className="page">
        <div className="card">
          <h1>Set complete</h1>
          <p>
            You scored <strong>{correct}</strong> / {items.length}.
          </p>
          <button type="button" onClick={onExit}>
            Back to setup
          </button>
        </div>
      </div>
    );
  }

  const item = items[index]!;

  function next(wasCorrect: boolean) {
    if (wasCorrect) setCorrect((c) => c + 1);
    if (index + 1 >= items.length) setDone(true);
    else setIndex((i) => i + 1);
  }

  return (
    <div className="page">
      <p className="muted">
        Question {index + 1} of {items.length} · {item.subject} ·{" "}
        {item.subtopic} · {config.timed ? "Timed" : "Tutor"}
      </p>
      <Question key={item.id} item={item} mode={config.mode} onNext={next} />
    </div>
  );
}

function Question({
  item,
  mode,
  onNext,
}: {
  item: PracticeItem;
  mode: "tutor" | "timed";
  onNext: (wasCorrect: boolean) => void;
}) {
  const startedAt = useRef(Date.now());
  const [confidence, setConfidence] = useState<Confidence | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [review, setReview] = useState<AttemptReview | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    startedAt.current = Date.now();
  }, []);

  async function submit() {
    if (!confidence || !selected) return;
    setSubmitting(true);
    try {
      const r = await api.submitAttempt({
        itemId: item.id,
        selectedChoiceId: selected,
        confidence,
        timeMs: Date.now() - startedAt.current,
        mode,
      });
      if (mode === "timed") {
        onNext(r.isCorrect);
      } else {
        setReview(r);
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (review) {
    return (
      <ReviewPanel review={review} onNext={() => onNext(review.isCorrect)} />
    );
  }

  return (
    <div className="card question">
      <p className="question__stem">{item.stem}</p>

      <fieldset className="question__confidence">
        <legend>How confident are you? (required before answering)</legend>
        {CONFIDENCE.map((c) => (
          <label key={c.value}>
            <input
              type="radio"
              name="confidence"
              checked={confidence === c.value}
              onChange={() => setConfidence(c.value)}
            />
            {c.label}
          </label>
        ))}
      </fieldset>

      <ul className="question__choices">
        {item.choices.map((c) => (
          <li key={c.id}>
            <label className={selected === c.id ? "selected" : ""}>
              <input
                type="radio"
                name="choice"
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
        disabled={!selected || submitting}
      >
        {submitting ? "Submitting…" : "Submit answer"}
      </button>
    </div>
  );
}

const CAUSES = [
  "didnt_know_rule",
  "misread_facts",
  "wrong_issue_spotted",
  "rule_misapplied",
  "timing_rushed",
  "careless",
  "trap_distractor",
];

function ReviewPanel({
  review,
  onNext,
}: {
  review: AttemptReview;
  onNext: () => void;
}) {
  const [cause, setCause] = useState(CAUSES[0]!);
  const [journaled, setJournaled] = useState(false);
  const [carded, setCarded] = useState(false);

  return (
    <div className="card review">
      <p
        className={`review__verdict ${review.isCorrect ? "review__verdict--ok" : "review__verdict--no"}`}
      >
        {review.isCorrect ? "✓ Correct" : "✗ Incorrect"}
      </p>

      <ul className="review__choices">
        {review.choices.map((c) => (
          <li
            key={c.id}
            className={
              c.isCorrect ? "review__choice--correct" : "review__choice--wrong"
            }
          >
            <strong>
              {c.label}. {c.isCorrect ? "(correct)" : "(incorrect)"}
            </strong>{" "}
            {c.body}
            {c.rationale && <p className="muted">{c.rationale}</p>}
          </li>
        ))}
      </ul>

      {review.ruleTakeaway && (
        <blockquote className="review__rule">
          <strong>Rule takeaway. </strong>
          {review.ruleTakeaway}
        </blockquote>
      )}
      {review.explanation && <p>{review.explanation}</p>}

      <div className="review__actions">
        <div className="review__journal">
          <label>
            Why I missed it
            <select value={cause} onChange={(e) => setCause(e.target.value)}>
              {CAUSES.map((c) => (
                <option key={c} value={c}>
                  {c.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={journaled}
            onClick={async () => {
              await api.addErrorJournal({
                questionAttemptId: review.attemptId,
                cause,
              });
              setJournaled(true);
            }}
          >
            {journaled ? "Added to journal ✓" : "Add to error journal"}
          </button>
        </div>

        <button
          type="button"
          disabled={carded}
          onClick={async () => {
            const correct = review.choices.find((c) => c.isCorrect);
            await api.createFlashcard({
              front: review.issue?.name ?? "Review this rule",
              back: review.ruleTakeaway ?? correct?.body ?? "",
            });
            setCarded(true);
          }}
        >
          {carded ? "Flashcard created ✓" : "Convert to flashcard"}
        </button>
      </div>

      <button type="button" className="review__next" onClick={onNext}>
        Next question
      </button>
    </div>
  );
}
