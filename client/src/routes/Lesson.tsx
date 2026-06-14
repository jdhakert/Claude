import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { useAsync } from "../hooks/useAsync";
import { ContentBlock } from "../components/ContentBlock";
import { EmptyState, ErrorState, LoadingState } from "../components/states";

export function Lesson() {
  const { lessonId } = useParams();
  const [params] = useSearchParams();
  const preview = params.get("preview") === "true";
  const { status, data, error, reload } = useAsync(
    () => api.lesson(lessonId!, preview),
    [lessonId, preview],
  );
  const startedRef = useRef(false);
  const openedAt = useRef<number>(Date.now());
  const [completed, setCompleted] = useState(false);
  const [saving, setSaving] = useState(false);

  // Track lesson start once when the lesson loads.
  useEffect(() => {
    if (status === "success" && data && !startedRef.current) {
      startedRef.current = true;
      openedAt.current = Date.now();
      setCompleted(data.progress.status === "completed");
      void api.startLesson(data.lesson.id).catch(() => {});
    }
  }, [status, data]);

  if (status === "loading") return <LoadingState label="Loading lesson…" />;
  if (status === "error")
    return <ErrorState message={error.message} onRetry={reload} />;
  if (!data) return null;
  if (!data.blocks.length)
    return <EmptyState title="This lesson has no content yet." />;
  const view = data;

  async function complete() {
    setSaving(true);
    const seconds = Math.round((Date.now() - openedAt.current) / 1000);
    try {
      await api.completeLesson(view.lesson.id, seconds);
      setCompleted(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className="lesson">
      <header className="lesson__header">
        <h1>{data.lesson.title}</h1>
        {data.lesson.preview && (
          <span className="badge badge--preview">
            Preview (not yet cleared)
          </span>
        )}
      </header>

      <div className="lesson__blocks">
        {data.blocks.map((b) => (
          <ContentBlock key={b.id} block={b} />
        ))}
      </div>

      <footer className="lesson__footer">
        {completed ? (
          <p className="status-tag status-tag--completed">✓ Lesson completed</p>
        ) : (
          <button
            type="button"
            onClick={() => void complete()}
            disabled={saving}
          >
            {saving ? "Saving…" : "Mark complete"}
          </button>
        )}
      </footer>
    </article>
  );
}
