import { describe, expect, it, vi } from "vitest";
import {
  StudentVueWebClient,
  embeddedJson,
  normalizeSessionCookie,
  parseWebDetails,
  parseWebOverview,
} from "../apps/server/src/studentvue-web";
import { buildApp } from "../apps/server/src/app";
import { SynergyError } from "../apps/server/src/synergy";

// Fictional portal fragments matching the PXP2 HTML/JSON contract.
const focus = {
  schoolID: 12,
  OrgYearGU: "year-test",
  studentGU: "student-test",
  classID: 101,
  gradePeriodGU: "term-1",
  AGU: "0",
};
const mainPage = `<script>PXP.AGU = '0'; PXP.GBCurrentFocus = ${JSON.stringify({ FocusArgs: focus })};</script>`;
function overview(term = 1) {
  return `<div data-school-id="12" data-orgyear-id="year-test">
  <div class="current breadcrumb-term">MP${term}</div>
  <a data-period-id="term-1" data-action="GB.SetTerm" data-period-group="Terms">MP1</a>
  <a data-period-group="Terms" data-period-id="term-2" data-action="GB.SetTerm">MP2</a>
  ${[false, true]
    .map(
      (
        print,
      ) => `<div class="gb-class-row ${print ? "hide-for-screen" : "hide-for-print"}" data-focus='${JSON.stringify({ LoadParams: { ControlName: "Gradebook_ClassDetails" }, FocusArgs: { ...focus, gradePeriodGU: `term-${term}` } })}'>
    <div class="class-title">Example &amp; Design</div><div class="period">2</div><div class="room">123</div><div class="teacher">Pat Example</div>
  </div>`,
    )
    .join("")}</div>`;
}
const rows = [
  {
    gradeBookId: "a1",
    GBAssignment: JSON.stringify({
      value: "Lesson [1] &amp; project",
      dataType: "LinkColumn",
    }),
    GBScore: JSON.stringify({ value: "3 out of 4.0000" }),
    GBPoints: "",
    GBAssignmentType: "Practice",
    Date: "9/12/26",
  },
  {
    gradeBookId: "a2",
    GBAssignment: "Not yet scored",
    GBScore: "Not Graded",
    GBPoints: "20.0000 Points Possible",
    DueDate: "9/30/26",
  },
  {
    gradeBookId: "a3",
    GBAssignment: "Overdue",
    GBScore: "Missing",
    GBPoints: "10.0000 Points Possible",
  },
  {
    gradeBookId: "a4",
    GBAssignment: "Exempt",
    GBScore: "Excused",
    GBNotes: "Was missing",
  },
];
function details(assignmentRows = rows) {
  return `<div class="gb-current-grade"><div class="mark">93.83%</div><div class="score">93.83%</div></div>
  <script>$('#AssignmentsGrid').dxDataGrid({"dataSource":${JSON.stringify(assignmentRows)},"onInitialized":someFunction});</script>`;
}
const controlReply = (html: string) =>
  new Response(JSON.stringify({ d: { Data: { html } } }), {
    headers: { "Content-Type": "application/json" },
  });
function transport() {
  return vi.fn<typeof fetch>().mockImplementation(async (url, init) => {
    if (String(url).includes("PXP2_Gradebook.aspx"))
      return new Response(mainPage);
    const request = JSON.parse(String(init?.body)).request;
    if (request.control === "Gradebook_SchoolClasses")
      return controlReply(
        overview(request.parameters.gradePeriodGU === "term-2" ? 2 : 1),
      );
    return controlReply(details());
  });
}

