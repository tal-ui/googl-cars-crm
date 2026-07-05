/**
 * withHandler — the wrapper every v2 function uses (audit "withHandler wrapper"
 * item). Provides: preflight/CORS, a per-request id, structured logging, and a
 * single place that converts thrown errors into a GENERIC client response while
 * logging the detail server-side (fixes I-109 stack/message leakage). No empty
 * catches anywhere downstream — throw and let this handle it.
 */
import { corsHeaders, json, logLine, requestId } from "./http.ts";

export interface Ctx {
  req: Request;
  origin: string | null;
  requestId: string;
  url: URL;
}

export function withHandler(
  fnName: string,
  handler: (ctx: Ctx) => Promise<Response>,
): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    const origin = req.headers.get("origin");
    const rid = requestId();

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    const started = Date.now();
    try {
      const res = await handler({ req, origin, requestId: rid, url: new URL(req.url) });
      logLine({ fn: fnName, request_id: rid, status: res.status, ms: Date.now() - started });
      return res;
    } catch (err) {
      // Detail to server logs ONLY; generic body to the client.
      logLine({
        fn: fnName,
        request_id: rid,
        level: "error",
        error: String(err),
        ms: Date.now() - started,
      });
      return json({ error: "internal error", request_id: rid }, 500, origin);
    }
  };
}
