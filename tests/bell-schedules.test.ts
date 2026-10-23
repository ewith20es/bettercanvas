import { describe, expect, it } from "vitest";
import { bellSchools, chosenDay, emptyBellPreference, schoolClock, selectedBells, validBells } from "../apps/web/src/bell-schedules";
import { activeMeeting } from "../packages/domain/src/gradebook";

describe("gradebook school bell schedules", () => {
  it("uses Eastern time across daylight-saving changes and identifies weekends", () => {
    expect(schoolClock(Date.parse("2026-10-21T12:00:05Z"))).toEqual({ date: "2026-10-21", weekday: true, seconds: 28805 });
    expect(schoolClock(Date.parse("2026-12-01T13:00:05Z")).seconds).toBe(28805);
    expect(schoolClock(Date.parse("2026-10-24T12:00:00Z")).weekday).toBe(false);
    expect(schoolClock(Date.parse("2026-10-22T02:00:00Z")).date).toBe("2026-10-21");
  });
  it("requires a fresh Blair block selection each day and suppresses non-meeting periods", () => {
    const p = { ...emptyBellPreference, school: "blair", date: "2026-10-21", day: "regular-odd" };
    const meetings = selectedBells(p, Date.parse("2026-10-21T12:00:00Z"));
    expect(activeMeeting(meetings, 480)).toMatchObject({ period: 1, end: 563 });
    expect(meetings.some(m => m.period === 2)).toBe(false);
    expect(selectedBells(p, Date.parse("2026-10-22T12:00:00Z"))).toEqual([]);
    expect(activeMeeting(selectedBells({ ...p, day: "regular-even" }, Date.parse("2026-10-21T12:00:00Z")), 480)?.period).toBe(2);
  });
  it("expires special-day overrides, respects pause and hides weekend countdowns", () => {
    const p = { ...emptyBellPreference, school: "rm", date: "2026-10-21", day: "delay" };
    expect(chosenDay(p, "2026-10-22")).toBe("regular");
    expect(activeMeeting(selectedBells(p, Date.parse("2026-10-21T12:00:00Z")), 480)).toBeNull();
    expect(selectedBells({ ...p, day: "off" }, Date.parse("2026-10-21T12:00:00Z"))).toEqual([]);
    expect(selectedBells(p, Date.parse("2026-10-24T12:00:00Z"))).toEqual([]);
  });
  it("keeps every preset within a valid school day, with no conflicting periods", () => {
    for (const school of bellSchools) for (const day of school.days) {
      expect(validBells(day.bells)).toBe(true);
      const sorted = [...day.bells].sort((a,b) => a.start-b.start);
      expect(sorted.every((b,i) => !i || b.start >= sorted[i-1].end)).toBe(true);
    }
    expect(validBells([{ period: 1, start: 500, end: 400 }])).toBe(false);
    expect(validBells([{ period: 1, start: 500, end: 600 }, { period: 1, start: 700, end: 800 }])).toBe(false);
  });
  it("requires a middle-school grade and preserves it when special schedules expire", () => {
    const now = Date.parse("2026-10-22T15:20:00Z");
    for (const school of ["frost", "cabin-john", "hoover", "north-bethesda"]) {
      expect(selectedBells({ ...emptyBellPreference, school }, now)).toEqual([]);
      const p = { ...emptyBellPreference, school, grade: 6 as const, date: "2026-10-21", day: "early-6" };
      expect(chosenDay(p, "2026-10-22")).toBe("regular-6");
      expect(selectedBells(p, now)).toHaveLength(7);
      expect(selectedBells({ ...p, date: "2026-10-22", day: "regular-7" }, now)).toEqual([]);
    }
  });
  it("uses the right middle-school lunch gaps instead of highlighting a class during lunch", () => {
    const now = Date.parse("2026-10-22T15:20:00Z");
    const meetings = (school: string, grade: 6 | 7 | 8) => selectedBells({ ...emptyBellPreference, school, grade }, now);
    expect(activeMeeting(meetings("frost", 7), 680)).toBeNull();
    expect(activeMeeting(meetings("frost", 6), 680)?.period).toBe(4);
    expect(activeMeeting(meetings("cabin-john", 8), 680)).toBeNull();
    expect(activeMeeting(meetings("cabin-john", 6), 680)?.period).toBe(4);
    expect(activeMeeting(meetings("hoover", 6), 650)).toBeNull();
    expect(activeMeeting(meetings("hoover", 8), 650)?.period).toBe(4);
    expect(activeMeeting(meetings("north-bethesda", 6), 680)).toBeNull();
    expect(activeMeeting(meetings("north-bethesda", 7), 680)?.period).toBe(4);
  });
  it("does not guess a Wootton weekday pattern or silently enable the dated Poolesville preset", () => {
    for (const school of ["wootton", "poolesville"]) {
      expect(chosenDay({ ...emptyBellPreference, school }, "2026-10-22")).toBe("");
    }
  });
  it("uses custom times without persisting any course or grade records", () => {
    const p = { ...emptyBellPreference, school: "custom", custom: [{ period: 3, start: 600, end: 650 }] };
    expect(activeMeeting(selectedBells(p, Date.parse("2026-10-21T14:05:00Z")), 605)).toMatchObject({ period: 3, end: 650 });
  });
  it("switches at the exact bell and does not extend a class through a later separate meeting", () => {
    const meeting = (period: number, start: number, end: number) => ({ name: "Science", period, start, end, room: "", teacher: "" });
    const meetings = [meeting(1, 480, 500), meeting(2, 500, 520), meeting(1, 600, 620)];
    expect(activeMeeting(meetings, 490)?.end).toBe(500);
    expect(activeMeeting(meetings, 500)?.period).toBe(2);
    expect(activeMeeting(meetings, 620)).toBeNull();
  });
});
