const DISTRICT =
  "https://md-mcps-psv.edupoint.com/Service/PXPCommunication.asmx";
const OPERATION = "ProcessWebServiceRequestMultiWeb";
const MAX_REQUEST_BYTES = 64 * 1024;
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
type Env = { RELAY_TOKEN?: string };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });

async function readBounded(
  body: ReadableStream<Uint8Array> | null,
  limit: number,
) {
  if (!body) return "";
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new RangeError("Body too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (request.method === "GET" && pathname === "/health")
      return json(
        { ok: !!env.RELAY_TOKEN, service: "studentvue-relay" },
        env.RELAY_TOKEN ? 200 : 503,
      );
    if (request.method !== "POST" || pathname !== "/fulfillAxios")
      return json({ status: false, message: "not found" }, 404);
    if (
      !env.RELAY_TOKEN ||
      request.headers.get("authorization") !== `Bearer ${env.RELAY_TOKEN}`
    )
      return json({ status: false, message: "unauthorized" }, 401);
    if (Number(request.headers.get("content-length") ?? 0) > MAX_REQUEST_BYTES)
      return json({ status: false, message: "request too large" }, 413);
    let body;
    try {
      body = JSON.parse(await readBounded(request.body, MAX_REQUEST_BYTES));
    } catch (error) {
      return json(
        { status: false, message: "invalid request" },
        error instanceof RangeError ? 413 : 400,
      );
    }
    // Fixed destination and read-only methods; never log credentials or XML.
    if (
      body?.url !== DISTRICT ||
      body?.encrypted !== false ||
      typeof body?.xml !== "string" ||
      !/<ProcessWebServiceRequestMultiWeb\s/.test(body.xml) ||
      !/<methodName>(Gradebook|StudentClassList)<\/methodName>/.test(
        body.xml,
      ) ||
      /<!\s*(?:DOCTYPE|ENTITY)/i.test(body.xml)
    )
      return json({ status: false, message: "invalid request" }, 400);
    try {
      const upstream = await fetch(DISTRICT, {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(20000),
        headers: {
          "content-type": "text/xml; charset=utf-8",
          soapaction: `"http://edupoint.com/webservices/${OPERATION}"`,
        },
        body: body.xml,
      });
      if (!upstream.ok) {
        await upstream.body?.cancel();
        return json({ status: false, message: "upstream unavailable" }, 502);
      }
      return json({
        status: true,
        response: await readBounded(upstream.body, MAX_RESPONSE_BYTES),
      });
    } catch {
      return json({ status: false, message: "upstream unavailable" }, 502);
    }
  },
};