describe("StudentVUE website parsing", () => {
  it("deduplicates screen and print rows without dropping course metadata", () => {
    const parsed = parseWebOverview(overview());
    expect(parsed.current).toBe("MP1");
    expect(parsed.periods.map((p) => p.name)).toEqual(["MP1", "MP2"]);
    expect(parsed.courses).toHaveLength(1);
    expect(parsed.courses[0]).toMatchObject({
      name: "Example & Design",
      teacher: "Pat Example",
      period: 2,
      room: "123",
    });
  });
  it("reads reported percentages and link cells without inventing weights, scores or dates", () => {
    const mark = parseWebDetails(details(), "MP1");
    expect(mark.percent).toBe(93.83);
    expect(mark.categories).toEqual([]);
    expect(mark.assignments[0]).toMatchObject({
      name: "Lesson [1] & project",
      earned: 3,
      possible: 4,
      due: "",
      assigned: "",
    });
    expect(mark.assignments[1]).toMatchObject({
      earned: null,
      possible: 20,
      due: "2026-09-30",
      missing: false,
    });
    expect(mark.assignments[2]).toMatchObject({ earned: null, missing: true });
    expect(mark.assignments[3]).toMatchObject({
      excluded: true,
      missing: false,
    });
    expect(parseWebDetails(details([]), "MP1").assignments).toEqual([]);
  });
  it("fails explicitly on changed page formats, executable data, or absent assignment data", () => {
    expect(() => parseWebOverview("<h1>Loading</h1>")).toThrow(/format/);
    expect(() =>
      parseWebDetails(
        details().replace('"dataSource":', '"anotherGrid":'),
        "MP1",
      ),
    ).toThrow(/format/);
    expect(() => embeddedJson('value = {"x":runCode()};', /value\s*=/)).toThrow(
      /format/,
    );
    expect(
      embeddedJson(
        'value = {"x":"a } [ b","child":{"n":1}}; runCode();',
        /value\s*=/,
      ),
    ).toEqual({ x: "a } [ b", child: { n: 1 } });
  });
  it("rejects newline/header injection and accepts a copied Cookie header", () => {
    expect(
      normalizeSessionCookie("Cookie: ASP.NET_SessionId=fake; .ASPXAUTH=test"),
    ).toBe("ASP.NET_SessionId=fake; .ASPXAUTH=test");
    for (const cookie of [
      "",
      "x=test\r\nX-Forwarded-Host: evil",
      "not-a-cookie",
      `x=${"a".repeat(6000)}`,
    ])
      expect(() => normalizeSessionCookie(cookie)).toThrow(SynergyError);
  });
});

describe("StudentVUE browser-session client", () => {
  it("uses the fixed website endpoint, forwards its private cookie, and returns only normalized grades", async () => {
    const fetcher = transport();
    const client = new StudentVueWebClient(
      "ASP.NET_SessionId=synthetic-secret",
      fetcher,
    );
    const snapshot = await client.gradebook();
    expect(snapshot.period).toMatchObject({ index: 0, name: "MP1" });
    expect(snapshot.courses).toHaveLength(1);
    expect(snapshot.courses[0].marks[0].percent).toBe(93.83);
    expect(JSON.stringify(snapshot)).not.toContain("synthetic-secret");
    expect(fetcher).toHaveBeenCalledTimes(3);
    for (const [url, init] of fetcher.mock.calls) {
      expect(new URL(String(url)).origin).toBe(
        "https://md-mcps-psv.edupoint.com",
      );
      expect(new Headers(init?.headers).get("cookie")).toBe(
        "ASP.NET_SessionId=synthetic-secret",
      );
      expect(init?.redirect).toBe("manual");
    }
    expect(await client.schedule()).toMatchObject({ meetings: [] });
    client.dispose();
    await expect(client.gradebook()).rejects.toThrow(/session/);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it("switches grading periods using the website's actual SetTerm arguments", async () => {
    const fetcher = transport(),
      client = new StudentVueWebClient("session=fake", fetcher);
    const snapshot = await client.gradebook(1);
    expect(snapshot.period).toMatchObject({ index: 1, name: "MP2" });
    expect(
      JSON.parse(String(fetcher.mock.calls[2][1]?.body)).request.parameters,
    ).toMatchObject({
      gradePeriodGU: "term-2",
      GradingPeriodGroup: "Terms",
      schoolID: "12",
      OrgYearGU: "year-test",
    });
    expect(
      JSON.parse(String(fetcher.mock.calls[3][1]?.body)).request.parameters
        .gradePeriodGU,
    ).toBe("term-2");
    await expect(client.gradebook(45)).rejects.toThrow(/not available/);
  });
  it("retains rotated same-district cookies and rejects cookies scoped to another site", async () => {
    const fetcher = transport();
    fetcher.mockImplementationOnce(async () => {
      const headers = new Headers();
      headers.append("Set-Cookie", "session=rotated; Path=/; Secure; HttpOnly");
      headers.append("Set-Cookie", "third=private; Domain=example.org; Path=/");
      return new Response(mainPage, { headers });
    });
    await new StudentVueWebClient("session=old", fetcher).gradebook();
    const cookies = new Headers(fetcher.mock.calls[1][1]?.headers).get(
      "cookie",
    );
    expect(cookies).toBe("session=rotated");
  });
  it.each([302, 401, 403])(
    "treats HTTP %s as an expired session and never follows redirects",
    async (status) => {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          new Response("private response", {
            status,
            headers: { Location: "https://accounts.google.com/" },
          }),
        );
      await expect(
        new StudentVueWebClient("session=fake", fetcher).gradebook(),
      ).rejects.toMatchObject({ statusCode: 422 });
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );
  it("recognizes a Google login page returned as HTTP 200", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("<h1>Login with Google</h1>"));
    await expect(
      new StudentVueWebClient("session=fake", fetcher).gradebook(),
    ).rejects.toMatchObject({ statusCode: 422 });
  });
  it("redacts request failures and does not return raw website errors", async () => {
    const fetcher = transport();
    fetcher.mockRejectedValueOnce(new Error("secret-session-value"));
    await expect(
      new StudentVueWebClient("session=fake", fetcher).gradebook(),
    ).rejects.not.toThrow("secret-session-value");
    fetcher.mockImplementationOnce(async () => new Response(mainPage));
    fetcher.mockImplementationOnce(
      async () =>
        new Response(
          JSON.stringify({
            d: { Error: { Message: "private gradebook contents" } },
          }),
        ),
    );
    await expect(
      new StudentVueWebClient("session=fake", fetcher).gradebook(),
    ).rejects.toThrow("could not open");
  });
});

