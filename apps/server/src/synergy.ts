import { XMLParser, XMLValidator } from "fast-xml-parser";
import type {
  ClassMeeting,
  Gradebook,
  GradeCourse,
  GradeMark,
  GradePeriod,
  TodaySchedule,
} from "../../../packages/domain/src/gradebook";

export const STUDENTVUE_ORIGIN = "https://md-mcps-psv.edupoint.com";
// Use the owner's authenticated relay. Moving the request to a Worker does
// not guarantee MCPS accepts it; preserve Synergy's UPD5304 error below.
const district = `${STUDENTVUE_ORIGIN}/Service/PXPCommunication.asmx`;
export type SynergyRelay = { url?: string; token?: string };
const maxBytes = 8 * 1024 * 1024;
export class SynergyError extends Error {
  constructor(
    message: string,
    public statusCode = 502,
  ) {
    super(message);
  }
}
type XmlNode = Record<string, any>;
const node = (value: unknown): XmlNode =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as XmlNode)
    : {};
const list = (value: unknown): XmlNode[] =>
  (Array.isArray(value)
    ? value
    : value && typeof value === "object"
      ? [value]
      : []
  ).map(node);
const text = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";
const attr = (value: XmlNode, key: string) => text(value[`@_${key}`]);
const number = (value: unknown): number | null => {
  const s = text(value).replace(/%$/, "").trim();
  if (!/^-?\d+(?:\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
const escapeXml = (value: string) =>
  value.replace(
    /[<>&"']/g,
    (c) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );

function parseXml(xml: string): XmlNode {
  // Synergy needs only built-in XML entities. Reject DTDs before either parse.
  if (
    xml.length > maxBytes ||
    /<!\s*(?:DOCTYPE|ENTITY)/i.test(xml) ||
    XMLValidator.validate(xml) !== true
  )
    throw new SynergyError(
      "StudentVUE returned an unreadable response. Please try again.",
    );
  return new XMLParser({
    ignoreAttributes: false,
    removeNSPrefix: true,
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: false,
  }).parse(xml);
}

function repairAssignmentText(xml: string) {
  // Some Synergy responses leave quotes/HTML unescaped in these two fields.
  // Only repair their known attribute boundaries, never cross another record.
  // Other malformed XML still fails validation in parseXml.
  if (XMLValidator.validate(xml) === true) return xml;
  for (const [field, next] of [
    ["MeasureDescription", "HasDropBox"],
    ["Measure", "Type"],
  ]) {
    const pattern = new RegExp(
      `(\\b${field}=")((?:(?!<\\/?(?:Assignment|Mark|Course)\\b)[\\s\\S])*?)("\\s+${next}=)`,
      "g",
    );
    xml = xml.replace(
      pattern,
      (_match, start: string, value: string, end: string) => {
        const safe = value
          .replace(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);)/gi, "&amp;")
          .replace(/"/g, "&quot;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
        return `${start}${safe}${end}`;
      },
    );
  }
  return xml;
}

function date(value: string) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s|$)/.exec(value);
  const normalized = m
    ? `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`
    : /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? value
      : "";
  const parsed = new Date(`${normalized}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === normalized
    ? normalized
    : "";
}
const periodFrom = (p: XmlNode, fallback: number): GradePeriod => ({
  index: number(attr(p, "Index")) ?? fallback,
  name: attr(p, "GradePeriod") || "Current grading period",
  start: date(attr(p, "StartDate")),
  end: date(attr(p, "EndDate")),
});

export function parseGradebook(
  xml: string,
  requestedPeriod?: number,
): Gradebook {
  const envelope = parseXml(xml);
  const body = node(node(envelope.Envelope).Body);
  // Requests relayed through the proxy use ProcessWebServiceRequestMultiWeb;
  // legacy direct calls and the tests use ProcessWebServiceRequest. Accept both.
  const result =
    node(body.ProcessWebServiceRequestMultiWebResponse)
      .ProcessWebServiceRequestMultiWebResult ??
    node(body.ProcessWebServiceRequestResponse).ProcessWebServiceRequestResult;
  if (typeof result !== "string")
    throw new SynergyError(
      "StudentVUE did not return a gradebook. Please try again later.",
    );
  if (/<!\s*(?:DOCTYPE|ENTITY)/i.test(result))
    throw new SynergyError(
      "StudentVUE returned an unreadable response. Please try again.",
    );
  const payload = parseXml(repairAssignmentText(result));
  if (payload.RT_ERROR) {
    const message = attr(node(payload.RT_ERROR), "ERROR_MESSAGE");
    if (/\bUPD5304(?:-\d+)?\b/i.test(message))
      throw new SynergyError(
        "MCPS is rejecting this app's StudentVUE API request (UPD5304). The official StudentVUE website may still work.",
        503,
      );
    if (
      /password|user\s*name|user\s*id|login|credential|authentication/i.test(
        message,
      )
    )
      throw new SynergyError(
        "StudentVUE did not accept that sign-in. Check your student ID and password in StudentVUE, then try again.",
        422,
      );
    throw new SynergyError(
      "StudentVUE could not open your gradebook. Check the StudentVUE website for an account notice or try again later.",
    );
  }
  const gb = node(payload.Gradebook);
  if (!payload.Gradebook || attr(gb, "ErrorMessage"))
    throw new SynergyError(
      "StudentVUE has not made this gradebook available. Try another grading period or check StudentVUE.",
    );
  if (attr(gb, "Type") && attr(gb, "Type").toLowerCase() !== "traditional")
    throw new SynergyError(
      "This gradebook uses a grading format Better Canvas does not support yet. Open StudentVUE to view it.",
    );
  const periods = list(node(gb.ReportingPeriods).ReportPeriod).map((p) =>
    periodFrom(p, 0),
  );
  const current = node(gb.ReportingPeriod);
  const currentIndex =
    number(attr(current, "Index")) ??
    periods.find((p) => p.name === attr(current, "GradePeriod"))?.index ??
    requestedPeriod ??
    0;
  const period = periodFrom(current, currentIndex);
  if (requestedPeriod !== undefined && period.index !== requestedPeriod)
    throw new SynergyError(
      "StudentVUE returned a different grading period. Please try selecting the period again.",
    );
  const hidePercent = /^(true|1|yes)$/i.test(attr(gb, "HidePercentSecondary"));
  const courses: GradeCourse[] = list(node(gb.Courses).Course)
    .map((c, ci) => ({
      id: `${attr(c, "CourseID") || ci}:${attr(c, "Period")}:${attr(c, "StaffGU")}`,
      name: attr(c, "Title") || "Untitled course",
      period: number(attr(c, "Period")),
      room: attr(c, "Room"),
      teacher: attr(c, "Staff"),
      marks: list(node(c.Marks).Mark).map((m): GradeMark => ({
        name: attr(m, "MarkName") || period.name,
        letter: attr(m, "CalculatedScoreString"),
        percent: hidePercent ? null : number(attr(m, "CalculatedScoreRaw")),
        categories: list(node(m.GradeCalculationSummary).AssignmentGradeCalc)
          .filter((cat) => !/^(total|overall)$/i.test(attr(cat, "Type")))
          .map((cat) => ({
            name: attr(cat, "Type"),
            weight: number(attr(cat, "Weight")),
            earned: number(attr(cat, "Points")),
            possible: number(attr(cat, "PointsPossible")),
            reportedGrade: attr(cat, "CalculatedMark"),
          })),
        assignments: list(node(m.Assignments).Assignment).map((a, ai) => {
          const points = attr(a, "Points").split("/");
          const notes = attr(a, "Notes"),
            score = attr(a, "Score");
          const excluded =
            /\b(excused|excluded|not (?:for grading|included))\b/i.test(
              `${score} ${notes}`,
            ) || /^(true|1)$/i.test(attr(a, "IsExcluded"));
          return {
            id: `${attr(a, "GradebookID") || ai}`,
            name: attr(a, "Measure") || "Untitled assignment",
            category: attr(a, "Type"),
            assigned: date(attr(a, "Date")),
            due: date(attr(a, "DueDate")),
            score,
            earned: points.length === 2 ? number(points[0]) : null,
            possible: number(points.length === 2 ? points[1] : points[0]),
            notes,
            excluded,
            missing:
              !excluded &&
              (/\bmissing\b/i.test(`${score} ${notes}`) ||
                /^(true|1)$/i.test(attr(a, "IsMissing"))),
          };
        }),
      })),
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

// "9:15 AM" / "13:05" -> minutes since midnight, or null when unparseable.
function minutes(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i.exec(value.trim());
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = Number(m[2]),
    meridiem = m[3]?.toUpperCase();
  if (minute > 59) return null;
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    if (meridiem === "PM" && hour !== 12) hour += 12;
    if (meridiem === "AM" && hour === 12) hour = 0;
  } else if (hour > 23) return null;
  return hour * 60 + minute;
}

// Today's bell schedule from StudentClassList. A missing or empty schedule (a
// weekend, a holiday, or a district that does not publish one) is not an error:
// it simply yields no meetings, which hides the countdown.
export function parseTodaySchedule(xml: string): TodaySchedule {
  const envelope = parseXml(xml);
  const body = node(node(envelope.Envelope).Body);
  const result =
    node(body.ProcessWebServiceRequestMultiWebResponse)
      .ProcessWebServiceRequestMultiWebResult ??
    node(body.ProcessWebServiceRequestResponse).ProcessWebServiceRequestResult;
  if (typeof result !== "string")
    throw new SynergyError(
      "StudentVUE did not return your schedule. Please try again later.",
    );
  const payload = parseXml(result);
  if (payload.RT_ERROR)
    throw new SynergyError(
      "StudentVUE could not open your schedule. Please try again later.",
    );
  const today = node(
    node(payload.StudentClassSchedule).TodayScheduleInfoData,
  ).SchoolInfos;
  const meetings: ClassMeeting[] = list(node(today).SchoolInfo)
    .flatMap((school) => list(node(school.Classes).ClassInfo))
    .map((c) => {
      const start = minutes(attr(c, "StartTime")),
        end = minutes(attr(c, "EndTime"));
      return start === null || end === null || end < start
        ? null
        : {
            name: attr(c, "ClassName") || "Class",
            period: number(attr(c, "Period")),
            room: attr(c, "RoomName"),
            teacher: attr(c, "TeacherName"),
            start,
            end,
          };
    })
    .filter((m): m is ClassMeeting => m !== null)
    .sort((a, b) => a.start - b.start);
  return { fetchedAt: new Date().toISOString(), meetings };
}

export interface GradebookClient {
  gradebook(period?: number): Promise<Gradebook>;
  schedule(): Promise<TodaySchedule>;
  dispose(): void;
}
export class SynergyClient implements GradebookClient {
  constructor(
    private username: string,
    private password: string,
    private request: typeof fetch = fetch,
    private relayConfig: SynergyRelay = {},
  ) {}
  dispose() {
    this.username = "";
    this.password = "";
  }
  async gradebook(period?: number): Promise<Gradebook> {
    if (
      period !== undefined &&
      (!Number.isInteger(period) || period < 0 || period > 50)
    )
      throw new SynergyError("Choose a valid grading period.", 400);
    const params = `<Parms><childIntId>0</childIntId>${period === undefined ? "" : `<ReportPeriod>${period}</ReportPeriod>`}</Parms>`;
    return parseGradebook(await this.relay("Gradebook", params), period);
  }
  async schedule(): Promise<TodaySchedule> {
    return parseTodaySchedule(
      await this.relay(
        "StudentClassList",
        "<Parms><childIntId>0</childIntId></Parms>",
      ),
    );
  }
  // Shared transport: wrap `params` in a SOAP envelope and relay it to Synergy
  // through the proxy, returning the raw SOAP response for a parser.
  private async relay(methodName: string, params: string): Promise<string> {
    if (!this.username || !this.password)
      throw new SynergyError(
        "Reconnect StudentVUE to refresh your grades.",
        409,
      );
    const { url, token } = this.relayConfig;
    if (!url || !token?.trim())
      throw new SynergyError(
        "StudentVUE relay is not configured. Set STUDENTVUE_RELAY_URL and STUDENTVUE_RELAY_TOKEN on the server.",
        503,
      );
    let endpoint: URL;
    try {
      endpoint = new URL(url);
      if (
        endpoint.protocol !== "https:" ||
        endpoint.username ||
        endpoint.password ||
        endpoint.search ||
        endpoint.hash ||
        endpoint.pathname !== "/fulfillAxios"
      )
        throw new Error("Invalid relay URL");
    } catch {
      throw new SynergyError(
        "STUDENTVUE_RELAY_URL must be an HTTPS Worker URL ending in /fulfillAxios.",
        503,
      );
    }
    const xml = `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><ProcessWebServiceRequestMultiWeb xmlns="http://edupoint.com/webservices/"><userID>${escapeXml(this.username)}</userID><password>${escapeXml(this.password)}</password><skipLoginLog>0</skipLoginLog><parent>0</parent><webServiceHandleName>PXPWebServices</webServiceHandleName><methodName>${escapeXml(methodName)}</methodName><paramStr>${escapeXml(params)}</paramStr></ProcessWebServiceRequestMultiWeb></soap:Body></soap:Envelope>`;
    // The proxy relays this envelope to `district` and returns
    // { status, response }. `encrypted: false` forwards the password as sent.
    const requestBody = JSON.stringify({
      url: district,
      xml,
      encrypted: false,
    });
    try {
      const response = await this.request(endpoint.href, {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(25000),
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: requestBody,
      });
      if (response.status === 401 || response.status === 403) {
        await response.body?.cancel();
        throw new SynergyError(
          "StudentVUE relay rejected its access token. Match STUDENTVUE_RELAY_TOKEN in Render to RELAY_TOKEN in Cloudflare.",
          503,
        );
      }
      const relayFailure = () =>
        new SynergyError(
          `The StudentVUE relay returned HTTP ${response.status}. This does not mean the official StudentVUE website is down.`,
        );
      if (!response.body) throw relayFailure();
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > (response.ok ? maxBytes : 8192)) {
            await reader.cancel();
            if (!response.ok) throw relayFailure();
            throw new SynergyError(
              "This StudentVUE response is too large to display.",
            );
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }
      let relayed: {
        status?: unknown;
        response?: unknown;
        code?: unknown;
        upstreamStatus?: unknown;
      };
      try {
        relayed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        if (!response.ok) throw relayFailure();
        throw new SynergyError(
          "StudentVUE returned an unreadable response. Please try again.",
        );
      }
      if (!response.ok) {
        if (relayed?.code === "UPSTREAM_NETWORK")
          throw new SynergyError(
            "Your StudentVUE relay could not reach MCPS's grade API. The official StudentVUE website may still work.",
          );
        if (
          relayed?.code === "UPSTREAM_HTTP" &&
          typeof relayed.upstreamStatus === "number" &&
          Number.isInteger(relayed.upstreamStatus) &&
          relayed.upstreamStatus >= 100 &&
          relayed.upstreamStatus <= 599
        )
          throw new SynergyError(
            `MCPS returned HTTP ${relayed.upstreamStatus} to your StudentVUE relay. The official StudentVUE website may still work.`,
          );
        throw relayFailure();
      }
      // The proxy reports transport failures as { status: false }; a real
      // Synergy reply (including RT_ERROR) comes back as a `response` string.
      if (
        !relayed ||
        typeof relayed !== "object" ||
        relayed.status === false ||
        typeof relayed.response !== "string"
      )
        throw new SynergyError(
          "StudentVUE could not open your gradebook. Check the StudentVUE website for an account notice or try again later.",
        );
      return relayed.response;
    } catch (e) {
      if (e instanceof SynergyError) throw e;
      throw new SynergyError(
        "Could not reach StudentVUE. Your previous grades were kept; try again shortly.",
      );
    }
  }
}
