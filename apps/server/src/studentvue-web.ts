import { load } from "cheerio/slim";
import { CookieJar } from "tough-cookie";
import type {
  GradeAssignment,
  Gradebook,
  GradeCourse,
  GradePeriod,
} from "../../../packages/domain/src/gradebook";
import {
  STUDENTVUE_ORIGIN,
  SynergyError,
  type GradebookClient,
} from "./synergy";

// The authenticated PXP2 website contract, separate from the SOAP mobile API.
// Public reference: MCPS /js/PXP/PXP2_Gradebook.js (LoadControl and SetTerm).
const gradebookPath = "/PXP2_Gradebook.aspx?AGU=0";
const controlPath = "/service/PXP2Communication.asmx/LoadControl";
const maxBytes = 8 * 1024 * 1024;
type RecordValue = Record<string, unknown>;
const record = (v: unknown): RecordValue =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as RecordValue) : {};
const string = (v: unknown) =>
  typeof v === "string"
    ? v.trim()
    : typeof v === "number" && Number.isFinite(v)
      ? String(v)
      : "";
const plain = (v: unknown) =>
  load(string(v)).root().text().replace(/\s+/g, " ").trim();
const numeric = (v: unknown): number | null => {
  const s = string(v).replace(/%$/, "").trim();
  return /^-?\d+(?:\.\d+)?$/.test(s) && Number.isFinite(Number(s))
    ? Number(s)
    : null;
};
const unreadable = () =>
  new SynergyError(
    "StudentVUE's website returned a gradebook format this connection cannot read yet.",
  );
const expired = () =>
  new SynergyError(
    "That StudentVUE browser session has expired or was not accepted. Sign in to StudentVUE again and replace the session cookie in Better Canvas.",
    422,
  );

