export type GradePeriod = {
  index: number;
  name: string;
  start: string;
  end: string;
};
export type GradeAssignment = {
  id: string;
  name: string;
  category: string;
  due: string;
  assigned: string;
  score: string;
  earned: number | null;
  possible: number | null;
  notes: string;
  excluded: boolean;
  missing: boolean;
};
export type GradeCategory = {
  name: string;
  weight: number | null;
  earned: number | null;
  possible: number | null;
  reportedGrade: string;
};
export type GradeMark = {
  name: string;
  letter: string;
  percent: number | null;
  categories: GradeCategory[];
  assignments: GradeAssignment[];
};
export type GradeCourse = {
  id: string;
  name: string;
  period: number | null;
  room: string;
  teacher: string;
  marks: GradeMark[];
};
export type Gradebook = {
  source: "synergy";
  demo: boolean;
  fetchedAt: string;
  period: GradePeriod;
  periods: GradePeriod[];
  courses: GradeCourse[];
};
// One class meeting from today's StudentVUE bell schedule. `start`/`end` are
// minutes since midnight in the school's local time, which is what the class
// countdown compares against the viewer's clock.
export type ClassMeeting = {
  name: string;
  period: number | null;
  room: string;
  teacher: string;
  start: number;
  end: number;
};
export type TodaySchedule = {
  fetchedAt: string;
  meetings: ClassMeeting[];
};
export type GradebookConnection = {
  connected: boolean;
  canConnect: boolean;
  /** The server can keep this device signed in to StudentVUE. */
  canRemember: boolean;
  /** This device has a saved StudentVUE sign-in it can reconnect with. */
  remembered: boolean;
  expiresAt: string | null;
  snapshot: Gradebook | null;
  schedule: TodaySchedule | null;
};

export function hasGradeScore(a: GradeAssignment) {
  return (
    !a.excluded &&
    (a.earned !== null ||
      (!!a.score.trim() &&
        !/^(not\s*graded|ungraded|not\s*scored|missing|n\/?a|[-—])$/i.test(
          a.score.trim(),
        )))
  );
}

export function gradeTone(letter: string) {
  letter = letter.trim().toUpperCase();
  if (/^A[+-]?$/.test(letter)) return "a";
  if (/^B[+-]?$/.test(letter)) return "b";
  if (/^C[+-]?$/.test(letter)) return "c";
  if (/^D[+-]?$/.test(letter)) return "d";
  if (/^[EF][+-]?$/.test(letter)) return "f";
  return "none";
}

// MCPS uses whole-number rounding for its A/B/C/D/E scale. Keep the
// unrounded percentage for display; 89.5 is an A, but 89.49 is still a B.
// https://www.montgomeryschoolsmd.org/curriculum/course-catalog/profile/
export function letterFromPercent(percent: number | null | undefined) {
  if (percent == null || !Number.isFinite(percent) || percent < 0) return "N/A";
  if (percent >= 89.5) return "A";
  if (percent >= 79.5) return "B";
  if (percent >= 69.5) return "C";
  if (percent >= 59.5) return "D";
  return "E";
}

// CalculatedScoreString can contain a percentage before letters are posted.
// Derive a display letter without changing Synergy's reported fields. Preserve
// explicit letter grades and special marks such as P or I when provided.
export function gradeDisplay(mark?: Pick<GradeMark, "letter" | "percent">) {
  const reported = mark?.letter.trim() ?? "";
  const canCalculate =
    /^(?:n\/?a|not\s*(?:graded|scored)|ungraded|[-—])?$/i.test(reported) ||
    /^\d+(?:\.\d+)?\s*%?$/.test(reported);
  const fallback = canCalculate ? letterFromPercent(mark?.percent) : "N/A";
  const calculated = fallback !== "N/A";
  const letter = calculated
    ? fallback
    : gradeTone(reported) !== "none"
      ? reported.toUpperCase()
      : canCalculate
        ? "N/A"
        : reported;
  return { letter, tone: gradeTone(letter), calculated };
}

export type WhatIfEntry = {
  category: string;
  earned: number;
  possible: number;
};

// Estimates use the category totals/weights returned by Synergy, never Canvas.
// Unknown weights or totals must not silently become zero.
// Accepts one hypothetical assignment or a list of them. Several entries may
// target the same category; their points are summed into that category's totals
// before the weighted average is renormalized over populated categories.
export function estimateGrade(
  categories: GradeCategory[],
  addition?: WhatIfEntry | WhatIfEntry[],
): number | null {
  if (
    !categories.length ||
    categories.some((c) => c.weight === null || c.weight < 0)
  )
    return null;
  const additions =
    addition === undefined
      ? []
      : Array.isArray(addition)
        ? addition
        : [addition];
  for (const a of additions)
    if (
      !categories.some((c) => c.name === a.category) ||
      !Number.isFinite(a.earned) ||
      !Number.isFinite(a.possible) ||
      a.earned < 0 ||
      a.possible <= 0
    )
      return null;
  let weighted = 0,
    weight = 0;
  for (const c of categories) {
    if (
      c.possible === null ||
      c.possible < 0 ||
      (c.earned === null && c.possible !== 0)
    )
      return null;
    const mine = additions.filter((a) => a.category === c.name);
    const addedEarned = mine.reduce((sum, a) => sum + a.earned, 0);
    const addedPossible = mine.reduce((sum, a) => sum + a.possible, 0);
    const possible = c.possible + addedPossible;
    if (possible <= 0 || !c.weight) continue;
    weighted += (((c.earned ?? 0) + addedEarned) / possible) * c.weight;
    weight += c.weight;
  }
  return weight > 0 ? (weighted / weight) * 100 : null;
}

// How far a grading period is from now, worded the way StudentVUE helpers do:
// "ends in 11 days", "starts in 13 days", "ended 3 days ago", "ends today".
// Returns "" when the dates are missing or unusable, so callers fall back to
// showing the period name on its own.
export function periodTiming(
  period: Pick<GradePeriod, "start" | "end">,
  now: number,
): string {
  const at = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const time = Date.parse(`${value}T12:00:00Z`);
    return Number.isFinite(time) ? time : null;
  };
  const day = 86400000;
  const days = (n: number) => `${n} day${n === 1 ? "" : "s"}`;
  const start = at(period.start),
    end = at(period.end);
  if (start !== null) {
    const toStart = Math.floor((start - now) / day);
    if (toStart > 0) return `starts in ${days(toStart)}`;
  }
  if (end === null) return "";
  const left = Math.ceil((end - now) / day);
  if (left > 0) return `ends in ${days(left)}`;
  const ago = Math.floor((now - end) / day);
  return ago > 0 ? `ended ${days(ago)} ago` : "ends today";
}

// Minutes since midnight -> "9:15 AM", for schedule labels.
export function clockLabel(minutes: number) {
  const h = Math.floor(minutes / 60),
    m = minutes % 60;
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

// The meeting covering `minutes` today, and when that class truly ends (back to
// back blocks of the same class are treated as one, matching StudentVUE).
export function activeMeeting(meetings: ClassMeeting[], minutes: number) {
  const active = meetings.find((m) => minutes >= m.start && minutes <= m.end);
  if (!active) return null;
  const end = meetings
    .filter((m) => m.name === active.name)
    .reduce((latest, m) => (m.end > latest ? m.end : latest), active.end);
  return { ...active, end };
}
