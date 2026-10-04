import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";

/**
 * "Keep me signed in" for StudentVUE.
 *
 * The mobile API returns a bearer token held only in server memory. To sign
 * in again after the one-hour connection ends (or after Render restarts the
 * server), the credentials are sealed with AES-256-GCM using a key that only
 * the server knows and handed to the browser as an httpOnly cookie.
 * Page JavaScript cannot read the cookie, the browser only sends it to
 * /api/gradebook, and it is useless without a signed-in app session, because
 * every gradebook route already requires one.
 */
export const rememberCookie = "bc_gradebook";
export const rememberPath = "/api/gradebook";
export const rememberAge = 30 * 24 * 60 * 60 * 1000;
const version = 1;

export type RememberedLogin = { username: string; password: string };

/**
 * The key must survive restarts, so it comes from configuration rather than
 * randomness. A dedicated GRADEBOOK_SECRET is preferred; otherwise it is
 * derived from APP_PASSWORD (changing either signs remembered devices out).
 */
export function rememberKey(secret?: string, appPassword?: string) {
  if (secret && secret.length >= 32)
    return scryptSync(secret, "bettercanvas:gradebook-secret:v1", 32);
  if (appPassword && appPassword.length >= 8)
    return scryptSync(appPassword, "bettercanvas:gradebook-remember:v1", 32);
  return null;
}

export function seal(key: Buffer, login: RememberedLogin, now = Date.now()) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([
    cipher.update(
      JSON.stringify({
        v: version,
        u: login.username,
        p: login.password,
        t: now,
      }),
      "utf8",
    ),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), body]
    .map((part) => part.toString("base64url"))
    .join(".");
}

/** Returns null for anything tampered, sealed with another key, or too old. */
export function unseal(
  key: Buffer,
  value: string | undefined,
  now = Date.now(),
): RememberedLogin | null {
  if (!value || value.length > 4096) return null;
  const parts = value.split(".");
  if (parts.length !== 3) return null;
  try {
    const [iv, tag, body] = parts.map((p) => Buffer.from(p, "base64url"));
    if (iv.length !== 12 || tag.length !== 16) return null;
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const data = JSON.parse(
      Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8"),
    ) as { v?: unknown; u?: unknown; p?: unknown; t?: unknown };
    if (
      data.v !== version ||
      typeof data.u !== "string" ||
      typeof data.p !== "string" ||
      !data.u ||
      !data.p ||
      typeof data.t !== "number" ||
      now - data.t > rememberAge ||
      data.t > now + 60000
    )
      return null;
    return { username: data.u, password: data.p };
  } catch {
    return null;
  }
}
