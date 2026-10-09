import { expect, it } from "vitest";
import {
  coursePeriod,
  periodFromCanvas,
  sortCourses,
} from "../packages/domain/src/schedule";
const course = (name: string, id = name, sections?: string[]) => ({
  id,
  name,
  code: name,
  url: "https://mcpsmd.instructure.com",
  ...(sections ? { sections } : {}),
});
it("reads a period written in the Canvas name, code or section", () => {
  expect(periodFromCanvas(course("English 9 - Period 3"))).toBe(3);
  expect(periodFromCanvas(course("Spanish 3A Per. 2"))).toBe(2);
  expect(periodFromCanvas(course("Physics P6"))).toBe(6);
  expect(periodFromCanvas(course("Chemistry", "c", ["Section 1", "Period 4"]))).toBe(4);
});
it("does not invent periods from unrelated numbers", () => {
  expect(periodFromCanvas(course("AP US History A"))).toBeUndefined();
  expect(periodFromCanvas(course("Photography 1A"))).toBeUndefined();
  expect(periodFromCanvas(course("English 9 - Period 42"))).toBeUndefined();
});
it("sorts by period and leaves courses without one last", () => {
  const courses = [
    course("Other course"),
    course("Math Period 5"),
    course("English Period 1"),
  ];
  expect(sortCourses(courses).map((c) => c.name)).toEqual([
    "English Period 1",
    "Math Period 5",
    "Other course",
  ]);
});
it("lets the user's choice override Canvas, including not in schedule", () => {
  const a = course("Unusual Canvas title", "a"),
    b = course("Homeroom Period 0", "b");
  expect(sortCourses([b, a], { a: 1, b: -1 })).toEqual([a, b]);
  expect(coursePeriod(a, { a: 0 })).toEqual({ period: 0, source: "manual" });
  expect(coursePeriod(b)).toEqual({ period: 0, source: "canvas" });
  expect(coursePeriod(b, { b: -1 })).toBeUndefined();
});
