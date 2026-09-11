import { emptySubmission, type Assignment, type Snapshot } from "./index";

export function demoSnapshot(now = new Date()): Snapshot {
  const origin = "https://mcpsmd.instructure.com";
  const due = (offset: number, hour = 23, minute = 59) => {
    const d = new Date(now);
    d.setDate(d.getDate() + offset);
    d.setHours(hour, minute, 0, 0);
    return d.toISOString();
  };
  const courses = [
    ["1", "AP English Language", "ENGLISH"],
    ["2", "Precalculus", "MATH"],
    ["3", "Biology", "SCIENCE"],
    ["4", "U.S. History", "HISTORY"],
    ["5", "Spanish III", "LANGUAGE"],
  ].map(([id, name, code]) => ({ id, name, code, url: origin }));
  const item = (
    id: string,
    courseId: string,
    name: string,
    offset: number | null,
    extra: Partial<Assignment> = {},
  ): Assignment => ({
    id,
    courseId,
    name,
    url: origin,
    dueAt: offset === null ? null : due(offset),
    unlockAt: null,
    lockAt: null,
    points: 20,
    types: ["online_upload"],
    locked: false,
    submission: { ...emptySubmission },
    ...extra,
  });
  const assignments = [
    item("1", "2", "Practice: polynomial functions", -1, {
      points: 15,
      submission: { ...emptySubmission, missing: true },
    }),
    item("2", "1", "Rhetorical analysis: first draft", 0, { points: 40 }),
    item("3", "3", "Cell structure & function review", 0, { points: 25 }),
    item("4", "5", "Vocabulario: la vida diaria", 0, {
      points: 10,
      submission: {
        ...emptySubmission,
        state: "submitted",
        submittedAt: now.toISOString(),
      },
    }),
    item("5", "4", "Primary source analysis", 1, { points: 30 }),
    item("6", "2", "Unit 2 problem set", 1, { points: 20 }),
    item("7", "3", "Lab report: diffusion & osmosis", 3, { points: 50 }),
    item("8", "1", "Read chapter 4", 4, { types: ["on_paper"], points: 5 }),
    item("9", "5", "Speaking practice", 5, {
      types: ["external_tool"],
      submission: null,
    }),
    item("10", "4", "Choose your research topic", null, { points: 10 }),
    item("11", "3", "Scientific method quiz", -3, {
      points: 20,
      submission: {
        ...emptySubmission,
        state: "graded",
        submittedAt: due(-4, 18, 20),
        score: 18,
        grade: "18",
        currentGrade: true,
        gradedAt: due(-2, 10),
      },
    }),
    item("12", "4", "Reading response: reconstruction", -4, {
      submission: {
        ...emptySubmission,
        state: "graded",
        submittedAt: due(-3, 17),
        late: true,
        grade: "17",
        score: 17,
        currentGrade: true,
      },
    }),
    item("13", "5", "Listening journal", -5, {
      submission: { ...emptySubmission, excused: true },
    }),
  ];
  return {
    demo: true,
    account: { id: "demo", name: "Student", origin },
    courses,
    assignments,
    fetchedAt: now.toISOString(),
    error: null,
    sync: courses.map((c) => ({
      courseId: c.id,
      successAt: now.toISOString(),
      error: null,
    })),
  };
}
