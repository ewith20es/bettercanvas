import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  AlertCircle,
  ArrowDownToLine,
  ArrowRight,
  BookOpen,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Eye,
  EyeOff,
  LifeBuoy,
  LockKeyhole,
  LogOut,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  X,
} from "lucide-react";
import {
  attentionRank,
  courseColors,
  dayKey,
  dueText,
  shiftDay,
  sortAssignments,
  statusOf,
  type Assignment,
  type Course,
  type Snapshot,
  type Status,
} from "../../../packages/domain/src";
import type { Preferences } from "./data";
import { SUPPORT_DISCORD_URL } from "./support";
import { TokenExpirySettings } from "./TokenExpiry";
import {
  coursePeriod,
  schedule,
  sortCourses,
} from "../../../packages/domain/src/schedule";
import { useAssignmentTools } from "./webmcp";
export type ViewProps = {
  data: Snapshot;
  prefs: Preferences;
  updatePrefs: (p: Partial<Preferences>) => void;
  now: Date;
  open: (a: Assignment) => void;
  hiddenAtEntry?: string[];
};
const nameOf = (c: Course, p: Preferences) => p.nicknames[c.id] || c.name;
const colorOf = (c: Course, data: Snapshot, p: Preferences) =>
  p.colors[c.id] ||
  courseColors[
    Math.max(
      0,
      data.courses.findIndex((v) => v.id === c.id),
    ) % courseColors.length
  ];
const assignmentKey = (a: Assignment) => `${a.courseId}:${a.id}`;
const inPerson = (a: Assignment, p: Preferences) => p.submittedInPerson.includes(assignmentKey(a));
function InPersonButton({ a, prefs, updatePrefs }: Pick<ViewProps, "prefs" | "updatePrefs"> & { a: Assignment }) {
  const checked = inPerson(a, prefs);
  const label = checked ? "Undo submitted in person" : "Mark submitted in person";
  return (
    <button className="assignment-check-button icon-button" aria-pressed={checked}
      aria-label={`${label}: ${a.name}`} title={`${label} (saved on this device only)`}
      onClick={() => updatePrefs({ submittedInPerson: checked
        ? prefs.submittedInPerson.filter((id) => id !== assignmentKey(a))
        : [...prefs.submittedInPerson, assignmentKey(a)] })}>
      <Check size={19} />
    </button>
  );
}
const missingOrOverdue = (s: Status) => !s.excused && (s.missing || s.overdue);
const visible = (d: Snapshot, p: Preferences, hidden = p.hiddenAssignments) =>
  d.assignments.filter(
    (a) => !p.hidden.includes(a.courseId) && !hidden.includes(assignmentKey(a)),
  );
