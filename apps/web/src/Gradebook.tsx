import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  BookOpenCheck,
  Calculator,
  Check,
  ExternalLink,
  FilePlus2,
  LayoutGrid,
  LockKeyhole,
  LogOut,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Table,
  Trash2,
} from "lucide-react";
import { api, ApiError } from "./data";
import {
  activeMeeting,
  clockLabel,
  estimateGrade,
  gradeDisplay,
  gradeTone,
  hasGradeScore,
  letterFromPercent,
  periodTiming,
  type Gradebook as GradebookData,
  type GradebookConnection,
  type GradeAssignment,
  type GradeCategory,
  type GradeCourse,
  type GradeMark,
  type TodaySchedule,
} from "../../../packages/domain/src/gradebook";
import {
  demoGradebook,
  demoSchedule,
} from "../../../packages/domain/src/gradebook-demo";
import "./gradebook.css";
import "@fontsource-variable/manrope";

const studentVue = "https://md-mcps-psv.edupoint.com/PXP2_GradeBook.aspx?AGU=0";
const percent = (n: number | null) =>
  n === null ? "—" : `${Number(n.toFixed(2))}%`;
// Use the same MCPS scale for course letters, category bars and score colors.
const scoreTone = (value: number | null) => gradeTone(letterFromPercent(value));
const calculatedGradeHint =
  "Letter calculated from the StudentVUE percentage using the MCPS grading scale.";
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
// Matches StudentVUE's own countdown wording: hours collapse the seconds.
const remainingLabel = (seconds: number) => {
  const h = Math.floor(seconds / 3600),
    m = Math.floor((seconds % 3600) / 60),
    s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
};
// Re-renders once a second so the class countdown stays live.
function useClock(enabled: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [enabled]);
  return now;
}
// The class in session right now, with seconds left, from today's bell schedule.
function useClassCountdown(schedule: TodaySchedule | null) {
  const now = useClock(!!schedule?.meetings.length);
  if (!schedule?.meetings.length) return null;
  const at = new Date(now);
  const minutes = at.getHours() * 60 + at.getMinutes();
  const active = activeMeeting(schedule.meetings, minutes);
  if (!active) return null;
  const secondsLeft = Math.max(
    0,
    active.end * 60 - (minutes * 60 + at.getSeconds()),
  );
  return { ...active, secondsLeft, label: remainingLabel(secondsLeft) };
}
// Under a minute turns red, under five minutes amber - GradeDurian's urgency cue.
const urgency = (seconds: number) =>
  seconds < 60 ? "urgent" : seconds < 300 ? "soon" : "";

// Renew a remembered connection this long before the server's hour runs out.
const renewEarly = 2 * 60 * 1000;

