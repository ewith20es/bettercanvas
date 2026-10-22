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
