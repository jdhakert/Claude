import { useState } from "react";
import { api } from "../api/client";
import type {
  AttackOutlineEntry,
  DueCard,
  RuleEntry,
  SrsRating,
} from "../api/types";
import { useAsync } from "../hooks/useAsync";
import { EmptyState, ErrorState, LoadingState } from "../components/states";

type Tab = "cards" | "rules" | "outlines" | "patterns";

export function Review() {
  const [tab, setTab] = useState<Tab>("cards");
  return (
    <div className="page">
      <h1>Review</h1>
      <div className="tabs" role="tablist">
        <button
          role="tab"
          aria-selected={tab === "cards"}
          className={tab === "cards" ? "active" : ""}
          onClick={() => setTab("cards")}
        >
          Due cards
        </button>
        <button
          role="tab"
          aria-selected={tab === "rules"}
          className={tab === "rules" ? "active" : ""}
          onClick={() => setTab("rules")}
        >
          Rule drills
        </button>
        <button
          role="tab"
          aria-selected={tab === "outlines"}
          className={tab === "outlines" ? "active" : ""}
          onClick={() => setTab("outlines")}
        >
          Attack outlines
        </button>
        <button
          role="tab"
          aria-selected={tab === "patterns"}
          className={tab === "patterns" ? "active" : ""}
          onClick={() => setTab("patterns")}
        >
          Error patterns
        </button>
      </div>
      {tab === "cards" && <DueCards />}
      {tab === "rules" && <RuleDrills />}
      {tab === "outlines" && <Outlines />}
      {tab === "patterns" && <Patterns />}
    </div>
  );
}

const RATINGS: SrsRating[] = ["again", "hard", "good", "easy"];

function DueCards() {
  const { status, data, error, reload } = useAsync(() => api.srsDue(), []);
  const stats = useAsync(() => api.srsStats(), []);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  if (status === "loading") return <LoadingState />;
  if (status === "error")
    return <ErrorState message={error.message} onRetry={reload} />;
  const cards: DueCard[] = data.cards;
  if (!cards.length)
    return <EmptyState title="All caught up — no cards due." />;

  const card = cards[index];
  if (!card) {
    return (
      <EmptyState
        title="Session complete!"
        hint="Come back when more cards are due."
      />
    );
  }

  async function rate(r: SrsRating) {
    await api.reviewCard(card!.reviewId, r);
    setFlipped(false);
    setIndex((i) => i + 1);
    stats.reload();
  }

  return (
    <div className="card review-card">
      <p className="muted">
        {index + 1} / {cards.length}
        {stats.status === "success" && stats.data.accuracy != null && (
          <> · recall {Math.round(stats.data.accuracy * 100)}%</>
        )}
        {card.isRule && <span className="pill"> rule</span>}
      </p>
      <p className="review-card__front">{card.front}</p>
      {flipped ? (
        <>
          <hr />
          <p className="review-card__back">{card.back}</p>
          <div className="rating-row">
            {RATINGS.map((r) => (
              <button key={r} type="button" onClick={() => void rate(r)}>
                {r}
              </button>
            ))}
          </div>
        </>
      ) : (
        <button type="button" onClick={() => setFlipped(true)}>
          Show answer
        </button>
      )}
    </div>
  );
}

function RuleDrills() {
  const courses = useAsync(() => api.courses(), []);
  const courseId =
    courses.status === "success"
      ? courses.data.courses.find((c) => c.enrolled)?.id
      : undefined;
  const rules = useAsync(
    () => (courseId ? api.rules(courseId) : Promise.resolve({ rules: [] })),
    [courseId],
  );

  if (rules.status === "loading" || courses.status === "loading")
    return <LoadingState />;
  if (rules.status === "error")
    return <ErrorState message={rules.error.message} onRetry={rules.reload} />;
  if (!rules.data.rules.length)
    return <EmptyState title="No rules to drill yet." />;

  return (
    <div className="rule-drills">
      {rules.data.rules.map((rule) => (
        <RuleDrill key={rule.id} rule={rule} />
      ))}
    </div>
  );
}

