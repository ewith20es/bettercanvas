import { describe, expect, it } from "vitest";
import {
  gradeDisplay,
  coursePercentage, type GradeMark, type GradeAssignment,
  letterFromPercent,
} from "../packages/domain/src/gradebook";

describe("MCPS percentage-to-letter display", () => {
  it.each([
    [100, "A"],
    [105, "A"],
    [89.5, "A"],
    [89.499, "B"],
    [79.5, "B"],
    [79.499, "C"],
    [76.47, "C"],
    [69.5, "C"],
    [69.499, "D"],
    [59.5, "D"],
    [59.499, "E"],
    [0, "E"],
  ])(
    "converts %s%% to %s without rounding the input first",
    (percent, letter) => {
      expect(letterFromPercent(percent)).toBe(letter);
    },
  );

  it.each([null, undefined, NaN, Infinity, -1])(
    "does not turn an unavailable or invalid percentage (%s) into an E",
    (percent) => expect(letterFromPercent(percent)).toBe("N/A"),
  );

  it.each(["", "76.47", "76.47%"])(
    "shows a calculated colored letter when StudentVUE returns %j",
    (letter) => {
      const mark = { letter, percent: 76.47 };
      expect(gradeDisplay(mark)).toEqual({
        letter: "C",
        tone: "c",
        calculated: true,
      });
      expect(mark).toEqual({ letter, percent: 76.47 });
    },
  );

  it("uses the reported percentage instead of a rounded numeric score string", () => {
    expect(gradeDisplay({ letter: "90", percent: 89.49 })).toEqual({
      letter: "B",
      tone: "b",
      calculated: true,
    });
  });

  it("preserves reported letters and special marks", () => {
    expect(gradeDisplay({ letter: " b+ ", percent: 95 })).toEqual({
      letter: "B+",
      tone: "b",
      calculated: false,
    });
    expect(gradeDisplay({ letter: "I", percent: 95 })).toEqual({
      letter: "I",
      tone: "none",
      calculated: false,
    });
    expect(gradeDisplay({ letter: "A", percent: null }).tone).toBe("a");
  });

  it("leaves missing or suppressed percentages neutral and colors genuine zero scores", () => {
    for (const mark of [
      undefined,
      { letter: "", percent: null },
      { letter: "N/A", percent: 0 },
      { letter: "Not Graded", percent: 0 },
      { letter: "100", percent: null },
    ]) {
      expect(gradeDisplay(mark)).toEqual({
        letter: "N/A",
        tone: "none",
        calculated: false,
      });
    }
    expect(gradeDisplay({ letter: "0", percent: 0 })).toEqual({
      letter: "E",
      tone: "f",
      calculated: true,
    });
  });
});

describe("course percentage precision", () => {
  const row: GradeAssignment = { id: "1", name: "Quiz", category: "Practice", due: "", assigned: "", score: "14", earned: 14, possible: 15, notes: "", excluded: false, missing: false };
  const mark: GradeMark = { name: "MP1", letter: "A", percent: 93, assignments: [row, { ...row, earned: 0, excluded: true }], categories: [] };
  it("uses published weights before assignment points", () => {
    const categories = [
      { name: "Tests", earned: 28, possible: 30, weight: 75, reportedGrade: "" },
      { name: "Practice", earned: 93, possible: 100, weight: 25, reportedGrade: "" },
    ];
    const result = coursePercentage({ ...mark, categories });
    expect(result.basis).toBe("weighted");
    expect(result.value?.toFixed(2)).toBe("93.25");
  });
  it("labels a points-only result and ignores excused work", () => {
    const result = coursePercentage(mark);
    expect(result.basis).toBe("points");
    expect(result.value?.toFixed(2)).toBe("93.33");
  });
  it("preserves unavailable, fractional, unexplained and incomplete marks", () => {
    for (const percent of [null, 92.7, 85]) expect(coursePercentage({ ...mark, percent })).toEqual({ value: percent, basis: "reported" });
    expect(coursePercentage({ ...mark, assignments: [{ ...row, possible: null }] }).basis).toBe("reported");
  });
});
