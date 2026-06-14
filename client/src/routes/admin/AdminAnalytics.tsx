import { api } from "../../api/client";
import { useAsync } from "../../hooks/useAsync";
import { ErrorState, LoadingState } from "../../components/states";

function pct(n: number | null | undefined): string {
  return n == null ? "—" : `${Math.round(n * 100)}%`;
}

export function AdminAnalytics() {
  const students = useAsync(() => api.adminStudents(), []);
  const cohort = useAsync(() => api.adminCohort(), []);
  const atRisk = useAsync(() => api.adminAtRisk(), []);
  const courses = useAsync(() => api.courses(), []);
  const courseId =
    courses.status === "success" ? courses.data.courses[0]?.id : undefined;
  const content = useAsync(
    () =>
      courseId
        ? api.adminContent(courseId)
        : Promise.resolve({ questionDifficulty: [], commonlyMissedIssues: [] }),
    [courseId],
  );

  if (students.status === "loading") return <LoadingState />;
  if (students.status === "error")
    return (
      <ErrorState message={students.error.message} onRetry={students.reload} />
    );

  return (
    <div className="page">
      <h1>Instructor analytics</h1>

      {cohort.status === "success" && (
        <section className="card" aria-label="Cohort overview">
          <h2>Cohort overview</h2>
          <ul className="pacing">
            <li>
              <span>{cohort.data.totalStudents}</span> students
            </li>
            <li>
              <span>{pct(cohort.data.averageReadiness)}</span> avg readiness
            </li>
            <li>
              <span>{cohort.data.distribution.low}</span> at &lt;50%
            </li>
            <li>
              <span>{cohort.data.distribution.medium}</span> at 50–75%
            </li>
            <li>
              <span>{cohort.data.distribution.high}</span> at 75%+
            </li>
          </ul>
        </section>
      )}

      <section className="card" aria-label="At-risk students">
        <h2>At-risk students</h2>
        {atRisk.status === "success" && atRisk.data.students.length ? (
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Student</th>
                <th scope="col" className="num">
                  Readiness
                </th>
                <th scope="col">Why</th>
              </tr>
            </thead>
            <tbody>
              {atRisk.data.students.map((s) => (
                <tr key={s.id}>
                  <td>{s.email}</td>
                  <td className="num">{pct(s.readiness)}</td>
                  <td>{(s.reasons ?? []).join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted">No at-risk students.</p>
        )}
      </section>

      <section className="card" aria-label="Students">
        <h2>Students</h2>
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">Student</th>
              <th scope="col" className="num">
                Readiness
              </th>
              <th scope="col">Last active</th>
            </tr>
          </thead>
          <tbody>
            {students.data.students.map((s) => (
              <tr key={s.id}>
                <td>{s.email}</td>
                <td className="num">{pct(s.readiness)}</td>
                <td className="muted">
                  {s.lastActiveAt ? s.lastActiveAt.slice(0, 10) : "never"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {content.status === "success" && (
        <section className="card" aria-label="Commonly missed issues">
          <h2>Commonly missed issues</h2>
          {content.data.commonlyMissedIssues.length ? (
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Issue</th>
                  <th scope="col" className="num">
                    Misses
                  </th>
                  <th scope="col" className="num">
                    Miss rate
                  </th>
                </tr>
              </thead>
              <tbody>
                {content.data.commonlyMissedIssues.map((i) => (
                  <tr key={i.issueId}>
                    <td>{i.name}</td>
                    <td className="num">{i.misses}</td>
                    <td className="num">{pct(i.missRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="muted">No miss data yet.</p>
          )}
          <h2>Question difficulty (lowest correct rate first)</h2>
          {content.data.questionDifficulty.length ? (
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Question</th>
                  <th scope="col" className="num">
                    Attempts
                  </th>
                  <th scope="col" className="num">
                    Correct
                  </th>
                </tr>
              </thead>
              <tbody>
                {content.data.questionDifficulty.map((q) => (
                  <tr key={q.itemId}>
                    <td>{q.stem}…</td>
                    <td className="num">{q.attempts}</td>
                    <td className="num">{pct(q.correctRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="muted">No attempt data yet.</p>
          )}
        </section>
      )}
    </div>
  );
}
