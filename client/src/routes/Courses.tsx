import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { CourseSummary } from "../api/types";
import { useAsync } from "../hooks/useAsync";
import { EmptyState, ErrorState, LoadingState } from "../components/states";

export function Courses() {
  const { status, data, error, reload } = useAsync(() => api.courses(), []);
  const [enrolling, setEnrolling] = useState<string | null>(null);

  if (status === "loading") return <LoadingState label="Loading courses…" />;
  if (status === "error")
    return <ErrorState message={error.message} onRetry={reload} />;
  if (!data.courses.length)
    return <EmptyState title="No courses available yet." />;

  async function enroll(c: CourseSummary) {
    setEnrolling(c.id);
    try {
      await api.enroll(c.id);
      reload();
    } finally {
      setEnrolling(null);
    }
  }

  return (
    <div className="page">
      <h1>Courses</h1>
      <ul className="course-grid">
        {data.courses.map((c) => (
          <li key={c.id} className="card">
            <h2>{c.title}</h2>
            <p className="muted">{c.description}</p>
            <div className="course-grid__actions">
              {c.enrolled ? (
                <Link className="cta" to={`/courses/${c.id}`}>
                  Open
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => void enroll(c)}
                  disabled={enrolling === c.id}
                >
                  {enrolling === c.id ? "Enrolling…" : "Enroll"}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
