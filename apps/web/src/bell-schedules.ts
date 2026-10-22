import type { ClassMeeting } from "../../../packages/domain/src/gradebook";

export type Bell = { period: number; start: number; end: number };
export type BellDay = { id: string; name: string; bells: Bell[] };
const time = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
const day = (id: string, name: string, rows: [number, string, string][]): BellDay => ({
  id, name, bells: rows.map(([period, start, end]) => ({ period, start: time(start), end: time(end) })),
});
const block = (id: string, name: string, rows: [number, string, string][]): BellDay[] => [
  day(`${id}-odd`, `${name} · periods 1, 3, 6, 7, 9`, rows),
  day(`${id}-even`, `${name} · periods 2, 4, 6, 8, 9`, rows.map(([p, s, e]) => [p === 1 || p === 3 || p === 7 ? p + 1 : p, s, e])),
];

// Transcribed from these official school sources, checked October 21, 2026.
// No automatic school-calendar or block-day inference: special days are chosen explicitly.
export const bellSchools = [
  {
    id: "blair", name: "Montgomery Blair High School", defaultDay: "",
    source: "https://mbhs.edu/schedule",
    days: [
      ...block("regular", "Regular block", [[1,"07:45","09:23"],[3,"09:29","11:00"],[6,"12:06","12:53"],[7,"12:59","14:30"],[9,"14:35","15:20"]]),
      day("all", "All-period day", [[1,"07:45","08:30"],[2,"08:35","09:25"],[3,"09:30","10:15"],[4,"10:20","11:05"],[6,"12:05","12:50"],[7,"12:55","13:40"],[8,"13:45","14:30"],[9,"14:35","15:20"]]),
      ...block("early", "Early release", [[1,"07:45","08:45"],[3,"08:51","09:45"],[6,"09:51","10:21"],[7,"10:27","11:21"],[9,"12:05","12:50"]]),
      ...block("delay", "Two-hour delay", [[1,"09:45","10:55"],[3,"11:00","12:05"],[6,"12:50","13:20"],[7,"13:25","14:30"],[9,"14:35","15:20"]]),
      ...block("homeroom", "Homeroom day", [[0,"07:45","08:20"],[1,"08:26","09:41"],[3,"09:47","11:02"],[6,"12:06","12:49"],[7,"12:55","14:30"],[9,"14:35","15:20"]]),
    ],
  },
  {
    id: "rm", name: "Richard Montgomery High School", defaultDay: "regular",
    source: "https://docs.google.com/document/d/1AmpwjSJlXZMseWaDFIK5xiuCAVdiqmxSZkTK8Aa03PE/edit",
    days: [
      day("regular", "Standard day", [[1,"07:45","08:30"],[2,"08:35","09:30"],[3,"09:35","10:20"],[4,"10:25","11:10"],[6,"12:05","12:50"],[7,"12:55","13:40"],[8,"13:45","14:30"]]),
      day("delay", "Two-hour delay", [[1,"09:45","10:16"],[2,"10:21","10:52"],[3,"10:57","11:28"],[4,"11:33","12:04"],[6,"12:47","13:18"],[7,"13:23","13:54"],[8,"13:59","14:30"]]),
      day("early", "Early release", [[1,"07:45","08:12"],[2,"08:17","08:44"],[3,"08:49","09:16"],[4,"09:21","09:48"],[6,"09:53","10:20"],[7,"10:25","10:52"],[8,"10:57","11:24"]]),
    ],
  },
  {
    id: "einstein", name: "Albert Einstein High School", defaultDay: "regular",
    source: "https://www.montgomeryschoolsmd.org/contentassets/ed4fa6fb482b4560b892d169fdbbf82d/bell-schedule.pdf",
    days: [
      day("regular", "Regular day", [[1,"07:45","08:40"],[2,"08:45","09:30"],[3,"09:35","10:20"],[4,"10:25","11:10"],[5,"12:05","12:50"],[6,"12:55","13:40"],[7,"13:45","14:30"]]),
      day("early", "Early release", [[1,"07:45","08:18"],[2,"08:24","08:50"],[3,"08:56","09:22"],[4,"09:28","09:54"],[5,"10:00","10:26"],[6,"10:32","10:58"],[7,"11:04","11:30"]]),
      day("delay", "Two-hour delay", [[1,"09:45","10:21"],[2,"10:26","10:55"],[3,"11:00","11:31"],[4,"11:36","12:07"],[5,"12:47","13:18"],[6,"13:23","13:54"],[7,"13:59","14:30"]]),
    ],
  },
];

export type BellPreference = { school: string; date: string; day: string; custom: Bell[] };
export const emptyBellPreference: BellPreference = { school: "", date: "", day: "", custom: [] };
export function schoolClock(now: number) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", weekday: "short", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, weekday: !["Sat", "Sun"].includes(get("weekday")), seconds: Number(get("hour")) * 3600 + Number(get("minute")) * 60 + Number(get("second")) };
}
export function validBells(value: unknown): value is Bell[] {
  return Array.isArray(value) && value.length <= 30 && value.every((v) => v && Number.isInteger(v.period) && v.period >= 0 && v.period <= 30 && Number.isInteger(v.start) && Number.isInteger(v.end) && v.start >= 0 && v.end < 1440 && v.end > v.start) && new Set(value.map(v => v.period)).size === value.length;
}
export function readBellPreference(key: string): BellPreference {
  try {
    const p = JSON.parse(localStorage.getItem(`bc:bells:${key}`) ?? "null");
    return p && typeof p.school === "string" && typeof p.date === "string" && typeof p.day === "string" && validBells(p.custom) ? p : emptyBellPreference;
  } catch { return emptyBellPreference; }
}
export function chosenDay(p: BellPreference, date: string) {
  return p.date === date ? p.day : bellSchools.find(s => s.id === p.school)?.defaultDay ?? (p.school === "custom" ? "custom" : "");
}
export function selectedBells(p: BellPreference, now: number): ClassMeeting[] {
  const clock = schoolClock(now);
  if (!clock.weekday) return [];
  const id = chosenDay(p, clock.date);
  const bells = id === "custom" ? p.custom : bellSchools.find(s => s.id === p.school)?.days.find(d => d.id === id)?.bells ?? [];
  return bells.map(b => ({ ...b, name: `Period ${b.period}`, room: "", teacher: "" }));
}
