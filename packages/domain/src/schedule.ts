import type { Course } from "./index";

/**
 * Class periods for ordering the Courses page.
 *
 * Nothing about any one student's timetable is built in. A course's period
 * comes from, in order:
 * 1. the period the user picked for it on the Courses page (saved per
 *    account on that device; -1 means "not in schedule"), then
 * 2. a period written in its Canvas course name, code or section name,
 *    such as "Period 3", "Per. 3" or "P3".
 * Canvas has no real timetable field, so courses whose names do not say a
 * period appear last until the user picks one.
 */
export const periodOptions = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export type CourseSlot = { period: number; source: "manual" | "canvas" };

const periodPattern = /\b(?:period|per|p)\s*\.?\s*(\d{1,2})\b/i;

/** The period written in Canvas text, if any. */
export function periodFromCanvas(course: Course): number | undefined {
  for (const text of [course.name, course.code, ...(course.sections ?? [])]) {
    const match = periodPattern.exec(text);
    const period = match ? Number(match[1]) : NaN;
    if (periodOptions.includes(period)) return period;
  }
  return undefined;
}

export function coursePeriod(
  course: Course,
  overrides: Record<string, number> = {},
): CourseSlot | undefined {
  if (Object.hasOwn(overrides, course.id))
    return periodOptions.includes(overrides[course.id])
      ? { period: overrides[course.id], source: "manual" }
      : undefined;
  const period = periodFromCanvas(course);
  return period === undefined ? undefined : { period, source: "canvas" };
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
