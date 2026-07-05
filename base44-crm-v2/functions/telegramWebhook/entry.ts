/**
 * telegramWebhook — v2 SECURED entrypoint.
 *
 * The legacy version was a 1,373-line god function whose only "auth" was
 * chatId===TELEGRAM_CHAT_ID || chat.type==='private', so anyone who DMed the bot
 * reached full service-role mutate flows (audit I-102, telegramWebhook deep-dive).
 *
 * v2:
 *  - REQUIRES the Telegram secret-token header (set at webhook registration) —
 *    fail closed. This is the security fix; nothing else runs without it.
 *  - Adds a per-user authorization gate: the sender's Telegram id must map to a
 *    known active Employee (telegram_chat_id) — not merely "is a private chat".
 *  - Delegates to a router module (handlers split out of the god function). The
 *    router + command handlers + a shared telegram-client are built during full
 *    Phase 3; this file is the secured shell they plug into.
 */
import { withHandler } from "../_shared/withHandler.ts";
import { json, logLine } from "../_shared/http.ts";
import { verifyTelegram } from "../_shared/verify.ts";

export default withHandler("telegramWebhook", async ({ req, origin, requestId }) => {
  // Telegram always returns 200 to avoid provider retries, BUT unauthenticated
  // callers get nothing done. Verify the secret token first (fail closed).
  if (!verifyTelegram(req)) {
    logLine({ fn: "telegramWebhook", request_id: requestId, denied: "bad secret token" });
    return json({ ok: true }, 200, origin); // 200 so a probing attacker learns nothing
  }

  const update = await req.json().catch(() => null);
  if (!update) return json({ ok: true }, 200, origin);

  const { createClientFromRequest } = await import("@base44/sdk");
  const base44 = createClientFromRequest(req);
  const svc = base44.asServiceRole.entities;

  // Per-user authorization: sender must be a known active Employee.
  const fromId = String(
    update?.message?.from?.id ?? update?.callback_query?.from?.id ?? "",
  );
  const employees = fromId
    ? await svc.Employee.filter({ telegram_chat_id: fromId, is_active: true }, "-created_date", 1)
    : [];
  if (!employees.length) {
    logLine({ fn: "telegramWebhook", request_id: requestId, denied: "unknown telegram user" });
    return json({ ok: true }, 200, origin); // silently ignore non-staff
  }

  // Authorized. Hand off to the router (built in full Phase 3):
  //   const { route } = await import("./router.ts");
  //   await route({ update, base44, employee: employees[0] });
  logLine({ fn: "telegramWebhook", request_id: requestId, authorized: true });
  return json({ ok: true }, 200, origin);
});
