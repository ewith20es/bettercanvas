import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../apps/server/src/app";
import {
  parseGradebook,
  parseTodaySchedule,
  SynergyClient,
  SynergyError,
} from "../apps/server/src/synergy";
import { demoGradebook } from "../packages/domain/src/gradebook-demo";
import {
  activeMeeting,
  clockLabel,
  estimateGrade,
  hasGradeScore,
} from "../packages/domain/src/gradebook";

const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const envelope = (xml: string) =>
  `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><ProcessWebServiceRequestResponse><ProcessWebServiceRequestResult>${escape(xml)}</ProcessWebServiceRequestResult></ProcessWebServiceRequestResponse></soap:Body></soap:Envelope>`;
// The proxy relays ProcessWebServiceRequestMultiWeb, so live replies arrive in
// this wrapper. This is the shape parseGradebook actually sees in production.
const multiWebEnvelope = (xml: string) =>
  `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><ProcessWebServiceRequestMultiWebResponse><ProcessWebServiceRequestMultiWebResult>${escape(xml)}</ProcessWebServiceRequestMultiWebResult></ProcessWebServiceRequestMultiWebResponse></soap:Body></soap:Envelope>`;
const fixture = `<Gradebook Type="Traditional" ErrorMessage="" HidePercentSecondary="false">
<ReportingPeriods><ReportPeriod Index="0" GradePeriod="Q1" StartDate="8/25/2026" EndDate="10/30/2026"/><ReportPeriod Index="1" GradePeriod="Q2"/></ReportingPeriods>
<ReportingPeriod GradePeriod="Q1" StartDate="8/25/2026" EndDate="10/30/2026"/>
<Courses><Course CourseID="apush" Period="9" Title="AP US History A" Room="242" Staff="Sample Teacher"><Marks><Mark MarkName="Q1" CalculatedScoreString="B" CalculatedScoreRaw="87.50">
<GradeCalculationSummary><AssignmentGradeCalc Type="Assessments" Weight="90%" Points="85" PointsPossible="100" CalculatedMark="B"/><AssignmentGradeCalc Type="Practice" Weight="10%" Points="100" PointsPossible="100" CalculatedMark="A"/></GradeCalculationSummary>
<Assignments>
<Assignment GradebookID="1" Measure="Reading &amp; analysis" Type="Assessments" DueDate="9/18/2026" Date="9/15/2026" Points="0 / 20" Score="0%" Notes="Missing"/>
<Assignment GradebookID="2" Measure="Awaiting a score" Type="Practice" Points="10" Score="Not Graded"/>
<Assignment GradebookID="3" Measure="Excused task" Type="Practice" Points="EX / 10" Score="Excused"/>
<Assignment GradebookID="4" Measure="Extra credit" Type="Practice" Points="5 / 0" Score="5"/>
</Assignments></Mark></Marks></Course><Course Period="0" Title="Homeroom" Room="332"><Marks/></Course></Courses></Gradebook>`;

