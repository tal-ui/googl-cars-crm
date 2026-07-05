# SECURITY-HOTFIX.md — Live-exploitable P0 remediations

> **Status: NOT APPLIED to the live app.** This document specifies fixes that can
> be applied to the live Base44 app (`68443d2c8f84772d77908ebe`) **ahead of** the
> full v2 rebuild, because the issues are exploitable today. Applying any of these
> to the live app is an outward-facing change and requires **explicit owner
> authorization**. When authorized, take a `create_checkpoint` first and apply in
> the order below, re-pointing webhooks last.

These map to `audit/ISSUES.md` I-101…I-106, I-109 and are additive/defensive —
none change business behavior for legitimate users when configured correctly.

---

## HF-1 — Rotate & remove the hardcoded agent API key (I-101)

**File:** `base44/functions/whatsappWebhook/entry.ts:37`
**Now:** `const bosiApiKey = Deno.env.get('bosi_api') || '<32-hex-literal>'`
**Fix:**
1. In the Base44 dashboard, **rotate** the Bosi agent key (the committed one is
   compromised by definition).
2. Set the new value as env var `bosi_api`.
3. Replace the line with a fail-closed read:
   ```ts
   const bosiApiKey = Deno.env.get('bosi_api');
   if (!bosiApiKey) return json({ error: 'not configured' }, 500);
   ```
   (No literal fallback, ever.)

## HF-2 — Verify webhook provider signatures (I-102, I-103)

Add a shared verifier and call it at the top of each webhook, rejecting on failure
**before** any entity access.

- **Telegram** (`telegramWebhook`, `setupTelegramWebhook` when it registers):
  set a secret token when registering the webhook, then require header
  `X-Telegram-Bot-Api-Secret-Token === Deno.env.get('TELEGRAM_WEBHOOK_SECRET')`.
- **Meta WhatsApp Cloud** (`whatsappBusinessWebhook` POST): verify
  `X-Hub-Signature-256` = `sha256=HMAC(app_secret, rawBody)` (constant-time compare).
- **GreenAPI** (`whatsappWebhook`, `greenApiWebhook`, `receiveWhatsAppWebhook`):
  GreenAPI can't sign, so gate with a shared secret in the webhook URL path/query
  (`?whs=<GREENAPI_WEBHOOK_SECRET>`) **and** an allowlist of GreenAPI egress IPs.

Reference skeleton (`_shared/verify.ts`):
```ts
export async function verifyMetaSignature(raw: string, header: string|null, secret: string) {
  if (!header) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw));
  const hex = 'sha256=' + [...new Uint8Array(mac)].map(b => b.toString(16).padStart(2,'0')).join('');
  return timingSafeEqual(hex, header);
}
```
Keep processing **idempotent** by provider message-id so a rejected-then-retried
delivery can't double-post.

## HF-3 — Lock down the `api` super-endpoint (I-104)

**File:** `base44/functions/api/entry.ts`
1. Stop reusing one key across `api` and `openclawWebhook` — issue a **separate**
   key per consumer (`API_KEY_INTEGRATIONS`, `API_KEY_OPENCLAW`).
2. **Remove DELETE and full-backup** from this general endpoint (move backup to a
   single admin-authenticated function).
3. Scope each key to the entities+methods it actually needs (an allowlist map),
   default-deny everything else.
4. Rate-limit and log every call with a request id (no payload bodies in logs).

## HF-4 — Delete or auth-gate debug/setup functions (I-105)

- **Delete from prod:** `debugFunctionPaths`, `debugTelegramBot`,
  `debugWhatsAppWebhook`, `testGreenApiWebhook`, `sendTestTelegramMessage`.
- **Auth-gate** `setupTelegramWebhook` / `setupGreenApiWebhook` behind
  `auth.me().role==='admin'` and never accept a caller-supplied webhook URL — build
  it from `BASE44_APP_URL` + a fixed path.

## HF-5 — Make opt-in auth fail closed (I-106)

**Files:** `receiveCustomerData`, `getVehicleDetails`, `getInventory`.
Change `if (expectedKey && provided !== expectedKey) reject` to **require** the key:
```ts
const expected = Deno.env.get('WEBHOOK_API_KEY');
if (!expected || provided !== expected) return json({ error: 'unauthorized' }, 401);
```
(For the intentionally-public catalog endpoints `getInventory`/`getVehicleDetails`,
if public access is desired, keep them public but strip to `show_on_website` data
only and remove any write path — do not leave them "auth if configured".)

## HF-6 — Stop leaking errors (I-109)

Replace `return json({ error: error.message /* or error.stack */ }, 500)` with a
generic client message + server-side structured log:
```ts
console.error(JSON.stringify({ fn: 'name', request_id, msg: String(error) }));
return json({ error: 'internal error', request_id }, 500);
```
Remove `stack` from every response and stop logging full request headers /
message bodies (`receiveCustomerData`).

---

## Suggested apply order (once authorized)

1. `create_checkpoint` on the live app (`pre-hotfix-YYYYMMDD`).
2. Set/rotate env vars (HF-1, HF-2 secrets, HF-3 split keys, HF-5 keys).
3. Deploy the verifier + fail-closed checks (HF-2, HF-5, HF-6) — these only *add*
   rejection paths, safe for legitimate traffic already sending the right secret.
4. Deploy the `api` scoping (HF-3) and delete debug/setup functions (HF-4).
5. **Re-register** the Telegram/Meta webhooks with their new secrets **last**, then
   smoke-test each provider end-to-end (send a real message, confirm it processes;
   send a forged one, confirm 401/403).
6. Roll back by restoring the checkpoint if any legitimate flow breaks.

**Note on staged code:** ready-to-apply patched versions of these functions will
be produced under `base44-crm-v2/functions/` during Phase 3 so the hotfix and the
v2 backend share one implementation. Until the owner authorizes touching the live
app, nothing here is deployed.
