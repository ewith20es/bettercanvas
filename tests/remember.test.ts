import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../apps/server/src/app";
import { rememberKey, seal, unseal } from "../apps/server/src/remember";
import { SynergyError } from "../apps/server/src/synergy";
import { demoGradebook } from "../packages/domain/src/gradebook-demo";

const origin = "https://bettercanvas.example";
const config = {
  origin,
  canvasOrigin: "https://mcpsmd.instructure.com",
  production: true,
  password: "testonly",
};
const fakeClient = () => ({
  gradebook: vi.fn().mockResolvedValue({ ...demoGradebook(), demo: false }),
  schedule: vi
    .fn()
    .mockResolvedValue({ fetchedAt: "2026-09-20T12:00:00Z", meetings: [] }),
  dispose: vi.fn(),
});
type App = Awaited<ReturnType<typeof buildApp>>;
const cookieValue = (header: unknown, name: string) => {
  const list = Array.isArray(header) ? header : [String(header ?? "")];
  const found = list.find((c: string) => c.startsWith(`${name}=`));
  return found ? String(found).split(";")[0] : undefined;
};
const setCookies = (header: unknown) =>
  (Array.isArray(header) ? header : [String(header ?? "")]).join("\n");
async function login(app: App) {
  const result = await app.inject({
    method: "POST",
    url: "/api/login",
    headers: { origin },
    payload: { password: config.password },
  });
  return cookieValue(result.headers["set-cookie"], "bc_session")!;
}
const post = (app: App, url: string, cookie: string, payload?: object) =>
  app.inject({
    method: "POST",
    url,
    headers: { origin, cookie },
    payload: payload ?? {},
  });

describe("sealed StudentVUE sign-in", () => {
  const key = rememberKey(undefined, "testonly")!;
  it("round-trips and rejects tampering, other keys and old cookies", () => {
    const sealed = seal(key, { username: "s1", password: "p1" });
    expect(sealed).not.toContain("s1");
    expect(unseal(key, sealed)).toEqual({ username: "s1", password: "p1" });
    const flipped = sealed.slice(0, -2) + (sealed.endsWith("A") ? "BB" : "AA");
    expect(unseal(key, flipped)).toBeNull();
    expect(unseal(rememberKey(undefined, "different")!, sealed)).toBeNull();
    expect(unseal(key, sealed, Date.now() + 31 * 24 * 3600 * 1000)).toBeNull();
    expect(unseal(key, "garbage")).toBeNull();
    expect(unseal(key, undefined)).toBeNull();
  });
  it("prefers a dedicated secret and needs one to exist", () => {
    const secret = "x".repeat(40);
    expect(rememberKey(secret, "testonly")).not.toEqual(key);
    expect(rememberKey("short", undefined)).toBeNull();
    expect(rememberKey(undefined, undefined)).toBeNull();
  });
});

