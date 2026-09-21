import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import type {
  Gradebook,
  GradebookConnection,
  TodaySchedule,
} from "../../../packages/domain/src/gradebook";
import {
  rememberAge,
  rememberCookie,
  rememberPath,
  seal,
  unseal,
} from "./remember";
import { SynergyClient, SynergyError, type GradebookClient } from "./synergy";

export type SynergyFactory = (
  username: string,
  password: string,
) => GradebookClient;
type Connection = {
  client: GradebookClient;
  expires: number;
  snapshot: Gradebook | null;
  schedule: TodaySchedule | null;
  cache: Map<number, Gradebook>;
  busy: boolean;
};
const credentials = z
  .object({
    username: z.string().trim().min(1).max(128),
    password: z.string().min(1).max(1024),
    remember: z.boolean().optional(),
  })
  .strict();
const periodInput = z
  .object({ period: z.number().int().min(0).max(50).optional() })
  .strict();
const connectionAge = 60 * 60 * 1000;
const renewWindow = 5 * 60 * 1000;

export function registerGradebook(
  app: FastifyInstance,
  options: {
    enabled: boolean;
    sessions: Map<string, number>;
    factory?: SynergyFactory;
    /** Null disables "keep me signed in". */
    rememberKey?: Buffer | null;
    secure?: boolean;
  },
) {
  const rememberKey = options.enabled ? (options.rememberKey ?? null) : null;
  const cookieOptions = {
    httpOnly: true,
    secure: !!options.secure,
    sameSite: "strict" as const,
    path: rememberPath,
  };
  const remembered = (value?: string) =>
    rememberKey ? unseal(rememberKey, value) : null;
  const forgetLogin = (reply: FastifyReply) =>
    reply.clearCookie(rememberCookie, cookieOptions);
  const connections = new Map<string, Connection>();
  const forget = (key: string) => {
    connections.get(key)?.client.dispose();
    connections.delete(key);
  };
  const sessionValid = (key: string) =>
    (options.sessions.get(key) ?? 0) > Date.now();
  const get = (key: string) => {
    const connection = connections.get(key);
    if (
      connection &&
      (!sessionValid(key) || connection.expires <= Date.now())
    ) {
      forget(key);
      return undefined;
    }
    return connection;
  };
  const state = (key: string, remember?: string): GradebookConnection => {
    const c = get(key);
    return {
      connected: !!c?.snapshot,
      canConnect: options.enabled,
      canRemember: !!rememberKey,
      remembered: !!remembered(remember),
      expiresAt: c ? new Date(c.expires).toISOString() : null,
      snapshot: c?.snapshot ?? null,
      schedule: c?.schedule ?? null,
    };
  };
  const assertActive = (key: string, c: Connection) => {
    if (get(key) !== c)
      throw new SynergyError(
        "StudentVUE was disconnected or your session expired. Connect again to continue.",
        409,
      );
  };
  const timer = setInterval(() => {
    for (const key of connections.keys()) get(key);
  }, 30000);
  timer.unref();
  app.addHook("onClose", async () => {
    clearInterval(timer);
    for (const key of connections.keys()) forget(key);
  });

  /** Signs in to StudentVUE and loads the first gradebook for this session. */
  const open = async (key: string, username: string, password: string) => {
    forget(key);
    const c: Connection = {
      client: (options.factory ?? ((u, p) => new SynergyClient(u, p)))(
        username,
        password,
      ),
      expires: Date.now() + connectionAge,
      snapshot: null,
      schedule: null,
      cache: new Map(),
      busy: true,
    };
    connections.set(key, c);
    try {
      const snapshot = await c.client.gradebook();
      assertActive(key, c);
      c.snapshot = snapshot;
      c.cache.set(snapshot.period.index, snapshot);
      // Today's bell schedule only drives the class countdown, so a district
      // that does not publish one must never fail the connection.
      try {
        const schedule = await c.client.schedule();
        if (connections.get(key) === c) c.schedule = schedule;
      } catch {
        /* countdown stays hidden */
      }
    } catch (e) {
      if (connections.get(key) === c) forget(key);
      throw e;
    } finally {
      c.busy = false;
    }
  };
  const notReady =
    "Set an app passphrase of at least 8 characters and sign in to Better Canvas before connecting StudentVUE.";

  app.get("/api/gradebook", async (req) =>
    state(req.cookies.bc_session ?? "", req.cookies[rememberCookie]),
  );
  app.post(
    "/api/gradebook/connect",
    { config: { rateLimit: { max: 5, timeWindow: "15 minutes" } } },
    async (req, reply) => {
      const key = req.cookies.bc_session ?? "";
      if (!options.enabled || !sessionValid(key))
        return reply.code(403).send({ error: notReady });
      const parsed = credentials.safeParse(req.body);
      if (!parsed.success)
        return reply
          .code(400)
          .send({ error: "Enter your StudentVUE student ID and password." });
      if (get(key)?.busy)
        return reply.code(409).send({
          error: "A StudentVUE request is still running. Please wait.",
        });
      const { username, password, remember } = parsed.data;
      await open(key, username, password);
      // Only credentials StudentVUE just accepted are remembered.
      if (remember && rememberKey) {
        reply.setCookie(
          rememberCookie,
          seal(rememberKey, { username, password }),
          {
            ...cookieOptions,
            maxAge: rememberAge / 1000,
          },
        );
        return { ...state(key), remembered: true };
      }
      forgetLogin(reply);
      return { ...state(key), remembered: false };
    },
  );
  app.post(
    "/api/gradebook/resume",
    { config: { rateLimit: { max: 10, timeWindow: "15 minutes" } } },
    async (req, reply) => {
      const key = req.cookies.bc_session ?? "";
      if (!options.enabled || !sessionValid(key))
        return reply.code(403).send({ error: notReady });
      const value = req.cookies[rememberCookie],
        login = remembered(value);
      if (!login) {
        if (value) forgetLogin(reply);
        return reply
          .code(409)
          .send({ error: "Sign in to StudentVUE to load your grades." });
      }
      const current = get(key);
      // A healthy connection is reused; one about to expire is renewed.
      if (
        current?.snapshot &&
        !current.busy &&
        current.expires - Date.now() > renewWindow
      )
        return state(key, value);
      if (current?.busy)
        return reply.code(409).send({
          error: "A StudentVUE request is still running. Please wait.",
        });
      try {
        await open(key, login.username, login.password);
      } catch (e) {
        // A changed StudentVUE password means the saved sign-in is useless.
        if (e instanceof SynergyError && e.statusCode === 422) {
          forgetLogin(reply);
          throw new SynergyError(
            "StudentVUE no longer accepts your saved sign-in. Enter your student ID and password again.",
            422,
          );
        }
        throw e;
      }
      return state(key, value);
    },
  );
  app.post(
    "/api/gradebook/refresh",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const key = req.cookies.bc_session ?? "",
        c = get(key);
      if (!c?.snapshot)
        return reply
          .code(409)
          .send({ error: "Reconnect StudentVUE to load your grades." });
      const parsed = periodInput.safeParse(req.body ?? {});
      if (!parsed.success)
        return reply
          .code(400)
          .send({ error: "Choose a valid grading period." });
      const period = parsed.data.period ?? c.snapshot.period.index;
      if (!c.snapshot.periods.some((p) => p.index === period))
        return reply.code(400).send({
          error: "That grading period is not available in StudentVUE.",
        });
      if (c.busy)
        return reply
          .code(409)
          .send({ error: "Your grades are already refreshing. Please wait." });
      const cached = c.cache.get(period);
      if (cached && Date.now() - Date.parse(cached.fetchedAt) < 20000) {
        c.snapshot = cached;
        return state(key, req.cookies[rememberCookie]);
      }
      c.busy = true;
      try {
        const snapshot = await c.client.gradebook(period);
        assertActive(key, c);
        c.snapshot = snapshot;
        c.cache.set(period, snapshot);
        return state(key, req.cookies[rememberCookie]);
      } catch (e) {
        if (
          e instanceof SynergyError &&
          e.statusCode === 422 &&
          connections.get(key) === c
        ) {
          forget(key);
          forgetLogin(reply);
        }
        throw e;
      } finally {
        c.busy = false;
      }
    },
  );
  app.post("/api/gradebook/disconnect", async (req, reply) => {
    const key = req.cookies.bc_session ?? "";
    forget(key);
    // Disconnecting is an explicit "forget me" on this device.
    forgetLogin(reply);
    return state(key);
  });
  return { forget, forgetLogin };
}
