import type {
  GradeAssignment,
  Gradebook,
  GradeCategory,
  GradeCourse,
  GradeMark,
  GradePeriod,
  TodaySchedule,
} from "../../../packages/domain/src/gradebook";
import {
  STUDENTVUE_ORIGIN,
  SynergyError,
  type GradebookClient,
} from "./synergy";
import { getStudentVueAppKey } from "./studentvue-app-key";

// Current mobile protocol evidence and fixtures:
// https://github.com/songsterq/gradebook-mcp/tree/main/src/lib/parentvue
// October 18 required app header/login envelope: https://github.com/Zillorz/svue-api/pull/2
// This is a separate protocol from the legacy PXPCommunication SOAP service.
const mobilePath = `${STUDENTVUE_ORIGIN}/api/v1/mobile/PXPWebServices`;
const maxBytes = 8 * 1024 * 1024;
const maxAssignments = 20_000;
type JsonObject = Record<string, unknown>;
const object = (value: unknown): JsonObject | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
const text = (value: unknown): string =>
  typeof value === "string"
    ? value.trim()
    : typeof value === "number" && Number.isFinite(value)
      ? String(value)
      : "";
const numeric = (value: unknown, allowPercent = false): number | null => {
  const input = text(value);
  const valueText = allowPercent ? input.replace(/%$/, "").trim() : input;
  if (!/^-?\d+(?:\.\d+)?$/.test(valueText)) return null;
  const result = Number(valueText);
  return Number.isFinite(result) ? result : null;
};
const truthy = (value: unknown) =>
  value === true || value === 1 || /^(true|1|yes)$/i.test(text(value));
const unreadable = () =>
  new SynergyError(
    "StudentVUE returned an unreadable response. Please try again.",
  );

function records(value: unknown, maximum: number): JsonObject[] {
  if (!Array.isArray(value) || value.length > maximum) throw unreadable();
  return value.map((entry) => {
    const result = object(entry);
    if (!result) throw unreadable();
    return result;
  });
}

