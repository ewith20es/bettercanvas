import { z } from "zod";
import type {
  Assignment,
  Course,
  Snapshot,
  Submission,
} from "../../../packages/domain/src";

const id = z.union([z.string(), z.number()]).transform(String);
const time = z
  .string()
  .datetime({ offset: true })
  .nullable()
  .optional()
  .transform((v) => v ?? null);
const flag = z
  .boolean()
  .nullable()
  .optional()
  .transform((v) => v ?? null);
const submissionSchema = z.object({
  workflow_state: z.string().optional(),
  submitted_at: time,
  missing: flag,
  late: flag,
  excused: flag,
  score: z.number().nullable().optional(),
  grade: z.string().nullable().optional(),
  graded_at: time,
  grade_matches_current_submission: flag,
  redo_request: flag,
  assignment_visible: z.boolean().optional(),
});
const assignmentSchema = z.object({
  id,
  name: z.string(),
  due_at: time,
  unlock_at: time,
  lock_at: time,
  html_url: z.string().optional(),
  points_possible: z.number().nullable().optional(),
  submission_types: z.array(z.string()),
  locked_for_user: z.boolean().optional(),
  published: z.boolean().optional(),
  submission: submissionSchema.nullable().optional(),
});
const courseSchema = z.object({
  id,
  name: z.string(),
  course_code: z.string().optional(),
  workflow_state: z.string().optional(),
  sections: z
    .array(z.object({ name: z.string().nullable().optional() }))
    .nullable()
    .optional(),
});
const profileSchema = z.object({
  id,
  short_name: z.string().optional(),
  name: z.string(),
});

export class CanvasError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
function safeError(error: unknown): string {
  if (error instanceof CanvasError) return error.message;
  if (error instanceof z.ZodError)
    return "Canvas returned an unexpected format. Previous data was kept.";
  return "Canvas could not be reached. Try refreshing shortly.";
}
export function normalizeAssignment(
  raw: unknown,
  courseId: string,
  origin: string,
): Assignment | null {
  const a = assignmentSchema.parse(raw);
  if (a.published === false || a.submission?.assignment_visible === false)
    return null;
  const s = a.submission;
  const submission: Submission | null = s
    ? {
        state: s.workflow_state ?? null,
        submittedAt: s.submitted_at,
        missing: s.missing,
        late: s.late,
        excused: s.excused,
        score: s.score ?? null,
        grade: s.grade ?? null,
        gradedAt: s.graded_at,
        currentGrade: s.grade_matches_current_submission,
        redo: s.redo_request,
      }
    : null;
  let url = `${origin}/courses/${encodeURIComponent(courseId)}/assignments/${encodeURIComponent(a.id)}`;
  try {
    if (a.html_url) {
      const candidate = new URL(a.html_url, origin);
      if (
        candidate.origin === origin &&
        candidate.protocol === "https:" &&
        !candidate.username &&
        !candidate.password
      )
        url = candidate.href;
    }
  } catch {
    /* use known assignment URL */
  }
  return {
    id: a.id,
    courseId,
    name: a.name,
    url,
    dueAt: a.due_at,
    unlockAt: a.unlock_at,
    lockAt: a.lock_at,
    points: a.points_possible ?? null,
    types: a.submission_types,
    locked: a.locked_for_user ?? false,
    submission,
  };
}