export function Gradebook({ demoWorkspace }: { demoWorkspace: boolean }) {
  const [connection, setConnection] = useState<GradebookConnection | null>(
    null,
  );
  const [sample, setSample] = useState<GradebookData | null>(null);
  const [busy, setBusy] = useState(true),
    [error, setError] = useState("");
  const [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [remember, setRemember] = useState(true);
  const [connectMethod, setConnectMethod] = useState<"api" | "browser-session">(
    "api",
  );
  const [sessionCookie, setSessionCookie] = useState("");
  const [showConnect, setShowConnect] = useState(false),
    [query, setQuery] = useState("");
  const [sort, setSort] = useState("schedule");
  const [view, setView] = useState<"card" | "table">(() => {
    try {
      return localStorage.getItem("bc:gradebookView") === "table"
        ? "table"
        : "card";
    } catch {
      return "card";
    }
  });
  const chooseView = (next: "card" | "table") => {
    setView(next);
    try {
      localStorage.setItem("bc:gradebookView", next);
    } catch {
      /* private mode: the choice just does not persist */
    }
  };
  const [params, setParams] = useSearchParams();
  const active = useRef(true);
  const connectHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (showConnect) connectHeading.current?.focus();
  }, [showConnect]);
  // Reconnects with the sign-in this device saved ("Keep me signed in").
  const resuming = useRef(false);
  const resume = async () => {
    if (resuming.current) return;
    resuming.current = true;
    setBusy(true);
    try {
      const c = await api<GradebookConnection>("gradebook/resume", "POST");
      if (!active.current) return;
      setConnection(c);
      setSample(null);
      setShowConnect(false);
      setError("");
    } catch (e) {
      if (!active.current) return;
      setError(e instanceof Error ? e.message : "Could not load your grades.");
      try {
        const c = await api<GradebookConnection>("gradebook");
        if (active.current) setConnection(c);
      } catch {
        /* original error stays visible */
      }
    } finally {
      resuming.current = false;
      if (active.current) setBusy(false);
    }
  };
  useEffect(() => {
    active.current = true;
    void api<GradebookConnection>("gradebook")
      .then((c) => {
        if (!active.current) return;
        setConnection(c);
        if (!c.connected && c.remembered) return resume();
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
    const remembered = connection.remembered;
    const timer = setTimeout(
      () => {
        // A saved sign-in renews the hour-long connection shortly before it ends.
        if (remembered) {
          void resume();
          return;
        }
        setConnection((c) =>
          c ? { ...c, connected: false, snapshot: null, expiresAt: null } : c,
        );
        setError(
          "Your StudentVUE connection expired. Connect again to load your grades.",
        );
      },
      Math.max(
        0,
        Date.parse(connection.expiresAt) -
          Date.now() -
          (remembered ? renewEarly : 0),
      ),
    );
    return () => clearTimeout(timer);
  }, [connection?.expiresAt, connection?.remembered]);

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
      setSessionCookie("");
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
          if (active.current && !c.connected && c.remembered) await resume();
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
    if (connectMethod === "browser-session") {
      const cookie = sessionCookie;
      setSessionCookie("");
      await run("gradebook/connect-session", { cookie });
      return;
    }
    const credentials = {
      username,
      password,
      ...(connection?.canRemember ? { remember } : {}),
    };
    setPassword("");
    await run("gradebook/connect", credentials);
  };
  const data = sample ?? connection?.snapshot;
  // The preview uses a stand-in schedule so the countdown is still visible.
  const sampleSchedule = useRef(
    demoSchedule(new Date().getHours() * 60 + new Date().getMinutes()),
  );
  const countdown = useClassCountdown(
    sample ? sampleSchedule.current : (connection?.schedule ?? null),
  );
  // Grading-period wording only changes by the day, so a value taken per render
  // is stable enough and avoids a second ticking clock.
  const now = Date.now();
  // The app topbar owns this node; it exists once the shell has rendered.
  const [topbarSlot, setTopbarSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setTopbarSlot(document.getElementById("gb-topbar-actions"));
  }, []);
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
      (c) =>
        Number.isFinite(c.marks[0]?.percent) ||
        gradeTone(c.marks[0]?.letter ?? "") !== "none",
    ) ?? [];
  const hasCalculatedLetters = data?.courses.some((c) =>
    c.marks.some((m) => gradeDisplay(m).calculated),
  );
  const missing =
    data?.courses.reduce(
      (sum, c) =>
        sum + (c.marks[0]?.assignments.filter((a) => a.missing).length ?? 0),
      0,
    ) ?? 0;

  const controls = data && (
    <div className="gb-toolbar">
      <div className="gb-toolbar-actions">
        <button
          className="icon-button"
          aria-label="Refresh grades"
          title="Refresh grades"
          disabled={busy}
          onClick={() => refresh()}
        >
          <RefreshCw size={17} className={busy ? "spin" : ""} />
        </button>
        <select
          aria-label="Grading period"
          value={data.period.index}
          disabled={busy}
          onChange={(e) => {
            setParams({});
            refresh(Number(e.target.value));
          }}
        >
          {data.periods.map((p) => {
            const timing = periodTiming(p, now);
            return (
              <option key={p.index} value={p.index}>
                {timing ? `${p.name} (${timing})` : p.name}
              </option>
            );
          })}
        </select>
        {!selected && (
          <button
            className="icon-button"
            aria-label={view === "card" ? "Show as table" : "Show as cards"}
            title={view === "card" ? "Show as table" : "Show as cards"}
            onClick={() => chooseView(view === "card" ? "table" : "card")}
          >
            {view === "card" ? <Table size={17} /> : <LayoutGrid size={17} />}
          </button>
        )}
        {!selected && (
          <details
            className="gb-filter-menu"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.currentTarget.open = false;
                event.currentTarget.querySelector("summary")?.focus();
              }
            }}
          >
            <summary
              aria-label="Filter and sort classes"
              title="Filter and sort classes"
            >
              <SlidersHorizontal size={18} />
            </summary>
            <div className="gb-filter-popover">
              <label className="field-label">
                Find a class
                <input
                  aria-label="Search gradebook courses"
                  value={query}
                  placeholder="Course or teacher"
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <label className="field-label">
                Sort classes
                <select
                  aria-label="Sort gradebook courses"
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                >
                  <option value="schedule">Schedule order</option>
                  <option value="grade">Lowest grade first</option>
                  <option value="name">Class name</option>
                </select>
              </label>
            </div>
          </details>
        )}
      </div>
    </div>
  );

  // Rendered into the app topbar beside the connection pill. Shown only with a
  // real connection to end, matching where this button used to live.
  const disconnect =
    topbarSlot &&
    data &&
    !sample &&
    createPortal(
      <button
        className="icon-button gb-topbar-disconnect"
        disabled={busy}
        title="Disconnect StudentVUE and forget this device's sign-in"
        aria-label="Disconnect StudentVUE"
        onClick={() => void run("gradebook/disconnect")}
      >
        <LogOut size={18} />
      </button>,
      topbarSlot,
    );

  return (
    <div className="gb-page">
      {disconnect}
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
            <p>
              {connectMethod === "api"
                ? "Use your MCPS student ID and StudentVUE password."
                : "Use your own signed-in StudentVUE website session. This new connection still needs live testing."}
            </p>
            {connection?.canConnect ? (
              <form onSubmit={(e) => void connect(e)}>
                <label className="field-label" htmlFor="sv-method">
                  Connection method
                  <select
                    id="sv-method"
                    value={connectMethod}
                    onChange={(e) => {
                      setConnectMethod(
                        e.target.value as "api" | "browser-session",
                      );
                      setPassword("");
                      setSessionCookie("");
                    }}
                  >
                    <option value="api">Student ID and password</option>
                    <option value="browser-session">
                      Browser session (Google sign-in) · Beta
                    </option>
                  </select>
                </label>
                {connectMethod === "browser-session" ? (
                  <>
                    <label className="field-label" htmlFor="sv-session">
                      StudentVUE session cookie
                      <input
                        id="sv-session"
                        type="password"
                        autoComplete="off"
                        spellCheck={false}
                        maxLength={6020}
                        required
                        value={sessionCookie}
                        onChange={(e) => setSessionCookie(e.target.value)}
                      />
                    </label>
                    <details className="gb-session-help">
                      <summary>How to get your session cookie</summary>
                      <ol>
                        <li>
                          On a personal computer, sign in to the official
                          StudentVUE website with Google.
                        </li>
                        <li>
                          Open your browser’s developer tools, choose Network,
                          then reload the StudentVUE Grade Book page.
                        </li>
                        <li>
                          Select the PXP2_Gradebook.aspx request to
                          md-mcps-psv.edupoint.com. Under Request Headers, copy
                          the Cookie value.
                        </li>
                        <li>
                          Paste it only in this private field in your Better
                          Canvas app. It must be a StudentVUE cookie, not a
                          Google cookie.
                        </li>
                      </ol>
                      <p>
                        The cookie acts as your StudentVUE sign-in. It stays in
                        server memory for up to one hour and is cleared when you
                        disconnect. MCPS may expire it sooner. You’ll need to
                        replace it to reconnect; it cannot renew your Google
                        sign-in.
                      </p>
                    </details>
                    <p className="gb-privacy">
                      This connection reads course grades and assignment scores
                      from the website. Category calculations, the class
                      countdown, and grading-period dates are not supported yet.
                    </p>
                  </>
                ) : (
                  <>
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
                    {connection.canRemember && (
                      <label className="check-label gb-remember">
                        <input
                          type="checkbox"
                          name="remember"
                          checked={remember}
                          onChange={(e) => setRemember(e.target.checked)}
                        />{" "}
                        Keep me signed in on this device
                      </label>
                    )}
                  </>
                )}
                <button
                  className="button primary"
                  type="submit"
                  disabled={busy}
                >
                  <LockKeyhole size={16} /> Connect securely
                </button>
                {connectMethod === "api" && connection.remembered && (
                  <button
                    className="text-button"
                    type="button"
                    disabled={busy}
                    onClick={() => void resume()}
                  >
                    <RefreshCw size={14} /> Try my saved sign-in again
                  </button>
                )}
                {connectMethod === "api" && (
                  <p className="gb-privacy">
                    StudentVUE sign-in uses GradeDurian by default, or the connection selected by your server settings. {" "}
                    {connection.canRemember && remember
                      ? "Your sign-in is encrypted and saved in a secure cookie on this device for 30 days, so the gradebook reconnects when you reopen the app. Disconnecting or signing out forgets it. Grades are not saved for offline use."
                      : "Your credentials stay in server memory for up to one hour, then are cleared. Disconnecting or signing out clears them sooner. Grades are not saved for offline use."}
                  </p>
                )}
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
                controls={controls}
              />
            </>
          ) : (
            <>
              {controls}
              {view === "card" ? (
                <div className="gb-grid">
                  {courses.map((c) => {
                    const m = c.marks[0];
                    const grade = gradeDisplay(m);
                    const live =
                      countdown !== null &&
                      c.period !== null &&
                      countdown.period === c.period;
                    return (
                      <button
                        key={c.id}
                        className="gb-course"
                        data-grade={grade.tone}
                        data-live={live ? "true" : undefined}
                        onClick={() => setParams({ course: c.id })}
                      >
                        <span className="gb-card-period">
                          {c.period === null ? "—" : c.period}
                        </span>
                        <div className="gb-card-info">
                          <h3>{c.name}</h3>
                          <p className="gb-card-teacher">
                            {c.teacher || "Teacher not provided"}
                            {live && (
                              <span
                                className={`gb-countdown ${urgency(countdown.secondsLeft)}`}
                                title={`Ends at ${clockLabel(countdown.end)}`}
                              >
                                {countdown.label}
                              </span>
                            )}
                          </p>
                        </div>
                        <div className="gb-card-foot">
                          <strong
                            className="gb-card-grade"
                            title={
                              grade.calculated ? calculatedGradeHint : undefined
                            }
                          >
                            {grade.letter}
                            {m?.percent !== null &&
                              m?.percent !== undefined && (
                                <span> ({percent(m.percent)})</span>
                              )}
                          </strong>
                          <span className="gb-view-button">View</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="gb-table-wrap">
                  <table className="gb-table gb-course-table">
                    <thead>
                      <tr>
                        <th>Period</th>
                        <th>Course Name</th>
                        <th>Teacher</th>
                        <th>Grade</th>
                      </tr>
                    </thead>
                    <tbody>
                      {courses.map((c) => {
                        const m = c.marks[0];
                        const grade = gradeDisplay(m);
                        const live =
                          countdown !== null &&
                          c.period !== null &&
                          countdown.period === c.period;
                        return (
                          <tr key={c.id} data-live={live ? "true" : undefined}>
                            <td>{c.period === null ? "—" : c.period}</td>
                            <td>
                              <button
                                className="gb-link-button"
                                onClick={() => setParams({ course: c.id })}
                              >
                                {c.name}
                              </button>
                              {live && (
                                <span
                                  className={`gb-countdown ${urgency(countdown.secondsLeft)}`}
                                >
                                  {countdown.label}
                                </span>
                              )}
                            </td>
                            <td>{c.teacher || "—"}</td>
                            <td
                              className="gb-grade-cell"
                              data-grade={grade.tone}
                              title={
                                grade.calculated
                                  ? calculatedGradeHint
                                  : undefined
                              }
                            >
                              <strong>{grade.letter}</strong>
                              {m?.percent !== null &&
                                m?.percent !== undefined && (
                                  <span> ({percent(m.percent)})</span>
                                )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
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
          <div className="gb-status">
            <span>
              {data.courses.length} classes · {marked.length} reported grades
              {missing > 0 && (
                <span className="gb-missing-count"> · {missing} missing</span>
              )}
            </span>
            <span>
              {sample
                ? "StudentVUE preview"
                : `Updated ${new Date(data.fetchedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`}
            </span>
          </div>
          <p className="gb-footnote">
            <ShieldCheck size={14} />{" "}
            {sample ? "Demo only" : "Reported grades from StudentVUE / Synergy"}{" "}
            {!sample && connection?.method === "browser-session" && (
              <span>
                · Browser session · Category calculations and the class
                countdown are unavailable.
              </span>
            )}
            {hasCalculatedLetters && (
              <span>
                · Letters are calculated from percentages when StudentVUE has
                not posted one.
              </span>
            )}
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

function CourseDetails({
  course,
  controls,
}: {
  course: GradeCourse;
  controls: ReactNode;
}) {
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
        <MarkDetails key={markIndex} mark={mark} controls={controls} />
      ) : (
        <div className="gb-empty">
          {controls}
          <h3>No grade posted</h3>
          <p>Your teacher has not published a grade for this class.</p>
        </div>
      )}
    </div>
  );
}

type WhatIfRow = {
  id: string;
  name: string;
  category: string;
  earned: string;
  possible: string;
};
const num = (s: string) => {
  const n = Number(s.trim());
  return Number.isFinite(n) && n >= 0 ? n : 0;
};
// An assignment is already inside Synergy's reported category totals only once
// it has a score and is not excused, so an edit to it is a delta, not an add.
const counted = (a: GradeAssignment) => !a.excluded && a.earned !== null;
const pointsOf = (n: number | null) =>
  n === null ? "" : String(Number(n.toFixed(2)));

// Click-to-edit number cell, matching GradeDurian's inline score fields.
function ScoreField({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
}) {
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);
  return editing ? (
    <input
      ref={ref}
      className="gb-score-input"
      type="number"
      min={0}
      step="any"
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={() => setEditing(false)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === "Escape") setEditing(false);
      }}
    />
  ) : (
    <button
      type="button"
      className="gb-score-value"
      onClick={() => setEditing(true)}
      aria-label={`${label}: ${value === "" ? "not graded" : value}. Edit`}
    >
      {value === "" ? "NG" : value}
    </button>
  );
}

function MarkDetails({
  mark,
  controls,
}: {
  mark: GradeMark;
  controls: ReactNode;
}) {
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [sort, setSort] = useState("newest");
  const [rows, setRows] = useState<WhatIfRow[]>([]);
  const [overrides, setOverrides] = useState<
    Record<string, { earned: string; possible: string }>
  >({});
  const categories = mark.categories;
  const defaultCategory = categories[0]?.name ?? "";
  const seq = useRef(0);

  const addRow = () =>
    setRows((r) => [
      {
        id: `whatif-${(seq.current += 1)}`,
        name: "New Assignment",
        category: defaultCategory,
        earned: "0",
        possible: "0",
      },
      ...r,
    ]);
  const setRow = (id: string, patch: Partial<WhatIfRow>) =>
    setRows((r) => r.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const removeRow = (id: string) =>
    setRows((r) => r.filter((x) => x.id !== id));
  const override = (a: GradeAssignment) =>
    overrides[a.id] ?? {
      earned: pointsOf(a.earned),
      possible: pointsOf(a.possible),
    };
  const setOverride = (
    a: GradeAssignment,
    patch: Partial<{ earned: string; possible: string }>,
  ) => setOverrides((o) => ({ ...o, [a.id]: { ...override(a), ...patch } }));
  const clearOverride = (id: string) =>
    setOverrides((o) => {
      const next = { ...o };
      delete next[id];
      return next;
    });
  const reset = () => {
    setRows([]);
    setOverrides({});
  };

  // Project the reported category totals forward: hypothetical rows add points,
  // edited real assignments contribute only the difference they make.
  const adjusted: GradeCategory[] = categories.map((c) => {
    let earned = c.earned ?? 0,
      possible = c.possible ?? 0;
    for (const r of rows)
      if (r.category === c.name) {
        earned += num(r.earned);
        possible += num(r.possible);
      }
    for (const a of mark.assignments) {
      const o = overrides[a.id];
      if (!o || a.category !== c.name) continue;
      earned += num(o.earned) - (counted(a) ? (a.earned ?? 0) : 0);
      possible += num(o.possible) - (counted(a) ? (a.possible ?? 0) : 0);
    }
    return {
      ...c,
      earned: Math.max(0, earned),
      possible: Math.max(0, possible),
    };
  });
  const changed = rows.length > 0 || Object.keys(overrides).length > 0;
  const estimate = estimateGrade(adjusted);
  const baseline = estimateGrade(categories);
  const shown = changed && estimate !== null ? estimate : mark.percent;
  const grade = gradeDisplay(mark);

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
      <div className="gb-grade-head" data-grade={grade.tone}>
        <div
          className="gb-grade-figure"
          title={grade.calculated ? calculatedGradeHint : undefined}
        >
          <strong>{grade.letter}</strong>
          {mark.percent !== null && <span>({percent(mark.percent)})</span>}
        </div>
        {changed && estimate !== null && (
          <span className="gb-estimate-chip">
            <Calculator size={14} /> What-if estimate{" "}
            {letterFromPercent(estimate)} ({percent(estimate)})
          </span>
        )}
      </div>
      <div
        className="gb-bar gb-bar-total"
        data-grade={
          changed && estimate !== null ? scoreTone(estimate) : grade.tone
        }
      >
        <span className="gb-bar-fill" style={barStyle(shown)} />
        <span className="gb-bar-label">
          Total{shown !== null ? ` (${percent(shown)})` : ""}
        </span>
      </div>
      {categories.map((c, i) => {
        const a = adjusted[i];
        const pct =
          a.possible !== null && a.possible > 0 && a.earned !== null
            ? (a.earned / a.possible) * 100
            : null;
        return (
          <div
            className="gb-bar"
            key={i}
            data-grade={
              changed || gradeTone(c.reportedGrade) === "none"
                ? scoreTone(pct)
                : gradeTone(c.reportedGrade)
            }
          >
            <span className="gb-bar-fill" style={barStyle(pct)} />
            <span className="gb-bar-label">
              {c.name} ({percent(pct)}) - {points(a.earned)}/
              {points(a.possible)}
              {c.weight !== null && (
                <em className="gb-weight"> · {c.weight}% weight</em>
              )}
            </span>
          </div>
        );
      })}
      {!categories.length && (
        <p className="gb-muted">
          StudentVUE has not provided category totals for this grade.
        </p>
      )}
      {baseline === null && categories.length > 0 && (
        <p className="gb-muted">
          StudentVUE did not publish complete category weights, so what-if
          estimates are unavailable for this class.
        </p>
      )}

      <div className="gb-detail-actions">
        {controls}
        <button
          className="button"
          onClick={addRow}
          disabled={!categories.length}
        >
          <FilePlus2 size={15} /> Add assignment
        </button>
        {changed && (
          <button className="text-button" onClick={reset}>
            Reset what-if
          </button>
        )}
        <p className="gb-simulation-label">
          <Calculator size={14} /> Edit any score or add assignments to test a
          grade. Nothing is sent to StudentVUE.
        </p>
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
        <table className="gb-table gb-assignment-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Assignment</th>
              <th>Score</th>
              <th>Category</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="gb-whatif-row">
                <td>Today</td>
                <td>
                  <input
                    className="gb-name-input"
                    aria-label="What-if assignment name"
                    value={r.name}
                    onChange={(e) => setRow(r.id, { name: e.target.value })}
                  />
                </td>
                <td>
                  <div className="gb-score">
                    <ScoreField
                      label="Points earned"
                      value={r.earned}
                      onChange={(v) => setRow(r.id, { earned: v })}
                    />
                    <span>/</span>
                    <ScoreField
                      label="Points possible"
                      value={r.possible}
                      onChange={(v) => setRow(r.id, { possible: v })}
                    />
                  </div>
                </td>
                <td>
                  <select
                    aria-label="What-if assignment category"
                    value={r.category}
                    onChange={(e) => setRow(r.id, { category: e.target.value })}
                  >
                    {categories.map((c, i) => (
                      <option key={i} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <button
                    className="icon-button"
                    title="Remove what-if assignment"
                    aria-label={`Remove what-if assignment ${r.name}`}
                    onClick={() => removeRow(r.id)}
                  >
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
            {assignments.map((a, i) => {
              const o = override(a);
              const edited = !!overrides[a.id];
              return (
                <tr
                  key={`${a.id}:${i}`}
                  className={edited ? "gb-edited-row" : undefined}
                  data-excluded={a.excluded ? "true" : undefined}
                >
                  <td>{date(a.due)}</td>
                  <td>
                    <strong>{a.name}</strong>
                    {a.notes && (
                      <p className="gb-assignment-notes">{a.notes}</p>
                    )}
                    {a.excluded ? (
                      <span className="badge gray">Excluded</span>
                    ) : a.missing ? (
                      <span className="badge red">Missing</span>
                    ) : null}
                  </td>
                  <td>
                    <div
                      className="gb-score"
                      data-grade={
                        a.excluded || o.earned === "" || num(o.possible) <= 0
                          ? "none"
                          : scoreTone((num(o.earned) / num(o.possible)) * 100)
                      }
                    >
                      <ScoreField
                        label={`${a.name} points earned`}
                        value={o.earned}
                        onChange={(v) => setOverride(a, { earned: v })}
                      />
                      <span>/</span>
                      <ScoreField
                        label={`${a.name} points possible`}
                        value={o.possible}
                        onChange={(v) => setOverride(a, { possible: v })}
                      />
                    </div>
                  </td>
                  <td>{a.category || "—"}</td>
                  <td>
                    {edited && (
                      <button
                        className="icon-button"
                        title="Undo this what-if edit"
                        aria-label={`Undo what-if edit to ${a.name}`}
                        onClick={() => clearOverride(a.id)}
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!assignments.length && !rows.length && (
          <div className="gb-empty">
            <p>No assignments match this view.</p>
          </div>
        )}
      </div>
    </>
  );
}