function date(value: unknown): string {
  const input = text(value);
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s|$)/.exec(input);
  const normalized = m
    ? `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`
    : /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(input)
      ? input.slice(0, 10)
      : "";
  const parsed = new Date(`${normalized}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === normalized
    ? normalized
    : "";
}

function periodFrom(value: JsonObject, fallback: number): GradePeriod {
  const index = numeric(value.index) ?? fallback;
  if (!Number.isInteger(index) || index < 0 || index > 50) throw unreadable();
  return {
    index,
    name: text(value.gradePeriod) || "Current grading period",
    start: date(value.startDate),
    end: date(value.endDate),
  };
}

function assignmentFrom(a: JsonObject, fallback: number): GradeAssignment {
  const score = text(a.score),
    notes = text(a.notes);
  const points = text(a.points);
  const split = /^\s*(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)\s*$/.exec(
    points,
  );
  const display = /(?:\/|\bout\s+of\b)\s*(-?\d+(?:\.\d+)?)\s*$/i.exec(
    text(a.displayScore),
  );
  const rubric = /rubric\D*\d+(?:\.\d+)?\s*(?:-|–|to)\s*(\d+(?:\.\d+)?)/i.exec(
    text(a.scoreType),
  );
  const plainPoints = /^\s*(-?\d+(?:\.\d+)?)(?:\s+Points Possible)?\s*$/i.exec(
    points,
  );
  const possibleCandidates = [
    numeric(a.pointPossible ?? a.point),
    numeric(split?.[2]),
    numeric(plainPoints?.[1]),
    numeric(display?.[1]),
    numeric(rubric?.[1]),
  ];
  // The mobile feed can use 0 as an unset sentinel while displayScore still
  // supplies a real denominator. Keep zero when no positive total is reported.
  const possible =
    possibleCandidates.find((n) => n !== null && n > 0) ??
    possibleCandidates.find((n) => n !== null) ??
    null;
  const excluded =
    truthy(a.isExcluded) ||
    /\b(excused|excluded|exempt|not (?:for grading|included))\b/i.test(
      `${score} ${notes}`,
    );
  return {
    id: text(a.gradebookID) || String(fallback),
    name: text(a.measure) || "Untitled assignment",
    category: text(a.type),
    due: date(a.dueDate),
    assigned: date(a.date),
    score,
    earned: numeric(a.score) ?? numeric(split?.[1]) ??
      (/^0(?:\.0+)?\s*%$/.test(score) ? 0 : null),
    possible,
    notes,
    excluded,
    missing:
      !excluded &&
      (truthy(a.isMissing) || /\bmissing\b/i.test(`${score} ${notes}`)),
  };
}

function categoriesFrom(value: unknown): GradeCategory[] {
  // Optional explicit summaries retain the same fields as the existing
  // StudentVUE parser. The public modern fixtures omit summaries entirely.
  // Never estimate a missing weight or total from assignment rows.
  if (value == null) return [];
  const rows = Array.isArray(value)
    ? value
    : object(value)?.assignmentGradeCalc;
  if (rows == null) return [];
  return records(rows, 200)
    .filter((row) => !/^(total|overall)$/i.test(text(row.type)))
    .map((row) => ({
      name: text(row.type),
      weight: numeric(row.weight, true),
      earned: numeric(row.points),
      possible: numeric(row.pointsPossible),
      reportedGrade: text(row.calculatedMark),
    }));
}

/** The period whose dates include today, else the latest one already started. */
function currentByDate(periods: GradePeriod[], now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  const started = periods.filter((p) => p.start && p.start <= today);
  return (
    started.find((p) => !p.end || today <= p.end) ?? started.at(-1) ?? null
  );
}

/** Parse the modern Gradebook response's data object; credentials never enter it.
 * Without a requested period, the response's own (current) period is used. */
export function parseMobileGradebook(
  data: unknown,
  requestedPeriod?: number,
): Gradebook {
  if (
    requestedPeriod !== undefined &&
    (!Number.isInteger(requestedPeriod) ||
      requestedPeriod < 0 ||
      requestedPeriod > 50)
  )
    throw new SynergyError("Choose a valid grading period.", 400);
  const gb = object(object(data)?.traditionalGradebook);
  if (!gb || text(gb.errorMessage))
    throw new SynergyError(
      "StudentVUE has not made this gradebook available. Try another grading period or check StudentVUE.",
    );
  if (text(gb.type) && text(gb.type).toLowerCase() !== "traditional")
    throw new SynergyError(
      "This gradebook uses a grading format Better Canvas does not support yet. Open StudentVUE to view it.",
    );
  const periods = records(gb.reportingPeriods, 51).map(periodFrom);
  if (new Set(periods.map((p) => p.index)).size !== periods.length)
    throw unreadable();
  const reportedPeriod = object(gb.reportingPeriod);
  // The reported period may omit its index; find it by name in the list.
  const reportedIndex = reportedPeriod
    ? (numeric(reportedPeriod.index) ??
      periods.find((p) => p.name === text(reportedPeriod.gradePeriod))?.index)
    : undefined;
  let period: GradePeriod;
  if (requestedPeriod === undefined) {
    // No period asked for: StudentVUE answers with the current one.
    period =
      (reportedPeriod && periodFrom(reportedPeriod, reportedIndex ?? 0)) ||
      currentByDate(periods) || {
        index: 0,
        name: "Current grading period",
        start: "",
        end: "",
      };
  } else {
    const selected = periods.find((p) => p.index === requestedPeriod);
    if (
      (reportedPeriod &&
        periodFrom(reportedPeriod, reportedIndex ?? requestedPeriod).index !==
          requestedPeriod) ||
      (periods.length > 0 && !selected) ||
      (!periods.length && requestedPeriod !== 0)
    )
      throw new SynergyError(
        "StudentVUE returned a different grading period. Please try selecting the period again.",
      );
    period = reportedPeriod
      ? periodFrom(reportedPeriod, reportedIndex ?? requestedPeriod)
      : (selected ?? {
          index: requestedPeriod,
          name: "Current grading period",
          start: "",
          end: "",
        });
  }
  let assignmentCount = 0;
  const hidePercent = truthy(gb.hidePercentSecondary);
  const courses = records(gb.courses, 200)
    .map((c, courseIndex): GradeCourse => ({
      id: `${text(c.courseID) || courseIndex}:${text(c.period)}:${text(c.staffGU) || text(c.staff)}`,
      name: text(c.title) || "Untitled course",
      period: numeric(c.period),
      room: text(c.room),
      teacher: text(c.staff),
      marks: records(c.marks, 50).map((m): GradeMark => {
        const assignments = records(m.assignments, maxAssignments);
        assignmentCount += assignments.length;
        if (assignmentCount > maxAssignments) throw unreadable();
        return {
          name: text(m.markName) || period.name,
          letter: text(m.calculatedScoreString),
          percent: hidePercent ? null : numeric(m.calculatedScoreRaw, true),
          categories: categoriesFrom(m.gradeCalculationSummary),
          assignments: assignments.map(assignmentFrom),
        };
      }),
    }))
    .sort(
      (a, b) =>
        (a.period ?? Infinity) - (b.period ?? Infinity) ||
        a.name.localeCompare(b.name),
    );
  return {
    source: "synergy",
    demo: false,
    fetchedAt: new Date().toISOString(),
    period,
    periods: periods.length ? periods : [period],
    courses,
  };
}

// Daily camel-case structure verified against the MCPS mobile response (Oct 22).
// Also accept the legacy daily structure's Pascal-case equivalents.
// Do not treat the all-terms class list as today's actual bell schedule.
export function parseMobileSchedule(data: unknown): TodaySchedule {
  const result: TodaySchedule = { fetchedAt: new Date().toISOString(), meetings: [], available: false };
  const queue: { value: unknown; daily: boolean; depth: number }[] = [{ value: data, daily: false, depth: 0 }];
  let visited = 0;
  let foundDaily = false;
  let classRows = 0;
  const field = (row: JsonObject, ...names: string[]) => {
    const entry = Object.entries(row).find(([key]) => names.includes(key.toLowerCase().replace(/^@/, "")));
    return entry?.[1];
  };
  const minutes = (value: unknown): number | null => {
    const match = /^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i.exec(text(value));
    if (!match) return null;
    let hour = Number(match[1]);
    const minute = Number(match[2]);
    if (minute > 59 || (match[3] ? hour < 1 || hour > 12 : hour > 23)) return null;
    if (match[3]) hour = hour % 12 + (match[3].toUpperCase() === "PM" ? 12 : 0);
    return hour * 60 + minute;
  };
  while (queue.length) {
    const item = queue.shift()!;
    if (++visited > 5000 || item.depth > 12) throw unreadable();
    if (Array.isArray(item.value)) {
      if (item.value.length > 1000) throw unreadable();
      queue.push(...item.value.map(value => ({ ...item, value, depth: item.depth + 1 })));
      continue;
    }
    const row = object(item.value);
    if (!row) continue;
    if (item.daily && (field(row, "starttime", "start") !== undefined || field(row, "endtime", "end") !== undefined || field(row, "classname", "coursetitle", "title") !== undefined)) {
      classRows++;
      const start = minutes(field(row, "starttime", "start"));
      const end = minutes(field(row, "endtime", "end"));
      const period = numeric(field(row, "period"));
      if (start !== null && end !== null && end > start) result.meetings.push({
        name: text(field(row, "classname", "coursetitle", "title")) || "Class",
        period: period !== null && Number.isInteger(period) ? period : null,
        room: text(field(row, "roomname", "room")),
        teacher: text(field(row, "teachername", "teacher")), start, end,
      });
    }
    for (const [key, value] of Object.entries(row)) {
      const isDaily = ["todayscheduleinfodata", "todayschedule", "todaycourses"].includes(key.toLowerCase());
      if (isDaily && (Array.isArray(value) || object(value))) foundDaily = true;
      if (value && typeof value === "object") queue.push({ value, daily: item.daily || isDaily, depth: item.depth + 1 });
    }
  }
  result.meetings.sort((a, b) => a.start - b.start);
  result.available = foundDaily && (classRows === 0 || result.meetings.length > 0);
  return result;
}

function upstreamError(value: unknown, stage: "sign-in" | "grade loading" | "schedule loading"): SynergyError | null {
  const error = object(value);
  if (!error) return value == null ? null : unreadable();
  const code = text(error.code),
    message = text(error.message);
  // Only short numeric service codes are safe to show. Never echo free-form
  // upstream messages or arbitrary code strings (which may contain account data).
  const reference = /^\d{1,6}$/.test(code) ? `code ${code}` : "unrecognized code";
  const detail = ` (StudentVUE ${stage}; ${reference})`;
  if (/UPD5304/i.test(`${code} ${message}`))
    return new SynergyError(
      `MCPS is rejecting this app's StudentVUE connection. The official StudentVUE website may still work. (StudentVUE ${stage}; UPD5304)`,
      503,
    );
  if (
    code === "401" ||
    /invalid (?:user|password|credential)|incorrect (?:user|password)|(?:authentication|login) failed/i.test(
      message,
    )
  )
    return new SynergyError(
      "StudentVUE did not accept that sign-in. Check your student ID and password in StudentVUE, then try again." + detail,
      422,
    );
  return new SynergyError(
    "StudentVUE could not open your gradebook. Check StudentVUE for an account notice or try again later." + detail,
  );
}

