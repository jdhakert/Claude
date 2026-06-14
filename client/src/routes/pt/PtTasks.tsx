import { Link } from "react-router-dom";
import { api } from "../../api/client";
import { useAsync } from "../../hooks/useAsync";
import { EmptyState, ErrorState, LoadingState } from "../../components/states";

export function PtTasks() {
  const courses = useAsync(() => api.courses(), []);
  if (courses.status === "loading") return <LoadingState />;
  if (courses.status === "error")
    return (
      <ErrorState message={courses.error.message} onRetry={courses.reload} />
    );
  const course = courses.data.courses.find((c) => c.enrolled);
  if (!course)
    return <EmptyState title="Enroll in a course to practice PTs." />;
  return <List courseId={course.id} />;
}

function List({ courseId }: { courseId: string }) {
  const { status, data, error, reload } = useAsync(
    () => api.ptTasks(courseId),
    [courseId],
  );
  if (status === "loading") return <LoadingState />;
  if (status === "error")
    return <ErrorState message={error.message} onRetry={reload} />;
  if (!data.tasks.length)
    return <EmptyState title="No performance tasks yet." />;

  return (
    <div className="page">
      <h1>Performance Tests</h1>
      <ul className="course-grid">
        {data.tasks.map((t) => (
          <li key={t.id} className="card">
            <h2>{t.title}</h2>
            <p className="muted">{t.expectedProduct}</p>
            <p className="muted">{t.timeLimitMinutes} min</p>
            <Link className="cta" to={`/pt/${t.id}`}>
              Start task
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