describe("keep me signed in", () => {
  it("reconnects after the app is reopened, even after a server restart", async () => {
    const client = fakeClient(),
      factory = vi.fn(() => client);
    let app = await buildApp(config, undefined, factory);
    let remembered: string;
    try {
      const session = await login(app);
      const connect = await post(app, "/api/gradebook/connect", session, {
        username: "private-student",
        password: "private-password",
        remember: true,
      });
      expect(connect.statusCode).toBe(200);
      expect(connect.json()).toMatchObject({
        connected: true,
        remembered: true,
        canRemember: true,
      });
      expect(connect.body).not.toContain("private-password");
      const header = setCookies(connect.headers["set-cookie"]);
      expect(header).toContain("HttpOnly");
      expect(header).toContain("Secure");
      expect(header).toContain("Path=/api/gradebook");
      expect(header).not.toContain("private-password");
      remembered = cookieValue(connect.headers["set-cookie"], "bc_gradebook")!;
      expect(remembered).toBeTruthy();
    } finally {
      await app.close();
    }
    // Simulate Render restarting: all in-memory sessions and connections are gone.
    app = await buildApp(config, undefined, factory);
    try {
      const session = await login(app);
      const cookie = `${session}; ${remembered}`;
      const state = await app.inject({
        url: "/api/gradebook",
        headers: { cookie },
      });
      expect(state.json()).toMatchObject({
        connected: false,
        remembered: true,
      });
      const resume = await post(app, "/api/gradebook/resume", cookie);
      expect(resume.statusCode).toBe(200);
      expect(resume.json()).toMatchObject({
        connected: true,
        remembered: true,
      });
      expect(factory).toHaveBeenLastCalledWith(
        "private-student",
        "private-password",
      );
      // A second call while connected does not sign in again.
      await post(app, "/api/gradebook/resume", cookie);
      expect(factory).toHaveBeenCalledTimes(2);
    } finally {
      await app.close();
    }
  });
  it("renews a connection that is about to expire", async () => {
    const factory = vi.fn(() => fakeClient()),
      app = await buildApp(config, undefined, factory);
    try {
      const session = await login(app);
      const connect = await post(app, "/api/gradebook/connect", session, {
        username: "s",
        password: "p",
        remember: true,
      });
      const cookie = `${session}; ${cookieValue(connect.headers["set-cookie"], "bc_gradebook")}`;
      const clock = vi
        .spyOn(Date, "now")
        .mockReturnValue(Date.now() + 57 * 60 * 1000);
      try {
        const resume = await post(app, "/api/gradebook/resume", cookie);
        expect(resume.statusCode).toBe(200);
        expect(factory).toHaveBeenCalledTimes(2);
      } finally {
        clock.mockRestore();
      }
    } finally {
      await app.close();
    }
  });
  it("does not remember unless asked, and needs an app session to resume", async () => {
    const factory = vi.fn(() => fakeClient()),
      app = await buildApp(config, undefined, factory);
    try {
      const session = await login(app);
      const connect = await post(app, "/api/gradebook/connect", session, {
        username: "s",
        password: "p",
      });
      expect(connect.json().remembered).toBe(false);
      expect(cookieValue(connect.headers["set-cookie"], "bc_gradebook")).toBe(
        "bc_gradebook=",
      );
      const sealed = seal(rememberKey(undefined, "testonly")!, {
        username: "s",
        password: "p",
      });
      const stolen = await post(
        app,
        "/api/gradebook/resume",
        `bc_gradebook=${sealed}`,
      );
      expect(stolen.statusCode).toBe(401);
      expect(factory).toHaveBeenCalledTimes(1);
    } finally {
      await app.close();
    }
  });
  it("forgets the saved sign-in on disconnect, sign-out and a rejected password", async () => {
    const client = fakeClient();
    const app = await buildApp(config, undefined, () => client);
    try {
      const sealed = `bc_gradebook=${seal(rememberKey(undefined, "testonly")!, { username: "s", password: "old" })}`;
      for (const url of ["/api/gradebook/disconnect", "/api/logout"]) {
        const session = await login(app);
        const res = await post(app, url, `${session}; ${sealed}`);
        expect(setCookies(res.headers["set-cookie"])).toMatch(
          /bc_gradebook=;.*Path=\/api\/gradebook/,
        );
      }
      client.gradebook.mockRejectedValueOnce(new SynergyError("rejected", 422));
      const session = await login(app);
      const res = await post(
        app,
        "/api/gradebook/resume",
        `${session}; ${sealed}`,
      );
      expect(res.statusCode).toBe(422);
      expect(res.json().error).toContain("saved sign-in");
      expect(cookieValue(res.headers["set-cookie"], "bc_gradebook")).toBe(
        "bc_gradebook=",
      );
      // A tampered cookie is cleared rather than trusted.
      const bad = await post(
        app,
        "/api/gradebook/resume",
        `${session}; bc_gradebook=bad.value.here`,
      );
      expect(bad.statusCode).toBe(409);
      expect(cookieValue(bad.headers["set-cookie"], "bc_gradebook")).toBe(
        "bc_gradebook=",
      );
    } finally {
      await app.close();
    }
  });
  it("keeps the saved sign-in through a temporary StudentVUE outage", async () => {
    const client = fakeClient();
    client.gradebook.mockRejectedValueOnce(
      new SynergyError("StudentVUE is unavailable.", 503),
    );
    const app = await buildApp(config, undefined, () => client);
    try {
      const session = await login(app);
      const sealed = `bc_gradebook=${seal(rememberKey(undefined, "testonly")!, { username: "s", password: "p" })}`;
      const res = await post(
        app,
        "/api/gradebook/resume",
        `${session}; ${sealed}`,
      );
      expect(res.statusCode).toBe(503);
      expect(res.headers["set-cookie"]).toBeUndefined();
    } finally {
      await app.close();
    }
  });
});
