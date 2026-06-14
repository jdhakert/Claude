import { useState } from "react";
import { api } from "../api/client";
import type { Account as AccountData } from "../api/types";
import { useAsync } from "../hooks/useAsync";
import { ErrorState, LoadingState } from "../components/states";

export function Account() {
  const { status, data, error, reload } = useAsync(() => api.account(), []);
  if (status === "loading") return <LoadingState label="Loading account…" />;
  if (status === "error")
    return <ErrorState message={error.message} onRetry={reload} />;
  return <AccountView account={data} reload={reload} />;
}

function AccountView({
  account,
  reload,
}: {
  account: AccountData;
  reload: () => void;
}) {
  return (
    <div className="page">
      <h1>Account</h1>

      <ProfileCard account={account} reload={reload} />
      <SubscriptionCard account={account} reload={reload} />
      <NotificationsCard account={account} />
      {!account.user.betaAccess && <BetaCard reload={reload} />}
    </div>
  );
}

function ProfileCard({
  account,
  reload,
}: {
  account: AccountData;
  reload: () => void;
}) {
  const hours = account.profile.weeklyTimeBudgetMinutes
    ? Math.round(Number(account.profile.weeklyTimeBudgetMinutes) / 60)
    : "";
  const [displayName, setDisplayName] = useState(
    account.profile.displayName ?? "",
  );
  const [examDate, setExamDate] = useState(
    account.profile.examDate ? account.profile.examDate.slice(0, 10) : "",
  );
  const [studyHours, setStudyHours] = useState(String(hours));
  const [saved, setSaved] = useState(false);

  return (
    <section className="card">
      <h2>Profile &amp; study schedule</h2>
      <p className="muted">{account.user.email}</p>
      <form
        className="auth-form"
        onSubmit={async (e) => {
          e.preventDefault();
          await api.updateProfile({
            displayName,
            examDate: examDate || undefined,
            studyHoursPerWeek: studyHours ? Number(studyHours) : undefined,
          });
          setSaved(true);
          reload();
        }}
      >
        <label htmlFor="displayName">Display name</label>
        <input
          id="displayName"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
        <label htmlFor="examDate">Exam date</label>
        <input
          id="examDate"
          type="date"
          value={examDate}
          onChange={(e) => setExamDate(e.target.value)}
        />
        <label htmlFor="studyHours">Study hours / week</label>
        <input
          id="studyHours"
          type="number"
          min={0}
          max={80}
          value={studyHours}
          onChange={(e) => setStudyHours(e.target.value)}
        />
        <button type="submit">Save profile</button>
        {saved && <p className="status-tag status-tag--completed">Saved ✓</p>}
      </form>
    </section>
  );
}

function SubscriptionCard({
  account,
  reload,
}: {
  account: AccountData;
  reload: () => void;
}) {
  const plans = useAsync(() => api.billingPlans(), []);
  const [busy, setBusy] = useState<string | null>(null);

  return (
    <section className="card">
      <h2>Subscription</h2>
      {account.subscription ? (
        <p>
          <strong className="cap">{account.subscription.plan}</strong> —{" "}
          <span className="status-tag status-tag--completed">
            {account.subscription.status}
          </span>
          {account.subscription.currentPeriodEnd && (
            <span className="muted">
              {" "}
              · renews {account.subscription.currentPeriodEnd.slice(0, 10)}
            </span>
          )}
        </p>
      ) : (
        <p className="muted">No active subscription.</p>
      )}

      <h3>Enrolled courses</h3>
      {account.enrollments.length ? (
        <ul className="lesson-list">
          {account.enrollments.map((c) => (
            <li key={c.id}>{c.title}</li>
          ))}
        </ul>
      ) : (
        <p className="muted">Not enrolled in any course.</p>
      )}

      <h3>Plans</h3>
      {plans.status === "success" && (
        <ul className="course-grid">
          {plans.data.plans.map((p) => (
            <li key={p.id} className="card">
              <h2>{p.name}</h2>
              <p className="hero__days">${p.priceMonthlyUsd}/mo</p>
              <ul>
                {p.features.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
              <button
                type="button"
                disabled={busy === p.id}
                onClick={async () => {
                  setBusy(p.id);
                  try {
                    // Stub mode: checkout returns a mock URL; complete activates.
                    await api.checkout(p.id);
                    await api.checkoutComplete(p.id);
                    reload();
                  } finally {
                    setBusy(null);
                  }
                }}
              >
                {busy === p.id ? "Activating…" : "Choose plan"}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="muted">
        Payments run in safe stub mode in beta — no live charges.
      </p>
    </section>
  );
}

const PREF_LABELS: Record<string, string> = {
  dailyReminder: "Daily study reminder",
  examCountdown: "Exam countdown alerts",
  weeklyProgress: "Weekly progress summary",
};

function NotificationsCard({ account }: { account: AccountData }) {
  const [prefs, setPrefs] = useState<Record<string, boolean>>({
    dailyReminder: true,
    examCountdown: true,
    weeklyProgress: true,
    ...account.profile.notificationPrefs,
  });
  const [saved, setSaved] = useState(false);

  return (
    <section className="card">
      <h2>Notification preferences</h2>
      <ul className="task-list">
        {Object.keys(PREF_LABELS).map((key) => (
          <li key={key}>
            <label>
              <input
                type="checkbox"
                checked={prefs[key] ?? false}
                onChange={(e) => {
                  setPrefs({ ...prefs, [key]: e.target.checked });
                  setSaved(false);
                }}
              />{" "}
              {PREF_LABELS[key]}
            </label>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={async () => {
          await api.updateNotifications(prefs);
          setSaved(true);
        }}
      >
        Save preferences
      </button>
      {saved && <p className="status-tag status-tag--completed">Saved ✓</p>}
    </section>
  );
}

function BetaCard({ reload }: { reload: () => void }) {
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  return (
    <section className="card red-flags">
      <h2>Beta access required</h2>
      <p>Enter your invite code to unlock course access.</p>
      <form
        className="add-row"
        onSubmit={async (e) => {
          e.preventDefault();
          setErr(null);
          try {
            await api.redeemBeta(code.trim());
            reload();
          } catch (ex) {
            setErr((ex as Error).message);
          }
        }}
      >
        <input
          value={code}
          placeholder="BETA-XXXXXXXX"
          aria-label="Invite code"
          onChange={(e) => setCode(e.target.value)}
        />
        <button type="submit">Redeem</button>
      </form>
      {err && <p className="form-error">{err}</p>}
    </section>
  );
}
