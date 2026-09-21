import {
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";

/**
 * Better Canvas sign-in sessions that survive server restarts.
 *
 * Render's free plan sleeps and restarts the server, which used to wipe an
 * in-memory session list and force the passphrase again. Instead, the cookie
 * now carries its own proof: a random session id and an expiry time, signed
 * with HMAC-SHA256 using a key derived from APP_PASSWORD (plus APP_SECRET when
 * set). Any restart can verify it without remembering anything. Changing the
 * passphrase or secret changes the key, which signs every device out.
 *
 * Signing out adds the id to an in-memory revocation list and deletes the
 * cookie from the browser. The list does not survive a restart, so a copied
 * cookie would work again after one, until it expires; the browser that
 * signed out no longer has it.
 */
export const sessionAge = 30 * 24 * 60 * 60 * 1000;
/** Refresh the cookie's expiry at most once a day while the app is used. */
const renewAfter = 24 * 60 * 60 * 1000;
const maxRevoked = 10000;

export type Session = { id: string; expires: number };

export class SessionStore {
  private key: Buffer;
  private revoked = new Map<string, number>();

  constructor(password: string, secret?: string) {
    this.key = scryptSync(
      `${secret ?? ""}\u0000${password}`,
      "bettercanvas:session:v1",
      32,
    );
  }

  private mac(body: string) {
    return createHmac("sha256", this.key).update(body).digest();
  }

  /** Creates a token for a new session, or a renewed one for an existing id. */
  issue(id = randomBytes(18).toString("base64url"), now = Date.now()) {
    const expires = now + sessionAge;
    const body = `${id}.${expires}`;
    return {
      session: { id, expires },
      token: `${body}.${this.mac(body).toString("base64url")}`,
    };
  }

  /** Returns the session for a genuine, unexpired, signed-in token. */
  verify(token: string | undefined, now = Date.now()): Session | null {
    if (!token || token.length > 200) return null;
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [id, exp, mac] = parts;
    const expires = Number(exp);
    if (!/^[\w-]{16,64}$/.test(id) || !Number.isSafeInteger(expires))
      return null;
    const given = Buffer.from(mac, "base64url"),
      expected = this.mac(`${id}.${exp}`);
    if (given.length !== expected.length || !timingSafeEqual(given, expected))
      return null;
    if (expires <= now || expires > now + sessionAge + 60000) return null;
    if (this.revoked.has(id)) return null;
    return { id, expires };
  }

  /** True when the cookie should be refreshed to keep the user signed in. */
  shouldRenew(session: Session, now = Date.now()) {
    return session.expires - now < sessionAge - renewAfter;
  }

  revoke(session: Session, now = Date.now()) {
    for (const [id, expires] of this.revoked)
      if (expires <= now) this.revoked.delete(id);
    if (this.revoked.size >= maxRevoked)
      this.revoked.delete(this.revoked.keys().next().value!);
    this.revoked.set(session.id, session.expires);
  }

  isRevoked(id: string) {
    return this.revoked.has(id);
  }
}
