import { describe, expect, it, vi } from "vitest";
import {
  StudentVueMobileClient,
  parseMobileGradebook,
} from "../apps/server/src/studentvue-mobile";
import { STUDENTVUE_ORIGIN } from "../apps/server/src/synergy";

// Fictional, minimal fixtures following the public modern-mobile contract.
function book() {
  return {
    traditionalGradebook: {
      type: "Traditional",
      errorMessage: null,
      reportingPeriods: [
        {
          index: 0,
          gradePeriod: "MP1",
          startDate: "9/2/2026",
          endDate: "11/6/2026",
        },
        {
          index: 1,
          gradePeriod: "MP2",
          startDate: "11/9/2026",
          endDate: "1/28/2027",
        },
      ],
      courses: [
        {
          title: "Example Science",
          period: 2,
          room: "B204",
          staff: "Pat Example",
          marks: [
            {
              markName: "MP1",
              calculatedScoreString: "93.83%",
              calculatedScoreRaw: "93.83",
              assignments: [
                {
                  gradebookID: 1,
                  measure: "Lab",
                  type: "Assessment",
                  date: "9/3/2026",
                  dueDate: "9/4/2026",
                  score: "3.5",
                  displayScore: "3.5 out of 4",
                  points: "",
                  pointPossible: null,
                  notes: "",
                },
                {
                  gradebookID: 2,
                  measure: "Homework",
                  type: "Practice",
                  dueDate: "9/11/2026",
                  score: null,
                  displayScore: "Not Graded",
                  points: "10 Points Possible",
                  pointPossible: null,
                  notes: "Missing ",
                },
              ],
            },
          ],
        },
      ],
    },
  };
}
const jsonReply = (body: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
const loginReply = (token = "fixture-token") =>
  jsonReply({ access_token: token });
const gradebookReply = () => jsonReply({ error: null, data: book() });
function transport() {
  return vi
    .fn<typeof fetch>()
    .mockImplementation(async (url) =>
      String(url).endsWith("/AttemptLogin") ? loginReply() : gradebookReply(),
    );
}

describe("modern StudentVUE gradebook parser", () => {
  it("keeps a percentage score distinct from earned points", () => {
    const data = book();
    const rows = data.traditionalGradebook.courses[0].marks[0].assignments;
    Object.assign(rows[0], {
      score: "50%",
      points: "",
      displayScore: "",
      pointPossible: 10,
    });
    Object.assign(rows[1], {
      score: "50%",
      points: "5 / 10",
      displayScore: "",
      pointPossible: 10,
    });
    const assignments =
      parseMobileGradebook(data).courses[0].marks[0].assignments;
    expect(assignments[0]).toMatchObject({
      score: "50%",
      earned: null,
      possible: 10,
    });
    expect(assignments[1]).toMatchObject({
      score: "50%",
      earned: 5,
      possible: 10,
    });
  });
  it("retains reported percentages, metadata, period dates and raw assignment scores", () => {
    const result = parseMobileGradebook(book());
    expect(result).toMatchObject({
      source: "synergy",
      demo: false,
      period: {
        index: 0,
        name: "MP1",
        start: "2026-09-02",
        end: "2026-11-06",
      },
    });
    expect(result.periods).toHaveLength(2);
    expect(result.courses[0]).toMatchObject({
      name: "Example Science",
      teacher: "Pat Example",
      room: "B204",
      period: 2,
    });
    const mark = result.courses[0].marks[0];
    expect(mark).toMatchObject({
      letter: "93.83%",
      percent: 93.83,
      categories: [],
    });
    expect(mark.assignments[0]).toMatchObject({
      id: "1",
      score: "3.5",
      earned: 3.5,
      possible: 4,
      due: "2026-09-04",
      missing: false,
    });
    expect(mark.assignments[1]).toMatchObject({
      id: "2",
      score: "",
      earned: null,
      possible: 10,
      missing: true,
    });
  });

  it("keeps zero scores and unknown totals distinct, and excludes excused missing work", () => {
    const data = book();
    const rows = data.traditionalGradebook.courses[0].marks[0].assignments;
    Object.assign(rows[0], { score: "0", pointPossible: 0, displayScore: "" });
    Object.assign(rows[1], {
      score: "Excused",
      notes: "Missing",
      points: "",
      dueDate: "2/30/2026",
    });
    const assignments =
      parseMobileGradebook(data).courses[0].marks[0].assignments;
    expect(assignments[0]).toMatchObject({ earned: 0, possible: 0 });
    expect(assignments[1]).toMatchObject({
      earned: null,
      possible: null,
      excluded: true,
      missing: false,
      due: "",
    });
  });

  it("reads explicit slash totals and rubric ceilings without inferring unknown scores", () => {
    const data = book();
    const rows = data.traditionalGradebook.courses[0].marks[0].assignments;
    Object.assign(rows[0], {
      score: null,
      points: "8 / 10",
      displayScore: "",
      pointPossible: null,
    });
    Object.assign(rows[1], {
      score: null,
      points: "",
      scoreType: "Rubric 0 - 4",
    });
    const assignments =
      parseMobileGradebook(data).courses[0].marks[0].assignments;
    expect(assignments[0]).toMatchObject({ earned: 8, possible: 10 });
    expect(assignments[1]).toMatchObject({ earned: null, possible: 4 });
  });

  it("uses a reported denominator when the feed also supplies an unset zero total", () => {
    const data = book();
    Object.assign(
      data.traditionalGradebook.courses[0].marks[0].assignments[0],
      { pointPossible: 0 },
    );
    expect(
      parseMobileGradebook(data).courses[0].marks[0].assignments[0].possible,
    ).toBe(4);
  });

  it("preserves only explicit category summaries and respects hidden percentages", () => {
    const data = book();
    Object.assign(data.traditionalGradebook, { hidePercentSecondary: true });
    Object.assign(data.traditionalGradebook.courses[0].marks[0], {
      gradeCalculationSummary: {
        assignmentGradeCalc: [
          {
            type: "Assessment",
            weight: "75%",
            points: "0",
            pointsPossible: "20",
            calculatedMark: "A",
          },
          {
            type: "Practice",
            weight: null,
            points: null,
            pointsPossible: null,
          },
        ],
      },
    });
    const mark = parseMobileGradebook(data).courses[0].marks[0];
    expect(mark.percent).toBeNull();
    expect(mark.categories).toEqual([
      {
        name: "Assessment",
        weight: 75,
        earned: 0,
        possible: 20,
        reportedGrade: "A",
      },
      {
        name: "Practice",
        weight: null,
        earned: null,
        possible: null,
        reportedGrade: "",
      },
    ]);
  });

  it("uses the requested period and rejects missing or conflicting period metadata", () => {
    expect(parseMobileGradebook(book(), 1).period.name).toBe("MP2");
    expect(() => parseMobileGradebook(book(), 2)).toThrow(
      "different grading period",
    );
    const data = book();
    Object.assign(data.traditionalGradebook, {
      reportingPeriod: { index: 1, gradePeriod: "MP2" },
    });
    expect(() => parseMobileGradebook(data, 0)).toThrow(
      "different grading period",
    );
  });

  it("rejects malformed, unsupported and excessively large records", () => {
    expect(() => parseMobileGradebook({})).toThrow(
      "not made this gradebook available",
    );
    const data = book();
    data.traditionalGradebook.type = "Standards";
    expect(() => parseMobileGradebook(data)).toThrow("grading format");
    data.traditionalGradebook.type = "Traditional";
    Object.assign(data.traditionalGradebook, { courses: [null] });
    expect(() => parseMobileGradebook(data)).toThrow("unreadable");
    Object.assign(data.traditionalGradebook, {
      courses: Array.from({ length: 201 }, () => ({})),
    });
    expect(() => parseMobileGradebook(data)).toThrow("unreadable");
  });
});

describe("modern MCPS StudentVUE client", () => {
  it("does not treat an authentication service outage as a rejected password", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      jsonReply({
        error: {
          code: "999",
          message:
            "The password authentication service is temporarily unavailable.",
        },
      }),
    );
    const client = new StudentVueMobileClient(
      "fixture-id",
      "fixture-password",
      request,
    );
    await expect(client.gradebook()).rejects.toMatchObject({ statusCode: 502 });
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("uses Basic only for student login, then Bearer only with fixed MCPS requests", async () => {
    const request = transport();
    const client = new StudentVueMobileClient(
      "fixture-id",
      "fixture-password",
      request,
    );
    await client.gradebook();
    await client.gradebook(1);
    expect(request).toHaveBeenCalledTimes(3);
    const [loginUrl, login] = request.mock.calls[0];
    expect(loginUrl).toBe(
      `${STUDENTVUE_ORIGIN}/api/v1/mobile/PXPWebServices/AttemptLogin`,
    );
    expect(new Headers(login?.headers).get("Authorization")).toBe(
      `Basic ${Buffer.from("fixture-id:fixture-password").toString("base64")}`,
    );
    expect(
      JSON.parse(JSON.parse(String(login?.body)).arguments.request),
    ).toEqual({ userID: null, password: null, userType: "student" });
    for (const [url, init] of request.mock.calls) {
      expect(new URL(String(url)).origin).toBe(STUDENTVUE_ORIGIN);
      expect(init?.redirect).toBe("manual");
      expect(String(init?.body)).not.toContain("fixture-password");
      expect(init?.signal).toBeInstanceOf(AbortSignal);
    }
    const [, data] = request.mock.calls[2];
    expect(new Headers(data?.headers).get("Authorization")).toBe(
      "Bearer fixture-token",
    );
    expect(
      JSON.parse(JSON.parse(String(data?.body)).arguments.request),
    ).toEqual({ reportPeriod: 1, childIntID: 0, languageCode: "en" });
  });

  it("does not invent a schedule or send unsupported schedule requests", async () => {
    const request = transport();
    const client = new StudentVueMobileClient(
      "fixture-id",
      "fixture-password",
      request,
    );
    expect((await client.schedule()).meetings).toEqual([]);
    expect(request).not.toHaveBeenCalled();
  });

  it("shares a pending login across concurrent grade requests", async () => {
    const request = transport();
    const client = new StudentVueMobileClient(
      "fixture-id",
      "fixture-password",
      request,
    );
    await Promise.all([client.gradebook(), client.gradebook()]);
    expect(
      request.mock.calls.filter(([url]) =>
        String(url).endsWith("/AttemptLogin"),
      ),
    ).toHaveLength(1);
    expect(request).toHaveBeenCalledTimes(3);
  });

  it("rejects invalid period choices before sending credentials", async () => {
    const request = transport();
    const client = new StudentVueMobileClient(
      "fixture-id",
      "fixture-password",
      request,
    );
    await expect(client.gradebook(-1)).rejects.toMatchObject({
      statusCode: 400,
    });
    await expect(client.gradebook(51)).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(request).not.toHaveBeenCalled();
  });

  it.each([401, "envelope"])(
    "renews an expired bearer once after %s and rejects repeated failure",
    async (failure) => {
      const request = vi
        .fn<typeof fetch>()
        .mockImplementation(async (url) =>
          String(url).endsWith("/AttemptLogin")
            ? loginReply()
            : failure === 401
              ? new Response(null, { status: 401 })
              : jsonReply({ error: { code: "401" }, data: null }),
        );
      const client = new StudentVueMobileClient(
        "fixture-id",
        "fixture-password",
        request,
      );
      await expect(client.gradebook()).rejects.toMatchObject({
        statusCode: 422,
      });
      expect(request).toHaveBeenCalledTimes(4);
      expect(
        request.mock.calls.filter(([url]) =>
          String(url).endsWith("/AttemptLogin"),
        ),
      ).toHaveLength(2);
    },
  );

  it("renews once and completes a gradebook fetch when the replacement token works", async () => {
    let calls = 0;
    const request = vi.fn<typeof fetch>().mockImplementation(async (url) => {
      if (String(url).endsWith("/AttemptLogin"))
        return loginReply(`fixture-token-${calls++}`);
      return calls === 1
        ? new Response(null, { status: 401 })
        : gradebookReply();
    });
    const client = new StudentVueMobileClient(
      "fixture-id",
      "fixture-password",
      request,
    );
    expect((await client.gradebook()).courses).toHaveLength(1);
    expect(request).toHaveBeenCalledTimes(4);
    expect(
      new Headers(request.mock.calls[3][1]?.headers).get("Authorization"),
    ).toBe("Bearer fixture-token-1");
  });

  it.each([401, 403, 404, 405, 410, 302])(
    "sanitizes HTTP %s login failure and never falls back to a parent or relay",
    async (status) => {
      const request = vi.fn<typeof fetch>().mockResolvedValue(
        new Response("fixture-password upstream secret", {
          status,
          headers: { Location: "https://example.test/redirect" },
        }),
      );
      const client = new StudentVueMobileClient(
        "fixture-id",
        "fixture-password",
        request,
      );
      await expect(client.gradebook()).rejects.toMatchObject({
        statusCode: status === 401 ? 422 : 503,
      });
      expect(request).toHaveBeenCalledTimes(1);
      expect(
        JSON.parse(
          JSON.parse(String(request.mock.calls[0][1]?.body)).arguments.request,
        ).userType,
      ).toBe("student");
    },
  );

  it("never reflects credentials, bearer tokens or raw upstream messages in errors", async () => {
    const request = vi.fn<typeof fetch>().mockImplementation(async (url) =>
      String(url).endsWith("/AttemptLogin")
        ? loginReply("fixture-private-token")
        : jsonReply({
            error: {
              code: "999",
              message: "fixture-id fixture-password fixture-private-token",
            },
          }),
    );
    const client = new StudentVueMobileClient(
      "fixture-id",
      "fixture-password",
      request,
    );
    const error = await client.gradebook().catch((e: Error) => e);
    expect(error).toBeInstanceOf(Error);
    expect(String(error)).not.toMatch(
      /fixture-id|fixture-password|fixture-private-token/,
    );
    const throwing = new StudentVueMobileClient(
      "fixture-id",
      "fixture-password",
      async () => {
        throw new Error("fixture-password");
      },
    );
    await expect(throwing.gradebook()).rejects.toThrow(
      "Could not reach StudentVUE",
    );
  });

  it("keeps a blocked API separate from a credential rejection", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      jsonReply({
        error: {
          code: "UPD5304-00",
          message: "Password authentication disabled UPD5304-00",
        },
      }),
    );
    const client = new StudentVueMobileClient(
      "fixture-id",
      "fixture-password",
      request,
    );
    await expect(client.gradebook()).rejects.toMatchObject({ statusCode: 503 });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it.each([
    null,
    [],
    "bad-json",
    { access_token: "" },
    { access_token: "bad\r\ntoken" },
  ])(
    "rejects an invalid login reply without fetching grades: %s",
    async (payload) => {
      const request = vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          payload === "bad-json"
            ? new Response("<html>Sign in</html>")
            : jsonReply(payload),
        );
      const client = new StudentVueMobileClient(
        "fixture-id",
        "fixture-password",
        request,
      );
      await expect(client.gradebook()).rejects.toMatchObject({
        statusCode: 502,
      });
      expect(request).toHaveBeenCalledTimes(1);
    },
  );

  it("bounds streamed responses even when content-length is omitted", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(8 * 1024 * 1024 + 1));
            controller.close();
          },
        }),
      ),
    );
    const client = new StudentVueMobileClient(
      "fixture-id",
      "fixture-password",
      request,
    );
    await expect(client.gradebook()).rejects.toThrow("unreadable");
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("aborts pending login on disconnect and prevents late replies from restoring a connection", async () => {
    let resolve!: (response: Response) => void;
    const request = vi.fn<typeof fetch>().mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const client = new StudentVueMobileClient(
      "fixture-id",
      "fixture-password",
      request,
    );
    const pending = client.gradebook();
    const signal = request.mock.calls[0][1]?.signal;
    client.dispose();
    expect(signal?.aborted).toBe(true);
    resolve(loginReply());
    await expect(pending).rejects.toMatchObject({ statusCode: 409 });
    await expect(client.gradebook()).rejects.toMatchObject({ statusCode: 409 });
    await expect(client.schedule()).rejects.toMatchObject({ statusCode: 409 });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("keeps the cancellation signal active while reading the response body", async () => {
    let started!: () => void;
    const reading = new Promise<void>((resolve) => {
      started = resolve;
    });
    const request = vi
      .fn<typeof fetch>()
      .mockImplementation(async (_url, init) => {
        return new Response(
          new ReadableStream({
            start(controller) {
              init?.signal?.addEventListener(
                "abort",
                () => controller.error(new Error("aborted")),
                { once: true },
              );
              controller.enqueue(new TextEncoder().encode('{"access_token":"'));
              started();
            },
          }),
        );
      });
    const client = new StudentVueMobileClient(
      "fixture-id",
      "fixture-password",
      request,
    );
    const pending = client.gradebook();
    await reading;
    client.dispose();
    await expect(pending).rejects.toMatchObject({ statusCode: 409 });
    expect(request).toHaveBeenCalledTimes(1);
  });
});
