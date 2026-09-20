import { XMLParser, XMLValidator } from "fast-xml-parser";
import type {
  Gradebook,
  GradeCourse,
  GradeMark,
  GradePeriod,
} from "../../../packages/domain/src/gradebook";

export const STUDENTVUE_ORIGIN = "https://md-mcps-psv.edupoint.com";
// Synergy SOAP endpoint for this district. MCPS now blocks direct SOAP calls
// with UPD5304 ("update your app"). The block is at the network layer, so a
// byte-identical request is rejected when sent from a server but accepted when
// relayed through the StudentVUE proxy. We send the same envelope through the
// proxy GradeDurian uses (https://github.com/btdpass/GradeDurian), which reaches
// Synergy on our behalf and returns { status, response }.
const district = `${STUDENTVUE_ORIGIN}/Service/PXPCommunication.asmx`;
const PROXY_ENDPOINT = "https://cloudproxy.gradedurian.workers.dev/fulfillAxios";
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
        "StudentVUE's grade service is temporarily unavailable (UPD5304). Please try again in a little while.",
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

export interface GradebookClient {
  gradebook(period?: number): Promise<Gradebook>;
  dispose(): void;
}
export class SynergyClient implements GradebookClient {
  constructor(
    private username: string,
    private password: string,
    private request: typeof fetch = fetch,
  ) {}
  dispose() {
    this.username = "";
    this.password = "";
  }
  async gradebook(period?: number): Promise<Gradebook> {
    if (!this.username || !this.password)
      throw new SynergyError(
        "Reconnect StudentVUE to refresh your grades.",
        409,
      );
    if (
      period !== undefined &&
      (!Number.isInteger(period) || period < 0 || period > 50)
    )
      throw new SynergyError("Choose a valid grading period.", 400);
    const params = `<Parms><childIntId>0</childIntId>${period === undefined ? "" : `<ReportPeriod>${period}</ReportPeriod>`}</Parms>`;
    const xml = `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><ProcessWebServiceRequestMultiWeb xmlns="http://edupoint.com/webservices/"><userID>${escapeXml(this.username)}</userID><password>${escapeXml(this.password)}</password><skipLoginLog>0</skipLoginLog><parent>0</parent><webServiceHandleName>PXPWebServices</webServiceHandleName><methodName>Gradebook</methodName><paramStr>${escapeXml(params)}</paramStr></ProcessWebServiceRequestMultiWeb></soap:Body></soap:Envelope>`;
    // The proxy relays this envelope to `district` and returns
    // { status, response }. `encrypted: false` forwards the password as sent.
    const requestBody = JSON.stringify({ url: district, xml, encrypted: false });
    try {
      const response = await this.request(PROXY_ENDPOINT, {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(25000),
        headers: { "Content-Type": "application/json" },
        body: requestBody,
      });
      if (!response.ok || !response.body)
        throw new SynergyError(
          "StudentVUE is unavailable right now. Please try again later.",
        );
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > maxBytes) {
            await reader.cancel();
            throw new SynergyError(
              "This StudentVUE response is too large to display.",
            );
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }
      let relayed: { status?: unknown; response?: unknown };
      try {
        relayed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        throw new SynergyError(
          "StudentVUE returned an unreadable response. Please try again.",
        );
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
      return parseGradebook(relayed.response, period);
    } catch (e) {
      if (e instanceof SynergyError) throw e;
      throw new SynergyError(
        "Could not reach StudentVUE. Your previous grades were kept; try again shortly.",
      );
    }
  }
}
