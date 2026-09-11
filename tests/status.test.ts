import { describe, expect, it } from "vitest";
import {
  statusOf,
  dayKey,
  shiftDay,
  attentionRank,
  emptySubmission,
  type Assignment,
} from "../packages/domain/src";
const now = new Date("2026-09-11T20:00:00Z");
const base: Assignment = {
  id: "1",
  courseId: "1",
  name: "Test",
  url: "https://mcpsmd.instructure.com",
  dueAt: "2026-09-10T23:59:00Z",
  unlockAt: null,
  lockAt: null,
  points: 10,
  types: ["online_upload"],
  locked: false,
  submission: { ...emptySubmission },
};
describe("student-facing statuses", () => {
  it("distinguishes an inferred overdue deadline from Canvas missing", () => {
    expect(statusOf(base, now)).toMatchObject({
      label: "Not submitted",
      overdue: true,
      missing: false,
      needsWork: true,
    });
  });
  it("keeps graded missing zero in the action queue", () => {
    const a = {
      ...base,
      submission: {
        ...emptySubmission,
        state: "graded",
        score: 0,
        grade: "0",
        missing: true,
      },
    };
    expect(statusOf(a, now)).toMatchObject({
      submitted: false,
      graded: true,
      missing: true,
      needsWork: true,
    });
    expect(attentionRank(a, now)).toBe(1);
  });
  it("retains submitted plus late instead of treating it as work to submit", () => {
    expect(
      statusOf(
        {
          ...base,
          submission: {
            ...emptySubmission,
            state: "submitted",
            submittedAt: now.toISOString(),
            late: true,
          },
        },
        now,
      ),
    ).toMatchObject({
      submitted: true,
      late: true,
      overdue: false,
      needsWork: false,
    });
  });
  it("retains a conflict between submitted and missing", () => {
    expect(
      statusOf(
        {
          ...base,
          submission: { ...emptySubmission, state: "submitted", missing: true },
        },
        now,
      ),
    ).toMatchObject({ submitted: true, missing: true, needsWork: true });
  });
  it("shows previous-attempt grades and explicit redo requests", () => {
    const a = {
      ...base,
      submission: {
        ...emptySubmission,
        state: "submitted",
        grade: "8",
        score: 8,
        currentGrade: false,
        redo: true,
      },
    };
    expect(statusOf(a, now).grading).toBe("Previous attempt graded");
    expect(attentionRank(a, now)).toBe(0);
  });
  it("never infers non-submission from paper or external tools", () => {
    for (const type of ["on_paper", "none", "external_tool"])
      expect(statusOf({ ...base, types: [type] }, now)).toMatchObject({
        overdue: false,
        check: true,
      });
  });
  it("does not turn missing API data into a submission fact", () => {
    expect(statusOf({ ...base, submission: null }, now)).toMatchObject({
      label: "Status unavailable",
      submitted: false,
      overdue: false,
      check: true,
    });
  });
  it("removes excused work even when Canvas has a missing flag", () => {
    expect(
      statusOf(
        {
          ...base,
          submission: { ...emptySubmission, excused: true, missing: true },
        },
        now,
      ),
    ).toMatchObject({ label: "Excused", needsWork: false });
  });
  it("supports pending review and undated assignments", () => {
    expect(
      statusOf(
        {
          ...base,
          submission: { ...emptySubmission, state: "pending_review" },
        },
        now,
      ),
    ).toMatchObject({
      label: "Pending review",
      submitted: true,
      overdue: false,
    });
    expect(statusOf({ ...base, dueAt: null }, now).overdue).toBe(false);
  });
});
describe("calendar boundaries", () => {
  it("groups an instant by school timezone instead of UTC date", () => {
    expect(dayKey("2026-09-12T02:00:00Z")).toBe("2026-09-11");
  });
  it("advances calendar dates across DST and year boundaries", () => {
    expect(shiftDay("2026-03-08", 1)).toBe("2026-03-09");
    expect(shiftDay("2026-12-31", 1)).toBe("2027-01-01");
    expect(dayKey("2026-11-01T05:30:00Z")).toBe(dayKey("2026-11-01T06:30:00Z"));
  });
});
