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
export type GradebookConnection = {
  connected: boolean;
  canConnect: boolean;
  expiresAt: string | null;
  snapshot: Gradebook | null;
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
  if (/^A[+-]?$/.test(letter)) return "a";
  if (/^B[+-]?$/.test(letter)) return "b";
  if (/^C[+-]?$/.test(letter)) return "c";
  if (/^D[+-]?$/.test(letter)) return "d";
  if (/^[EF][+-]?$/.test(letter)) return "f";
  return "none";
}

// Estimates use the category totals/weights returned by Synergy, never Canvas.
// Unknown weights or totals must not silently become zero.
export function estimateGrade(
  categories: GradeCategory[],
  addition?: {
    category: string;
    earned: number;
    possible: number;
  },
): number | null {
  if (
    !categories.length ||
    categories.some((c) => c.weight === null || c.weight < 0)
  )
    return null;
  if (
    addition &&
    (!categories.some((c) => c.name === addition.category) ||
      !Number.isFinite(addition.earned) ||
      !Number.isFinite(addition.possible) ||
      addition.earned < 0 ||
      addition.possible <= 0)
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
    const added = addition?.category === c.name ? addition : undefined;
    const possible = c.possible + (added?.possible ?? 0);
    if (possible <= 0 || !c.weight) continue;
    weighted +=
      (((c.earned ?? 0) + (added?.earned ?? 0)) / possible) * c.weight;
    weight += c.weight;
  }
  return weight > 0 ? (weighted / weight) * 100 : null;
}