export const fmtFull = (v: string | null, zone: string) =>
  v
    ? new Intl.DateTimeFormat("en-US", {
        timeZone: zone,
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(v))
    : "Not recorded";
export function Empty({
  title,
  text,
  action,
}: {
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <CheckCheck size={29} />
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}
function Badge({ a, now, prefs }: { a: Assignment; now: Date; prefs: Preferences }) {
  const s = statusOf(a, now, inPerson(a, prefs));
  return (
    <span className={"badge " + s.tone}>
      {s.submitted ? (
        <Check size={14} />
      ) : s.excused ? null : (
        <span className="status-dot" />
      )}
      {s.label}
    </span>
  );
}
function Row({
  a,
  data,
  prefs,
  now,
  open,
  updatePrefs,
}: ViewProps & { a: Assignment }) {
  const hidden = prefs.hiddenAssignments.includes(assignmentKey(a));
  const c = data.courses.find((c) => c.id === a.courseId)!;
  const s = statusOf(a, now, inPerson(a, prefs)),
    sync = data.sync.find((v) => v.courseId === a.courseId);
  return (
    <div
      className={`assignment-with-hide${hidden ? " assignment-hidden" : ""}`}
    >
      <button
        className={
          "assignment-row " + (attentionRank(a, now, inPerson(a, prefs)) < 3 ? "attention" : "")
        }
        onClick={() => open(a)}
        aria-label={`${a.name}, ${s.label}${s.missing ? ", Missing in Canvas" : ""}`}
      >
        <span
          className="course-line"
          style={{ background: colorOf(c, data, prefs) }}
        />
        <div className="assignment-main">
          <strong>
            {a.name}
            {a.locked && <LockKeyhole size={14} aria-label="Locked" />}
          </strong>
          <span>
            <span style={{ color: colorOf(c, data, prefs) }}>
              {nameOf(c, prefs)}
            </span>
            <i>·</i>
            <span>{dueText(a, prefs.zone, now)}</span>
            {a.points !== null && (
              <>
                <i>·</i>
                <span>{a.points} pts</span>
              </>
            )}
          </span>
          {(s.reason || s.late || a.locked || sync?.error) && (
            <div className="row-flags">
              {s.reason && (
                <span className={s.check ? "amber-text" : "red-text"}>
                  {s.reason}
                </span>
              )}
              {s.late && <span className="amber-text">Late in Canvas</span>}
              {a.locked && <span>Locked — check Canvas</span>}
              {sync?.error && <span>Previous data</span>}
            </div>
          )}
        </div>
        <div className="status-column">
          <Badge a={a} now={now} prefs={prefs} />
          {s.grading && (
            <small>
              {s.grading}
              {s.graded && a.submission?.score != null
                ? ` · ${a.submission.score}${a.points !== null ? `/${a.points}` : ""}`
                : ""}
            </small>
          )}
        </div>
        <ChevronRight size={17} />
      </button>
      <InPersonButton a={a} prefs={prefs} updatePrefs={updatePrefs} />
      <button
        className="assignment-hide-button icon-button"
        aria-label={`${hidden ? "Unhide" : "Hide"} ${a.name}`}
        aria-pressed={hidden}
        title={hidden ? "Unhide assignment" : "Hide assignment"}
        onClick={() =>
          updatePrefs({
            hiddenAssignments: hidden
              ? prefs.hiddenAssignments.filter((id) => id !== assignmentKey(a))
              : [...prefs.hiddenAssignments, assignmentKey(a)],
          })
        }
      >
        {hidden ? <EyeOff size={19} /> : <Eye size={19} />}
      </button>
    </div>
  );
}
function Section({
  title,
  items,
  props,
  hint,
}: {
  title: string;
  items: Assignment[];
  props: ViewProps;
  hint?: string;
}) {
  return (
    <section>
      <div className="section-title">
        <h2>
          {title}
          <span className="count">{items.length}</span>
        </h2>
        {hint && <span>{hint}</span>}
      </div>
      <div className="assignment-list">
        {items.map((a) => (
          <Row key={`${a.courseId}:${a.id}`} a={a} {...props} />
        ))}
      </div>
    </section>
  );
}
export function Home(props: ViewProps & { incomplete: boolean }) {
  const { data, prefs, now } = props;
  const [showDone, setShowDone] = useState(false);
  const all = visible(data, prefs, props.hiddenAtEntry),
    today = dayKey(now, prefs.zone);
  const needs = all.filter((a) => statusOf(a, now, inPerson(a, prefs)).needsWork),
    selected = sortAssignments(showDone ? all : needs);
  const attention = selected
    .filter((a) => attentionRank(a, now, inPerson(a, prefs)) < 9)
    .sort((a, b) => attentionRank(a, now, inPerson(a, prefs)) - attentionRank(b, now, inPerson(b, prefs)));
  const remaining = selected.filter(
    (a) => attentionRank(a, now, inPerson(a, prefs)) === 9 && !statusOf(a, now, inPerson(a, prefs)).excused,
  );
  const todayItems = remaining.filter(
      (a) => a.dueAt && dayKey(a.dueAt, prefs.zone) === today,
    ),
    tomorrow = remaining.filter(
      (a) => a.dueAt && dayKey(a.dueAt, prefs.zone) === shiftDay(today, 1),
    );
  const later = remaining.filter(
      (a) => a.dueAt && dayKey(a.dueAt, prefs.zone) > shiftDay(today, 1),
    ),
    older = remaining.filter(
      (a) => a.dueAt && dayKey(a.dueAt, prefs.zone) < today,
    ),
    undated = remaining.filter((a) => !a.dueAt);
  const completed = all.filter((a) => statusOf(a, now, inPerson(a, prefs)).submitted).length,
    counts = all.filter(
      (a) => a.dueAt && dayKey(a.dueAt, prefs.zone) === today,
    ).length;
  const week = later
    .filter((a) => dayKey(a.dueAt!, prefs.zone) <= shiftDay(today, 7))
    .slice(0, 8);
  return (
    <>
      <div className="stats">
        <Link to={`/assignments?day=${today}`}>
          <span>
            <CalendarDays size={16} /> Due today
          </span>
          <strong>
            {counts}
            <small>{counts === 1 ? "assignment" : "assignments"}</small>
          </strong>
        </Link>
        <Link to="/assignments?filter=attention">
          <span>
            <AlertCircle size={16} /> Needs attention
          </span>
          <strong className={attention.length ? "red-text" : ""}>
            {attention.length}
            <small>to check first</small>
          </strong>
        </Link>
        <Link to="/assignments?filter=submitted">
          <span>
            <CheckCheck size={17} /> Submitted
          </span>
          <strong>
            {completed}
            <small>across selected courses</small>
          </strong>
        </Link>
      </div>
      <div className="home-controls">
        <span>
          <span className="tiny-label">YOUR NEXT STEPS</span>
          <span className="muted">
            {data.courses.filter((c) => !prefs.hidden.includes(c.id)).length}{" "}
            selected courses
          </span>
        </span>
        <label className="check-label">
          <input
            type="checkbox"
            checked={showDone}
            onChange={(e) => setShowDone(e.target.checked)}
          />{" "}
          Show submitted & graded
        </label>
      </div>
      {!selected.length && (
        <Empty
          title={
            props.incomplete
              ? "No work in the available data."
              : "Nothing to work on here."
          }
          text={
            props.incomplete
              ? "Refresh to check courses with unavailable or older data."
              : data.courses.length === 0
                ? "No active student courses were returned by Canvas."
                : "Review completed work or adjust your selected courses."
          }
          action={
            <Link className="button" to="/assignments">
              View all assignments
            </Link>
          }
        />
      )}
      {attention.length > 0 && (
        <Section
          title="Needs attention"
          items={attention}
          props={props}
          hint="A good place to start"
        />
      )}
      {todayItems.length > 0 && (
        <Section
          title="Today"
          items={todayItems}
          props={props}
          hint="One step at a time"
        />
      )}
      {tomorrow.length > 0 && (
        <Section title="Tomorrow" items={tomorrow} props={props} />
      )}
      {week.length > 0 && (
        <Section
          title="Later"
          items={week}
          props={props}
          hint="The next 7 days"
        />
      )}
      {later.length > 0 && (
        <Link className="list-link" to="/assignments?filter=upcoming">
          See all upcoming assignments <ArrowRight size={15} />
        </Link>
      )}
      {undated.length > 0 && (
        <Section
          title="No due date"
          items={undated}
          props={props}
          hint="Worth keeping on your radar"
        />
      )}
      {showDone && older.length > 0 && (
        <Section title="Earlier assignments" items={older} props={props} />
      )}
      <div className="quiet-note">
        <ShieldCheck size={15} /> Canvas statuses include your personal in-person marks.
        Submit work using your teacher’s instructions.
      </div>
    </>
  );
}
export function Assignments(props: ViewProps) {
  const { data, prefs, now } = props;
  const [params, setParams] = useSearchParams();
  const requestedFilter = params.get("filter") ?? "all";
  const filter = requestedFilter === "overdue" ? "missing" : requestedFilter,
    query = params.get("q") ?? "",
    course = params.get("course") ?? "",
    day = params.get("day"),
    work = params.get("work") === "1";
  const requestedStatus =
    filter === "hidden" ? (params.get("status") ?? "all") : filter;
  const statusFilter =
    requestedStatus === "overdue" ? "missing" : requestedStatus;
  const missingCount = visible(data, prefs).filter((a) =>
    missingOrOverdue(statusOf(a, now, inPerson(a, prefs))),
  ).length;
  const set = (key: string, value: string) =>
    setParams((prev) => {
      const p = new URLSearchParams(prev);
      value ? p.set(key, value) : p.delete(key);
      return p;
    });
  const filters = [
    ["all", "All"],
    ["upcoming", "Upcoming"],
    ["missing", "Missing"],
    ["submitted", "Submitted"],
    ["graded", "Graded"],
    ["hidden", "Hidden"],
  ];
  const filtered = sortAssignments(
    (filter === "hidden"
      ? data.assignments.filter((a) =>
          prefs.hiddenAssignments.includes(assignmentKey(a)),
        )
      : visible(data, prefs, props.hiddenAtEntry)
    ).filter((a) => {
      const s = statusOf(a, now, inPerson(a, prefs));
      const match =
        statusFilter === "upcoming"
          ? !!a.dueAt && Date.parse(a.dueAt) >= now.getTime()
          : statusFilter === "missing"
            ? missingOrOverdue(s)
            : statusFilter === "submitted"
              ? s.submitted
              : statusFilter === "graded"
                ? s.graded
                : statusFilter === "attention"
                  ? attentionRank(a, now, inPerson(a, prefs)) < 9
                  : true;
      return (
        match &&
        (!course || a.courseId === course) &&
        a.name.toLowerCase().includes(query.toLowerCase()) &&
        (!work || s.needsWork) &&
        (!day || (!!a.dueAt && dayKey(a.dueAt, prefs.zone) === day))
      );
    }),
  );
  const defaultSort = ["submitted", "graded", "hidden"].includes(filter)
    ? "newest"
    : "due";
  const sort = params.get("sort") ?? defaultSort;
  if (sort === "newest")
    filtered.sort(
      (a, b) =>
        (b.dueAt ? Date.parse(b.dueAt) : -Infinity) -
          (a.dueAt ? Date.parse(a.dueAt) : -Infinity) ||
        a.name.localeCompare(b.name),
    );
  if (sort === "name") filtered.sort((a, b) => a.name.localeCompare(b.name));
  if (sort === "course")
    filtered.sort((a, b) =>
      nameOf(
        data.courses.find((c) => c.id === a.courseId)!,
        prefs,
      ).localeCompare(
        nameOf(
          data.courses.find((c) => c.id === b.courseId)!,
          prefs,
        ),
      ),
    );
  const dueGroups = new Map<string, Assignment[]>();
  if (filter === "upcoming") {
    for (const assignment of filtered) {
      const key = dayKey(assignment.dueAt!, prefs.zone);
      const group = dueGroups.get(key) ?? [];
      group.push(assignment);
      dueGroups.set(key, group);
    }
  }
  const orderedGroups = [...dueGroups].sort(([a], [b]) =>
    sort === "newest" ? b.localeCompare(a) : a.localeCompare(b),
  );
  const today = dayKey(now, prefs.zone);
  useAssignmentTools(
    filter === "upcoming" ? orderedGroups.flatMap(([, items]) => items) : filtered,
    now,
    prefs.submittedInPerson,
  );
  return (
    <>
      <div className="tabs" aria-label="Assignment filters">
        {filters.map(([id, name]) => (
          <button
            key={id}
            className={filter === id ? "active" : ""}
            aria-pressed={filter === id}
            aria-label={
              id === "missing" && missingCount
                ? `Missing, ${missingCount} missing or overdue ${missingCount === 1 ? "assignment" : "assignments"}`
                : name
            }
            onClick={() =>
              setParams((prev) => {
                const p = new URLSearchParams(prev);
                p.set("filter", id);
                p.delete("day");
                p.delete("course");
                p.delete("q");
                p.delete("work");
                p.delete("status");
                p.delete("sort");
                return p;
              })
            }
          >
            {name}
            {id === "missing" && missingCount > 0 && (
              <span className="missing-tab-count" aria-hidden="true">
                {missingCount}
              </span>
            )}
          </button>
        ))}
      </div>
      {filter === "missing" && (
        <p className="filter-help">
          Missing in Canvas or past due without a recorded submission. Use the checkmark for work submitted in person; this is saved on this device only and does not change Canvas. Undo it from Submitted or All.
        </p>
      )}
      {filter === "hidden" && (
        <p className="hidden-help">
          Hidden from your workspace on this device. Use the eye button to
          restore an assignment. Nothing changes in Canvas.
        </p>
      )}
      <div className="filter-bar">
        <label className="search-box">
          <Search size={18} />
          <input
            aria-label="Search assignments"
            placeholder="Search assignments…"
            value={query}
            onChange={(e) => set("q", e.target.value)}
          />
        </label>
        <select
          aria-label="Filter by course"
          value={course}
          onChange={(e) => set("course", e.target.value)}
        >
          <option value="">
            {filter === "hidden" ? "All courses" : "All selected courses"}
          </option>
          {data.courses
            .filter((c) => filter === "hidden" || !prefs.hidden.includes(c.id))
            .map((c) => (
              <option key={c.id} value={c.id}>
                {nameOf(c, prefs)}
              </option>
            ))}
        </select>
        {filter === "hidden" && (
          <select
            aria-label="Filter hidden assignments by status"
            value={statusFilter}
            onChange={(e) => set("status", e.target.value)}
          >
            <option value="all">All statuses</option>
            <option value="upcoming">Upcoming</option>
            <option value="missing">Missing</option>
            <option value="submitted">Submitted</option>
            <option value="graded">Graded</option>
          </select>
        )}
        <select
          aria-label="Sort assignments"
          value={sort}
          onChange={(e) => set("sort", e.target.value)}
        >
          <option value="due">Due date: earliest first</option>
          <option value="newest">Due date: latest first</option>
          <option value="name">{filter === "upcoming" ? "Name within each day" : "Assignment name"}</option>
          <option value="course">{filter === "upcoming" ? "Course within each day" : "Course name"}</option>
        </select>
      </div>
      <div className="filter-secondary">
        <span>
          {filtered.length} assignments{day ? ` · ${day}` : ""}
        </span>
        <div>
          <label className="check-label">
            <input
              type="checkbox"
              checked={work}
              onChange={(e) => set("work", e.target.checked ? "1" : "")}
            />{" "}
            Needs work only
          </label>
          {(course ||
            query ||
            work ||
            day ||
            sort !== defaultSort ||
            (filter === "hidden" && statusFilter !== "all") ||
            filter === "attention") && (
            <button
              className="text-button"
              onClick={() =>
                setParams(filter === "attention" ? {} : { filter })
              }
            >
              Clear filters
            </button>
          )}
        </div>
      </div>
      {filtered.length ? (
        filter === "upcoming" ? (
          <div className="assignment-agenda">
            {orderedGroups.map(([date, assignments]) => (
              <section key={date} aria-labelledby={`due-${date}`}>
                <h2 id={`due-${date}`} className="assignment-date-heading">
                  <time dateTime={date}>
                    {date === today ? "Today · " : date === shiftDay(today, 1) ? "Tomorrow · " : ""}
                    {new Intl.DateTimeFormat("en-US", {
                      timeZone: "UTC",
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    }).format(new Date(`${date}T12:00:00Z`))}
                  </time>
                  <span className="assignment-date-count">{assignments.length}</span>
                </h2>
                <div className="assignment-list">
                  {assignments.map((a) => (
                    <Row key={`${a.courseId}:${a.id}`} a={a} {...props} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
        <div className="assignment-list">
          {filtered.map((a) => (
            <Row key={`${a.courseId}:${a.id}`} a={a} {...props} />
          ))}
        </div>
        )
      ) : (
        <Empty
          title="No assignments match."
          text="Try another filter, course, or search term."
        />
      )}
    </>
  );
}
export function Calendar(props: ViewProps) {
  const { data, prefs, now } = props,
    today = dayKey(now, prefs.zone);
  const [month, setMonth] = useState(today.slice(0, 7)),
    [selected, setSelected] = useState(today);
  const first = `${month}-01`,
    date = new Date(`${first}T12:00:00Z`),
    start = shiftDay(first, -date.getUTCDay());
  const cells = Array.from({ length: 42 }, (_, i) => shiftDay(start, i)),
    all = sortAssignments(visible(data, prefs, props.hiddenAtEntry));
  const move = (n: number) => {
    const d = new Date(`${first}T12:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + n);
    const key = d.toISOString().slice(0, 10);
    setMonth(key.slice(0, 7));
    setSelected(key);
  };
  const dayItems = all.filter(
      (a) => a.dueAt && dayKey(a.dueAt, prefs.zone) === selected,
    ),
    undated = all.filter((a) => !a.dueAt);
  return (
    <>
      <div className="calendar-card">
        <div className="calendar-heading">
          <h2>
            {new Intl.DateTimeFormat("en-US", {
              month: "long",
              year: "numeric",
              timeZone: "UTC",
            }).format(date)}
          </h2>
          <div>
            <button
              className="button"
              onClick={() => {
                setMonth(today.slice(0, 7));
                setSelected(today);
              }}
            >
              Today
            </button>
            <button
              className="icon-button"
              aria-label="Previous month"
              onClick={() => move(-1)}
            >
              <ChevronLeft size={20} />
            </button>
            <button
              className="icon-button"
              aria-label="Next month"
              onClick={() => move(1)}
            >
              <ChevronRight size={20} />
            </button>
          </div>
        </div>
        <div className="calendar-weekdays">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
        <div className="calendar-grid">
          {cells.map((key) => {
            const items = all.filter(
              (a) => a.dueAt && dayKey(a.dueAt, prefs.zone) === key,
            );
            return (
              <button
                key={key}
                className={
                  "calendar-day " +
                  (key.slice(0, 7) !== month ? "outside " : "") +
                  (key === selected ? "selected " : "") +
                  (key === today ? "today" : "")
                }
                onClick={() => setSelected(key)}
                aria-pressed={key === selected}
                aria-label={`${key}, ${items.length} assignments`}
              >
                <span>{Number(key.slice(8))}</span>
                <div>
                  {items.slice(0, 2).map((a) => (
                    <span className="calendar-item" key={a.id}>
                      <span
                        style={{
                          background: colorOf(
                            data.courses.find((c) => c.id === a.courseId)!,
                            data,
                            prefs,
                          ),
                        }}
                      />
                      {a.name}
                    </span>
                  ))}
                  {items.length > 2 && <small>+{items.length - 2} more</small>}
                </div>
                {items.length > 0 && (
                  <b className="calendar-mobile-count">{items.length}</b>
                )}
              </button>
            );
          })}
        </div>
      </div>
      {dayItems.length ? (
        <Section
          title={new Intl.DateTimeFormat("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
            timeZone: "UTC",
          }).format(new Date(`${selected}T12:00:00Z`))}
          items={dayItems}
          props={props}
        />
      ) : (
        <Empty
          title="A little breathing room."
          text={`No assignment deadlines on ${selected}.`}
        />
      )}{" "}
      {undated.length > 0 && (
        <Section title="No due date" items={undated} props={props} />
      )}
    </>
  );
}
export function Courses(props: ViewProps) {
  const { data, prefs, updatePrefs, now } = props;
  const courses = sortCourses(data.courses, prefs.coursePeriods);
  return (
    <>
      <div className="section-title">
        <h2>{data.courses.length} active courses</h2>
        <div
          className="course-view-toggle"
          role="group"
          aria-label="Course view"
        >
          <button
            type="button"
            aria-pressed={prefs.courseView === "list"}
            onClick={() => updatePrefs({ courseView: "list" })}
          >
            List
          </button>
          <button
            type="button"
            aria-pressed={prefs.courseView === "gallery"}
            onClick={() => updatePrefs({ courseView: "gallery" })}
          >
            Gallery
          </button>
        </div>
      </div>
      <p className="course-order-note">
        In schedule order · Unmatched courses appear last. Adjust a course’s
        period if its Canvas name is different.
      </p>
      <div
        className={prefs.courseView === "list" ? "course-list" : "course-grid"}
      >
        {courses.map((c) => {
          const slot = coursePeriod(c, prefs.coursePeriods);
          const list = data.assignments.filter(
              (a) =>
                a.courseId === c.id &&
                !prefs.hiddenAssignments.includes(assignmentKey(a)),
            ),
            missing = list.filter((a) =>
              missingOrOverdue(statusOf(a, now, inPerson(a, prefs))),
            ).length,
            needs = list.filter((a) => statusOf(a, now, inPerson(a, prefs)).needsWork).length,
            hidden = prefs.hidden.includes(c.id);
          return (
            <article
              className={"course-card " + (hidden ? "hidden-course" : "")}
              key={c.id}
              style={
                { "--course-color": colorOf(c, data, prefs) } as CSSProperties
              }
            >
              <div className="course-card-top">
                <span className="course-symbol">
                  {slot ? (
                    <span aria-label={`Period ${slot.period}`}>
                      {slot.period}
                    </span>
                  ) : (
                    <BookOpen size={22} />
                  )}
                </span>
                <label className="switch-label">
                  <input
                    type="checkbox"
                    aria-label={`Show ${c.name}`}
                    checked={!hidden}
                    onChange={() =>
                      updatePrefs({
                        hidden: hidden
                          ? prefs.hidden.filter((id) => id !== c.id)
                          : [...prefs.hidden, c.id],
                      })
                    }
                  />
                  {hidden ? "Hidden" : "Shown"}
                </label>
              </div>
              <div className="course-identity">
                <p className="tiny-label">
                  {slot
                    ? `Period ${slot.period} · ${slot.name}`
                    : "Not in schedule"}
                </p>
                <h2>{nameOf(c, prefs)}</h2>
                <p className="course-room">
                  {slot ? `Room ${slot.room}` : c.code}
                </p>
              </div>
              <div className="course-counts">
                <span>
                  <strong>{needs}</strong> need attention or work
                </span>
                <span className={missing ? "red-text" : ""}>
                  {missing} missing
                </span>
              </div>
              <label className="field-label">
                Course nickname
                <input
                  placeholder={c.name}
                  value={prefs.nicknames[c.id] ?? ""}
                  maxLength={80}
                  onChange={(e) =>
                    updatePrefs({
                      nicknames: { ...prefs.nicknames, [c.id]: e.target.value },
                    })
                  }
                />
              </label>
              <label className="field-label course-period-field">
                Schedule period
                <select
                  aria-label={`Schedule period for ${c.name}`}
                  value={
                    Object.hasOwn(prefs.coursePeriods, c.id)
                      ? String(prefs.coursePeriods[c.id])
                      : "auto"
                  }
                  onChange={(e) => {
                    const coursePeriods = { ...prefs.coursePeriods };
                    if (e.target.value === "auto") delete coursePeriods[c.id];
                    else coursePeriods[c.id] = Number(e.target.value);
                    updatePrefs({ coursePeriods });
                  }}
                >
                  <option value="auto">Automatic match</option>
                  {schedule.map((s) => (
                    <option key={s.period} value={s.period}>
                      {s.period} · {s.name}
                    </option>
                  ))}
                  <option value="-1">Not in schedule</option>
                </select>
              </label>
              <div className="course-actions">
                <label className="color-label">
                  <input
                    type="color"
                    aria-label={`Color for ${c.name}`}
                    value={colorOf(c, data, prefs)}
                    onChange={(e) =>
                      updatePrefs({
                        colors: { ...prefs.colors, [c.id]: e.target.value },
                      })
                    }
                  />{" "}
                  Course color
                </label>
                <a href={c.url} target="_blank" rel="noreferrer">
                  Canvas <ExternalLink size={14} />
                </a>
              </div>
            </article>
          );
        })}
      </div>
      {!data.courses.length && (
        <Empty
          title="No active courses yet."
          text="Refresh after connecting your Canvas account."
        />
      )}
    </>
  );
}
type InstallEvent = Event & { prompt: () => Promise<void> };
export function Settings(
  props: ViewProps & {
    logout?: () => Promise<void>;
    clearData: () => Promise<void>;
  },
) {
  const { data, prefs, updatePrefs, logout, clearData } = props;
  const [confirm, setConfirm] = useState(false),
    [installPrompt, setInstallPrompt] = useState<InstallEvent | null>(null),
    [installNote, setInstallNote] = useState("");
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as InstallEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);
  return (
    <div className="settings-stack">
      <section className="settings-card">
        <div className="settings-title">
          <ShieldCheck size={20} />
          <div>
            <h2>Canvas connection</h2>
            <p>
              {data.demo
                ? "Demo mode · sample assignments"
                : "Your personal Canvas account"}
            </p>
          </div>
          <span
            className={
              "badge " + (data.demo ? "amber" : data.error ? "red" : "green")
            }
          >
            {data.demo
              ? "Not connected"
              : data.error
                ? "Needs attention"
                : "Canvas"}
          </span>
        </div>
        <div className="settings-body">
          <div className="setting-row">
            <div>
              <strong>Canvas address</strong>
              <p>{data.account.origin}</p>
            </div>
            <a
              className="button"
              href={data.account.origin}
              target="_blank"
              rel="noreferrer"
            >
              Open Canvas <ExternalLink size={14} />
            </a>
          </div>
          {data.demo && (
            <div className="setup-note">
              <strong>Ready for your own assignments?</strong>
              <p>
                Add your personal Canvas token and a separate app passphrase in
                your hosting settings. Keep both out of chat. Your next visit
                will show a sign-in screen.
              </p>
              <p className="field-help">
                The included README has the exact Render setup steps.
              </p>
            </div>
          )}
          {!data.demo && (
            <p className="field-help">
              Your token stays on the server. Update or revoke it through your
              Canvas and hosting settings.
            </p>
          )}
          <TokenExpirySettings
            date={prefs.canvasTokenExpiry}
            now={props.now}
            save={(canvasTokenExpiry) => updatePrefs({ canvasTokenExpiry })}
          />
        </div>
      </section>
      <section className="settings-card">
        <div className="settings-title">
          <SlidersHorizontal size={20} />
          <h2>Preferences</h2>
        </div>
        <div className="settings-body">
          <div className="setting-row">
            <div>
              <strong>Timezone</strong>
              <p>Used for deadlines and daily groups.</p>
            </div>
            <select
              aria-label="Timezone"
              value={prefs.zone}
              onChange={(e) => updatePrefs({ zone: e.target.value })}
            >
              {[
                "America/New_York",
                "America/Chicago",
                "America/Denver",
                "America/Los_Angeles",
                "UTC",
              ].map((z) => (
                <option key={z}>{z}</option>
              ))}
            </select>
          </div>
          <div className="setting-row">
            <div>
              <strong>Appearance</strong>
              <p>Choose what feels comfortable.</p>
            </div>
            <select
              aria-label="Appearance"
              value={prefs.theme}
              onChange={(e) =>
                updatePrefs({ theme: e.target.value as Preferences["theme"] })
              }
            >
              <option value="light">Light</option>
              <option value="dark">Dark</option>
              <option value="system">Match device</option>
            </select>
          </div>
          <div className="setting-row">
            <div>
              <strong>Offline assignments</strong>
              <p>
                Save assignment details on this trusted device. Anyone using
                this browser profile may see saved data.
              </p>
            </div>
            <label className="switch-label">
              <input
                type="checkbox"
                aria-label="Offline assignments"
                checked={prefs.offline}
                onChange={(e) => updatePrefs({ offline: e.target.checked })}
              />
              {prefs.offline ? "On" : "Off"}
            </label>
          </div>
          <div className="setting-row">
            <div>
              <strong>Install the app</strong>
              <p>Add Better Canvas to your home screen for quick access.</p>
              {installNote && <p role="status">{installNote}</p>}
            </div>
            <button
              className="button"
              onClick={async () => {
                if (installPrompt) {
                  await installPrompt.prompt();
                  setInstallPrompt(null);
                } else
                  setInstallNote(
                    "Use your browser’s Install app option. On iPhone, open in Safari and choose Share → Add to Home Screen.",
                  );
              }}
            >
              <ArrowDownToLine size={16} /> Install
            </button>
          </div>
        </div>
      </section>
      <section className="settings-card">
        <div className="settings-title">
          <RefreshCw size={20} />
          <h2>Last checked</h2>
        </div>
        <div className="settings-body">
          {data.error && <p className="red-text">{data.error}</p>}
          {data.sync.map((s) => (
            <div className="setting-row" key={s.courseId}>
              <div>
                <strong>
                  {data.courses.find((c) => c.id === s.courseId)?.name}
                </strong>
                <p>
                  {s.successAt
                    ? fmtFull(s.successAt, prefs.zone)
                    : "Not checked yet"}
                </p>
                {s.error && <p className="red-text">{s.error}</p>}
              </div>
              <span className={"badge " + (s.error ? "amber" : "green")}>
                {s.error ? "Needs update" : "Checked"}
              </span>
            </div>
          ))}
          {!data.sync.length && <p>No courses have been checked yet.</p>}
        </div>
      </section>
      <section className="settings-card">
        <div className="settings-title">
          <LifeBuoy size={20} />
          <h2>Help & support</h2>
        </div>
        <div className="settings-body">
          <div className="setting-row">
            <div>
              <strong>Support Discord</strong>
              <p>Ask questions, report problems, or suggest features.</p>
            </div>
            <a
              className="button"
              href={SUPPORT_DISCORD_URL}
              target="_blank"
              rel="noreferrer"
            >
              Join Discord <ExternalLink size={16} />
            </a>
          </div>
        </div>
      </section>
      <section className="settings-card">
        <div className="settings-title">
          <LockKeyhole size={20} />
          <h2>This device</h2>
        </div>
        <div className="settings-body">
          <div className="setting-row">
            <div>
              <strong>Clear saved data</strong>
              <p>
                Remove cached assignments and local preferences. This does not
                revoke your Canvas token.
              </p>
            </div>
            <button className="button" onClick={() => setConfirm(true)}>
              Clear data
            </button>
          </div>
          {confirm && (
            <div className="confirm-row">
              <span>
                Clear saved assignments and preferences from this browser?
              </span>
              <button className="button" onClick={() => setConfirm(false)}>
                Cancel
              </button>
              <button
                className="button primary"
                onClick={() => {
                  void clearData();
                  setConfirm(false);
                }}
              >
                Clear saved data
              </button>
            </div>
          )}
          {logout && (
            <div className="setting-row">
              <div>
                <strong>Sign out</strong>
                <p>Ends this app session and clears saved assignment data.</p>
              </div>
              <button className="button" onClick={() => void logout()}>
                <LogOut size={16} /> Sign out
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
export function Detail({
  a,
  data,
  prefs,
  now,
  close,
  updatePrefs,
}: ViewProps & { a: Assignment; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null),
    c = data.courses.find((c) => c.id === a.courseId)!,
    s = statusOf(a, now, inPerson(a, prefs));
  useEffect(() => {
    ref.current?.showModal();
    return () => ref.current?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="detail-dialog"
      onCancel={close}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      aria-labelledby="detail-title"
    >
      <div className="detail-inner">
        <div className="detail-top">
          <span
            className="tiny-label"
            style={{ color: colorOf(c, data, prefs) }}
          >
            {nameOf(c, prefs)}
          </span>
          <button
            className="icon-button"
            aria-label="Close assignment details"
            onClick={close}
          >
            <X size={21} />
          </button>
        </div>
        <h2 id="detail-title">{a.name}</h2>
        <div className="in-person-detail">
          <InPersonButton a={a} prefs={prefs} updatePrefs={updatePrefs} />
          <span>Submitted in person · your record on this device only</span>
        </div>
        <div className="detail-badges">
          <Badge a={a} now={now} prefs={prefs} />
          {s.missing && <span className="badge red">Missing in Canvas</span>}
          {s.late && <span className="badge amber">Late in Canvas</span>}
          {s.grading && <span className="badge blue">{s.grading}</span>}
        </div>
        {s.reason && (
          <div className="notice">
            <AlertCircle size={18} />
            {s.reason}
          </div>
        )}
        <dl>
          <div>
            <dt>Due</dt>
            <dd>{a.dueAt ? fmtFull(a.dueAt, prefs.zone) : "No due date"}</dd>
          </div>
          <div>
            <dt>Submitted</dt>
            <dd>
              {a.submission?.submittedAt
                ? fmtFull(a.submission.submittedAt, prefs.zone)
                : inPerson(a, prefs)
                  ? "Marked submitted in person by you; no submission time recorded"
                : s.submitted
                  ? "Canvas recorded submission; time unavailable"
                  : "No submission time recorded"}
            </dd>
          </div>
          <div>
            <dt>Grade</dt>
            <dd>
              {s.excused
                ? "Excused"
                : s.graded
                  ? `${a.submission?.grade ?? a.submission?.score}${a.submission?.currentGrade === false ? " (previous attempt)" : ""}`
                  : "Not available"}
            </dd>
          </div>
          <div>
            <dt>Points possible</dt>
            <dd>{a.points ?? "Not specified"}</dd>
          </div>
          <div>
            <dt>Availability</dt>
            <dd>
              {a.locked
                ? "Locked — check Canvas"
                : "See Canvas for submission options"}
            </dd>
          </div>
          {a.unlockAt && (
            <div>
              <dt>Opens</dt>
              <dd>{fmtFull(a.unlockAt, prefs.zone)}</dd>
            </div>
          )}
          {a.lockAt && (
            <div>
              <dt>Closes</dt>
              <dd>{fmtFull(a.lockAt, prefs.zone)}</dd>
            </div>
          )}
          <div>
            <dt>Last checked</dt>
            <dd>
              {fmtFull(
                data.sync.find((v) => v.courseId === a.courseId)?.successAt ??
                  null,
                prefs.zone,
              )}
            </dd>
          </div>
        </dl>
        <p className="field-help">
          {data.demo
            ? "This is a sample assignment. The link opens your Canvas homepage."
            : "Read the full instructions and submit your work in Canvas."}
        </p>
        <a
          className="button primary"
          href={a.url}
          target="_blank"
          rel="noreferrer"
        >
          Open in Canvas <ExternalLink size={16} />
        </a>
      </div>
    </dialog>
  );
}
