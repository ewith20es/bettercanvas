import { expect, it } from "vitest";
import {
  coursePeriod,
  schedule,
  sortCourses,
} from "../packages/domain/src/schedule";
const course = (name: string, id = name) => ({
  id,
  name,
  code: name,
  url: "https://mcpsmd.instructure.com",
});
it("sorts all scheduled classes, including period zero, in schedule order", () => {
  const courses = schedule.map((s) => course(s.name)).reverse();
  expect(sortCourses(courses).map((c) => coursePeriod(c)?.period)).toEqual([
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
  ]);
});
it("matches punctuation and Canvas prefixes, leaving unrelated courses last", () => {
  const courses = [
    course("Other course"),
    course("2026 AP U.S. History A - Section 2"),
    course("Hon English 9 A"),
  ];
  expect(sortCourses(courses).map((c) => c.name)).toEqual([
    courses[2].name,
    courses[1].name,
    courses[0].name,
  ]);
  expect(coursePeriod(course("AP English Language"))).toBeUndefined();
});
it("supports manual assignments and an explicit unscheduled override", () => {
  const a = course("Unusual Canvas title", "a"),
    b = course("Homeroom", "b");
  expect(sortCourses([b, a], { a: 1, b: -1 })).toEqual([a, b]);
  expect(coursePeriod(a, { a: 0 })?.period).toBe(0);
});
