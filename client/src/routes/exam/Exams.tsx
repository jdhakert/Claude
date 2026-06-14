import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api/client";
import { useAsync } from "../../hooks/useAsync";
import { EmptyState, ErrorState, LoadingState } from "../../components/states";

const KIND_LABEL: Record<string, string> = {
  diagnostic: "Diagnostic",
  full_length: "Full-length simulation",
  periodic: "Progress exam",
  sectional: "Sectional",
  custom: "Custom",
};

export function Exams() {
  const courses = useAsync(() => api.courses(), []);
  const navigate = useNavigate();
  const [starting, setStarting] = useState<string | null>(null);

  if (courses.status === "loading") return <LoadingState />;
  if (courses.status === "error")
    return (
      <ErrorState message={courses.error.message} onRetry={courses.reload} />
    );
  const course = courses.data.courses.find((c) => c.enrolled);
  if (!course) return <EmptyState title="Enroll in a course to take exams." />;

  return (
    <ExamList
      courseId={course.id}
      starting={starting}
      onStart={async (examId) => {
        setStarting(examId);
        try {
          const state = await api.startExam(examId);
          navigate(`/exam-attempts/${state.attempt.id}`);
        } finally {
          setStarting(null);
        }
      }}
    />
  );
}

function ExamList({
  courseId,
  starting,
  onStart,
}: {
  courseId: string;
  starting: string | null;
  onStart: (examId: string) => void;
}) {
  const { status, data, error, reload } = useAsync(
    () => api.exams(courseId),
    [courseId],
  );
  if (status === "loading") return <LoadingState />;
  if (status === "error")
    return <ErrorState message={error.message} onRetry={reload} />;
  if (!data.exams.length) return <EmptyState title="No exams available yet." />;

  return (
    <div className="page">
      <h1>Exams</h1>
      <ul className="course-grid">
        {data.exams.map((e) => (
          <li key={e.id} className="card">
            <span className="pill">{KIND_LABEL[e.kind] ?? e.kind}</span>
            <h2>{e.title}</h2>
            <button
              type="button"
              onClick={() => onStart(e.id)}
              disabled={starting === e.id}
            >
              {starting === e.id ? "Starting…" : "Start / resume"}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
