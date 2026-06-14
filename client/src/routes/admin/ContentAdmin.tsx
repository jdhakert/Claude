import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import type { CourseTree } from "../../api/types";
import { ErrorState, LoadingState } from "../../components/states";
import { useAsync } from "../../hooks/useAsync";

const BLOCK_KINDS = [
  "text",
  "checklist",
  "rule_statement",
  "example",
  "mini_quiz",
  "video",
  "outline_download",
  "callout",
];

const SAMPLE_BODY: Record<string, string> = {
  text: '{ "text": "Your explanatory text." }',
  checklist: '{ "title": "Steps", "items": ["One", "Two"] }',
  rule_statement: '{ "statement": "State the rule precisely." }',
  example: '{ "prompt": "Facts…", "analysis": "Application…" }',
  mini_quiz:
    '{ "question": "Q?", "choices": ["A", "B"], "correctIndex": 0, "explanation": "Why." }',
  video: '{ "title": "Lecture title" }',
  outline_download: '{ "title": "Attack outline" }',
  callout: '{ "variant": "warning", "text": "Watch out for…" }',
};

export function ContentAdmin() {
  const list = useAsync(() => api.adminCourses(), []);
  const [selected, setSelected] = useState<string | null>(null);
  const [tree, setTree] = useState<CourseTree | null>(null);
  const [busy, setBusy] = useState(false);

  async function loadTree(courseId: string) {
    setSelected(courseId);
    setTree(await api.adminTree(courseId));
  }

  async function createCourse(form: HTMLFormElement) {
    setBusy(true);
    try {
      const f = new FormData(form);
      await api.createCourse({
        slug: String(f.get("slug")),
        title: String(f.get("title")),
        type: String(f.get("type")),
        jurisdiction: String(f.get("jurisdiction")),
        description: String(f.get("description") || ""),
      });
      form.reset();
      list.reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page admin">
      <h1>Content authoring</h1>
      <p>
        <Link to="/admin/cms">→ Content lifecycle &amp; publishing (CMS)</Link>
      </p>

      <section className="card">
        <h2>Create a course</h2>
        <form
          className="auth-form"
          onSubmit={(e) => {
            e.preventDefault();
            void createCourse(e.currentTarget);
          }}
        >
          <input name="slug" placeholder="slug (e.g. mbe-only-2026)" required />
          <input name="title" placeholder="Title" required />
          <select name="type" defaultValue="ube" aria-label="Course type">
            <option value="ube">UBE</option>
            <option value="california">California</option>
            <option value="mbe_only">MBE-only</option>
            <option value="essay_only">Essay-only</option>
            <option value="mpre">MPRE</option>
          </select>
          <select
            name="jurisdiction"
            defaultValue="ube"
            aria-label="Jurisdiction"
          >
            <option value="ube">UBE</option>
            <option value="california">California</option>
            <option value="mbe">MBE</option>
            <option value="general">General</option>
          </select>
          <input name="description" placeholder="Description" />
          <button type="submit" disabled={busy}>
            Create course
          </button>
        </form>
      </section>

      <section className="card">
        <h2>Courses</h2>
        {list.status === "loading" && <LoadingState />}
        {list.status === "error" && (
          <ErrorState message={list.error.message} onRetry={list.reload} />
        )}
        {list.status === "success" && (
          <ul className="admin-course-list">
            {list.data.courses.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => void loadTree(c.id)}>
                  {c.title}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {selected && tree && (
        <CourseEditor tree={tree} onChange={() => void loadTree(selected)} />
      )}
    </div>
  );
}

function CourseEditor({
  tree,
  onChange,
}: {
  tree: CourseTree;
  onChange: () => void;
}) {
  return (
    <section className="card">
      <h2>Editing: {tree.course.title}</h2>

      <AddRow
        label="Add module"
        placeholder="Module title"
        onAdd={async (title) => {
          await api.createModule(tree.course.id, title);
          onChange();
        }}
      />

      {tree.modules.map((m) => (
        <div key={m.id} className="admin-module">
          <h3>{m.title}</h3>
          <ul className="lesson-list">
            {m.lessons.map((l) => (
              <li key={l.id}>
                <span>{l.title}</span>
                <span
                  className={`status-tag status-tag--${l.licenseStatus === "cleared" ? "completed" : "scheduled"}`}
                >
                  {l.licenseStatus}
                </span>
                <Link to={`/lessons/${l.id}?preview=true`}>Preview</Link>
                <LessonBlockAdder lessonId={l.id} onChange={onChange} />
              </li>
            ))}
          </ul>
          <AddRow
            label="Add lesson"
            placeholder="Lesson title"
            onAdd={async (title) => {
              await api.createLesson(m.id, title);
              onChange();
            }}
          />
        </div>
      ))}
    </section>
  );
}

function AddRow({
  label,
  placeholder,
  onAdd,
}: {
  label: string;
  placeholder: string;
  onAdd: (value: string) => Promise<void>;
}) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="add-row"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!value.trim()) return;
        setBusy(true);
        try {
          await onAdd(value.trim());
          setValue("");
        } finally {
          setBusy(false);
        }
      }}
    >
      <input
        value={value}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
        aria-label={label}
      />
      <button type="submit" disabled={busy}>
        {label}
      </button>
    </form>
  );
}

function LessonBlockAdder({
  lessonId,
  onChange,
}: {
  lessonId: string;
  onChange: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState("text");
  const [body, setBody] = useState(SAMPLE_BODY.text ?? "{}");
  const [err, setErr] = useState<string | null>(null);

  if (!open)
    return (
      <button type="button" className="link-btn" onClick={() => setOpen(true)}>
        + block
      </button>
    );

  return (
    <form
      className="block-adder"
      onSubmit={async (e) => {
        e.preventDefault();
        setErr(null);
        try {
          const parsed = JSON.parse(body) as Record<string, unknown>;
          await api.createBlock(lessonId, kind, parsed);
          setOpen(false);
          onChange();
        } catch {
          setErr("Body must be valid JSON.");
        }
      }}
    >
      <select
        value={kind}
        aria-label="Block kind"
        onChange={(e) => {
          setKind(e.target.value);
          setBody(SAMPLE_BODY[e.target.value] ?? "{}");
        }}
      >
        {BLOCK_KINDS.map((k) => (
          <option key={k} value={k}>
            {k}
          </option>
        ))}
      </select>
      <textarea
        value={body}
        rows={3}
        aria-label="Block body JSON"
        onChange={(e) => setBody(e.target.value)}
      />
      {err && <p className="form-error">{err}</p>}
      <button type="submit">Save block</button>
    </form>
  );
}