function RuleDrill({ rule }: { rule: RuleEntry }) {
  const [revealed, setRevealed] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  return (
    <div className="card">
      <h3>State the rule: {rule.issueName}</h3>
      {!revealed ? (
        <>
          {/* Active recall: state it before seeing the answer. */}
          <p className="muted">
            Recall the rule and its elements, then reveal to self-check.
          </p>
          {rule.elements && (
            <ul className="cloze">
              {rule.elements.map((_, i) => (
                <li key={i}>Element {i + 1}: ______</li>
              ))}
            </ul>
          )}
          <button type="button" onClick={() => setRevealed(true)}>
            Reveal rule
          </button>
        </>
      ) : (
        <>
          <blockquote className="block block--rule">
            {rule.statement}
          </blockquote>
          {rule.elements && (
            <ul className="checklist-elements">
              {rule.elements.map((e, i) => (
                <li key={i}>✓ {e}</li>
              ))}
            </ul>
          )}
          {rule.mnemonic && <p className="muted">Mnemonic: {rule.mnemonic}</p>}
          {done ? (
            <p className="status-tag status-tag--completed">Logged ({done})</p>
          ) : (
            <div className="rating-row">
              {(["again", "good", "easy"] as SrsRating[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={async () => {
                    await api.drillRule(rule.id, r);
                    setDone(r);
                  }}
                >
                  {r}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Outlines() {
  const { status, data, error, reload } = useAsync(() => api.outlines(), []);
  const [openId, setOpenId] = useState<string | null>(null);
  const [title, setTitle] = useState("");

  if (status === "loading") return <LoadingState />;
  if (status === "error")
    return <ErrorState message={error.message} onRetry={reload} />;

  return (
    <div>
      <form
        className="add-row"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!title.trim()) return;
          await api.createOutline(title.trim());
          setTitle("");
          reload();
        }}
      >
        <input
          value={title}
          placeholder="New attack outline title"
          aria-label="Outline title"
          onChange={(e) => setTitle(e.target.value)}
        />
        <button type="submit">Create outline</button>
      </form>

      {data.outlines.length === 0 ? (
        <EmptyState title="No attack outlines yet." />
      ) : (
        <ul className="lesson-list">
          {data.outlines.map((o) => (
            <li key={o.id}>
              <span>{o.title}</span>
              <button type="button" onClick={() => setOpenId(o.id)}>
                Open
              </button>
            </li>
          ))}
        </ul>
      )}

      {openId && <OutlineEditor outlineId={openId} />}
    </div>
  );
}

function OutlineEditor({ outlineId }: { outlineId: string }) {
  const { status, data, error, reload } = useAsync(
    () => api.outline(outlineId),
    [outlineId],
  );
  const [form, setForm] = useState({
    rule: "",
    triggerFacts: "",
    commonTraps: "",
    checklist: "",
  });

  if (status === "loading") return <LoadingState />;
  if (status === "error")
    return <ErrorState message={error.message} onRetry={reload} />;

  const entries: AttackOutlineEntry[] = data.entries;

  return (
    <section className="card">
      <h2>{data.outline.title}</h2>
      {entries.map((e) => (
        <div key={e.id} className="outline-entry">
          <p>
            <strong>Rule.</strong> {e.rule}
          </p>
          {e.triggerFacts && (
            <p>
              <strong>Trigger facts.</strong> {e.triggerFacts}
            </p>
          )}
          {e.commonTraps && (
            <p>
              <strong>Common traps.</strong> {e.commonTraps}
            </p>
          )}
          {e.checklist && (
            <ul className="checklist-elements">
              {e.checklist.map((c, i) => (
                <li key={i}>☐ {c}</li>
              ))}
            </ul>
          )}
        </div>
      ))}

      <form
        className="grade-field"
        onSubmit={async (ev) => {
          ev.preventDefault();
          await api.addOutlineEntry(outlineId, {
            rule: form.rule,
            triggerFacts: form.triggerFacts,
            commonTraps: form.commonTraps,
            checklist: form.checklist
              ? form.checklist.split(",").map((s) => s.trim())
              : [],
          });
          setForm({
            rule: "",
            triggerFacts: "",
            commonTraps: "",
            checklist: "",
          });
          reload();
        }}
      >
        <h3>Add entry</h3>
        <input
          placeholder="Rule"
          value={form.rule}
          onChange={(e) => setForm({ ...form, rule: e.target.value })}
        />
        <input
          placeholder="Trigger facts"
          value={form.triggerFacts}
          onChange={(e) => setForm({ ...form, triggerFacts: e.target.value })}
        />
        <input
          placeholder="Common traps"
          value={form.commonTraps}
          onChange={(e) => setForm({ ...form, commonTraps: e.target.value })}
        />
        <input
          placeholder="Checklist (comma-separated)"
          value={form.checklist}
          onChange={(e) => setForm({ ...form, checklist: e.target.value })}
        />
        <button type="submit">Add entry</button>
      </form>
    </section>
  );
}

function Patterns() {
  const { status, data, error, reload } = useAsync(
    () => api.wrongAnswerPatterns(),
    [],
  );
  if (status === "loading") return <LoadingState />;
  if (status === "error")
    return <ErrorState message={error.message} onRetry={reload} />;
  if (!data.totalMisses)
    return (
      <EmptyState
        title="No error patterns yet."
        hint="Tag why you miss questions to reveal your patterns."
      />
    );

  return (
    <div>
      <section className="card">
        <h2>Your #1 error pattern</h2>
        <p className="review-card__front">{data.insight}</p>
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">Why you missed</th>
              <th scope="col" className="num">
                Count
              </th>
              <th scope="col" className="num">
                Share
              </th>
            </tr>
          </thead>
          <tbody>
            {data.causeBreakdown.map((c) => (
              <tr key={c.cause}>
                <td className="cap">{c.label}</td>
                <td className="num">{c.count}</td>
                <td className="num">{Math.round(c.pct * 100)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {data.confusions.length > 0 && (
        <section className="card" aria-label="Distractor gravity">
          <h2>Distractors you gravitate to</h2>
          <ul className="lesson-list">
            {data.confusions.map((c) => (
              <li key={c.issueName}>
                <span>
                  <strong>{c.issueName}:</strong> {c.topPick ?? "—"}
                </span>
                <span className="muted">{c.pickCount}x</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
