import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import { useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  BookOpenCheck,
  Calculator,
  Check,
  ChevronRight,
  ExternalLink,
  LockKeyhole,
  LogOut,
  RefreshCw,
  Search,
  ShieldCheck,
} from "lucide-react";
import { api, ApiError } from "./data";
import {
  estimateGrade,
  gradeTone,
  hasGradeScore,
  type Gradebook as GradebookData,
  type GradebookConnection,
  type GradeCourse,
  type GradeMark,
} from "../../../packages/domain/src/gradebook";
import { demoGradebook } from "../../../packages/domain/src/gradebook-demo";
import "./gradebook.css";

const studentVue = "https://md-mcps-psv.edupoint.com/PXP2_Login_Student.aspx";
const percent = (n: number | null) =>
  n === null ? "—" : `${Number(n.toFixed(2))}%`;
const points = (n: number | null) =>
  n === null ? "—" : Number(n.toFixed(2)).toString();
const date = (s: string) =>
  s
    ? new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      }).format(new Date(`${s}T12:00:00Z`))
    : "No date";
const barStyle = (n: number | null): CSSProperties => ({
  width: `${Math.max(0, Math.min(100, n ?? 0))}%`,
});

export function Gradebook({ demoWorkspace }: { demoWorkspace: boolean }) {
  const [connection, setConnection] = useState<GradebookConnection | null>(
    null,
  );
  const [sample, setSample] = useState<GradebookData | null>(null);
  const [busy, setBusy] = useState(true),
    [error, setError] = useState("");
  const [username, setUsername] = useState(""),
    [password, setPassword] = useState("");
  const [showConnect, setShowConnect] = useState(false),
    [query, setQuery] = useState("");
  const [sort, setSort] = useState("schedule");
  const [params, setParams] = useSearchParams();
  const active = useRef(true);
  const connectHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (showConnect) connectHeading.current?.focus();
  }, [showConnect]);
  useEffect(() => {
    active.current = true;
    void api<GradebookConnection>("gradebook")
      .then((c) => {
        if (!active.current) return;
        setConnection(c);
        if (!c.connected && demoWorkspace) setSample(demoGradebook());
      })
      .catch((e) => {
        if (active.current) setError(e.message);
      })
      .finally(() => {
        if (active.current) setBusy(false);
      });
    return () => {
      active.current = false;
    };
  }, [demoWorkspace]);
  useEffect(() => {
    if (!connection?.expiresAt) return;
    const timer = setTimeout(
      () => {
        setConnection((c) =>
          c ? { ...c, connected: false, snapshot: null, expiresAt: null } : c,
        );
        setError(
          "Your StudentVUE connection expired. Connect again to load your grades.",
        );
      },
      Math.max(0, Date.parse(connection.expiresAt) - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [connection?.expiresAt]);

  const run = async (path: string, body?: unknown) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const c = await api<GradebookConnection>(path, "POST", body);
      if (!active.current) return;
      setConnection(c);
      setSample(null);
      setShowConnect(false);
      setPassword("");
      setUsername("");
    } catch (e) {
      if (!active.current) return;
      setError(e instanceof Error ? e.message : "Could not load your grades.");
      if (e instanceof ApiError && [401, 422].includes(e.status))
        setConnection((c) =>
          c ? { ...c, connected: false, snapshot: null, expiresAt: null } : c,
        );
      if (e instanceof ApiError && e.status === 409) {
        try {
          const c = await api<GradebookConnection>("gradebook");
          if (active.current) setConnection(c);
        } catch {
          /* original error stays visible */
        }
      }
    } finally {
      if (active.current) setBusy(false);
    }
  };
  const connect = async (event: FormEvent) => {
    event.preventDefault();
    const credentials = { username, password };
    setPassword("");
    await run("gradebook/connect", credentials);
  };
  const data = sample ?? connection?.snapshot;
  const selected = data?.courses.find((c) => c.id === params.get("course"));
  const refresh = (period?: number) => {
    if (sample) {
      setSample(demoGradebook(period ?? sample.period.index));
      return;
    }
    void run("gradebook/refresh", { period: period ?? data?.period.index });
  };
  const preview = () => {
    setSample(demoGradebook());
    setShowConnect(false);
    setParams({});
    setError("");
  };
  const courses = [...(data?.courses ?? [])]
    .filter((c) =>
      `${c.name} ${c.teacher}`.toLowerCase().includes(query.toLowerCase()),
    )
    .sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name)
        : sort === "grade"
          ? (a.marks[0]?.percent ?? Infinity) -
            (b.marks[0]?.percent ?? Infinity)
          : (a.period ?? Infinity) - (b.period ?? Infinity),
    );
  const marked =
    data?.courses.filter(
      (c) => c.marks[0]?.letter && c.marks[0].letter !== "N/A",
    ) ?? [];
  const missing =
    data?.courses.reduce(
      (sum, c) =>
        sum + (c.marks[0]?.assignments.filter((a) => a.missing).length ?? 0),
      0,
    ) ?? 0;

  return (
    <div className="gb-page">
      {error && (
        <div className="notice" role="alert">
          {error}
        </div>
      )}
      {!data && busy && (
        <div className="gb-loading" role="status">
          <RefreshCw className="spin" size={24} /> Opening your gradebook…
        </div>
      )}
      {(!data || showConnect) && !busy && (
        <section className="gb-connect">
          <div className="gb-connect-intro">
            <span className="gb-connect-icon">
              <BookOpenCheck size={30} />
            </span>
            <p className="eyebrow">MCPS · STUDENTVUE</p>
            <h2>Your grades, a little clearer.</h2>
            <p>
              See your teacher’s grades, explore each category, and try out a
              what-if score.
            </p>
            <div className="gb-source-note">
              <ShieldCheck size={19} />
              <span>Grades come directly from StudentVUE / Synergy.</span>
            </div>
          </div>
          <div className="gb-connect-form">
            <h3 ref={connectHeading} tabIndex={-1}>
              Connect StudentVUE
            </h3>
            <p>Use your MCPS student ID and StudentVUE password.</p>
            {connection?.canConnect ? (
              <form onSubmit={(e) => void connect(e)}>
                <label className="field-label" htmlFor="sv-username">
                  Student ID
                  <input
                    id="sv-username"
                    name="username"
                    autoComplete="username"
                    maxLength={128}
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                  />
                </label>
                <label className="field-label" htmlFor="sv-password">
                  StudentVUE password
                  <input
                    id="sv-password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    maxLength={1024}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </label>
                <button
                  className="button primary"
                  type="submit"
                  disabled={busy}
                >
                  <LockKeyhole size={16} /> Connect securely
                </button>
                <p className="gb-privacy">
                  Your credentials stay in server memory for up to one hour,
                  then are cleared. Disconnecting or signing out clears them
                  sooner. Grades are not saved for offline use.
                </p>
              </form>
            ) : (
              <div className="gb-setup-note">
                <LockKeyhole size={19} />
                <p>
                  {connection
                    ? "Set APP_PASSWORD to at least 8 characters on your server, restart, and sign in to Better Canvas to enable StudentVUE."
                    : "The app server needs to be available before you can connect. Reload the page to try again."}
                </p>
              </div>
            )}
            <div className="gb-connect-links">
              <button className="text-button" onClick={preview}>
                Preview with sample grades <ArrowRight size={14} />
              </button>
              <a href={studentVue} target="_blank" rel="noreferrer">
                Open StudentVUE <ExternalLink size={13} />
              </a>
            </div>
          </div>
        </section>
      )}
      {busy && data && (
        <p className="gb-working" role="status">
          <RefreshCw size={15} className="spin" /> Loading StudentVUE grades…
        </p>
      )}
      {data && (
        <>
          {sample && (
            <div className="gb-sample">
              <span>Sample grades · These are made-up examples.</span>
              <button
                className="text-button"
                onClick={() => setShowConnect(!showConnect)}
              >
                {showConnect ? "Close connection form" : "Connect StudentVUE"}
                <ArrowRight size={14} />
              </button>
            </div>
          )}
          <div className="gb-toolbar">
            <div className="gb-provider">
              <ShieldCheck size={19} />
              <div>
                <strong>
                  {sample ? "StudentVUE preview" : "Connected to StudentVUE"}
                </strong>
                <small>
                  {sample
                    ? "Try the gradebook"
                    : `Updated ${new Date(data.fetchedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`}
                </small>
              </div>
            </div>
            <div className="gb-toolbar-actions">
              <select
                aria-label="Grading period"
                value={data.period.index}
                disabled={busy}
                onChange={(e) => {
                  setParams({});
                  refresh(Number(e.target.value));
                }}
              >
                {data.periods.map((p) => (
                  <option key={p.index} value={p.index}>
                    {p.name}
                  </option>
                ))}
              </select>
              <button
                className="button"
                aria-label="Refresh grades"
                disabled={busy}
                onClick={() => refresh()}
              >
                <RefreshCw size={15} className={busy ? "spin" : ""} />
                <span>Refresh grades</span>
              </button>
              {!sample && (
                <button
                  className="icon-button"
                  disabled={busy}
                  title="Disconnect StudentVUE"
                  aria-label="Disconnect StudentVUE"
                  onClick={() => void run("gradebook/disconnect")}
                >
                  <LogOut size={18} />
                </button>
              )}
            </div>
          </div>
          {selected ? (
            <>
              <button
                className="gb-back text-button"
                onClick={() => setParams({})}
              >
                <ArrowLeft size={16} /> All classes
              </button>
              <CourseDetails
                key={`${data.period.index}:${selected.id}`}
                course={selected}
              />
            </>
          ) : (
            <>
              <div className="gb-summary">
                <div>
                  <span>YOUR CLASSES</span>
                  <strong>
                    {data.courses.length}
                    <small>this grading period</small>
                  </strong>
                </div>
                <div>
                  <span>REPORTED GRADES</span>
                  <strong>
                    {marked.length}
                    <small>from {sample ? "sample data" : "StudentVUE"}</small>
                  </strong>
                </div>
                <div>
                  <span>MARKED MISSING</span>
                  <strong className={missing ? "red-text" : ""}>
                    {missing}
                    <small>
                      {missing ? "check your class details" : "nothing flagged"}
                    </small>
                  </strong>
                </div>
              </div>
              <div className="gb-section-heading">
                <div>
                  <h2>Your gradebook</h2>
                  <p>Choose a class to see what’s behind the grade.</p>
                </div>
                <div className="gb-course-filters">
                  <label className="gb-search">
                    <Search size={16} />
                    <input
                      aria-label="Search gradebook courses"
                      value={query}
                      placeholder="Find a class"
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </label>
                  <select
                    aria-label="Sort gradebook courses"
                    value={sort}
                    onChange={(e) => setSort(e.target.value)}
                  >
                    <option value="schedule">Schedule order</option>
                    <option value="grade">Lowest grade first</option>
                    <option value="name">Class name</option>
                  </select>
                </div>
              </div>
              <div className="gb-grid">
                {courses.map((c) => {
                  const m = c.marks[0],
                    count = m?.assignments.filter((a) => a.missing).length ?? 0;
                  return (
                    <button
                      key={c.id}
                      className="gb-course"
                      data-grade={gradeTone(m?.letter ?? "")}
                      onClick={() => setParams({ course: c.id })}
                    >
                      <div className="gb-course-top">
                        <span className="gb-period">
                          {c.period === null ? "CLASS" : `PERIOD ${c.period}`}
                        </span>
                        <ChevronRight size={18} />
                      </div>
                      <h3>{c.name}</h3>
                      <p>{c.teacher || "Teacher not provided"}</p>
                      <div className="gb-grade-line">
                        <strong>{m?.letter || "—"}</strong>
                        <span>{percent(m?.percent ?? null)}</span>
                      </div>
                      <div className="gb-track">
                        <span style={barStyle(m?.percent ?? null)} />
                      </div>
                      <div className="gb-course-bottom">
                        <span>{m?.assignments.length ?? 0} assignments</span>
                        {count > 0 ? (
                          <span className="gb-missing-count">
                            {count} missing
                          </span>
                        ) : (
                          <span>
                            {c.room ? `Room ${c.room}` : "View details"}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
              {!courses.length && (
                <div className="gb-empty">
                  <BookOpenCheck size={32} />
                  <h3>
                    {query ? "No matching classes" : "No grades available yet"}
                  </h3>
                  <p>
                    {query
                      ? "Try a different course or teacher name."
                      : "StudentVUE has no courses for this grading period. Choose another period or check back later."}
                  </p>
                </div>
              )}
            </>
          )}
          <p className="gb-footnote">
            <ShieldCheck size={14} />{" "}
            {sample ? "Demo only" : "Reported grades from StudentVUE / Synergy"}{" "}
            · What-if scores are estimates and do not change your grades.
            <a href={studentVue} target="_blank" rel="noreferrer">
              Open StudentVUE ↗
            </a>
          </p>
        </>
      )}
    </div>
  );
}

function CourseDetails({ course }: { course: GradeCourse }) {
  const [markIndex, setMarkIndex] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, [course.id]);
  const mark = course.marks[markIndex];
  return (
    <div className="gb-detail">
      <div className="gb-detail-heading">
        <div>
          <p className="eyebrow">
            {course.period === null
              ? "CLASS DETAILS"
              : `PERIOD ${course.period}`}{" "}
            {course.room && `· ROOM ${course.room}`}
          </p>
          <h2 ref={heading} tabIndex={-1}>
            {course.name}
          </h2>
          <p>{course.teacher}</p>
        </div>
        {course.marks.length > 1 && (
          <select
            aria-label="Grade mark"
            value={markIndex}
            onChange={(e) => setMarkIndex(Number(e.target.value))}
          >
            {course.marks.map((m, i) => (
              <option key={i} value={i}>
                {m.name}
              </option>
            ))}
          </select>
        )}
      </div>
      {mark ? (
        <MarkDetails key={markIndex} mark={mark} />
      ) : (
        <div className="gb-empty">
          <h3>No grade posted</h3>
          <p>Your teacher has not published a grade for this class.</p>
        </div>
      )}
    </div>
  );
}

function MarkDetails({ mark }: { mark: GradeMark }) {
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [sort, setSort] = useState("newest");
  const [whatIf, setWhatIf] = useState(false);
  const assignments = [...mark.assignments]
    .filter(
      (a) =>
        `${a.name} ${a.category}`.toLowerCase().includes(query.toLowerCase()) &&
        (filter === "all" ||
          (filter === "missing" && a.missing) ||
          (filter === "ungraded" && !hasGradeScore(a) && !a.excluded) ||
          (filter === "graded" && hasGradeScore(a))),
    )
    .sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name)
        : (sort === "oldest" ? 1 : -1) * a.due.localeCompare(b.due),
    );
  return (
    <>
      <div className="gb-breakdown">
        <div className="gb-reported" data-grade={gradeTone(mark.letter)}>
          <span className="eyebrow">REPORTED GRADE</span>
          <div>
            <strong>{mark.letter || "—"}</strong>
            <span>{percent(mark.percent)}</span>
          </div>
          <p>{mark.name}</p>
          <div className="gb-track">
            <span style={barStyle(mark.percent)} />
          </div>
          <small>As reported by StudentVUE</small>
        </div>
        <section className="gb-categories">
          <h3>Category breakdown</h3>
          {mark.categories.length ? (
            mark.categories.map((c, i) => {
              const pct =
                c.earned !== null && c.possible !== null && c.possible > 0
                  ? (c.earned / c.possible) * 100
                  : null;
              return (
                <div className="gb-category" key={i}>
                  <div>
                    <strong>{c.name}</strong>
                    <span>
                      {c.weight === null
                        ? "Weight unavailable"
                        : `${c.weight}% weight`}
                    </span>
                  </div>
                  <div className="gb-track">
                    <span style={barStyle(pct)} />
                  </div>
                  <div>
                    <span>
                      {points(c.earned)} / {points(c.possible)} points
                    </span>
                    <strong>{percent(pct)}</strong>
                  </div>
                </div>
              );
            })
          ) : (
            <p className="gb-muted">
              StudentVUE has not provided category totals for this grade.
            </p>
          )}
        </section>
      </div>
      <div className="gb-whatif-heading">
        <div>
          <Calculator size={20} />
          <div>
            <h3>What if?</h3>
            <p>See how one future assignment could affect your grade.</p>
          </div>
        </div>
        <button
          className="button"
          aria-expanded={whatIf}
          onClick={() => setWhatIf(!whatIf)}
        >
          {whatIf ? "Close calculator" : "Try a score"}
          <ArrowRight size={15} />
        </button>
      </div>
      {whatIf && <WhatIf mark={mark} />}
      <div className="gb-section-heading">
        <div>
          <h3>
            Assignments <span className="count">{mark.assignments.length}</span>
          </h3>
          <p>Scores and notes from your teacher’s gradebook.</p>
        </div>
      </div>
      <div className="gb-assignment-filters">
        <label className="gb-search">
          <Search size={16} />
          <input
            aria-label="Search gradebook assignments"
            placeholder="Search assignments"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <select
          aria-label="Filter gradebook assignments"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">All assignments</option>
          <option value="missing">Missing</option>
          <option value="ungraded">Not graded</option>
          <option value="graded">Graded</option>
        </select>
        <select
          aria-label="Sort gradebook assignments"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="name">Assignment name</option>
        </select>
      </div>
      <div className="gb-table-wrap">
        <table className="gb-table">
          <thead>
            <tr>
              <th>Assignment</th>
              <th>Due</th>
              <th>Points</th>
              <th>Teacher score</th>
            </tr>
          </thead>
          <tbody>
            {assignments.map((a, i) => (
              <tr key={`${a.id}:${i}`}>
                <td>
                  <strong>{a.name}</strong>
                  <small>{a.category}</small>
                  {a.notes && <p className="gb-assignment-notes">{a.notes}</p>}
                </td>
                <td>{date(a.due)}</td>
                <td className="gb-numeric">
                  {points(a.earned)} <span>/ {points(a.possible)}</span>
                </td>
                <td>
                  {a.excluded ? (
                    <span className="badge gray">Excluded</span>
                  ) : a.missing ? (
                    <span className="badge red">Missing</span>
                  ) : (
                    <span
                      className={`badge ${hasGradeScore(a) ? "green" : "gray"}`}
                    >
                      {a.score || (a.earned === null ? "Not graded" : "Scored")}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!assignments.length && (
          <div className="gb-empty">
            <p>No assignments match this view.</p>
          </div>
        )}
      </div>
    </>
  );
}

function WhatIf({ mark }: { mark: GradeMark }) {
  const [category, setCategory] = useState(mark.categories[0]?.name ?? "");
  const [earned, setEarned] = useState(""),
    [possible, setPossible] = useState("20");
  const estimate =
    earned.trim() && possible.trim()
      ? estimateGrade(mark.categories, {
          category,
          earned: Number(earned),
          possible: Number(possible),
        })
      : null;
  const baseline = estimateGrade(mark.categories);
  const mismatch =
    baseline !== null &&
    mark.percent !== null &&
    Math.abs(baseline - mark.percent) > 0.15;
  return (
    <section className="gb-calculator">
      <p className="gb-simulation-label">
        <Calculator size={15} /> SIMULATION · ONE NEW ASSIGNMENT
      </p>
      <div className="gb-calculator-fields">
        <label className="field-label">
          Category
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {mark.categories.map((c, i) => (
              <option key={i} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field-label">
          Points earned
          <input
            type="number"
            min="0"
            step="any"
            placeholder="18"
            value={earned}
            onChange={(e) => setEarned(e.target.value)}
          />
        </label>
        <label className="field-label">
          Points possible
          <input
            type="number"
            min="0.01"
            step="any"
            value={possible}
            onChange={(e) => setPossible(e.target.value)}
          />
        </label>
        <div className="gb-estimate" aria-live="polite">
          <span>Estimated grade</span>
          <strong>{percent(estimate)}</strong>
        </div>
      </div>
      <p>
        {baseline === null
          ? "Synergy has not provided enough category totals and weights for an estimate."
          : mismatch
            ? "These category totals do not exactly match the reported grade. Teacher overrides or other grading rules may affect the result."
            : "Uses StudentVUE’s category weights and totals. Rounding and teacher adjustments may differ."}
      </p>
      <div className="gb-calculator-footer">
        <span>
          <Check size={14} /> Your reported grade stays unchanged.
        </span>
        <button
          className="text-button"
          onClick={() => {
            setEarned("");
            setPossible("20");
          }}
        >
          Reset
        </button>
      </div>
    </section>
  );
}
