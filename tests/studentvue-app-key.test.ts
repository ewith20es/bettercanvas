import { describe, expect, it, vi } from "vitest";
import { createStudentVueAppKeyProvider } from "../apps/server/src/studentvue-app-key";

const key = "A".repeat(62) + "+/"; // Fictional public-app value, never a live key.

describe("StudentVUE app compatibility key", () => {
  it("only fetches the fixed public URL without credentials and picks up rotation", async () => {
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(key))
      .mockResolvedValueOnce(new Response("B".repeat(64)));
    const getKey = createStudentVueAppKeyProvider(request);
    const signal = new AbortController().signal;
    expect(await getKey(signal)).toBe(key);
    expect(await getKey(signal)).toBe("B".repeat(64));
    for (const [url, init] of request.mock.calls) {
      expect(url).toBe("https://axum-svue.fly.dev/akey");
      expect(init).toMatchObject({ method: "GET", credentials: "omit", redirect: "manual" });
      expect(init?.body).toBeUndefined();
      expect([...new Headers(init?.headers).entries()]).toEqual([["accept", "text/plain"]]);
      expect(init?.signal).toBeInstanceOf(AbortSignal);
    }
  });

  it.each([
    { body: key, status: 302 },
    { body: key, status: 503 },
    { body: "<html>service unavailable</html>", status: 200 },
    { body: key + "\r\nX-Injected: value", status: 200 },
    { body: "A".repeat(257), status: 200 },
    { body: "", status: 200 },
  ])("rejects invalid replies without reflecting them: $status", async ({ body, status }) => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(body, { status }));
    const error = await createStudentVueAppKeyProvider(request)(new AbortController().signal)
      .catch((e: Error) => e);
    expect(error).toMatchObject({ statusCode: 503 });
    expect(String(error)).toContain("mobile connection setup");
    expect(String(error)).not.toContain(key);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("bounds bodies without content-length and cancels oversized streams", async () => {
    const cancel = vi.fn();
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array(257)); }, cancel,
    })));
    await expect(createStudentVueAppKeyProvider(request)(new AbortController().signal))
      .rejects.toMatchObject({ statusCode: 503 });
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("sanitizes lookup failures and honors disconnect while reading", async () => {
    const failing = createStudentVueAppKeyProvider(async () => { throw new Error("private transport detail"); });
    await expect(failing(new AbortController().signal)).rejects.toThrow("mobile connection setup");
    const controller = new AbortController();
    let ready!: () => void;
    const started = new Promise<void>((resolve) => { ready = resolve; });
    const request = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => new Response(new ReadableStream({
      start(stream) {
        init?.signal?.addEventListener("abort", () => stream.error(new Error("aborted")), { once: true });
        stream.enqueue(new TextEncoder().encode("A"));
        ready();
      },
    })));
    const getKey = createStudentVueAppKeyProvider(request);
    const pending = getKey(controller.signal);
    await started;
    controller.abort();
    await expect(pending).rejects.toThrow();
    await expect(getKey(controller.signal)).rejects.toThrow();
    expect(request).toHaveBeenCalledOnce();
  });
});
