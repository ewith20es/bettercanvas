import type { Course } from "./index";

export const schedule = [
  { period: 0, name: "Homeroom", room: "332", match: /\bhomeroom\b/ },
  {
    period: 1,
    name: "Hon English 9A",
    room: "P14",
    match: /\benglish\s*9\s*a?\b/,
  },
  {
    period: 2,
    name: "Hon Spanish 3A",
    room: "163",
    match: /\bspanish\s*(3\s*a?|iii)\b/,
  },
  {
    period: 3,
    name: "Photography 1A",
    room: "004 · Photography",
    match: /\bphotography\s*1\s*a?\b/,
  },
  {
    period: 4,
    name: "Mag Functions A",
    room: "309",
    match: /\bfunctions\s*a?\b/,
  },
  { period: 5, name: "Lunch", room: "Cafeteria", match: /\blunch\b/ },
  { period: 6, name: "Adv Sci1 Physics DP", room: "215", match: /\bphysics\b/ },
  {
    period: 7,
    name: "Research Exp ProbSolv 1A",
    room: "211",
    match: /\bresearch\s+(exp|experimentation|experience)\b|\bprob\s*solv\b/,
  },
  {
    period: 8,
    name: "Fnd Computer Sci A",
    room: "328",
    match: /\bcomputer\s+sci(ence)?\b/,
  },
  {
    period: 9,
    name: "AP US History A",
    room: "242",
    match: /\b(u\s*s|united states)\s+history\b/,
  },
  {
    period: 10,
    name: "Advisory",
    room: "342 · Academy Office",
    match: /\badvisory\b/,
  },
];

export function coursePeriod(
  course: Course,
  overrides: Record<string, number> = {},
) {
  if (Object.hasOwn(overrides, course.id))
    return schedule.find((s) => s.period === overrides[course.id]);
  const text = `${course.name} ${course.code}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return schedule.find((s) => s.match.test(text));
}

export function sortCourses(
  courses: Course[],
  overrides: Record<string, number> = {},
) {
  return [...courses].sort(
    (a, b) =>
      (coursePeriod(a, overrides)?.period ?? Infinity) -
        (coursePeriod(b, overrides)?.period ?? Infinity) ||
      a.name.localeCompare(b.name, undefined, { numeric: true }) ||
      a.id.localeCompare(b.id),
  );
}
