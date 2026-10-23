import type { ClassMeeting } from "../../../packages/domain/src/gradebook";

export type Bell = { period: number; start: number; end: number };
export type SchoolGrade = 6 | 7 | 8;
export type BellDay = { id: string; name: string; bells: Bell[]; grade?: SchoolGrade };
type BellSchool = { id: string; name: string; level: "High schools" | "Middle schools"; defaultDay: string; source: string; note?: string; days: BellDay[] };
type BellRow = [number, string, string];
const time = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
const day = (id: string, name: string, rows: [number, string, string][]): BellDay => ({
  id, name, bells: rows.map(([period, start, end]) => ({ period, start: time(start), end: time(end) })),
});
const block = (id: string, name: string, rows: [number, string, string][]): BellDay[] => [
  day(`${id}-odd`, `${name} · periods 1, 3, 6, 7, 9`, rows),
  day(`${id}-even`, `${name} · periods 2, 4, 6, 8, 9`, rows.map(([p, s, e]) => [p === 1 || p === 3 || p === 7 ? p + 1 : p, s, e])),
];

// Grade-specific lunch gaps must not count as an academic class meeting.
const gradeDays = (id: string, name: string, common: BellRow[], variants: Record<SchoolGrade, BellRow[]>): BellDay[] =>
  ([6, 7, 8] as const).map(grade => ({ ...day(`${id}-${grade}`, name, [...common, ...variants[grade]].sort((a,b) => time(a[1]) - time(b[1]))), grade }));

