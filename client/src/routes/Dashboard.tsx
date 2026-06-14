import { api } from "../api/client";
import type { DashboardData } from "../api/types";
import { useAsync } from "../hooks/useAsync";
import { EmptyState, ErrorState, LoadingState } from "../components/states";

function pct(n: number | null): string {
  return n == null ? "—" : `${Math.round(n * 100)}%`;
}

function MasteryBar({ value }: { value: number | null }) {
  const p = value == null ? 0 : Math.round(value * 100);
  return (
    <div
      className="bar"
      role="meter"
      aria-valuenow={p}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`Mastery ${p}%`}
    >
      <span className="bar__fill" style={{ width: `${p}%` }} />
    </div>
  );
}

export function Dashboard() {
  const { status, data, error, reload } = useAsync<DashboardData>(
    () => api.dashboard(),
    [],
  );

  if (status === "loading") return <LoadingState label="Loading your day…" />;
  if (status === "error")
    return <ErrorState message={error.message} onRetry={reload} />;

  const d = data;

  return (
    <div className="dashboard">
      {/* Readiness + course + countdown */}
      <section className="card card--hero" aria-label="Readiness">
        <div>
          <h2>Readiness</h2>
          <p className="hero__readiness">{pct(d.readiness)}</p>
          <p className="hero__sub">
            {d.course ? d.course.title : "No course yet"}
          </p>
        </div>
        <div className="hero__countdown">
          {d.examCountdown.daysRemaining != null ? (
            <>
              <span className="hero__days">
                {d.examCountdown.daysRemaining}
              </span>
              <span>days to exam</span>
            </>
          ) : (
            <span>Set your exam date in onboarding</span>
          )}
        </div>
      </section>

      {!d.course && (
        <EmptyState
          title="You're not enrolled in a course yet."
          hint="Complete onboarding to get your personalized plan."
        />
      )}

      <div className="dashboard__grid">
        {/* Today's assignment */}
        <section className="card" aria-label="Today's assignments">
          <h2>Today</h2>
          {d.todaysAssignment ? (
            <>
              <p className="muted">
                ~{d.todaysAssignment.estMinutes} min ·{" "}
                {d.todaysAssignment.status}
              </p>
              <ul className="task-list">
                {d.todaysAssignment.items.map((it) => (
                  <li key={it.id}>
                    <span className={`pill pill--${it.kind}`}>{it.kind}</span>
                    <span className="task-list__reason">{it.reason}</span>
                    <span className="muted">{it.estMinutes}m</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <EmptyState
              title="Nothing scheduled yet."
              hint="Your daily plan appears here."
            />
          )}
        </section>

        {/* Next recommended task */}
        <section className="card" aria-label="Next recommended task">
          <h2>Do this next</h2>
          {d.nextTask ? (
            <div className="next-task">
              <span className={`pill pill--${d.nextTask.kind}`}>
                {d.nextTask.kind}
              </span>
              <p>{d.nextTask.reason}</p>
              <p className="muted">~{d.nextTask.estMinutes} min</p>
            </div>
          ) : (
            <EmptyState title="No recommendation yet." />
          )}
        </section>

        {/* Diagnostic status */}
        <section className="card" aria-label="Diagnostic status">
          <h2>Diagnostic</h2>
          <p className={`status-tag status-tag--${d.diagnostic.status}`}>
            {d.diagnostic.status.replace("_", " ")}
          </p>
          {d.diagnostic.status === "completed" && (
            <p className="muted">Score: {pct(d.diagnostic.scorePct)}</p>
          )}
          {d.diagnostic.status === "scheduled" && d.diagnostic.scheduledFor && (
            <p className="muted">Scheduled for {d.diagnostic.scheduledFor}</p>
          )}
        </section>

        {/* Progress by subject */}
        <section className="card" aria-label="Progress by subject">
          <h2>Progress by subject</h2>
          {d.progressBySubject.length ? (
            <ul className="subject-list">
              {d.progressBySubject.map((s) => (
                <li key={s.subjectId}>
                  <span className="subject-list__name">{s.name}</span>
                  <MasteryBar value={s.mastery} />
                  <span className="muted">{pct(s.mastery)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              title="No progress data yet."
              hint="Take the diagnostic to start."
            />
          )}
        </section>

        {/* Weak areas */}
        <section className="card" aria-label="Weak areas">
          <h2>Weak areas</h2>
          {d.weakAreas.length ? (
            <ul className="weak-list">
              {d.weakAreas.map((w) => (
                <li key={w.issueId}>
                  <span className="weak-list__name">{w.name}</span>
                  <span className="muted">{w.subject}</span>
                  <span className="weak-list__score">{pct(w.mastery)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No weak areas identified yet." />
          )}
        </section>

        {/* Recent activity */}
        <section className="card" aria-label="Recent activity">
          <h2>Recent activity</h2>
          {d.recentActivity.length ? (
            <ul className="activity-list">
              {d.recentActivity.map((a, i) => (
                <li key={i}>
                  <span>{a.type.replace(/_/g, " ")}</span>
                  <span className="muted">
                    {new Date(a.occurredAt).toLocaleDateString()}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No activity yet." />
          )}
        </section>
      </div>
    </div>
  );
}
