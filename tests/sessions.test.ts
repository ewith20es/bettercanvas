import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../apps/server/src/app";
import { sessionAge, SessionStore } from "../apps/server/src/sessions";

const origin = "https://bettercanvas.example";
const config = {
  origin,
  canvasOrigin: "https://mcpsmd.instructure.com",
  production: true,
  token: "fake-test-token",
  password: "testonly",
};
const client = () => ({ sync: vi.fn().mockResolvedValue(null) });
async function login(app: Awaited<ReturnType<typeof buildApp>>) {
  const res = await app.inject({
    method: "POST",
    url: "/api/login",
    headers: { origin },
    payload: { password: config.password },
  });
  expect(res.statusCode).toBe(200);
  return String(res.headers["set-cookie"]).split(";")[0];
}
const authed = async (
  app: Awaited<ReturnType<typeof buildApp>>,
  cookie: string,
) =>
  (await app.inject({ url: "/api/snapshot", headers: { cookie } })).statusCode;

describe("sign-in that survives restarts", () => {
  it("keeps the app signed in after the server restarts", async () => {
    let app = await buildApp(config, client());
    const cookie = await login(app);
    await app.close();
    app = await buildApp(config, client());
    try {
      expect(await authed(app, cookie)).toBe(200);
      expect(
        (
          await app.inject({ url: "/api/bootstrap", headers: { cookie } })
        ).json().authenticated,
      ).toBe(true);
    } finally {
      await app.close();
    }
  });
  it("signs every device out when the passphrase or secret changes", async () => {
    const first = await buildApp(config, client());
    const cookie = await login(first);
    await first.close();
    for (const changed of [
      { ...config, password: "different-pass" },
      { ...config, secret: "s".repeat(40) },
    ]) {
      const app = await buildApp(changed, client());
      try {
        expect(await authed(app, cookie)).toBe(401);
      } finally {
        await app.close();
      }
    }
  });
  it("rejects tampered, extended and expired cookies", async () => {
    const app = await buildApp(config, client());
    try {
      const cookie = await login(app);
      const [id, exp, mac] = cookie.slice("bc_session=".length).split(".");
      const later = `bc_session=${id}.${Number(exp) + 1000}.${mac}`;
      const otherId = `bc_session=${"A".repeat(24)}.${exp}.${mac}`;
      expect(await authed(app, later)).toBe(401);
      expect(await authed(app, otherId)).toBe(401);
      expect(await authed(app, "bc_session=nonsense")).toBe(401);
      const clock = vi
        .spyOn(Date, "now")
        .mockReturnValue(Date.now() + sessionAge + 1);
      try {
        expect(await authed(app, cookie)).toBe(401);
      } finally {
        clock.mockRestore();
      }
    } finally {
      await app.close();
    }
  });
  it("signs out immediately and replaces the old session on a new sign-in", async () => {
    const app = await buildApp(config, client());
    try {
      const cookie = await login(app);
      await app.inject({
        method: "POST",
        url: "/api/logout",
        headers: { origin, cookie },
      });
      expect(await authed(app, cookie)).toBe(401);
      const second = await login(app);
      const res = await app.inject({
        method: "POST",
        url: "/api/login",
        headers: { origin, cookie: second },
        payload: { password: config.password },
      });
      expect(res.statusCode).toBe(200);
      expect(await authed(app, second)).toBe(401);
    } finally {
      await app.close();
    }
  });
  it("renews the cookie at most once a day while the app is used", async () => {
    const app = await buildApp(config, client());
    try {
      const cookie = await login(app);
      const fresh = await app.inject({
        url: "/api/bootstrap",
        headers: { cookie },
      });
      expect(fresh.headers["set-cookie"]).toBeUndefined();
      const clock = vi
        .spyOn(Date, "now")
        .mockReturnValue(Date.now() + 2 * 24 * 60 * 60 * 1000);
      try {
        const renewed = await app.inject({
          url: "/api/bootstrap",
          headers: { cookie },
        });
        const next = String(renewed.headers["set-cookie"]);
        expect(next).toContain("HttpOnly");
        expect(next).toContain("Max-Age=2592000");
        const token = next.split(";")[0];
        // Same session id, so a StudentVUE connection keyed to it carries over.
        expect(token.split(".")[0]).toBe(cookie.split(".")[0]);
        expect(await authed(app, token)).toBe(200);
      } finally {
        clock.mockRestore();
      }
    } finally {
      await app.close();
    }
  });
  it("never puts the passphrase in the cookie", () => {
    const { token } = new SessionStore("testonly").issue();
    expect(token).not.toContain("testonly");
    expect(token.length).toBeLessThan(200);
  });
});
