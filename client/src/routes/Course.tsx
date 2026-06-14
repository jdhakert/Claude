import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import { useAsync } from "../hooks/useAsync";
import { EmptyState, ErrorState, LoadingState } from "../components/states";

const STATUS_LABEL: Record<string, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  completed: "✓ Completed",
};

export function Course() {
  const { courseId } = useParams();
  const { status, data, error, reload } = useAsync(
    () => api.course(courseId!),
    [courseId],
  );

  if (status === "loading") return <LoadingState label="Loading course…" />;
  if (status === "error")
    return <ErrorState message={error.message} onRetry={reload} />;

  return (
    <div className="page">
      <h1>{data.course.title}</h1>
      {data.modules.length === 0 && (
        <EmptyState title="This course has no published lessons yet." />
      )}
      {data.modules.map((m) => (
        <section key={m.id} className="card">
          <h2>{m.title}</h2>
          {m.lessons.length === 0 ? (
            <p className="muted">No lessons yet.</p>
          ) : (
            <ul className="lesson-list">
              {m.lessons.map((l) => (
                <li key={l.id}>
                  <Link to={`/lessons/${l.id}`}>{l.title}</Link>
                  <span className={`status-tag status-tag--${l.progress}`}>
                    {STATUS_LABEL[l.progress]}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