export class StudentVueMobileClient implements GradebookClient {
  private token = "";
  private loginPending: Promise<void> | null = null;
  private lifecycle = new AbortController();

  constructor(
    private username: string,
    private password: string,
    private request: typeof fetch = fetch,
  ) {}

  dispose() {
    this.username = "";
    this.password = "";
    this.token = "";
    this.lifecycle.abort();
  }

  private assertConnected() {
    if (this.lifecycle.signal.aborted || !this.username || !this.password)
      throw new SynergyError(
        "Reconnect StudentVUE to refresh your grades.",
        409,
      );
  }

  async gradebook(period?: number): Promise<Gradebook> {
    this.assertConnected();
    if (
      period !== undefined &&
      (!Number.isInteger(period) || period < 0 || period > 50)
    )
      throw new SynergyError("Choose a valid grading period.", 400);
    await this.login();
    // Leaving reportPeriod out asks StudentVUE for the current grading period;
    // sending 0 always returned the first one (old grades later in the year).
    const inner = {
      ...(period === undefined ? {} : { reportPeriod: period }),
      childIntID: 0,
      languageCode: "en",
    };
    let json = await this.post("Gradebook", inner, `Bearer ${this.token}`);
    if (text(object(json.error)?.code) === "401") {
      this.token = "";
      await this.login();
      json = await this.post("Gradebook", inner, `Bearer ${this.token}`);
    }
    this.assertConnected();
    const error = upstreamError(json.error, "grade loading");
    if (error) throw error;
    return parseMobileGradebook(json.data, period);
  }