// Existing presets checked October 21; seven added schools checked October 22, 2026.
// Sources are the documents linked by each school's official MCPS website.
// No automatic school-calendar or block-day inference: special days are chosen explicitly.
export const bellSchools: BellSchool[] = [
  {
    id: "blair", name: "Montgomery Blair High School", level: "High schools", defaultDay: "",
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
    id: "rm", name: "Richard Montgomery High School", level: "High schools", defaultDay: "regular",
    source: "https://docs.google.com/document/d/1AmpwjSJlXZMseWaDFIK5xiuCAVdiqmxSZkTK8Aa03PE/edit",
    days: [
      day("regular", "Standard day", [[1,"07:45","08:30"],[2,"08:35","09:30"],[3,"09:35","10:20"],[4,"10:25","11:10"],[6,"12:05","12:50"],[7,"12:55","13:40"],[8,"13:45","14:30"]]),
      day("delay", "Two-hour delay", [[1,"09:45","10:16"],[2,"10:21","10:52"],[3,"10:57","11:28"],[4,"11:33","12:04"],[6,"12:47","13:18"],[7,"13:23","13:54"],[8,"13:59","14:30"]]),
      day("early", "Early release", [[1,"07:45","08:12"],[2,"08:17","08:44"],[3,"08:49","09:16"],[4,"09:21","09:48"],[6,"09:53","10:20"],[7,"10:25","10:52"],[8,"10:57","11:24"]]),
    ],
  },
  {
    id: "einstein", name: "Albert Einstein High School", level: "High schools", defaultDay: "regular",
    source: "https://www.montgomeryschoolsmd.org/contentassets/ed4fa6fb482b4560b892d169fdbbf82d/bell-schedule.pdf",
    days: [
      day("regular", "Regular day", [[1,"07:45","08:40"],[2,"08:45","09:30"],[3,"09:35","10:20"],[4,"10:25","11:10"],[5,"12:05","12:50"],[6,"12:55","13:40"],[7,"13:45","14:30"]]),
      day("early", "Early release", [[1,"07:45","08:18"],[2,"08:24","08:50"],[3,"08:56","09:22"],[4,"09:28","09:54"],[5,"10:00","10:26"],[6,"10:32","10:58"],[7,"11:04","11:30"]]),
      day("delay", "Two-hour delay", [[1,"09:45","10:21"],[2,"10:26","10:55"],[3,"11:00","11:31"],[4,"11:36","12:07"],[5,"12:47","13:18"],[6,"13:23","13:54"],[7,"13:59","14:30"]]),
    ],
  },
  {
    id: "wootton", name: "Thomas S. Wootton High School", level: "High schools", defaultDay: "",
    source: "https://docs.google.com/document/d/1pZIOZOOusQ5LIl5A5ZA0y2vl-T7VAB3nB28VLx79z-k/edit",
    note: "Choose regular for Monday, Wednesday or Friday; advisory for Tuesday or Thursday, unless the school announces a special schedule.",
    days: [
      day("regular", "Regular · Mon / Wed / Fri", [[1,"07:45","08:36"],[2,"08:41","09:27"],[3,"09:32","10:18"],[4,"10:23","11:09"],[6,"12:02","12:48"],[7,"12:53","13:39"],[8,"13:44","14:30"]]),
      day("advisory", "Advisory · Tue / Thu", [[1,"07:45","08:32"],[2,"08:37","09:19"],[3,"09:54","10:36"],[4,"10:41","11:23"],[6,"12:14","12:56"],[7,"13:01","13:43"],[8,"13:48","14:30"]]),
      day("early", "Early release", [[1,"07:45","08:16"],[2,"08:21","08:48"],[3,"08:53","09:20"],[4,"09:25","09:52"],[6,"09:57","10:24"],[7,"10:29","10:56"],[8,"11:01","11:28"]]),
      day("delay", "Two-hour delay", [[1,"09:45","10:16"],[2,"10:21","10:52"],[3,"10:57","11:28"],[4,"11:33","12:04"],[6,"12:47","13:18"],[7,"13:23","13:54"],[8,"13:59","14:30"]]),
      day("rally", "Pep rally", [[1,"07:45","08:26"],[2,"08:31","09:12"],[3,"09:17","09:58"],[4,"10:03","10:44"],[6,"10:49","11:30"],[7,"12:18","12:59"],[8,"13:04","13:45"]]),
    ],
  },
  {
    id: "churchill", name: "Winston Churchill High School", level: "High schools", defaultDay: "regular",
    source: "https://docs.google.com/document/d/1aZnCSElzXTTrsvWGbsTs8KcEsjRNc-kRA-nNmzfifsM/edit",
    days: [
      day("regular", "Regular day", [[1,"07:45","08:35"],[2,"08:40","09:25"],[3,"09:30","10:15"],[4,"10:20","11:05"],[6,"12:05","12:50"],[7,"12:55","13:40"],[8,"13:45","14:30"]]),
      day("early", "Early release", [[1,"07:45","08:15"],[2,"08:20","08:45"],[3,"08:50","09:15"],[4,"09:20","09:45"],[6,"09:50","10:15"],[7,"10:20","10:45"],[8,"10:50","11:15"]]),
      day("delay", "Two-hour delay", [[1,"09:45","10:20"],[2,"10:25","10:55"],[3,"11:00","11:30"],[4,"12:15","12:45"],[6,"12:50","13:20"],[7,"13:25","13:55"],[8,"14:00","14:30"]]),
      day("pride", "PRIDE / report cards", [[1,"07:45","08:30"],[2,"08:35","09:15"],[3,"09:20","10:00"],[4,"10:40","11:20"],[6,"12:20","13:00"],[7,"13:05","13:45"],[8,"13:50","14:30"]]),
      day("town-hall", "Town hall", [[1,"08:40","09:20"],[2,"09:25","10:05"],[3,"10:10","10:50"],[4,"10:55","11:35"],[6,"12:20","13:00"],[7,"13:05","13:45"],[8,"13:50","14:30"]]),
      day("rally", "Pep rally", [[1,"07:45","08:30"],[2,"08:35","09:15"],[3,"09:20","10:00"],[4,"10:50","11:30"],[6,"12:20","13:00"],[7,"13:05","13:45"],[8,"13:50","14:30"]]),
    ],
  },
  {
    id: "poolesville", name: "Poolesville High School", level: "High schools", defaultDay: "",
    source: "https://docs.google.com/document/d/1CuroPtuLpbRhBv_smS3HbzXw7DV014EB/edit",
    note: "The school's current website links a schedule labeled 2023–24. Confirm these times with your school before selecting a backup schedule.",
    days: [
      day("regular", "Published regular · Mon / Tue / Thu / Fri", [[1,"07:45","08:35"],[2,"08:40","09:25"],[3,"09:30","10:15"],[4,"10:20","11:05"],[5,"12:05","12:50"],[6,"12:55","13:40"],[7,"13:45","14:30"],[8,"14:37","15:25"]]),
      day("wednesday", "Published Wednesday / advisory", [[1,"07:45","08:30"],[2,"08:35","09:15"],[3,"10:05","10:45"],[4,"10:50","11:30"],[5,"12:20","13:00"],[6,"13:05","13:45"],[7,"13:50","14:30"],[8,"14:37","15:25"]]),
      day("delay", "Published two-hour delay", [[1,"09:45","10:19"],[2,"10:24","10:55"],[3,"11:00","11:31"],[4,"12:11","12:42"],[5,"12:47","13:18"],[6,"13:23","13:54"],[7,"13:59","14:30"],[8,"14:37","15:25"]]),
      day("early", "Published early release", [[1,"07:45","08:15"],[2,"08:20","08:47"],[3,"08:52","09:19"],[4,"09:24","09:51"],[5,"09:56","10:23"],[6,"10:28","10:55"],[7,"11:00","11:27"]]),
    ],
  },
  {
    id: "frost", name: "Robert Frost Middle School", level: "Middle schools", defaultDay: "regular",
    source: "https://docs.google.com/document/d/15ftzevZiHWVXD8_SZiFb4GYkBVbgkcWP4Wto98ALM70/edit",
    days: [
      ...gradeDays("regular", "Regular day", [[1,"08:15","09:05"],[2,"09:09","09:54"],[3,"10:22","11:07"],[6,"13:23","14:08"],[7,"14:12","15:00"]], {
        6: [[4,"11:11","11:56"],[5,"12:00","12:45"]],
        7: [[4,"11:45","12:30"],[5,"12:34","13:19"]],
        8: [[4,"11:11","11:56"],[5,"12:34","13:19"]],
      }),
      ...gradeDays("early", "Early release", [[1,"08:15","08:46"],[2,"08:50","09:18"],[3,"09:22","09:50"],[6,"09:54","10:22"],[7,"10:26","10:54"]], {
        6: [[4,"10:58","11:26"],[5,"11:30","11:58"]],
        7: [[4,"11:30","11:58"],[5,"12:02","12:30"]],
        8: [[4,"10:58","11:26"],[5,"12:02","12:30"]],
      }),
      ...gradeDays("delay", "Two-hour delay", [[1,"10:15","10:49"],[2,"10:53","11:27"],[3,"13:13","13:46"],[6,"13:50","14:23"],[7,"14:27","15:00"]], {
        6: [[4,"11:31","12:01"],[5,"12:05","12:35"]],
        7: [[4,"12:05","12:35"],[5,"12:39","13:09"]],
        8: [[4,"11:31","12:01"],[5,"12:39","13:09"]],
      }),
    ],
  },
  {
    id: "cabin-john", name: "Cabin John Middle School", level: "Middle schools", defaultDay: "regular",
    source: "https://docs.google.com/document/d/1kWyJmGX1RcMAOtMLSuorgg_waysb1mtsU5U3HWeET6o/edit",
    days: [
      ...gradeDays("regular", "Regular day", [[1,"08:15","09:02"],[2,"09:06","09:49"],[3,"09:53","10:36"],[7,"13:28","14:11"],[8,"14:15","15:00"]], {
        6: [[4,"11:07","11:50"],[5,"11:54","12:37"]],
        7: [[4,"11:07","11:50"],[6,"12:41","13:24"]],
        8: [[5,"11:54","12:37"],[6,"12:41","13:24"]],
      }),
      ...gradeDays("early", "Early release", [[1,"08:15","08:46"],[2,"08:50","09:18"],[3,"09:22","09:50"],[7,"09:54","10:22"],[8,"12:02","12:30"]], {
        6: [[4,"10:26","10:54"],[5,"10:58","11:26"]],
        7: [[4,"10:26","10:54"],[6,"11:30","11:58"]],
        8: [[5,"10:58","11:26"],[6,"11:30","11:58"]],
      }),
      ...gradeDays("delay", "Two-hour delay", [[1,"10:15","10:48"],[2,"10:52","11:24"],[3,"11:28","12:00"],[7,"13:52","14:24"],[8,"14:28","15:00"]], {
        6: [[4,"12:04","12:36"],[5,"12:40","13:12"]],
        7: [[4,"12:04","12:36"],[6,"13:16","13:48"]],
        8: [[5,"12:40","13:12"],[6,"13:16","13:48"]],
      }),
    ],
  },
  {
    id: "hoover", name: "Herbert Hoover Middle School", level: "Middle schools", defaultDay: "regular",
    source: "https://docs.google.com/document/d/1zObRevrEcLpS6oS8CEPTGdbaGbsyKW68TvgbVdgIDCE/edit",
    days: [
      ...gradeDays("regular", "Regular day", [[1,"08:15","08:59"],[2,"09:03","09:50"],[3,"09:54","10:38"],[6,"12:54","13:38"],[7,"14:16","15:00"]], {
        6: [[4,"11:16","12:01"],[5,"12:05","12:50"]],
        7: [[4,"10:42","11:27"],[5,"12:05","12:50"]],
        8: [[4,"10:42","11:27"],[5,"11:31","12:16"]],
      }),
      ...gradeDays("early", "Early release", [[1,"08:15","08:43"],[2,"08:47","09:18"],[3,"09:22","09:50"],[6,"09:54","10:22"],[7,"12:02","12:30"]], {
        6: [[4,"10:58","11:26"],[5,"11:30","11:58"]],
        7: [[4,"10:26","10:54"],[5,"11:30","11:58"]],
        8: [[4,"10:26","10:54"],[5,"10:58","11:26"]],
      }),
      ...gradeDays("delay", "Two-hour delay", [[1,"10:15","10:53"],[2,"10:56","11:31"],[3,"13:17","13:48"],[6,"13:52","14:23"],[7,"14:27","15:00"]], {
        6: [[4,"12:09","12:39"],[5,"12:43","13:13"]],
        7: [[4,"11:35","12:05"],[5,"12:43","13:13"]],
        8: [[4,"11:35","12:05"],[5,"12:09","12:39"]],
      }),
    ],
  },
  {
    id: "north-bethesda", name: "North Bethesda Middle School", level: "Middle schools", defaultDay: "regular",
    source: "https://docs.google.com/document/d/1yL7iJombyI_DsczKEzUUZQwoxkcP0EepOxdq-D-67CE/edit",
    days: [
      ...gradeDays("regular", "Regular day", [[1,"08:15","09:00"],[2,"09:04","09:49"],[3,"10:25","11:10"],[6,"13:26","14:11"],[7,"14:15","15:00"]], {
        6: [[4,"11:48","12:33"],[5,"12:37","13:22"]],
        7: [[4,"11:14","11:59"],[5,"12:37","13:22"]],
        8: [[4,"11:14","11:59"],[5,"12:03","12:48"]],
      }),
      ...gradeDays("early", "Early release", [[1,"08:15","08:45"],[2,"08:49","09:16"],[3,"09:20","09:47"],[6,"09:51","10:18"],[7,"10:22","10:48"]], {
        6: [[4,"11:26","11:56"],[5,"12:00","12:30"]],
        7: [[4,"10:52","11:22"],[5,"12:00","12:30"]],
        8: [[4,"10:52","11:22"],[5,"11:26","11:56"]],
      }),
      ...gradeDays("delay", "Two-hour delay", [[1,"10:15","10:50"],[2,"10:54","11:24"],[3,"13:10","13:44"],[6,"13:48","14:22"],[7,"14:26","15:00"]], {
        6: [[4,"12:02","12:32"],[5,"12:36","13:06"]],
        7: [[4,"11:28","11:58"],[5,"12:36","13:06"]],
        8: [[4,"11:28","11:58"],[5,"12:02","12:32"]],
      }),
    ],
  },
];