describe("Synergy gradebook normalization", () => {
  it("keeps reported grades, weights, period order, zero scores, ungraded and excused separate", () => {
    const gb = parseGradebook(envelope(fixture));
    expect(gb.source).toBe("synergy");
    expect(gb.demo).toBe(false);
    expect(gb.period).toMatchObject({
      index: 0,
      name: "Q1",
      start: "2026-08-25",
    });
    expect(gb.periods).toHaveLength(2);
    expect(gb.courses.map((c) => c.period)).toEqual([0, 9]);
    expect(gb.courses[0].marks).toEqual([]);
    const mark = gb.courses[1].marks[0];
    // Do not overwrite the official 87.5 with the category-derived 86.5.
    expect(mark.percent).toBe(87.5);
    expect(mark.letter).toBe("B");
    expect(mark.categories[0].weight).toBe(90);
    expect(mark.assignments[0]).toMatchObject({
      name: "Reading & analysis",
      earned: 0,
      possible: 20,
      missing: true,
      due: "2026-09-18",
    });
    expect(mark.assignments[1]).toMatchObject({
      earned: null,
      possible: 10,
      missing: false,
    });
    expect(mark.assignments[2]).toMatchObject({
      earned: null,
      excluded: true,
      missing: false,
    });
    expect(mark.assignments[3]).toMatchObject({ earned: 5, possible: 0 });
  });
  it("parses the ProcessWebServiceRequestMultiWeb wrapper used in production", () => {
    // Live proxy replies come back in the MultiWeb envelope, not the legacy one.
    const gb = parseGradebook(multiWebEnvelope(fixture));
    expect(gb.source).toBe("synergy");
    expect(gb.courses.map((c) => c.period)).toEqual([0, 9]);
    expect(gb.courses[1].marks[0].percent).toBe(87.5);
    expect(() =>
      parseGradebook(
        multiWebEnvelope(
          '<RT_ERROR ERROR_MESSAGE="Invalid user id or password (ID: 1)"/>',
        ),
      ),
    ).toThrow("did not accept");
  });
  it("does not turn blank or suppressed grades into zero", () => {
    expect(
      parseGradebook(
        envelope(
          fixture.replace(
            'CalculatedScoreRaw="87.50"',
            'CalculatedScoreRaw=""',
          ),
        ),
      ).courses[1].marks[0].percent,
    ).toBeNull();
    expect(
      parseGradebook(
        envelope(
          fixture.replace(
            'HidePercentSecondary="false"',
            'HidePercentSecondary="true"',
          ),
        ),
      ).courses[1].marks[0].percent,
    ).toBeNull();
  });
  it("recognizes letter-only scores and ignores invalid dates", () => {
    const gb = parseGradebook(
      envelope(fixture.replace('DueDate="9/18/2026"', 'DueDate="13/40/2026"')),
    );
    const a = gb.courses[1].marks[0].assignments[0];
    expect(a.due).toBe("");
    expect(
      hasGradeScore({ ...a, earned: null, score: "A", missing: false }),
    ).toBe(true);
    expect(
      hasGradeScore({
        ...a,
        earned: null,
        score: "Not Graded",
        missing: false,
      }),
    ).toBe(false);
    expect(hasGradeScore({ ...a, earned: null, score: "Missing" })).toBe(false);
  });
  it("handles Synergy's unescaped rich-text fields without changing grades or following assignments", () => {
    const rich = fixture
      .replace(
        'Measure="Reading &amp; analysis"',
        'Measure="Reading "Document A" &amp; analysis"',
      )
      .replace(
        'Notes="Missing"',
        'Notes="Missing" MeasureDescription="Click "Turn In". <b class="example">A & B</b>\nThen finish." HasDropBox="false"',
      );
    const mark = parseGradebook(envelope(rich)).courses[1].marks[0];
    expect(mark.assignments[0]).toMatchObject({
      name: 'Reading "Document A" & analysis',
      earned: 0,
      missing: true,
    });
    expect(mark.assignments).toHaveLength(4);
    expect(mark.assignments[1].name).toBe("Awaiting a score");
    expect(mark.percent).toBe(87.5);
  });
  it("does not repair across record boundaries when a rich-text field has no closing marker", () => {
    const broken = fixture.replace(
      'Measure="Reading &amp; analysis" Type="Assessments"',
      'Measure="Broken " title"',
    );
    expect(() => parseGradebook(envelope(broken))).toThrow(SynergyError);
  });
  it("supports singleton and empty collections and checks the selected period", () => {
    const gb = parseGradebook(
      envelope(
        '<Gradebook Type="Traditional"><ReportingPeriod GradePeriod="Q2"/><ReportingPeriods><ReportPeriod Index="1" GradePeriod="Q2"/></ReportingPeriods><Courses/></Gradebook>',
      ),
      1,
    );
    expect(gb.courses).toEqual([]);
    expect(gb.periods).toHaveLength(1);
    expect(() => parseGradebook(envelope(fixture), 1)).toThrow(
      "different grading period",
    );
  });
  it("returns safe messages for login errors without reflecting upstream contents", () => {
    expect(() =>
      parseGradebook(
        envelope(
          '<RT_ERROR ERROR_MESSAGE="Invalid user id or password: secret"/>',
        ),
      ),
    ).toThrow("did not accept");
    expect(() =>
      parseGradebook(
        envelope('<RT_ERROR ERROR_MESSAGE="private information"/>'),
      ),
    ).toThrow("account notice");
  });
  it("recognizes the MCPS API retirement without blaming the user's credentials", () => {
    try {
      parseGradebook(
        envelope(
          '<RT_ERROR ERROR_MESSAGE="We have upgraded our server for better performance. You must update app to the new version to continue. Error Code: UPD5304-00 private-data"/>',
        ),
      );
      expect.fail("An unsupported API must not return a gradebook");
    } catch (error) {
      expect(error).toBeInstanceOf(SynergyError);
      expect(error).toMatchObject({ statusCode: 503 });
      expect((error as Error).message).toContain("UPD5304");
      expect((error as Error).message).not.toContain("private-data");
    }
  });
  it("rejects malformed XML, DTDs, unexpected bodies and unavailable gradebooks", () => {
    expect(() => parseGradebook("not xml")).toThrow(SynergyError);
    expect(() =>
      parseGradebook(
        envelope('<!DOCTYPE test [<!ENTITY private "secret">]><Gradebook/>'),
      ),
    ).toThrow(SynergyError);
    expect(() =>
      parseGradebook(envelope('<Gradebook ErrorMessage="Unavailable"/>')),
    ).toThrow("not made");
    expect(() =>
      parseGradebook(envelope('<Gradebook Type="Standards"/>')),
    ).toThrow("does not support");
  });
  it("relays escaped credentials only through the proxy to the fixed MCPS endpoint, with no redirects", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ status: true, response: envelope(fixture) }),
        ),
      );
    const client = new SynergyClient("123<456", 'pw&"<>', fetcher);
    await client.gradebook(0);
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe("https://cloudproxy.gradedurian.workers.dev/fulfillAxios");
    expect(options?.redirect).toBe("error");
    const payload = JSON.parse(String(options?.body));
    expect(payload.url).toBe(
      "https://md-mcps-psv.edupoint.com/Service/PXPCommunication.asmx",
    );
    expect(payload.encrypted).toBe(false);
    expect(payload.xml).toContain("123&lt;456");
    expect(payload.xml).toContain("pw&amp;&quot;&lt;&gt;");
    expect(payload.xml).toContain("&lt;ReportPeriod&gt;0&lt;/ReportPeriod&gt;");
    client.dispose();
    await expect(client.gradebook()).rejects.toThrow("Reconnect");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("does not leak network errors or credentials", async () => {
    const client = new SynergyClient(
      "test",
      "secret",
      vi.fn<typeof fetch>().mockRejectedValue(new Error("secret")),
    );
    await expect(client.gradebook()).rejects.toThrow(
      "Could not reach StudentVUE",
    );
  });
  it("reports a proxy transport failure without leaking its message", async () => {
    const client = new SynergyClient(
      "student",
      "secret",
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ status: false, message: "proxy internal secret" }),
          ),
        ),
    );
    await expect(client.gradebook()).rejects.toThrow(
      "could not open your gradebook",
    );
    await expect(client.gradebook()).rejects.not.toThrow("proxy internal");
  });
  it("treats a non-JSON proxy body as an unreadable response", async () => {
    const client = new SynergyClient(
      "student",
      "secret",
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response("<html>502 Bad Gateway</html>")),
    );
    await expect(client.gradebook()).rejects.toThrow("unreadable response");
  });
});

