import { dayKey, type Assignment, type Course, type Snapshot } from "./index";
import {
  estimateGrade,
  hasGradeScore,
  letterFromPercent,
  pointsPercentage,
  type GradeAssignment,
  type Gradebook,
  type GradeCourse,
  type GradeMark,
  type GradePeriod,
} from "./gradebook";
import { periodFromCanvas } from "./schedule";

const words = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

// Keep unit, exercise and date numbers. Only remove known category labels and
// the optional Spanish due-date annotation, which may appear on Canvas alone.
const titleKey = (name: string) =>
  words(
    name
      .replace(
        /^\s*(?:\((?:p|pp|ppr|at|ata)\)\s*|at\s*[:-]\s*|(?:pp|ppr|ata)\b[\s:-]*)/i,
        "",
      )
      .replace(/\s*\(fecha de entrega\s*:[^)]*\)\s*$/i, ""),
  );

function matchCourse(course: Course, courses: GradeCourse[]) {
  const period = periodFromCanvas(course);
  const names = [course.name, course.code, ...(course.sections ?? [])].map(
    words,
  );
  // MCPS Canvas course and section names often append the teacher, semester,
  // year or Pnn. Require the actual course title before those suffixes.
  const matches = courses.filter((c) => {
    if (period !== undefined && c.period !== null && c.period !== period)
      return false;
    // StudentVUE may append a catalog code such as "(ITC2013A)" that Canvas
    // omits. Keep the full title usable when both portals include the code.
    const shortName = c.name.replace(/\s*\([A-Z]{2,5}\d{3,5}[A-Z\d]*\)\s*$/i, "");
    const titles = (shortName === c.name ? [c.name] : [c.name, shortName]).map(words);
    const surname = words(c.teacher.split(",")[0]).split(" ").at(-1);
    return titles.some(title =>
      !!title &&
      names.some((n) => {
        if (n === title) return true;
        if (!n.startsWith(title + " ")) return false;
        const suffix = n.slice(title.length + 1).split(" ")[0];
        return suffix === surname || /^(?:p\d{1,2}|s[12]|period)$/.test(suffix);
      })
    );
  });
  return matches.length === 1 ? matches[0] : undefined;
}

type DatedAssignment = { row: Assignment; due: string; inPeriod: boolean };
const quarter = (name: string) =>
  /^(?:mp|marking period|quarter|qtr|q)\s*([1-4])$/i.exec(name.trim())?.[1];
function scopedAssignment(
  row: Assignment,
  period: GradePeriod,
): DatedAssignment | null {
  const due = row.dueAt ? dayKey(row.dueAt) : "";
  const canvasQuarter = quarter(row.gradingPeriod ?? ""),
    selectedQuarter = quarter(period.name);
  if (canvasQuarter && selectedQuarter)
    return canvasQuarter === selectedQuarter
      ? { row, due, inPeriod: true }
      : null;
  const evidence =
    row.dueAt ?? row.submission?.submittedAt ?? row.submission?.gradedAt;
  const when = due || (evidence ? dayKey(evidence) : "");
  if (
    when &&
    ((period.start && when < period.start) || (period.end && when > period.end))
  )
    return null;
  return { row, due, inPeriod: !!(when && period.start && period.end) };
}