  async schedule(): Promise<TodaySchedule> {
    this.assertConnected();
    await this.login();
    // MCPS only includes todayScheduleInfoData when loadAllTerms is false.
    // Asking for all terms returns course lists without daily bell times.
    const inner = { childIntID: 0, loadAllTerms: false, conSchOrgYearGU: "", conSchTermIndex: "-1", termIndex: "-1" };
    let json = await this.post("StudentClassList", inner, `Bearer ${this.token}`);
    if (text(object(json.error)?.code) === "401") {
      this.token = "";
      await this.login();
      json = await this.post("StudentClassList", inner, `Bearer ${this.token}`);
    }
    this.assertConnected();
    const error = upstreamError(json.error, "schedule loading");
    if (error) throw error;
    return parseMobileSchedule(json.data);
  }

  private async login(): Promise<void> {
    this.assertConnected();
    if (this.token) return;
    if (this.loginPending) return this.loginPending;
    const pending = (async () => {
      const json = await this.post(
        "AttemptLogin",
        {
          userID: "",
          password: "",
          userType: "Student",
        },
        `Basic ${Buffer.from(`${this.username}:${this.password}`, "utf8").toString("base64")}`,
      );
      this.assertConnected();
      const error = upstreamError(json.error, "sign-in");
      if (error) throw error;
      if (
        typeof json.access_token !== "string" ||
        !json.access_token.trim() ||
        json.access_token.length > 8192 ||
        /[\x00-\x20\x7f]/.test(json.access_token)
      )
        throw new SynergyError(
          "StudentVUE did not return a session token. Check StudentVUE or try again later.",
        );
      this.token = json.access_token;
    })();
    this.loginPending = pending;
    try {
      await pending;
    } finally {
      if (this.loginPending === pending) this.loginPending = null;
    }
  }

