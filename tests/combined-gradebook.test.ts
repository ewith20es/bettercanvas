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

it("pairs encoded and literal ampersands without merging other vocabulary work", () => {
  const { canvas, original, merge } = fixture();
  const quiz = canvas.assignments[0];
  canvas.assignments = [quiz];
  quiz.name = "Prueba: Vocabulario Secciones 5 & 6 NRT (fecha de entrega: 19/10; fecha límite: 27/10)";
  original.assignments[2].name = quiz.name.replace("&", "&amp;");
  original.assignments[1].name = "Tarea: Práctica de Vocabulario Parte 2";
  const result = merge();
  expect(result.assignments).toHaveLength(original.assignments.length);
  expect(result.assignments[2]).toMatchObject({ id: original.assignments[2].id, earned: 85, canvasChange: "updated" });
  expect(result.assignments[1]).toEqual(original.assignments[1]);
});

it("merges a regraded quiz when StudentVUE appends a catalog code to the course title", () => {
  const { book, canvas, original, merge } = fixture();
  const course = book.courses[0];
  Object.assign(course, { name: "Computer Science A (ITC1234A)", period: 8 });
  Object.assign(canvas.courses[0], { name: "Computer Science A-Example-S1-2027",
    code: "", sections: ["Computer Science A-P08-Example"] });
  const quiz = canvas.assignments[0];
  Object.assign(quiz, { name: "AT Spreadsheet Quiz R", dueAt: "2026-10-30T19:30:00Z", points: 18 });
  quiz.submission!.score = 18;
  Object.assign(original.assignments[2], { name: quiz.name, due: "2026-10-30", earned: 17, possible: 18 });
  const result = merge().assignments.filter(a => a.name === quiz.name);
  expect(result).toHaveLength(1);
  expect(result[0]).toMatchObject({ id: "3", earned: 18, possible: 18, canvasChange: "updated" });
  expect(original.assignments[2].earned).toBe(17);
});

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

it("isolates repeated assignment names when switching quarters", () => {
  const { book, canvas, original, merge } = fixture();
  const q1 = { ...canvas.assignments[0], gradingPeriod: "MP 1" };
  const q2 = { ...q1, id: "next-quarter", gradingPeriod: "MP 2", dueAt: "2026-11-06T18:00:00Z",
    submission: { ...q1.submission!, score: 75 } };
  canvas.assignments = [q1, q2];
  expect(merge().assignments[2].earned).toBe(85);
  book.period = book.periods[1];
  original.assignments[2].due = "2026-11-06";
  expect(merge().assignments[2].earned).toBe(75);
  // Neither a contradictory quarter label nor a later grading timestamp proves membership.
  canvas.assignments = [{ ...q1, gradingPeriod: "MP 2" }, { ...q2, gradingPeriod: "MP 1" },
    { ...q1, gradingPeriod: undefined, dueAt: null, submission: { ...q1.submission!, gradedAt: q2.dueAt } }];
  expect(merge()).toBe(original);
  book.period.start = book.period.end = "";
  canvas.assignments = [{ ...q2, gradingPeriod: undefined }];
  expect(merge()).toBe(original);
});

it("only adds assignments from the selected interim quarter even with broad reporting dates", () => {
  const { book, canvas, original, merge } = fixture();
  book.period = { index: 2, name: "MP2 Interim", start: "2026-08-25", end: "2026-11-20" };
  book.periods = [book.period];
  original.name = "MP2 Interim";
  const row = canvas.assignments[1];
  canvas.assignments = [
    { ...row, gradingPeriod: "MP 1" },
    { ...row, id: "q2", name: "Quarter two work", gradingPeriod: "MP 2", dueAt: "2026-11-06T18:00:00Z" },
  ];
  const merged = merge();
  expect(merged.assignments.filter(a => a.canvasChange)).toEqual([
    expect.objectContaining({ name: "Quarter two work", canvasChange: "added" }),
  ]);
  canvas.assignments = [{ ...canvas.assignments[0], name: "Reading notes" }];
  expect(merge()).toBe(original);
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

it("retains distinct exercise numbers and leaves excluded scores out of totals", () => {
  const { canvas, original, merge } = fixture();
  original.assignments[2].name = "Unit 2 HW 2";
  const row = canvas.assignments[0];
  canvas.assignments = [
    { ...row, name: "(P) Unit 2 HW 1", submission: { ...row.submission!, score: 0 } },
    { ...row, id: "excused", name: "Bonus", omitFromGrade: true },
  ];
  const mark = merge();
  expect(
    mark.assignments
      .slice(-2)
      .map((a) => [a.canvasChange, a.earned, a.excluded]),
  ).toEqual([
    ["added", 0, false],
    ["added", 85, true],
  ]);
  expect(mark.categories[1].possible).toBe(original.categories[1].possible! + row.points!);
});

it("skips Canvas-only placeholders and superseded grades while retaining scored extra credit", () => {
  const { canvas, original, merge } = fixture();
  const row = { ...canvas.assignments[1], points: 0 };
  for (const submission of [null, { ...row.submission!, score: null }, { ...row.submission!, currentGrade: false }]) {
    canvas.assignments = [{ ...row, submission }];
    expect(merge()).toBe(original);
  }
  canvas.assignments = [row];
  expect(merge().assignments.at(-1)).toMatchObject({ canvasChange: "added", earned: 8, possible: 0 });
});

it("ignores Z, unknown and unlabeled Canvas groups for updates and additions", () => {
  const { canvas, original, merge } = fixture();
  original.categories.push({ ...original.categories[0], name: "Z Assignments" });
  for (const group of ["z assignments", "Unmapped group", ""]) {
    for (const row of canvas.assignments) row.group = group;
    expect(merge()).toBe(original);
  }
});

it("uses StudentVUE assignment categories when no category summary is available", () => {
  const { canvas, original, merge } = fixture();
  const row: Assignment = canvas.assignments[1];
  original.categories = [];
  expect(merge().percent).toBeCloseTo(((94 + 85 + 8) / 210) * 100);
  expect(merge().canvasEstimate).toBe("points");
  row.points = null;
  expect(merge().percent).toBeNull();
  original.assignments = [];
  expect(merge()).toBe(original);
});
