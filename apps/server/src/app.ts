import Fastify from "fastify";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import staticFiles from "@fastify/static";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { demoSnapshot } from "../../../packages/domain/src/demo";
import type { Snapshot } from "../../../packages/domain/src";
import { CanvasClient } from "./canvas";
import { registerGradebook, type SynergyFactory } from "./gradebook-routes";
import { SynergyError } from "./synergy";

export type Config = {
  origin: string;
  canvasOrigin: string;
  token?: string;
  password?: string;
  production: boolean;
};
export async function buildApp(
  config: Config,
  client?: Pick<CanvasClient, "sync">,
  synergyFactory?: SynergyFactory,
) {
  if (config.token && (!config.password || config.password.length < 8))
    throw new Error(
      "Set APP_PASSWORD to a separate passphrase of at least 8 characters before connecting Canvas.",
    );
  const origin = new URL(config.origin);
  if (config.production && origin.protocol !== "https:")
    throw new Error("Production APP_ORIGIN must be your exact HTTPS app URL.");
  const app = Fastify({ logger: false, bodyLimit: 8192, trustProxy: false });
  // Register before routes/plugins: Fastify captures the handler on each route.
  app.setErrorHandler((error, _req, reply) => {
    const code =
      error &&
      typeof error === "object" &&
      "statusCode" in error &&
      typeof error.statusCode === "number"
        ? error.statusCode
        : 500;
    reply.code(code).send({
      error:
        error instanceof SynergyError
          ? error.message
          : code === 429
            ? "Too many attempts. Please wait before trying again."
            : "The request could not be completed. Please try again.",
    });
  });
  await app.register(cookie);
  await app.register(helmet, {
    contentSecurityPolicy: config.production
      ? {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:"],
            fontSrc: ["'self'"],
            connectSrc: ["'self'"],
            objectSrc: ["'none'"],
            frameAncestors: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
          },
        }
      : false,
  });
  await app.register(rateLimit, { global: false });
  const passwordSalt = randomBytes(16),
    passwordHash = config.password
      ? scryptSync(config.password, passwordSalt, 64)
      : null;
  const sessions = new Map<string, number>();
  const sessionAge = 7 * 24 * 60 * 60 * 1000;
  const validSession = (value?: string) => {
    if (!passwordHash) return true;
    const expiry = value ? sessions.get(value) : null;
    return expiry != null && expiry > Date.now();
  };
  const live =
    client ?? new CanvasClient(config.canvasOrigin, config.token ?? "");
  let snapshot: Snapshot | undefined,
    inflight: Promise<Snapshot> | null = null,
    lastAttempt = 0;
  app.addHook("onRequest", async (req, reply) => {
    if (!req.url.startsWith("/api/")) return;
    reply.header("Cache-Control", "no-store, private");
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.headers.origin !== origin.origin
    ) {
      return reply
        .code(403)
        .send({ error: "Request origin was not accepted." });
    }
    const publicPath = req.url.split("?")[0];
    if (
      !["/api/health", "/api/bootstrap", "/api/login"].includes(publicPath) &&
      !validSession(req.cookies.bc_session)
    ) {
      return reply.code(401).send({ error: "Sign in to view your workspace." });
    }
  });
  const gradebook = registerGradebook(app, {
    enabled: (config.password?.length ?? 0) >= 8,
    sessions,
    factory: synergyFactory,
  });
  app.get("/api/health", async () => ({ ok: true }));
  app.get("/api/bootstrap", async (req) => ({
    authenticated: validSession(req.cookies.bc_session),
    requiresLogin: !!passwordHash,
    demo: !config.token,
  }));
  app.post(
    "/api/login",
    { config: { rateLimit: { max: 5, timeWindow: "15 minutes" } } },
    async (req, reply) => {
      const value = (req.body as { password?: unknown } | null)?.password;
      if (
        !passwordHash ||
        typeof value !== "string" ||
        value.length > 1024 ||
        !timingSafeEqual(scryptSync(value, passwordSalt, 64), passwordHash)
      ) {
        return reply
          .code(401)
          .send({ error: "That passphrase was not accepted." });
      }
      // Expired sessions and a bounded active-session count keep memory use predictable.
      for (const [key, expiry] of sessions)
        if (expiry <= Date.now()) {
          sessions.delete(key);
          gradebook.forget(key);
        }
      if (sessions.size >= 30) {
        const oldest = sessions.keys().next().value!;
        sessions.delete(oldest);
        gradebook.forget(oldest);
      }
      if (req.cookies.bc_session) {
        gradebook.forget(req.cookies.bc_session);
        sessions.delete(req.cookies.bc_session);
      }
      const session = randomBytes(32).toString("hex");
      sessions.set(session, Date.now() + sessionAge);
      reply.setCookie("bc_session", session, {
        httpOnly: true,
        secure: config.production,
        sameSite: "strict",
        path: "/",
        maxAge: sessionAge / 1000,
      });
      return { ok: true };
    },
  );
  app.post("/api/logout", async (req, reply) => {
    gradebook.forget(req.cookies.bc_session ?? "");
    sessions.delete(req.cookies.bc_session ?? "");
    reply.clearCookie("bc_session", { path: "/" });
    return { ok: true };
  });
  app.get(
    "/api/snapshot",
    async () => snapshot ?? (!config.token ? demoSnapshot() : null),
  );
  app.post(
    "/api/sync",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async () => {
      if (!config.token) return demoSnapshot();
      if (inflight) return inflight;
      if (snapshot && Date.now() - lastAttempt < 15000) return snapshot;
      lastAttempt = Date.now();
      inflight = live.sync(snapshot);
      try {
        snapshot = await inflight;
        return snapshot;
      } finally {
        inflight = null;
      }
    },
  );
  const root = resolve("dist/web");
  if (existsSync(root)) {
    await app.register(staticFiles, {
      root,
      prefix: "/",
      setHeaders(res, path) {
        if (path.endsWith("sw.js") || path.endsWith("index.html"))
          res.header("Cache-Control", "no-cache");
      },
    });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith("/api/") || !["GET", "HEAD"].includes(req.method))
        return reply.code(404).send({ error: "Not found" });
      return reply.sendFile("index.html");
    });
  }
  return app;
}
