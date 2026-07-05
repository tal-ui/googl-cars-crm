/**
 * Webhook authentication — fixes the P0 "unauthenticated mutating webhooks"
 * (audit I-102, I-103, I-105, I-106). Every inbound webhook must pass one of
 * these BEFORE any entity access. All checks fail closed: a missing env secret
 * means reject, never allow.
 */

/** Constant-time string compare (avoids timing oracles on secret comparison). */
export function timingSafeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ eb[i];
  return diff === 0;
}

/** Telegram: verify the X-Telegram-Bot-Api-Secret-Token header set at registration. */
export function verifyTelegram(req: Request): boolean {
  const expected = Deno.env.get("TELEGRAM_WEBHOOK_SECRET");
  if (!expected) return false; // fail closed
  const got = req.headers.get("x-telegram-bot-api-secret-token");
  return !!got && timingSafeEqual(got, expected);
}

/** Meta WhatsApp Cloud: verify X-Hub-Signature-256 = sha256=HMAC(app_secret, rawBody). */
export async function verifyMetaSignature(
  rawBody: string,
  header: string | null,
): Promise<boolean> {
  const secret = Deno.env.get("META_APP_SECRET");
  if (!secret || !header) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(rawBody),
  );
  const hex = "sha256=" +
    [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return timingSafeEqual(hex, header);
}

/**
 * GreenAPI can't sign, so gate on a shared secret carried in the webhook URL
 * (?whs=) or a header, plus an optional egress-IP allowlist.
 */
export function verifyGreenApi(req: Request): boolean {
  const expected = Deno.env.get("GREENAPI_WEBHOOK_SECRET");
  if (!expected) return false; // fail closed
  const url = new URL(req.url);
  const got = url.searchParams.get("whs") ?? req.headers.get("x-webhook-secret") ?? "";
  if (!timingSafeEqual(got, expected)) return false;

  const allow = (Deno.env.get("GREENAPI_ALLOWED_IPS") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (allow.length) {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
    if (!allow.includes(ip)) return false;
  }
  return true;
}

/**
 * Static API-key check for machine endpoints. REQUIRES the env key to be set
 * (fail closed) — replaces the legacy `if (key && ...)` opt-in-open pattern
 * (I-106). Pass the specific env var name per consumer so keys are scoped/split
 * (I-104): e.g. verifyApiKey(req, 'API_KEY_INTEGRATIONS').
 */
export function verifyApiKey(req: Request, envName: string): boolean {
  const expected = Deno.env.get(envName);
  if (!expected) return false;
  const got = req.headers.get("x-api-key") ?? "";
  return timingSafeEqual(got, expected);
}