function overlay(
  mark: GradeMark,
  rows: DatedAssignment[],
  allowAdds: boolean,
): GradeMark {
  const assignments = [...mark.assignments];
  const categories = mark.categories.map((c) => ({ ...c }));
  let reason: string | undefined;
  let scoreChanged = false;
  function count(a: GradeAssignment, direction: 1 | -1) {
    if (!hasGradeScore(a)) return;
    scoreChanged = true;
    if (!categories.length) return;
    const cat = categories.find((c) => c.name === a.category);
    if (!cat || a.earned === null || a.possible === null) {
      reason ??= !cat
        ? a.category
          ? `“${a.name}” is in “${a.category}”, which has no matching StudentVUE grading category.`
          : `“${a.name}” has no grading category.`
        : `“${a.name}” is missing the points needed to update its category total.`;
      return;
    }
    if (cat.earned !== null || cat.possible === 0)
      cat.earned = (cat.earned ?? 0) + direction * a.earned;
    if (cat.possible !== null) cat.possible += direction * a.possible;
    cat.reportedGrade = "";
  }

  function apply({ row, due }: DatedAssignment, original?: GradeAssignment) {
    const sub = row.submission;
    const earned = sub?.currentGrade === false ? null : (sub?.score ?? null);
    if (!original && earned === null) return;
    const excluded = !!(
      original?.excluded ||
      sub?.excused ||
      row.omitFromGrade
    );
    if (original && earned === null && original.excluded === excluded) return;
    const possible = row.points ?? original?.possible ?? null;
    if (
      original &&
      earned === original.earned &&
      possible === original.possible &&
      excluded === original.excluded
    )
      return;
    const group = categories.find(
      (c) => words(c.name) === words(row.group ?? ""),
    );
    const merged: GradeAssignment = {
      id: original?.id ?? `canvas:${row.courseId}:${row.id}`,
      name: original?.name ?? row.name,
      category: original?.category || group?.name || row.group || "",
      due: original?.due || due,
      assigned: original?.assigned ?? "",
      earned: earned ?? original?.earned ?? null,
      possible,
      score: earned !== null ? String(earned) : (original?.score ?? ""),
      notes: original?.notes ?? "",
      excluded,
      missing: !excluded && (sub?.missing ?? original?.missing ?? false),
      canvasChange: original ? "updated" : "added",
    };
    if (original) {
      count(original, -1);
      assignments[mark.assignments.indexOf(original)] = merged;
    } else assignments.push(merged);
    count(merged, 1);
  }

  const byTitle = new Map<string, DatedAssignment[]>();
  for (const r of rows) {
    const key = titleKey(r.row.name);
    const group = byTitle.get(key);
    if (group) group.push(r);
    else byTitle.set(key, [r]);
  }
  for (const [title, group] of byTitle) {
    if (!title) continue;
    const originals = mark.assignments.filter(
      (a) => titleKey(a.name) === title,
    );
    const matched = new Set<GradeAssignment>();
    // Resolve repeated titles by a unique school-local due date on both sides.
    const remaining = group.filter((r) => {
      const onDate = originals.filter((a) => r.due && a.due === r.due);
      if (
        onDate.length !== 1 ||
        group.filter((x) => x.due === r.due).length !== 1
      )
        return true;
      apply(r, onDate[0]);
      matched.add(onDate[0]);
      return false;
    });
    const candidates = originals.filter((a) => !matched.has(a));
    if (!candidates.length && allowAdds) {
      for (const r of remaining) if (r.inPeriod) apply(r);
    } else if (
      remaining.length === 1 &&
      candidates.length === 1 &&
      remaining[0].inPeriod
    ) {
      apply(remaining[0], candidates[0]);
    }
  }

  if (!assignments.some((a) => a.canvasChange)) return mark;
  if (!scoreChanged) return { ...mark, assignments };
  let value: number | null = null;
  if (categories.length) {
    if (
      !reason &&
      categories.every((c) => c.earned === null || c.earned >= 0)
    )
      value = estimateGrade(categories);
  } else {
    value = pointsPercentage(assignments.filter(hasGradeScore));
  }
  return {
    ...mark,
    assignments,
    categories,
    percent: value,
    canvasEstimateReason: value === null ? reason ?? (categories.length
      ? "The category weights and point totals do not support a weighted average."
      : "There are insufficient graded assignment points to calculate a percentage.") : undefined,
    letter: letterFromPercent(value),
    canvasEstimate:
      value === null
        ? "unavailable"
        : categories.length
          ? "weighted"
          : "points",
  };
}

/** Browser-only projection. The official snapshot is also the undo baseline. */
export function combinedGradebook(
  book: Gradebook,
  canvas: Snapshot,
): Gradebook {
  if (canvas.demo !== book.demo) return book;
  const listed = book.periods.find((p) => p.index === book.period.index);
  const period = {
    ...book.period,
    start: book.period.start || listed?.start || "",
    end: book.period.end || listed?.end || "",
  };
  const pairs = canvas.courses.map((c) => ({
    canvasId: c.id,
    course: matchCourse(c, book.courses),
  }));
  return {
    ...book,
    courses: book.courses.map((course) => {
      const matched = pairs.filter((p) => p.course === course);
      if (matched.length !== 1) return course;
      const rows = canvas.assignments
        .filter((a) => a.courseId === matched[0].canvasId)
        .map((a) => scopedAssignment(a, period))
        .filter((r) => r !== null);
      if (!rows.length) return course;
      const empty: GradeMark = {
        name: book.period.name,
        letter: "N/A",
        percent: null,
        categories: [],
        assignments: [],
      };
      const marks = course.marks.length ? course.marks : [empty];
      const merged = marks.map((m) =>
        overlay(m, rows, marks.length === 1 || m.name === period.name),
      );
      return merged.every((m, i) => m === marks[i])
        ? course
        : { ...course, marks: merged };
    }),
  };
}
