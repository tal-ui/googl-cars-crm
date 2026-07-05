/**
 * whatsappWebhook — v2 CONSOLIDATED inbound WhatsApp handler.
 *
 * Replaces the FOUR overlapping legacy handlers (whatsappWebhook, greenApiWebhook,
 * receiveWhatsAppWebhook, whatsappBusinessWebhook) — audit I-129 — with one
 * entrypoint that:
 *  - verifies the provider signature BEFORE any work (I-103): Meta HMAC for the
 *    Cloud API path, shared-secret+IP gate for GreenAPI;
 *  - is idempotent by provider message id (I-013) so retries don't double-post;
 *  - writes ONE canonical snake_case WhatsAppMessage row (I-005) — no legacy
 *    camelCase twins;
 *  - has NO hardcoded agent key (I-101) — the agent key is read from env, fail
 *    closed.
 *
 * Meta GET verification (hub.challenge) is handled with WHATSAPP_VERIFY_TOKEN.
 */
import { withHandler } from "../_shared/withHandler.ts";
import { json } from "../_shared/http.ts";
import { verifyGreenApi, verifyMetaSignature } from "../_shared/verify.ts";
import { alreadyProcessedMessage } from "../_shared/idempotency.ts";

type Provider = "meta" | "greenapi";

function detectProvider(url: URL, body: unknown): Provider {
  if (url.searchParams.get("provider") === "greenapi") return "greenapi";
  // Meta payloads carry an "object":"whatsapp_business_account"
  if (body && typeof body === "object" && (body as Record<string, unknown>).object === "whatsapp_business_account") {
    return "meta";
  }
  return "greenapi";
}

export default withHandler("whatsappWebhook", async ({ req, origin, url }) => {
  // Meta subscription handshake (GET).
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && token && token === Deno.env.get("WHATSAPP_VERIFY_TOKEN")) {
      return new Response(challenge ?? "", { status: 200 });
    }
    return json({ error: "verification failed" }, 403, origin);
  }

  const raw = await req.text();
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: "bad payload" }, 400, origin);
  }

  const provider = detectProvider(url, body);

  // --- signature verification (fail closed) ---
  if (provider === "meta") {
    const ok = await verifyMetaSignature(raw, req.headers.get("x-hub-signature-256"));
    if (!ok) return json({ error: "bad signature" }, 401, origin);
  } else {
    if (!verifyGreenApi(req)) return json({ error: "unauthorized" }, 401, origin);
  }

  const { createClientFromRequest } = await import("@base44/sdk");
  const base44 = createClientFromRequest(req);
  const svc = base44.asServiceRole.entities;

  const normalized = normalizeInbound(provider, body);
  if (!normalized) return json({ ok: true, ignored: true }, 200, origin); // status callbacks etc.

  // idempotency by provider message id
  if (await alreadyProcessedMessage(svc.WhatsAppMessage, normalized.message_id)) {
    return json({ ok: true, duplicate: true }, 200, origin);
  }

  await svc.WhatsAppMessage.create({
    phone: normalized.phone,
    direction: "incoming",
    message_text: normalized.message_text, // canonical field only
    customer_phone: normalized.phone,
    media_url: normalized.media_url,
    media_type: normalized.media_type,
    message_id: normalized.message_id,
    is_read: false,
  });

  // (Optional) hand off to the employee_assistant agent here, using an agent key
  // read from env — NEVER a hardcoded literal:
  //   const agentKey = Deno.env.get("BOSI_API"); if (!agentKey) return json(...500)
  // Deliberately omitted from the interim skeleton; wired during full Phase 3.

  return json({ ok: true }, 200, origin);
});

interface Normalized {
  phone: string;
  message_text: string;
  message_id: string;
  media_url?: string;
  media_type?: string;
}

/** Map either provider's payload to the canonical shape. Returns null to ignore. */
function normalizeInbound(provider: Provider, body: unknown): Normalized | null {
  const b = body as Record<string, any>;
  try {
    if (provider === "meta") {
      const msg = b?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
      if (!msg) return null;
      return {
        phone: String(msg.from ?? ""),
        message_text: msg.text?.body ?? "",
        message_id: String(msg.id ?? ""),
        media_type: msg.type !== "text" ? msg.type : undefined,
      };
    }
    // GreenAPI
    const data = b?.messageData ?? b;
    const id = b?.idMessage ?? data?.idMessage;
    if (!id) return null;
    return {
      phone: String(b?.senderData?.sender ?? "").replace(/@c\.us$/, ""),
      message_text: data?.textMessageData?.textMessage ?? data?.extendedTextMessageData?.text ?? "",
      message_id: String(id),
    };
  } catch {
    return null;
  }
}
