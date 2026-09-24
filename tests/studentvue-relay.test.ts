import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../workers/studentvue-relay/worker";

const env = { RELAY_TOKEN: "synthetic-test-token" };
const payload = {
  url: "https://md-mcps-psv.edupoint.com/Service/PXPCommunication.asmx",
  encrypted: false,
  xml: '<ProcessWebServiceRequestMultiWeb xmlns="http://edupoint.com/webservices/"><methodName>Gradebook</methodName></ProcessWebServiceRequestMultiWeb>',
};
const request = (body: unknown = payload, token: string = env.RELAY_TOKEN) =>
  new Request("https://relay.example/fulfillAxios", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
afterEach(() => vi.unstubAllGlobals());

describe("private StudentVUE relay", () => {
  it("reports readiness without calling StudentVUE or exposing the token", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const response = await worker.fetch(
      new Request("https://relay.example/health"),
      env,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      service: "studentvue-relay",
    });
    expect(
      (await worker.fetch(new Request("https://relay.example/health"), {}))
        .status,
    ).toBe(503);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("rejects unauthorized, unconfigured, oversized and off-district requests before forwarding", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    expect((await worker.fetch(request(payload, "wrong"), env)).status).toBe(
      401,
    );
    expect((await worker.fetch(request(), {})).status).toBe(401);
    expect(
      (
        await worker.fetch(
          request({ ...payload, url: "https://example.com" }),
          env,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await worker.fetch(
          request({
            ...payload,
            xml: payload.xml.replace("Gradebook", "ChangePassword"),
          }),
          env,
        )
      ).status,
    ).toBe(400);
    expect(
      (await worker.fetch(request({ ...payload, xml: "x".repeat(65536) }), env))
        .status,
    ).toBe(413);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("forwards both read methods only to MCPS without forwarding relay credentials", async () => {
    const fetcher = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(new Response("<soap>synthetic response</soap>")),
      );
    vi.stubGlobal("fetch", fetcher);
    for (const method of ["Gradebook", "StudentClassList"]) {
      const xml = payload.xml.replace("Gradebook", method);
      const response = await worker.fetch(request({ ...payload, xml }), env);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await response.json()).toEqual({
        status: true,
        response: "<soap>synthetic response</soap>",
      });
      expect(fetcher).toHaveBeenLastCalledWith(
        payload.url,
        expect.objectContaining({
          body: xml,
          method: "POST",
          redirect: "error",
        }),
      );
      expect(JSON.stringify(fetcher.mock.lastCall)).not.toContain(
        env.RELAY_TOKEN,
      );
    }
  });
  it("does not expose upstream error details", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("private upstream detail")),
    );
    const response = await worker.fetch(request(), env);
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      status: false,
      message: "upstream unavailable",
    });
  });
});
