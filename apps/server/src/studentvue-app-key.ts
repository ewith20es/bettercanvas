import { SynergyError } from "./synergy";

// Public app compatibility value, not a student's session token. Protocol evidence:
// https://github.com/Zillorz/svue-api/pull/2 and src/main.rs at cb488e6.
const keyUrl = "https://axum-svue.fly.dev/akey";
const maxBytes = 256;
const unavailable = () => new SynergyError(
  "StudentVUE's mobile connection setup is temporarily unavailable. Please try again shortly.",
  503,
);

export function createStudentVueAppKeyProvider(
  request: typeof fetch = (...args) => fetch(...args),
) {
  return async (signal: AbortSignal): Promise<string> => {
    signal.throwIfAborted();
    try {
      // Never attach credentials, cookies, district, user IDs, or a request body.
      const response = await request(keyUrl, {
        method: "GET",
        credentials: "omit",
        redirect: "manual",
        signal: AbortSignal.any([signal, AbortSignal.timeout(8_000)]),
        headers: { Accept: "text/plain" },
      });
      if (!response.ok || !response.body ||
          Number(response.headers.get("content-length")) > maxBytes) {
        await response.body?.cancel();
        throw unavailable();
      }
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          signal.throwIfAborted();
          const { done, value } = await reader.read();
          signal.throwIfAborted();
          if (done) break;
          size += value.byteLength;
          if (size > maxBytes) {
            await reader.cancel();
            throw unavailable();
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }
      const value = Buffer.concat(chunks).toString("utf8").trim();
      // Observed public response is 64 base64 characters. Reject error pages,
      // header injection, and unexpected shapes instead of forwarding them.
      if (!/^[A-Za-z0-9+/]{64}$/.test(value)) throw unavailable();
      signal.throwIfAborted();
      // The upstream reference refreshes per request; no key lifetime is published.
      return value;
    } catch {
      signal.throwIfAborted();
      throw unavailable();
    }
  };
}

export const getStudentVueAppKey = createStudentVueAppKeyProvider();