describe("private browser-session connection route", () => {
  const origin = "https://bettercanvas.example";
  const config = {
    origin,
    canvasOrigin: "https://mcpsmd.instructure.com",
    production: true,
    password: "testonly",
  };
  it("requires app sign-in and origin protection, clears saved API credentials, and disposes on disconnect", async () => {
    const snapshot = await new StudentVueWebClient(
      "session=fake",
      transport(),
    ).gradebook();
    const client = {
      gradebook: vi.fn().mockResolvedValue(snapshot),
      schedule: vi
        .fn()
        .mockResolvedValue({
          fetchedAt: new Date().toISOString(),
          meetings: [],
        }),
      dispose: vi.fn(),
    };
    const factory = vi.fn().mockReturnValue(client);
    const app = await buildApp(config, undefined, undefined, factory);
    const payload = { cookie: "session=synthetic-private" };
    try {
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/api/gradebook/connect-session",
            headers: { origin },
            payload,
          })
        ).statusCode,
      ).toBe(401);
      const login = await app.inject({
        method: "POST",
        url: "/api/login",
        headers: { origin },
        payload: { password: "testonly" },
      });
      const cookie = String(login.headers["set-cookie"]).split(";")[0];
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/api/gradebook/connect-session",
            headers: { cookie, origin: "https://other.example" },
            payload,
          })
        ).statusCode,
      ).toBe(403);
      const response = await app.inject({
        method: "POST",
        url: "/api/gradebook/connect-session",
        headers: { cookie, origin },
        payload,
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        connected: true,
        method: "browser-session",
        remembered: false,
      });
      expect(response.body).not.toContain("synthetic-private");
      expect(String(response.headers["set-cookie"])).toContain(
        "bc_gradebook=;",
      );
      expect(factory).toHaveBeenCalledExactlyOnceWith(
        "session=synthetic-private",
      );
      expect(
        (await app.inject({ url: "/api/gradebook", headers: { cookie } })).body,
      ).not.toContain("synthetic-private");
      await app.inject({
        method: "POST",
        url: "/api/gradebook/disconnect",
        headers: { cookie, origin },
      });
      expect(client.dispose).toHaveBeenCalledOnce();
      expect(
        (
          await app.inject({ url: "/api/gradebook", headers: { cookie } })
        ).json().connected,
      ).toBe(false);
    } finally {
      await app.close();
    }
  });
});