export class CanvasClient {
  constructor(
    readonly origin: string,
    private token: string,
    private fetcher: typeof fetch = fetch,
    private pause = (ms: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, ms)),
  ) {}
  async request(path: string): Promise<Response> {
    const url = new URL(path, this.origin);
    if (
      url.origin !== this.origin ||
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      !url.pathname.startsWith("/api/v1/")
    ) {
      throw new CanvasError(
        502,
        "Canvas returned an unsafe pagination link. Refresh stopped.",
      );
    }
    for (let attempt = 0; attempt < 3; attempt++) {
      let response: Response;
      try {
        response = await this.fetcher(url, {
          headers: {
            Authorization: `Bearer ${this.token}`,
            Accept: "application/json",
          },
          redirect: "error",
          signal: AbortSignal.timeout(15000),
        });
      } catch {
        if (attempt < 2) {
          await this.pause(500 * 2 ** attempt);
          continue;
        }
        throw new CanvasError(
          502,
          "Canvas could not be reached. Try refreshing shortly.",
        );
      }
      if (response.ok) return response;
      if (response.status === 401)
        throw new CanvasError(
          401,
          "Canvas token expired or was rejected. Update it in your server settings.",
        );
      if (response.status === 403)
        throw new CanvasError(
          403,
          "Canvas denied access to this course. Previous data was kept.",
        );
      if ((response.status === 429 || response.status >= 500) && attempt < 2) {
        const retry = response.headers.get("retry-after");
        const seconds = Number(retry);
        const delay = retry
          ? Number.isFinite(seconds)
            ? seconds * 1000
            : Date.parse(retry) - Date.now()
          : 500 * 2 ** attempt + Math.random() * 250;
        // Respect long cooldowns by stopping instead of retrying earlier than requested.
        if (delay > 10000)
          throw new CanvasError(
            429,
            "Canvas is busy. Wait a little before refreshing again.",
          );
        await this.pause(Math.max(0, Number.isFinite(delay) ? delay : 1000));
        continue;
      }
      throw new CanvasError(
        response.status,
        response.status === 429
          ? "Canvas is busy. Try again later."
          : "Canvas could not complete this request. Previous data was kept.",
      );
    }
    throw new CanvasError(502, "Canvas is temporarily unavailable.");
  }
  async all(path: string): Promise<unknown[]> {
    const items: unknown[] = [],
      seen = new Set<string>();
    let next: string | null = path;
    while (next) {
      const absolute = new URL(next, this.origin).href;
      if (seen.has(absolute) || seen.size >= 1000)
        throw new CanvasError(
          502,
          "Canvas pagination could not be completed. Previous data was kept.",
        );
      seen.add(absolute);
      const res = await this.request(next);
      const page: unknown = await res.json();
      if (!Array.isArray(page))
        throw new CanvasError(502, "Canvas returned an unexpected response.");
      items.push(...page);
      next = null;
      for (const link of (res.headers.get("link") ?? "").split(",")) {
        const match = link.match(/<([^>]+)>\s*;\s*rel="?next"?/);
        if (match) next = match[1];
      }
    }
    return items;
  }
  async sync(previous?: Snapshot): Promise<Snapshot> {
    const now = new Date().toISOString();
    let profile: z.infer<typeof profileSchema>, courses: Course[];
    try {
      profile = profileSchema.parse(
        await (await this.request("/api/v1/users/self/profile")).json(),
      );
      courses = (
        await this.all(
          "/api/v1/courses?enrollment_type=student&enrollment_state=active&include%5B%5D=sections&per_page=100",
        )
      )
        .map((c) => courseSchema.parse(c))
        .filter(
          (c) =>
            c.workflow_state !== "completed" && c.workflow_state !== "deleted",
        )
        .map((c) => {
          const sections = (c.sections ?? []).flatMap((s) =>
            s.name ? [s.name] : [],
          );
          return {
            id: c.id,
            name: c.name,
            code: c.course_code ?? c.name,
            url: `${this.origin}/courses/${encodeURIComponent(c.id)}`,
            ...(sections.length ? { sections } : {}),
          };
        });
    } catch (e) {
      return previous
        ? { ...previous, error: safeError(e) }
        : {
            demo: false,
            account: {
              id: "unverified",
              name: "My workspace",
              origin: this.origin,
            },
            courses: [],
            assignments: [],
            sync: [],
            fetchedAt: null,
            error: safeError(e),
          };
    }
    const old = previous?.account.id === profile.id ? previous : undefined;
    const result: Snapshot = {
      demo: false,
      account: {
        id: profile.id,
        name: profile.short_name ?? profile.name,
        origin: this.origin,
      },
      courses,
      assignments: [],
      sync: [],
      fetchedAt: now,
      error: null,
    };
    const queue = [...courses];
    await Promise.all(
      Array.from({ length: Math.min(3, courses.length) }, async () => {
        for (let course = queue.shift(); course; course = queue.shift()) {
          try {
            const raw = await this.all(
              `/api/v1/courses/${encodeURIComponent(course.id)}/assignments?include%5B%5D=submission&per_page=100`,
            );
            const assignments = raw
              .map((a) => normalizeAssignment(a, course.id, this.origin))
              .filter((a): a is Assignment => a !== null);
            result.assignments.push(...assignments);
            result.sync.push({
              courseId: course.id,
              successAt: now,
              error: null,
            });
          } catch (e) {
            result.assignments.push(
              ...(old?.assignments.filter((a) => a.courseId === course.id) ??
                []),
            );
            result.sync.push({
              courseId: course.id,
              successAt:
                old?.sync.find((s) => s.courseId === course.id)?.successAt ??
                null,
              error: safeError(e),
            });
          }
        }
      }),
    );
    return result;
  }
}
