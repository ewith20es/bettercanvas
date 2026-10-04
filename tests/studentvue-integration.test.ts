import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../apps/server/src/app";

const origin = "https://bettercanvas.example";
const config = {
  origin,
  canvasOrigin: "https://mcpsmd.instructure.com",
  production: true,
  password: "testonly",
  studentvueProvider: "mobile" as const,
};
const gradebook = {
  data: {
    traditionalGradebook: {
      type: "Traditional",
      reportingPeriods: [{ index: 0, gradePeriod: "MP1" }],
      courses: [
        {
          title: "Example English",
          period: 1,
          marks: [
            {
              markName: "MP1",
              calculatedScoreString: "A",
              calculatedScoreRaw: 93,
              assignments: [],
            },
          ],
        },
      ],
    },
  },
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

async function signIn(app: Awaited<ReturnType<typeof buildApp>>) {
  const response = await app.inject({
    method: "POST",
    url: "/api/login",
    headers: { origin },
    payload: { password: config.password },
  });
  return {
    origin,
    cookie: String(response.headers["set-cookie"]).split(";")[0],
  };
}

describe("optional direct MCPS StudentVUE connection", () => {
  it("keeps GradeDurian as the app default after merging the mobile client", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      json({ status: false, message: "synthetic upstream unavailable" }),
    );
    const app = await buildApp({ ...config, studentvueProvider: undefined });
    try {
      const headers = await signIn(app);
      const response = await app.inject({
        method: "POST", url: "/api/gradebook/connect", headers,
        payload: { username: "synthetic-student", password: "synthetic-password", remember: false },
      });
      expect(response.statusCode).toBe(502);
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(fetcher.mock.calls[0][0]).toBe("https://cloudproxy.gradedurian.workers.dev/fulfillAxios");
      expect(new Headers(fetcher.mock.calls[0][1]?.headers).has("Authorization")).toBe(false);
    } finally {
      await app.close();
      fetcher.mockRestore();
    }
  });
  it("uses student token login without relay settings and exposes only normalized grades", async () => {
    const fetcher = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (url) =>
        String(url).endsWith("/AttemptLogin")
          ? json({ access_token: "synthetic-private-token" })
          : json(gradebook),
      );
    const app = await buildApp(config);
    try {
      const headers = await signIn(app);
      const response = await app.inject({
        method: "POST",
        url: "/api/gradebook/connect",
        headers,
        payload: {
          username: "synthetic-student",
          password: "synthetic-password",
          remember: true,
        },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        connected: true,
        method: "api",
        remembered: true,
        snapshot: {
          source: "synergy",
          demo: false,
          courses: [{ name: "Example English", marks: [{ percent: 93 }] }],
        },
      });
      expect(fetcher.mock.calls.map(([url]) => String(url))).toEqual([
        "https://md-mcps-psv.edupoint.com/api/v1/mobile/PXPWebServices/AttemptLogin",
        "https://md-mcps-psv.edupoint.com/api/v1/mobile/PXPWebServices/Gradebook",
      ]);
      const request = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
      expect(JSON.parse(request.arguments.request).userType).toBe("student");
      expect(
        new Headers(fetcher.mock.calls[1][1]?.headers).get("Authorization"),
      ).toBe("Bearer synthetic-private-token");
      for (const value of [
        response.body,
        String(response.headers["set-cookie"]),
      ]) {
        expect(value).not.toContain("synthetic-student");
        expect(value).not.toContain("synthetic-password");
        expect(value).not.toContain("synthetic-private-token");
      }
      expect(response.headers["cache-control"]).toContain("no-store");
      await app.inject({ method: "POST", url: "/api/logout", headers });
      expect(
        (await app.inject({ url: "/api/gradebook", headers })).statusCode,
      ).toBe(401);
    } finally {
      await app.close();
      fetcher.mockRestore();
    }
  });

  it("returns a private sign-in error when MCPS rejects credentials", async () => {
    const fetcher = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        json(
          { error: { code: "401", message: "private account details" } },
          401,
        ),
      );
    const app = await buildApp(config);
    try {
      const headers = await signIn(app);
      const response = await app.inject({
        method: "POST",
        url: "/api/gradebook/connect",
        headers,
        payload: {
          username: "synthetic-student",
          password: "synthetic-password",
          remember: true,
        },
      });
      expect(response.statusCode).toBe(422);
      expect(response.body).not.toContain("private account details");
      expect(response.headers["set-cookie"]).toBeUndefined();
      expect(
        (await app.inject({ url: "/api/gradebook", headers })).json(),
      ).toMatchObject({ connected: false, remembered: false, snapshot: null });
      expect(fetcher).toHaveBeenCalledTimes(1);
    } finally {
      await app.close();
      fetcher.mockRestore();
    }
  });
});
