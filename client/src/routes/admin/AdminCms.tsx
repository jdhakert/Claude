import { useState } from "react";
import { api } from "../../api/client";
import type { CmsItem, CmsKind } from "../../api/types";
import { useAsync } from "../../hooks/useAsync";
import { ErrorState, LoadingState } from "../../components/states";

const KINDS: CmsKind[] = ["question", "lesson", "essay", "pt", "flashcard"];
const STATUSES = ["draft", "in_review", "approved", "published", "archived"];

// Which lifecycle actions are offered from a given status.
const ACTIONS: Record<string, string[]> = {
  draft: ["submit", "archive"],
  in_review: ["approve", "reject", "archive"],
  approved: ["publish", "reject", "archive"],
  published: ["archive"],
  archived: [],
};

export function AdminCms() {
  const dash = useAsync(() => api.cmsDashboard(), []);
  const [kind, setKind] = useState<CmsKind>("question");
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");

  return (
    <div className="page">
      <h1>Content management</h1>

      {/* Dashboard counts */}
      {dash.status === "success" && (
        <section className="card" aria-label="Content dashboard">
          <h2>Library status</h2>
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Type</th>
                {STATUSES.map((s) => (
                  <th key={s} scope="col" className="num cap">
                    {s.replace("_", " ")}
                  </th>
                ))}
                <th scope="col" className="num">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {dash.data.summary.map((row) => (
                <tr key={row.kind}>
                  <td>{row.label}</td>
                  {STATUSES.map((s) => (
                    <td key={s} className="num">
                      {row.byStatus[s] ?? 0}
                    </td>
                  ))}
                  <td className="num">{row.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Filters */}
      <section className="card">
        <div className="cms-filters">
          <label>
            Type
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as CmsKind)}
            >
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </label>
          <label>
            Status
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.replace("_", " ")}
                </option>
              ))}
            </select>
          </label>
          <label>
            Search
            <input
              value={q}
              placeholder="title…"
              onChange={(e) => setQ(e.target.value)}
            />
          </label>
        </div>
        <ContentList
          kind={kind}
          status={status}
          q={q}
          onChanged={() => dash.reload()}
        />
      </section>
    </div>
  );
}

function ContentList({
  kind,
  status,
  q,
  onChanged,
}: {
  kind: CmsKind;
  status: string;
  q: string;
  onChanged: () => void;
}) {
  const {
    status: loadStatus,
    data,
    error,
    reload,
  } = useAsync(
    () => api.cmsList(kind, { status: status || undefined, q: q || undefined }),
    [kind, status, q],
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  if (loadStatus === "loading") return <LoadingState />;
  if (loadStatus === "error")
    return <ErrorState message={error.message} onRetry={reload} />;

  async function act(item: CmsItem, action: string) {
    setBusy(item.id + action);
    setErr(null);
    try {
      await api.cmsTransition(kind, item.id, action);
      reload();
      onChanged();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (!data.items.length) return <p className="muted">No content matches.</p>;

  return (
    <>
      {err && <p className="form-error">{err}</p>}
      <table className="data-table">
        <thead>
          <tr>
            <th scope="col">Title</th>
            <th scope="col">Status</th>
            <th scope="col">License</th>
            <th scope="col" className="num">
              v
            </th>
            <th scope="col">Actions</th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((item) => (
            <tr key={item.id}>
              <td>{item.title || "(untitled)"}…</td>
              <td>
                <span
                  className={`status-tag status-tag--${item.contentStatus === "published" ? "completed" : item.contentStatus === "archived" ? "not_started" : "scheduled"}`}
                >
                  {item.contentStatus.replace("_", " ")}
                </span>
              </td>
              <td className="muted">{item.licenseStatus}</td>
              <td className="num">{item.version}</td>
              <td>
                <div className="cms-actions">
                  {(ACTIONS[item.contentStatus] ?? []).map((a) => (
                    <button
                      key={a}
                      type="button"
                      className="link-btn"
                      disabled={busy === item.id + a}
                      onClick={() => void act(item, a)}
                    >
                      {a}
                    </button>
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