  private async post(
    method: "AttemptLogin" | "Gradebook" | "StudentClassList",
    inner: JsonObject,
    authorization: string,
  ): Promise<JsonObject> {
    this.assertConnected();
    try {
      const appKey = await getStudentVueAppKey(this.lifecycle.signal);
      this.assertConnected();
      const response = await this.request(`${mobilePath}/${method}`, {
        method: "POST",
        redirect: "manual",
        signal: AbortSignal.any([
          this.lifecycle.signal,
          AbortSignal.timeout(25_000),
        ]),
        headers: {
          "Content-Type": "application/json",
          Authorization: authorization,
          edupointkeyversion: appKey,
        },
        body: JSON.stringify({ arguments: { request: JSON.stringify(inner) } }),
      });
      this.assertConnected();
      if (!response.ok) {
        await response.body?.cancel();
        if (response.status === 401 && method !== "AttemptLogin")
          return { error: { code: "401" } };
        if (response.status === 401)
          throw new SynergyError(
            "StudentVUE did not accept that sign-in. Check your student ID and password in StudentVUE, then try again.",
            422,
          );
        if (
          [403, 404, 405, 410].includes(response.status) ||
          (response.status >= 300 && response.status < 400)
        )
          throw new SynergyError(
            "MCPS is not accepting this app's StudentVUE connection. The official StudentVUE website may still work.",
            503,
          );
        if (response.status === 429)
          throw new SynergyError(
            "StudentVUE is receiving too many sign-in requests. Wait a minute and try again.",
            429,
          );
        throw new SynergyError(
          "StudentVUE could not open your gradebook. Please try again later.",
        );
      }
      if (!response.body) throw unreadable();
      const declaredSize = Number(response.headers.get("content-length"));
      if (Number.isFinite(declaredSize) && declaredSize > maxBytes) {
        await response.body.cancel();
        throw unreadable();
      }
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      try {
        while (true) {
          this.assertConnected();
          const { done, value } = await reader.read();
          this.assertConnected();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > maxBytes) {
            await reader.cancel();
            throw unreadable();
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }
      let json: unknown;
      try {
        json = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        throw unreadable();
      }
      const result = object(json);
      if (!result) throw unreadable();
      return result;
    } catch (error) {
      if (error instanceof SynergyError) throw error;
      if (this.lifecycle.signal.aborted)
        throw new SynergyError(
          "Reconnect StudentVUE to refresh your grades.",
          409,
        );
      throw new SynergyError(
        "Could not reach StudentVUE. Your previous grades were kept; try again shortly.",
      );
    }
  }
}
