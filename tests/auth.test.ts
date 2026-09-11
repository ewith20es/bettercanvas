import { expect, it, vi } from "vitest";
import { buildApp } from "../apps/server/src/app";
const origin = "https://bettercanvas.example";
const config = {
  origin,
  canvasOrigin: "https://mcpsmd.instructure.com",
  production: true,
  token: "fake-test-token",
  password: "testonly",
};
it.each([undefined, "", "1234567"])(
  "rejects live configuration with a missing or shorter-than-eight-character passphrase (%s)",
  async (password) => {
    await expect(buildApp({ ...config, password })).rejects.toThrow(
      "at least 8 characters",
    );
  },
);
it("accepts an eight-character passphrase while protecting data, checking origins, and invalidating signed-out sessions", async () => {
  const client = { sync: vi.fn() };
  const app = await buildApp(config, client);
  try {
    expect((await app.inject("/api/snapshot")).statusCode).toBe(401);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/sync",
          headers: { origin },
        })
      ).statusCode,
    ).toBe(401);
    expect(client.sync).not.toHaveBeenCalled();
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/login",
          headers: { origin: "https://wrong.example" },
          payload: { password: config.password },
        })
      ).statusCode,
    ).toBe(403);
    const login = await app.inject({
      method: "POST",
      url: "/api/login",
      headers: { origin },
      payload: { password: config.password },
    });
    expect(login.statusCode).toBe(200);
    const cookie = String(login.headers["set-cookie"]);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Strict");
    const headers = { origin, cookie: cookie.split(";")[0] };
    const snapshot = await app.inject({ url: "/api/snapshot", headers });
    expect(snapshot.statusCode).toBe(200);
    expect(snapshot.headers["cache-control"]).toContain("no-store");
    expect(
      (await app.inject({ method: "POST", url: "/api/logout", headers }))
        .statusCode,
    ).toBe(200);
    expect(
      (await app.inject({ url: "/api/snapshot", headers })).statusCode,
    ).toBe(401);
    expect((await app.inject("/api/bootstrap")).body).not.toContain(
      config.token,
    );
  } finally {
    await app.close();
  }
});
it("limits incorrect sign-in attempts", async () => {
  const app = await buildApp(config);
  try {
    for (let i = 0; i < 5; i++)
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/api/login",
            headers: { origin },
            payload: { password: "wrong" },
          })
        ).statusCode,
      ).toBe(401);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/login",
          headers: { origin },
          payload: { password: "wrong" },
        })
      ).statusCode,
    ).toBe(429);
  } finally {
    await app.close();
  }
});
