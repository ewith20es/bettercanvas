import "dotenv/config";
import { buildApp } from "./app";

const production = process.env.NODE_ENV === "production";
const canvasOrigin = (
  process.env.CANVAS_BASE_URL ?? "https://mcpsmd.instructure.com"
).replace(/\/$/, "");
if (canvasOrigin !== "https://mcpsmd.instructure.com")
  throw new Error(
    "This personal app is configured only for https://mcpsmd.instructure.com.",
  );
const app = await buildApp({
  production,
  canvasOrigin,
  token: process.env.CANVAS_ACCESS_TOKEN,
  password: process.env.APP_PASSWORD,
  // GRADEBOOK_SECRET is the earlier name for APP_SECRET and still works.
  secret: process.env.APP_SECRET || process.env.GRADEBOOK_SECRET,
  studentvueRelay: process.env.STUDENTVUE_PROXY_PROVIDER === "private" ? {
    url: process.env.STUDENTVUE_RELAY_URL,
    token: process.env.STUDENTVUE_RELAY_TOKEN,
  } : { provider: "gradedurian" },
  origin:
    process.env.APP_ORIGIN ||
    process.env.RENDER_EXTERNAL_URL ||
    "http://127.0.0.1:5173",
});
const address = await app.listen({
  port: Number(process.env.PORT ?? 3001),
  host: production ? "0.0.0.0" : "127.0.0.1",
});
console.log(
  `Better Canvas API ready at ${address} (${process.env.CANVAS_ACCESS_TOKEN ? "Canvas" : "demo"} mode).`,
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, async () => {
    await app.close();
    process.exit(0);
  });