describe("what-if estimates", () => {
  const categories = [
    {
      name: "Tests",
      weight: 90,
      earned: 80,
      possible: 100,
      reportedGrade: "B",
    },
    {
      name: "Practice",
      weight: 10,
      earned: 100,
      possible: 100,
      reportedGrade: "A",
    },
  ];
  it("uses weighted category totals and adds a new assignment without modifying official totals", () => {
    expect(estimateGrade(categories)).toBe(82);
    expect(
      estimateGrade(categories, {
        category: "Tests",
        earned: 20,
        possible: 20,
      }),
    ).toBe(85);
    expect(categories[0].earned).toBe(80);
  });
  it("renormalizes only populated categories and refuses unknown data or invalid input", () => {
    expect(
      estimateGrade([
        { ...categories[0] },
        { ...categories[1], earned: null, possible: 0 },
      ]),
    ).toBe(80);
    expect(estimateGrade([{ ...categories[0], weight: null }])).toBeNull();
    expect(estimateGrade([{ ...categories[0], earned: null }])).toBeNull();
    expect(
      estimateGrade(categories, {
        category: "No such category",
        earned: 10,
        possible: 10,
      }),
    ).toBeNull();
    expect(
      estimateGrade(categories, {
        category: "Tests",
        earned: -1,
        possible: 10,
      }),
    ).toBeNull();
    expect(
      estimateGrade(categories, { category: "Tests", earned: 5, possible: 0 }),
    ).toBeNull();
  });
  it("adds several hypothetical assignments, including two in one category", () => {
    // Tests 90/110 = 81.8182, Practice 110/110 = 100 -> .9/.1 split = 83.6364
    expect(
      estimateGrade(categories, [
        { category: "Tests", earned: 10, possible: 10 },
        { category: "Practice", earned: 10, possible: 10 },
      ]),
    ).toBeCloseTo(83.6364, 3);
    // Two entries in one category accumulate: 120/140 = 85.7143 -> 87.1429
    expect(
      estimateGrade(categories, [
        { category: "Tests", earned: 20, possible: 20 },
        { category: "Tests", earned: 20, possible: 20 },
      ]),
    ).toBeCloseTo(87.1429, 3);
    // Splitting one entry in two must equal the combined entry.
    expect(
      estimateGrade(categories, [
        { category: "Tests", earned: 20, possible: 20 },
        { category: "Tests", earned: 20, possible: 20 },
      ]),
    ).toBe(
      estimateGrade(categories, {
        category: "Tests",
        earned: 40,
        possible: 40,
      }),
    );
    // An empty list must match the untouched baseline.
    expect(estimateGrade(categories, [])).toBe(estimateGrade(categories));
    // One invalid entry rejects the whole projection.
    expect(
      estimateGrade(categories, [
        { category: "Tests", earned: 10, possible: 10 },
        { category: "No such category", earned: 1, possible: 1 },
      ]),
    ).toBeNull();
  });
});

