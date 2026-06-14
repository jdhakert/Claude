import { Link } from "react-router-dom";
import { api } from "../../api/client";
import { useAsync } from "../../hooks/useAsync";
import { EmptyState, ErrorState, LoadingState } from "../../components/states";

export function Essays() {
  const courses = useAsync(() => api.courses(), []);
  if (courses.status === "loading") return <LoadingState />;
  if (courses.status === "error")
    return (
      <ErrorState message={courses.error.message} onRetry={courses.reload} />
    );
  const course = courses.data.courses.find((c) => c.enrolled);
  if (!course)
    return <EmptyState title="Enroll in a course to write essays." />;
  return <EssayList courseId={course.id} />;
}

function EssayList({ courseId }: { courseId: string }) {
  const { status, data, error, reload } = useAsync(
    () => api.essays(courseId),
    [courseId],
  );
  if (status === "loading") return <LoadingState />;
  if (status === "error")
    return <ErrorState message={error.message} onRetry={reload} />;
  if (!data.prompts.length) return <EmptyState title="No essay prompts yet." />;

  return (
    <div className="page">
      <h1>Essays</h1>
      <ul className="course-grid">
        {data.prompts.map((p) => (
          <li key={p.id} className="card">
            <p>{p.prompt.slice(0, 160)}…</p>
            <p className="muted">{p.timeLimitMinutes} min</p>
            <Link className="cta" to={`/essays/${p.id}`}>
              Start essay
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
