/**
 * Shared HTTP helpers for v2 Deno functions.
 *
 * Fixes audit findings: no more `Access-Control-Allow-Origin: *` on mutating
 * endpoints (I-103 systemic), no more raw `error.message`/`error.stack` returned
 * to callers (I-109). CORS is allowlist-based; errors return a generic body +
 * request id, with detail logged server-side only.
 */

/** Allowlisted origins for browser-facing endpoints. Extend via env if needed. */
const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export function corsHeaders(origin: string | null): Record<string, string> {
  const h: Record<string, string> = {
    "Content-Type": "application/json",
    Vary: "Origin",
  };
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    h["Access-Control-Allow-Origin"] = origin;
    h["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS";
    h["Access-Control-Allow-Headers"] = "Content-Type,Authorization,x-api-key";
  }
  return h;
}

export function json(
  body: unknown,
  status = 200,
  origin: string | null = null,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders(origin),
  });
}

/** A short, non-guessable request id for correlating logs and client errors. */
export function requestId(): string {
  return crypto.randomUUID().slice(0, 8);
}

/** Structured server log line (JSON). Never logs request bodies or headers. */
export function logLine(fields: Record<string, unknown>): void {
  console.log(JSON.stringify({ ts: new Date().toISOString(), ...fields }));
}