describe("class countdown", () => {
  const meetings = [
    {
      name: "Homeroom",
      period: 0,
      room: "332",
      teacher: "",
      start: 480,
      end: 495,
    },
    {
      name: "AP US History A",
      period: 9,
      room: "242",
      teacher: "",
      start: 500,
      end: 550,
    },
    {
      name: "AP US History A",
      period: 9,
      room: "242",
      teacher: "",
      start: 550,
      end: 600,
    },
  ];
  it("finds the class in session and extends across back-to-back blocks", () => {
    expect(activeMeeting(meetings, 485)).toMatchObject({
      name: "Homeroom",
      end: 495,
    });
    // Both AP US History blocks are one class, so it ends at 600, not 550.
    expect(activeMeeting(meetings, 520)).toMatchObject({
      name: "AP US History A",
      period: 9,
      end: 600,
    });
    expect(activeMeeting(meetings, 497)).toBeNull();
    expect(activeMeeting([], 500)).toBeNull();
  });
  it("formats clock labels around noon and midnight", () => {
    expect(clockLabel(0)).toBe("12:00 AM");
    expect(clockLabel(720)).toBe("12:00 PM");
    expect(clockLabel(555)).toBe("9:15 AM");
    expect(clockLabel(785)).toBe("1:05 PM");
  });
});

describe("today's bell schedule", () => {
  const scheduleXml = (classes: string) =>
    multiWebEnvelope(
      `<StudentClassSchedule TermIndexName="Term 1"><TodayScheduleInfoData><SchoolInfos><SchoolInfo SchoolName="Blair"><Classes>${classes}</Classes></SchoolInfo></SchoolInfos></TodayScheduleInfoData></StudentClassSchedule>`,
    );
  it("parses today's classes into minutes and sorts them", () => {
    const schedule = parseTodaySchedule(
      scheduleXml(
        '<ClassInfo ClassName="AP US History A" Period="9" RoomName="242" TeacherName="Sample Teacher" StartTime="10:20 AM" EndTime="11:10 AM"/><ClassInfo ClassName="Homeroom" Period="0" RoomName="332" TeacherName="" StartTime="8:00 AM" EndTime="8:15 AM"/>',
      ),
    );
    expect(schedule.meetings).toHaveLength(2);
    expect(schedule.meetings[0]).toMatchObject({
      name: "Homeroom",
      period: 0,
      start: 480,
      end: 495,
    });
    expect(schedule.meetings[1]).toMatchObject({
      name: "AP US History A",
      period: 9,
      room: "242",
      start: 620,
      end: 670,
    });
  });
  it("drops unparseable or reversed times and tolerates an empty day", () => {
    expect(
      parseTodaySchedule(
        scheduleXml(
          '<ClassInfo ClassName="Broken" StartTime="" EndTime="9:00 AM"/><ClassInfo ClassName="Backwards" StartTime="11:00 AM" EndTime="10:00 AM"/><ClassInfo ClassName="Bad hour" StartTime="19:00 PM" EndTime="20:00 PM"/>',
        ),
      ).meetings,
    ).toEqual([]);
    expect(
      parseTodaySchedule(
        multiWebEnvelope(
          "<StudentClassSchedule><TodayScheduleInfoData><SchoolInfos/></TodayScheduleInfoData></StudentClassSchedule>",
        ),
      ).meetings,
    ).toEqual([]);
  });
  it("reports StudentVUE schedule errors safely", () => {
    expect(() =>
      parseTodaySchedule(
        multiWebEnvelope('<RT_ERROR ERROR_MESSAGE="private detail"/>'),
      ),
    ).toThrow("could not open your schedule");
    expect(() => parseTodaySchedule("not xml")).toThrow(SynergyError);
  });
});

