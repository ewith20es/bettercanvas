export type Submission = {
  state: string | null;
  submittedAt: string | null;
  missing: boolean | null;
  late: boolean | null;
  excused: boolean | null;
  score: number | null;
  grade: string | null;
  gradedAt: string | null;
  currentGrade: boolean | null;
  redo: boolean | null;
};
export type Assignment = {
  id: string;
  courseId: string;
  name: string;
  url: string;
  dueAt: string | null;
  unlockAt: string | null;
  lockAt: string | null;
  points: number | null;
  types: string[];
  locked: boolean;
  submission: Submission | null;
};
export type Course = {
  id: string;
  name: string;
  code: string;
  url: string;
  /** Canvas section names, which sometimes say the class period. */
  sections?: string[];
};
export type CourseSync = {
  courseId: string;
  successAt: string | null;
  error: string | null;
};
export type Snapshot = {
  account: { id: string; name: string; origin: string };
  demo: boolean;
  courses: Course[];
  assignments: Assignment[];
  sync: CourseSync[];
  fetchedAt: string | null;
  error: string | null;
};
export type Status = {
  label: string;
  tone: "green" | "red" | "amber" | "blue" | "gray";
  submitted: boolean;
  graded: boolean;
  missing: boolean;
  late: boolean;
  overdue: boolean;
  needsWork: boolean;
  check: boolean;
  excused: boolean;
  grading: string;
  reason: string | null;
};
export const emptySubmission: Submission = {
  state: "unsubmitted",
  submittedAt: null,
  missing: false,
  late: false,
  excused: false,
  score: null,
  grade: null,
  gradedAt: null,
  currentGrade: null,
  redo: false,
};
export function statusOf(a: Assignment, now = new Date(), submittedInPerson = false): Status {
  const s = a.submission;
  const submitted =
    !!s?.submittedAt ||
    s?.state === "submitted" ||
    s?.state === "pending_review";
  const graded = s?.score != null || s?.grade != null;
  const excused = s?.excused === true;
  const missing = s?.missing === true;
  const late = s?.late === true;
  const past = a.dueAt != null && new Date(a.dueAt).getTime() < now.getTime();
  const external = a.types.includes("external_tool");
  const offline = a.types.includes("on_paper") || a.types.includes("none");
  const unsubmitted =
    s?.state === "unsubmitted" && !submitted && !external && !offline;
  const overdue = !excused && past && !submitted && !graded;
  const check = !excused && !submitted && !graded && !unsubmitted;
  let label = "Status unavailable";
  let tone: Status["tone"] = "gray";
  if (excused) {
    label = "Excused";
  } else if (submitted) {
    label = s?.state === "pending_review" ? "Pending review" : "Submitted";
    tone = "green";
  } else if (offline) {
    label = "No online submission";
  } else if (external) {
    label = "Check in Canvas";
    tone = "amber";
  } else if (unsubmitted) {
    label = "Not submitted";
    tone = missing || overdue ? "red" : "amber";
  } else if (graded) {
    label = "No submission recorded";
  }
  if (!excused && !submitted && (missing || overdue)) {
    label = "Missing";
    tone = "red";
  }
  const grading = graded
    ? s?.currentGrade === false
      ? "Previous attempt graded"
      : "Graded"
    : submitted
      ? "Awaiting grade"
      : "";
  const needsWork = !excused && (!!s?.redo || missing || unsubmitted || check);
  const reason = excused
    ? null
    : s?.redo
      ? "Resubmission requested"
      : missing
        ? "Missing in Canvas"
        : overdue
          ? "Past due — no submission recorded"
          : check && past
            ? "Past due — check Canvas"
            : null;
  if (submittedInPerson && !excused) {
    return {
      label: "Submitted in person", tone: "green", submitted: true, graded,
      missing: false, late, overdue: false, needsWork: false, check: false,
      excused, grading: graded ? grading : "Awaiting grade", reason: null,
    };
  }
  return {
    label,
    tone,
    submitted,
    graded,
    missing,
    late,
    overdue,
    needsWork,
    check,
    excused,
    grading,
    reason,
  };
}
export function dayKey(date: Date | string, timeZone = "America/New_York") {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(date));
  const get = (name: string) => parts.find((p) => p.type === name)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
export function shiftDay(key: string, days: number) {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function dueText(a: Assignment, zone: string, now = new Date()) {
  if (!a.dueAt) return "No due date";
  const key = dayKey(a.dueAt, zone),
    today = dayKey(now, zone);
  const date =
    key === today
      ? "Today"
      : key === shiftDay(today, 1)
        ? "Tomorrow"
        : new Intl.DateTimeFormat("en-US", {
            timeZone: zone,
            month: "short",
            day: "numeric",
          }).format(new Date(a.dueAt));
  return `${date}, ${new Intl.DateTimeFormat("en-US", { timeZone: zone, hour: "numeric", minute: "2-digit" }).format(new Date(a.dueAt))}`;
}
export function sortAssignments(list: Assignment[]) {
  return [...list].sort(
    (a, b) =>
      (a.dueAt ? Date.parse(a.dueAt) : Infinity) -
        (b.dueAt ? Date.parse(b.dueAt) : Infinity) ||
      a.courseId.localeCompare(b.courseId) ||
      a.name.localeCompare(b.name),
  );
}
export function attentionRank(a: Assignment, now = new Date(), submittedInPerson = false) {
  const s = statusOf(a, now, submittedInPerson);
  return s.excused || submittedInPerson
    ? 9
    : a.submission?.redo
      ? 0
      : s.missing
        ? 1
        : s.overdue
          ? 2
          : s.reason
            ? 3
            : 9;
}
export const courseColors = [
  "#5473c5",
  "#267b65",
  "#a568b5",
  "#b27a29",
  "#c15c62",
  "#458ca8",
];
