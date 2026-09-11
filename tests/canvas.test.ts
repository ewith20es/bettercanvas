import { expect, it, vi } from "vitest";
import { CanvasClient, normalizeAssignment } from "../apps/server/src/canvas";
import { demoSnapshot } from "../packages/domain/src/demo";
const origin = "https://mcpsmd.instructure.com";
const json = (body: unknown, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), { headers });
it("follows next links and supplies the token only in the header", async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      json([1], { Link: `<${origin}/api/v1/courses?page=2>; rel="next"` }),
    )
    .mockResolvedValueOnce(json([2]));
  expect(
    await new CanvasClient(origin, "test-token", fetcher).all(
      "/api/v1/courses",
    ),
  ).toEqual([1, 2]);
  expect(fetcher.mock.calls[0][1]?.headers).toMatchObject({
    Authorization: "Bearer test-token",
  });
  expect(fetcher.mock.calls[0][1]?.redirect).toBe("error");
});
it("rejects pagination to another origin before sending credentials", async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValue(
      json([], {
        Link: '<https://untrusted.example/api/v1/courses>; rel="next"',
      }),
    );
  await expect(
    new CanvasClient(origin, "test", fetcher).all("/api/v1/courses"),
  ).rejects.toThrow("unsafe");
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("stops a pagination loop and does not publish partial results", async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValue(
      json([1], { Link: `<${origin}/api/v1/courses>; rel="next"` }),
    );
  await expect(
    new CanvasClient(origin, "test", fetcher).all("/api/v1/courses"),
  ).rejects.toThrow("pagination");
});
it("stops retrying rejected credentials", async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValue(new Response("", { status: 401 }));
  await expect(
    new CanvasClient(origin, "test", fetcher).all("/api/v1/courses"),
  ).rejects.toThrow("token");
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("honors retry-after for transient errors", async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      new Response("", { status: 429, headers: { "Retry-After": "1" } }),
    )
    .mockResolvedValueOnce(json([]));
  const pause = vi.fn().mockResolvedValue(undefined);
  await new CanvasClient(origin, "test", fetcher, pause).all("/api/v1/courses");
  expect(pause).toHaveBeenCalledWith(1000);
});
it("strips unnecessary data and preserves user-specific dates, zero and unknowns", () => {
  const a = normalizeAssignment(
    {
      id: 1,
      name: "Work",
      due_at: "2026-09-12T03:59:00Z",
      submission_types: ["online_upload"],
      has_submitted_submissions: true,
      description: "private HTML",
      submission: {
        workflow_state: "graded",
        score: 0,
        grade: "0",
        body: "private submission",
      },
    },
    "2",
    origin,
  )!;
  expect(a.submission?.score).toBe(0);
  expect(a.submission?.submittedAt).toBeNull();
  expect(a.dueAt).toBe("2026-09-12T03:59:00Z");
  expect(JSON.stringify(a)).not.toContain("private");
  expect(a.url).toBe(`${origin}/courses/2/assignments/1`);
});
it("retains failed courses while replacing complete successful course snapshots", async () => {
  const previous = {
    ...demoSnapshot(),
    demo: false,
    account: { id: "42", name: "Me", origin },
  };
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async (input) => {
    const path = new URL(String(input)).pathname;
    if (path.endsWith("/profile")) return json({ id: 42, name: "Me" });
    if (path === "/api/v1/courses")
      return json([
        { id: 1, name: "English" },
        { id: 2, name: "Math" },
      ]);
    if (path.includes("/courses/1/")) return json([]);
    return new Response("", { status: 403 });
  });
  const next = await new CanvasClient(origin, "test", fetcher).sync(previous);
  expect(next.assignments.filter((a) => a.courseId === "1")).toHaveLength(0);
  expect(next.assignments.filter((a) => a.courseId === "2")).toEqual(
    previous.assignments.filter((a) => a.courseId === "2"),
  );
  expect(next.sync.find((s) => s.courseId === "2")?.error).toContain("denied");
});