const origin = "https://bettercanvas.example";
const config = {
  origin,
  canvasOrigin: "https://mcpsmd.instructure.com",
  production: true,
  password: "testonly",
};
const liveSnapshot = () => ({ ...demoGradebook(), demo: false });
const fakeClient = () => ({
  gradebook: vi.fn().mockResolvedValue(liveSnapshot()),
  schedule: vi.fn().mockResolvedValue({
    fetchedAt: "2026-09-20T12:00:00Z",
    meetings: [],
  }),
  dispose: vi.fn(),
});
async function login(app: Awaited<ReturnType<typeof buildApp>>) {
  const result = await app.inject({
    method: "POST",
    url: "/api/login",
    headers: { origin },
    payload: { password: config.password },
  });
  return { origin, cookie: String(result.headers["set-cookie"]).split(";")[0] };
}
describe("private StudentVUE connection", () => {
  it("returns useful safe connection errors instead of Fastify's generic Bad Gateway", async () => {
    const client = fakeClient();
    const message = "StudentVUE could not be reached. Please try again later.";
    client.gradebook.mockRejectedValueOnce(new SynergyError(message));
    client.gradebook.mockRejectedValueOnce(
      new Error("private-password upstream body"),
    );
    const app = await buildApp(config, undefined, () => client);
    try {
      const headers = await login(app);
      const request = {
        method: "POST" as const,
        url: "/api/gradebook/connect",
        headers,
        payload: { username: "student", password: "private-password" },
      };
      const known = await app.inject(request);
      expect(known.statusCode).toBe(502);
      expect(known.json()).toEqual({ error: message });
      const unexpected = await app.inject(request);
      expect(unexpected.statusCode).toBe(500);
      expect(unexpected.json()).toEqual({
        error: "The request could not be completed. Please try again.",
      });
      expect(unexpected.body).not.toContain("private-password");
      expect(client.dispose).toHaveBeenCalledTimes(2);
    } finally {
      await app.close();
    }
  });
  it("requires app authentication, origin checks and valid credentials before calling Synergy", async () => {
    const client = fakeClient(),
      factory = vi.fn(() => client),
      app = await buildApp(config, undefined, factory);
    try {
      expect((await app.inject("/api/gradebook")).statusCode).toBe(401);
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/api/gradebook/connect",
            headers: { origin },
            payload: { username: "student", password: "secret" },
          })
        ).statusCode,
      ).toBe(401);
      const headers = await login(app);
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/api/gradebook/connect",
            headers: { ...headers, origin: "https://wrong.example" },
            payload: { username: "student", password: "secret" },
          })
        ).statusCode,
      ).toBe(403);
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/api/gradebook/connect",
            headers,
            payload: { username: "student", password: "" },
          })
        ).statusCode,
      ).toBe(400);
      expect(factory).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
  it("isolates connections per session, never returns credentials, caches a recent refresh and clears on sign-out", async () => {
    const client = fakeClient(),
      app = await buildApp(config, undefined, () => client);
    try {
      const headers = await login(app),
        second = await login(app);
      const result = await app.inject({
        method: "POST",
        url: "/api/gradebook/connect",
        headers,
        payload: { username: "private-student", password: "private-password" },
      });
      expect(result.statusCode).toBe(200);
      expect(result.headers["cache-control"]).toContain("no-store");
      expect(result.body).not.toContain("private-student");
      expect(result.body).not.toContain("private-password");
      expect(result.json().connected).toBe(true);
      expect(
        (await app.inject({ url: "/api/gradebook", headers: second })).json()
          .snapshot,
      ).toBeNull();
      await app.inject({
        method: "POST",
        url: "/api/gradebook/refresh",
        headers,
        payload: { period: 0 },
      });
      expect(client.gradebook).toHaveBeenCalledTimes(1);
      await app.inject({ method: "POST", url: "/api/logout", headers });
      expect(client.dispose).toHaveBeenCalledOnce();
      expect(
        (await app.inject({ url: "/api/gradebook", headers })).statusCode,
      ).toBe(401);
    } finally {
      await app.close();
    }
  });
  it("disables connecting in an unprotected public demo", async () => {
    const factory = vi.fn(() => fakeClient()),
      app = await buildApp(
        { ...config, password: undefined },
        undefined,
        factory,
      );
    try {
      expect((await app.inject("/api/gradebook")).json()).toMatchObject({
        connected: false,
        canConnect: false,
        snapshot: null,
      });
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/api/gradebook/connect",
            headers: { origin },
            payload: { username: "student", password: "secret" },
          })
        ).statusCode,
      ).toBe(403);
      expect(factory).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
  it("preserves the last successful grades on an upstream failure and clears on disconnect", async () => {
    const client = fakeClient();
    client.gradebook
      .mockResolvedValueOnce({
        ...liveSnapshot(),
        fetchedAt: "2020-01-01T00:00:00Z",
      })
      .mockRejectedValue(new SynergyError("StudentVUE is unavailable."));
    const app = await buildApp(config, undefined, () => client);
    try {
      const headers = await login(app);
      await app.inject({
        method: "POST",
        url: "/api/gradebook/connect",
        headers,
        payload: { username: "student", password: "secret" },
      });
      const refresh = await app.inject({
        method: "POST",
        url: "/api/gradebook/refresh",
        headers,
        payload: { period: 1 },
      });
      expect(refresh.statusCode).toBe(502);
      expect(refresh.json()).toEqual({ error: "StudentVUE is unavailable." });
      expect(
        (await app.inject({ url: "/api/gradebook", headers })).json().snapshot
          .period.index,
      ).toBe(0);
      await app.inject({
        method: "POST",
        url: "/api/gradebook/disconnect",
        headers,
      });
      expect(client.dispose).toHaveBeenCalledOnce();
      expect(
        (await app.inject({ url: "/api/gradebook", headers })).json().snapshot,
      ).toBeNull();
    } finally {
      await app.close();
    }
  });
  it("expires StudentVUE credentials and data after one hour", async () => {
    const client = fakeClient(),
      app = await buildApp(config, undefined, () => client);
    try {
      const headers = await login(app);
      await app.inject({
        method: "POST",
        url: "/api/gradebook/connect",
        headers,
        payload: { username: "student", password: "secret" },
      });
      const later = Date.now() + 60 * 60 * 1000 + 1;
      const clock = vi.spyOn(Date, "now").mockReturnValue(later);
      try {
        expect(
          (await app.inject({ url: "/api/gradebook", headers })).json()
            .connected,
        ).toBe(false);
        expect(client.dispose).toHaveBeenCalledOnce();
      } finally {
        clock.mockRestore();
      }
    } finally {
      await app.close();
    }
  });
  it("does not restore data when a pending connect finishes after disconnect", async () => {
    let finish!: (value: ReturnType<typeof liveSnapshot>) => void;
    let started!: () => void;
    const starting = new Promise<void>((resolve) => {
      started = resolve;
    });
    const client = {
      gradebook: () => {
        started();
        return new Promise<ReturnType<typeof liveSnapshot>>((resolve) => {
          finish = resolve;
        });
      },
      schedule: vi
        .fn()
        .mockResolvedValue({ fetchedAt: "2026-09-20T12:00:00Z", meetings: [] }),
      dispose: vi.fn(),
    };
    const app = await buildApp(config, undefined, () => client);
    try {
      const headers = await login(app);
      const pending = app
        .inject({
          method: "POST",
          url: "/api/gradebook/connect",
          headers,
          payload: { username: "student", password: "secret" },
        })
        .then((r) => r);
      await starting;
      await app.inject({
        method: "POST",
        url: "/api/gradebook/disconnect",
        headers,
      });
      finish(liveSnapshot());
      expect((await pending).statusCode).toBe(409);
      expect(
        (await app.inject({ url: "/api/gradebook", headers })).json().snapshot,
      ).toBeNull();
    } finally {
      await app.close();
    }
  });
});