export type BellPreference = { school: string; date: string; day: string; grade?: SchoolGrade; custom: Bell[] };
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
    return p && typeof p.school === "string" && typeof p.date === "string" && typeof p.day === "string" && (p.grade === undefined || [6, 7, 8].includes(p.grade)) && validBells(p.custom) ? p : emptyBellPreference;
  } catch { return emptyBellPreference; }
}
export function chosenDay(p: BellPreference, date: string) {
  const school = bellSchools.find(s => s.id === p.school);
  if (school?.days.some(d => d.grade) && !p.grade) return "";
  if (p.date === date) return p.day;
  const base = school?.defaultDay ?? (p.school === "custom" ? "custom" : "");
  return school?.days.some(d => d.grade) && base ? `${base}-${p.grade}` : base;
}
export function selectedBells(p: BellPreference, now: number): ClassMeeting[] {
  const clock = schoolClock(now);
  if (!clock.weekday) return [];
  const id = chosenDay(p, clock.date);
  const bells = id === "custom" ? p.custom : bellSchools.find(s => s.id === p.school)?.days.find(d => d.id === id && (!d.grade || d.grade === p.grade))?.bells ?? [];
  return bells.map(b => ({ ...b, name: `Period ${b.period}`, room: "", teacher: "" }));
}