export function normalizeSessionCookie(value: string): string {
  const cookie = value.trim().replace(/^cookie:\s*/i, "");
  if (!cookie || cookie.length > 6000 || /[^\x20-\x7e]/.test(cookie))
    throw new SynergyError(
      "Paste the Cookie request header from your own signed-in StudentVUE gradebook.",
      400,
    );
  const parts = cookie
    .split(";")
    .map((p) => p.trim())
    .filter(Boolean);
  if (
    !parts.length ||
    parts.some((p) => !/^[!#$%&'*+.^_`|~\w-]+=[\x21-\x3a\x3c-\x7e]*$/.test(p))
  )
    throw new SynergyError(
      "Paste the Cookie request header, without other request headers.",
      400,
    );
  return parts.join("; ");
}

// Parse embedded JSON only. Never evaluate StudentVUE's scripts.
export function embeddedJson(source: string, marker: RegExp): unknown {
  const match = marker.exec(source);
  if (!match) throw unreadable();
  const start = match.index + match[0].length;
  let quoted = false,
    escaped = false;
  const stack: string[] = [];
  let begin = -1;
  for (let i = start; i < source.length; i++) {
    const c = source[i];
    if (begin < 0) {
      if (/\s/.test(c)) continue;
      if (c !== "{" && c !== "[") throw unreadable();
      begin = i;
    }
    if (quoted) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') quoted = false;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === "{" || c === "[") stack.push(c);
    else if (c === "}" || c === "]") {
      if (stack.pop() !== (c === "}" ? "{" : "[")) throw unreadable();
      if (!stack.length) {
        try {
          return JSON.parse(source.slice(begin, i + 1));
        } catch {
          throw unreadable();
        }
      }
    }
  }
  throw unreadable();
}

type PortalPeriod = {
  key: string;
  name: string;
  gu: string;
  group: string;
  school: string;
  year: string;
};
type PortalCourse = {
  id: string;
  name: string;
  teacher: string;
  room: string;
  period: number | null;
  focus: RecordValue;
};
export function parseWebOverview(html: string) {
  const $ = load(html);
  const current = $(".current.breadcrumb-term").first().text().trim();
  const periods: PortalPeriod[] = [];
  const courses: PortalCourse[] = [];
  const seen = new Set<string>();
  $('[data-action="GB.SetTerm"][data-period-id]').each((_i, el) => {
    const item = $(el),
      gu = item.attr("data-period-id") ?? "",
      group = item.attr("data-period-group") ?? "";
    const school =
      item.closest("[data-school-id]").attr("data-school-id") ?? "";
    const year =
      item.closest("[data-orgyear-id]").attr("data-orgyear-id") ?? "";
    const key = JSON.stringify([school, year, group, gu]);
    if (gu && !periods.some((p) => p.key === key))
      periods.push({ key, name: item.text().trim(), gu, group, school, year });
  });
  $(".gb-class-row").each((_i, el) => {
    const row = $(el);
    const rawFocus =
      row.attr("data-focus") ??
      row.find("[data-focus]").first().attr("data-focus");
    if (!rawFocus) return;
    let focusData: RecordValue;
    try {
      focusData = record(JSON.parse(rawFocus));
    } catch {
      throw unreadable();
    }
    const control = string(record(focusData.LoadParams).ControlName);
    if (control && control !== "Gradebook_ClassDetails")
      throw new SynergyError(
        "This StudentVUE course uses a gradebook format the browser-session connection does not support yet.",
      );
    const focus = record(focusData.FocusArgs),
      id = string(focus.classID);
    if (!id || id === "-1" || seen.has(id)) return;
    seen.add(id);
    const cell = (selector: string) =>
      row.find(selector).first().text().replace(/\s+/g, " ").trim();
    courses.push({
      id,
      name:
        cell(".class-title, .course-title") || `Course ${courses.length + 1}`,
      teacher: cell(".teacher"),
      room: cell(".room"),
      period: numeric(cell(".period")),
      focus,
    });
  });
  // Never silently return an empty gradebook if the page structure changed.
  if (!courses.length || courses.length > 30 || periods.length > 50)
    throw unreadable();
  const schools = new Set(
    periods.map((p) => JSON.stringify([p.school, p.year])),
  );
  if (schools.size > 1)
    throw new SynergyError(
      "The browser-session connection currently supports one school's gradebook at a time.",
    );
  return { current, periods, courses };
}

function cellValue(value: unknown) {
  if (typeof value === "object") return plain(record(value).value);
  const s = string(value);
  if (s.startsWith("{")) {
    try {
      return plain(record(JSON.parse(s)).value);
    } catch {
      throw unreadable();
    }
  }
  return plain(s);
}
function date(value: unknown) {
  const s = string(value),
    m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(s);
  const year = m ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : 0;
  const iso = m
    ? `${year}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`
    : s;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === iso
    ? iso
    : "";
}
export function parseWebDetails(html: string, markName: string) {
  const $ = load(html),
    grade = $(".gb-current-grade").first();
  if (!grade.length) throw unreadable();
  const gridScripts = $("script")
    .toArray()
    .map((el) => $(el).text())
    .filter(
      (s) => s.includes("AssignmentsGrid") && /["']dataSource["']\s*:/.test(s),
    );
  if (gridScripts.length !== 1) throw unreadable();
  const rows = embeddedJson(gridScripts[0], /["']dataSource["']\s*:/);
  if (!Array.isArray(rows) || rows.length > 2000) throw unreadable();
  const assignments: GradeAssignment[] = rows.map((raw, i) => {
    const row = record(raw),
      score = cellValue(row.GBScore),
      notes = cellValue(row.GBNotes),
      points = cellValue(row.GBPoints);
    const pair =
      /^\s*(-?\d+(?:\.\d+)?)\s*(?:\/|out of)\s*(\d+(?:\.\d+)?)(?:\s*points?)?\s*$/i.exec(
        points,
      ) ??
      /^\s*(-?\d+(?:\.\d+)?)\s*(?:\/|out of)\s*(\d+(?:\.\d+)?)\s*$/i.exec(
        score,
      );
    const possible = pair
      ? numeric(pair[2])
      : numeric(/^\s*(\d+(?:\.\d+)?)\s+Points Possible\s*$/i.exec(points)?.[1]);
    const excluded =
      /\b(excused|excluded|not (?:for grading|included))\b/i.test(
        `${score} ${notes}`,
      );
    return {
      id: string(row.gradeBookId ?? row.GradebookID ?? row.boid) || `row-${i}`,
      name: cellValue(row.GBAssignment) || "Untitled assignment",
      category: cellValue(row.GBAssignmentType),
      // A generic Date column is not necessarily a due date. Leave it unknown.
      due: date(row.DueDate),
      assigned: date(row.AssignedDate),
      score,
      earned: pair ? numeric(pair[1]) : null,
      possible,
      notes,
      excluded,
      missing: !excluded && /\bmissing\b/i.test(`${score} ${notes}`),
    };
  });
  return {
    name: markName,
    letter: grade.find(".mark").first().text().trim(),
    percent: numeric(grade.find(".score").first().text()),
    categories: [],
    assignments,
  };
}

export class StudentVueWebClient implements GradebookClient {
  private jar = new CookieJar();
  private disposed = new AbortController();
  private periodIndexes = new Map<string, number>();
  constructor(
    cookie: string,
    private request: typeof fetch = fetch,
  ) {
    for (const part of normalizeSessionCookie(cookie).split("; "))
      this.jar.setCookieSync(`${part}; Path=/; Secure`, STUDENTVUE_ORIGIN);
  }
  dispose() {
    this.disposed.abort();
    this.jar.removeAllCookiesSync();
  }
  async schedule() {
    return { fetchedAt: new Date().toISOString(), meetings: [] };
  }
  private async read(
    path: typeof gradebookPath | typeof controlPath,
    signal: AbortSignal,
    body?: unknown,
    agu = "0",
  ) {
    if (this.disposed.signal.aborted) throw expired();
    const url = STUDENTVUE_ORIGIN + path;
    const headers: Record<string, string> = {
      Cookie: this.jar.getCookieStringSync(url),
      Accept: body ? "application/json" : "text/html",
    };
    if (body)
      Object.assign(headers, {
        "Content-Type": "application/json; charset=utf-8",
        "X-Requested-With": "XMLHttpRequest",
        Referer: STUDENTVUE_ORIGIN + gradebookPath,
        AGU: agu,
      });
    try {
      const response = await this.request(url, {
        method: body ? "POST" : "GET",
        headers,
        body: body ? JSON.stringify(body) : undefined,
        redirect: "manual",
        signal,
      });
      if (!response.ok) {
        await response.body?.cancel();
        if ([301, 302, 303, 307, 308, 401, 403].includes(response.status))
          throw expired();
        throw new SynergyError(
          `StudentVUE's website returned HTTP ${response.status}. Please try again shortly.`,
        );
      }
      if (!this.disposed.signal.aborted)
        for (const cookie of response.headers.getSetCookie())
          this.jar.setCookieSync(cookie, url, { ignoreError: true });
      if (!response.body) throw unreadable();
      const reader = response.body.getReader(),
        chunks: Uint8Array[] = [];
      let bytes = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
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
      const result = Buffer.concat(chunks).toString("utf8");
      if (
        /Login with Google|id=["'](?:ctl00_MainContent_LoginMessage|LoginSVUE)["']/i.test(
          result,
        )
      )
        throw expired();
      return result;
    } catch (error) {
      if (error instanceof SynergyError) throw error;
      throw new SynergyError(
        "Could not read StudentVUE's website. Please try again shortly.",
      );
    }
  }
  private async control(
    control: "Gradebook_SchoolClasses" | "Gradebook_ClassDetails",
    parameters: RecordValue,
    agu: string,
    signal: AbortSignal,
  ) {
    const text = await this.read(
      controlPath,
      signal,
      { request: { control, parameters } },
      agu,
    );
    let data: RecordValue;
    try {
      const payload = record(JSON.parse(text));
      data = record(payload.d ?? payload);
    } catch {
      throw unreadable();
    }
    if (data.Error) {
      if (
        /session|login|sign.?in|authenticat|unauthorized/i.test(
          JSON.stringify(data.Error),
        )
      )
        throw expired();
      throw new SynergyError(
        "StudentVUE could not open this gradebook page. Check the official website for an account notice.",
      );
    }
    const html = record(data.Data ?? data).html;
    if (typeof html !== "string") throw unreadable();
    return html;
  }
  async gradebook(requested?: number): Promise<Gradebook> {
    if (
      requested !== undefined &&
      (!Number.isInteger(requested) || requested < 0 || requested > 50)
    )
      throw new SynergyError("Choose a valid grading period.", 400);
    const signal = AbortSignal.any([
      this.disposed.signal,
      AbortSignal.timeout(75000),
    ]);
    const page = await this.read(gradebookPath, signal);
    const bootstrap = record(embeddedJson(page, /PXP\.GBCurrentFocus\s*=/)),
      focus = record(bootstrap.FocusArgs);
    if (!Object.keys(focus).length) throw unreadable();
    const agu = /PXP\.AGU\s*=\s*["']?(\d+)/.exec(page)?.[1] ?? "0";
    let overview = parseWebOverview(
      await this.control("Gradebook_SchoolClasses", focus, agu, signal),
    );
    const available = overview.periods.length
      ? overview.periods
      : [
          {
            key: "current",
            name: overview.current || "Current grading period",
            gu: string(focus.gradePeriodGU),
            group: "",
            school: string(focus.schoolID),
            year: string(focus.OrgYearGU),
          },
        ];
    for (const p of available)
      if (!this.periodIndexes.has(p.key)) {
        if (this.periodIndexes.size > 50)
          throw new SynergyError(
            "Reconnect StudentVUE to load the updated grading periods.",
            409,
          );
        this.periodIndexes.set(p.key, this.periodIndexes.size);
      }
    let selected =
      available.find((p) => p.name === overview.current) ??
      available.find((p) => p.gu === string(focus.gradePeriodGU));
    if (!selected && available.length === 1) selected = available[0];
    if (!selected) throw unreadable();
    if (requested !== undefined) {
      const target = available.find(
        (p) => this.periodIndexes.get(p.key) === requested,
      );
      if (!target)
        throw new SynergyError(
          "That grading period is not available in StudentVUE.",
          400,
        );
      if (target.key !== selected.key) {
        overview = parseWebOverview(
          await this.control(
            "Gradebook_SchoolClasses",
            {
              schoolID: target.school,
              OrgYearGU: target.year,
              gradePeriodGU: target.gu,
              GradingPeriodGroup: target.group,
              AGU: agu,
            },
            agu,
            signal,
          ),
        );
        if (overview.current !== target.name) throw unreadable();
        selected = target;
      }
    }
    const period = (p: PortalPeriod): GradePeriod => ({
      index: this.periodIndexes.get(p.key)!,
      name: p.name,
      start: "",
      end: "",
    });
    const courses: GradeCourse[] = [];
    for (const course of overview.courses) {
      if (courses.length)
        await new Promise<void>((resolve, reject) => {
          if (signal.aborted)
            return reject(
              new SynergyError(
                "The StudentVUE request ended before all courses loaded. Please try again.",
              ),
            );
          const timer = setTimeout(() => {
            signal.removeEventListener("abort", cancel);
            resolve();
          }, 350);
          const cancel = () => {
            clearTimeout(timer);
            reject(
              new SynergyError(
                "The StudentVUE request ended before all courses loaded. Please try again.",
              ),
            );
          };
          signal.addEventListener("abort", cancel, { once: true });
        });
      const mark = parseWebDetails(
        await this.control(
          "Gradebook_ClassDetails",
          { ...focus, ...course.focus },
          agu,
          signal,
        ),
        selected.name,
      );
      courses.push({
        id: `web:${course.id}`,
        name: course.name,
        period: course.period,
        room: course.room,
        teacher: course.teacher,
        marks: [mark],
      });
    }
    if (this.disposed.signal.aborted) throw expired();
    return {
      source: "synergy",
      demo: false,
      fetchedAt: new Date().toISOString(),
      period: period(selected),
      periods: available.map(period),
      courses: courses.sort(
        (a, b) => (a.period ?? Infinity) - (b.period ?? Infinity),
      ),
    };
  }
}
