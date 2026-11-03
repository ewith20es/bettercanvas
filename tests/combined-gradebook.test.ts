import { expect, it } from "vitest";
import { combinedGradebook } from "../packages/domain/src/combined-gradebook";
import {
  demoGradebook,
  demoGradebookCanvas,
} from "../packages/domain/src/gradebook-demo";
import type { Assignment } from "../packages/domain/src";

function fixture() {
  const book = demoGradebook(),
    canvas = demoGradebookCanvas();
  const original = book.courses[0].marks[0];
  const merge = () => combinedGradebook(book, canvas).courses[0].marks[0];
  return { book, canvas, original, merge };
}

it("matches MCPS sections and normalized titles, and applies category deltas only once", () => {
  const { book, canvas, original, merge } = fixture();
  const before = structuredClone(book);
  Object.assign(canvas.courses[0], {
    name: "Hon English 9A-Olivero-S1-2027",
    code: "",
    sections: ["Hon English 9A-P01-Olivero"],
  });
  const mark = merge();
  expect(mark.assignments).toHaveLength(original.assignments.length + 1);
  expect(mark.assignments.find((a) => a.id === "3")).toMatchObject({
    earned: 85,
    canvasChange: "updated",
  });
  expect(mark.assignments.at(-1)).toMatchObject({
    due: "2026-09-18",
    canvasChange: "added",
  });
  expect(mark.categories[1]).toMatchObject({ earned: 93, possible: 110 });
  expect(mark.percent).toBeCloseTo(93.0545, 4);
  expect(merge()).toEqual(mark);
  expect(book).toEqual(before);
});

it("keeps equal, missing and superseded Canvas scores from overriding StudentVUE", () => {
  const { canvas, original, merge } = fixture();
  canvas.assignments.pop();
  const s = canvas.assignments[0].submission!;
  for (const fields of [
    { score: 99 },
    { score: null },
    { score: 88, currentGrade: false },
  ]) {
    Object.assign(s, fields);
    expect(merge()).toEqual(original);
  }
  Object.assign(s, { score: 0, currentGrade: true });
  expect(merge().assignments[2]).toMatchObject({
    earned: 0,
    canvasChange: "updated",
  });
});

it("uses the school-local date at the quarter boundary and never adds unplaceable work", () => {
  const { book, canvas, merge } = fixture();
  canvas.assignments = [
    { ...canvas.assignments[1], dueAt: "2026-10-31T03:59:00Z" },
  ];
  expect(merge().assignments.at(-1)?.canvasChange).toBe("added");
  for (const dueAt of [null, "2026-10-31T04:00:00Z"]) {
    canvas.assignments[0].dueAt = dueAt;
    expect(merge().assignments).toHaveLength(4);
  }
  book.period.start = book.period.end = "";
  expect(merge().assignments).toHaveLength(4);
});

it("does not import another class, ambiguous section or live data into a preview", () => {
  const { canvas, original, merge } = fixture();
  canvas.courses[0].sections = ["Hon English 9A-P02"];
  expect(merge()).toEqual(original);
  delete canvas.courses[0].sections;
  canvas.courses.push({ ...canvas.courses[0], id: "parallel-section" });
  expect(merge()).toEqual(original);
  canvas.courses.pop();
  canvas.demo = false;
  expect(merge()).toEqual(original);
});

it("places undated work by the explicit Canvas marking period when StudentVUE lacks dates", () => {
  const { book, canvas, merge } = fixture();
  book.period = { ...book.period, name: "MP1", start: "", end: "" };
  book.periods = [book.period];
  canvas.assignments = [
    { ...canvas.assignments[1], gradingPeriod: "MP 1", dueAt: null },
  ];
  expect(merge().assignments.at(-1)).toMatchObject({
    due: "",
    canvasChange: "added",
  });
  canvas.assignments[0].gradingPeriod = "MP 2";
  expect(merge().assignments).toHaveLength(4);
});

it("pairs repeated titles by due date and leaves ambiguous scores alone", () => {
  const { canvas, original, merge } = fixture();
  original.assignments.push({
    ...original.assignments[2],
    id: "repeat",
    due: "2026-09-11",
  });
  canvas.assignments.pop();
  expect(
    merge()
      .assignments.filter((a) => a.canvasChange)
      .map((a) => a.id),
  ).toEqual(["3"]);
  canvas.assignments[0].dueAt = "2026-09-22T12:00:00Z";
  expect(merge()).toEqual(original);
});

it("retains distinct exercise numbers and leaves ungraded and excused additions out of totals", () => {
  const { canvas, original, merge } = fixture();
  original.assignments[2].name = "Unit 2 HW 2";
  const row = canvas.assignments[0];
  canvas.assignments = [
    { ...row, name: "(P) Unit 2 HW 1", submission: null },
    { ...row, id: "excused", name: "Bonus", omitFromGrade: true },
  ];
  const mark = merge();
  expect(
    mark.assignments
      .slice(-2)
      .map((a) => [a.canvasChange, a.earned, a.excluded]),
  ).toEqual([
    ["added", null, false],
    ["added", 85, true],
  ]);
  expect(mark.percent).toBe(original.percent);
});

it("labels points-only estimates and withholds weighted estimates with unknown inputs", () => {
  const { canvas, original, merge } = fixture();
  const row: Assignment = canvas.assignments[1];
  row.group = "Unmapped group";
  expect(merge()).toMatchObject({
    percent: null,
    canvasEstimate: "unavailable",
  });
  original.categories = [];
  expect(merge().percent).toBeCloseTo(((94 + 85 + 8) / 210) * 100);
  expect(merge().canvasEstimate).toBe("points");
  row.points = null;
  expect(merge().percent).toBeNull();
});
