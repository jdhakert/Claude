import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { useAsync } from "../hooks/useAsync";
import { EmptyState, ErrorState, LoadingState } from "../components/states";

function pct(n: number | null | undefined): string {
  return n == null ? "—" : `${Math.round(n * 100)}%`;
}

/** Accessible bar meter (the surrounding table is the data fallback). */
function Bar({ value, label }: { value: number | null; label: string }) {
  const p = value == null ? 0 : Math.round(value * 100);
  return (
    <div
      className="bar"
      role="meter"
      aria-valuenow={p}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`${label}: ${p}%`}
    >
      <span className="bar__fill" style={{ width: `${p}%` }} />
    </div>
  );
}

export function Analytics() {
  const { user } = useAuth();
  const { status, data, error, reload } = useAsync(() => api.myAnalytics(), []);
  const privileged = (user?.roles ?? []).some((r) =>
    ["instructor", "admin"].includes(r),
  );

  if (status === "loading")
    return <LoadingState label="Crunching your data…" />;
  if (status === "error")
    return <ErrorState message={error.message} onRetry={reload} />;
  const a = data;

  return (
    <div className="page">
      <div className="essay-writer__bar">
        <h1>Your analytics</h1>
        {privileged && <Link to="/admin/analytics">Instructor view →</Link>}
      </div>

      <section className="card card--hero" aria-label="Readiness">
        <div>
          <h2>Readiness</h2>
          <p className="hero__readiness">{pct(a.readiness)}</p>
          <p className="hero__sub">
            coverage {pct(a.coverage)} · recency {pct(a.recency)}
          </p>
        </div>
        <div className="hero__countdown">
          <span>Focus next</span>
          <strong>{a.nextFocus ?? "—"}</strong>
        </div>
      </section>

      {/* Subject performance */}
      <section className="card" aria-label="Subject performance">
        <h2>Subject performance</h2>
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">Subject</th>
              <th scope="col">Mastery</th>
              <th scope="col" className="num">
                %
              </th>
            </tr>
          </thead>
          <tbody>
            {a.subjects.map((s) => (
              <tr key={s.id}>
                <td>{s.name}</td>
                <td>
                  <Bar value={s.mastery} label={s.name} />
                </td>
                <td className="num">{pct(s.mastery)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Confidence calibration */}
      <section className="card" aria-label="Confidence calibration">
        <h2>Confidence calibration</h2>
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">Confidence</th>
              <th scope="col" className="num">
                Answers
              </th>
              <th scope="col" className="num">
                Accuracy
              </th>
              <th scope="col">Flag</th>
            </tr>
          </thead>
          <tbody>
            {a.calibration.map((c) => (
              <tr key={c.level}>
                <td className="cap">{c.level}</td>
                <td className="num">{c.count}</td>
                <td className="num">{pct(c.accuracy)}</td>
                <td>
                  {c.flag && (
                    <span
                      className={`status-tag status-tag--${c.flag === "overconfident" ? "scheduled" : "completed"}`}
                    >
                      {c.flag}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted">
          Overconfident = sure but wrong (study these); underconfident = unsure
          but right (trust yourself).
        </p>
      </section>

      {/* Weak issues */}
      <section className="card" aria-label="Issue performance">
        <h2>Weakest issues</h2>
        {a.issues.length ? (
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Issue</th>
                <th scope="col">Subject</th>
                <th scope="col" className="num">
                  Mastery
                </th>
              </tr>
            </thead>
            <tbody>
              {a.issues.map((i) => (
                <tr key={i.id}>
                  <td>{i.name}</td>
                  <td className="muted">{i.subjectName}</td>
                  <td className="num">{pct(i.mastery)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyState title="No issue data yet." />
        )}
      </section>

      <div className="dashboard__grid">
        <section className="card" aria-label="MBE accuracy trend">
          <h2>MBE accuracy trend</h2>
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col" className="num">
                  Accuracy
                </th>
                <th scope="col" className="num">
                  Qs
                </th>
              </tr>
            </thead>
            <tbody>
              {a.mbeAccuracyTrend.length ? (
                a.mbeAccuracyTrend.map((d) => (
                  <tr key={d.date}>
                    <td>{d.date}</td>
                    <td className="num">{pct(d.accuracy)}</td>
                    <td className="num">{d.count}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={3} className="muted">
                    No attempts yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        <section className="card" aria-label="Timing and completion">
          <h2>Timing &amp; completion</h2>
          <p>
            Avg time / question:{" "}
            <strong>
              {a.timing.avgSecondsPerQuestion == null
                ? "—"
                : `${a.timing.avgSecondsPerQuestion}s`}
            </strong>
          </p>
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col" className="num">
                  Activities
                </th>
              </tr>
            </thead>
            <tbody>
              {a.completionTrend.length ? (
                a.completionTrend.map((d) => (
                  <tr key={d.date}>
                    <td>{d.date}</td>
                    <td className="num">{d.count}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={2} className="muted">
                    No activity yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
