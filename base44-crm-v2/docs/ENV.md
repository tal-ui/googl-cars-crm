# ENV.md — v2 backend environment variables

Every secret is read via `Deno.env.get(...)` and **fails closed** if unset (no
literal fallbacks — fixes the hardcoded agent key, audit I-101). Any value that
was ever hardcoded in the legacy source is considered compromised and **must be
rotated** when v2 deploys.

## Required

| Var | Used by | Purpose |
|-----|---------|---------|
| `TELEGRAM_BOT_TOKEN` | telegram send/webhook | Bot API token |
| `TELEGRAM_WEBHOOK_SECRET` | telegramWebhook, setupTelegramWebhook | Secret-token header set at webhook registration; verified on every update |
| `TELEGRAM_CHAT_ID` | notifications | Default ops chat |
| `META_APP_SECRET` | whatsappWebhook (Meta path) | HMAC key for `X-Hub-Signature-256` verification |
| `WHATSAPP_VERIFY_TOKEN` | whatsappWebhook GET | Meta subscription handshake |
| `GREENAPI_INSTANCE_ID`, `GREENAPI_API_TOKEN` | whatsapp send | GreenAPI credentials |
| `GREENAPI_WEBHOOK_SECRET` | whatsappWebhook (GreenAPI path) | Shared secret in `?whs=` / header |
| `GREENAPI_ALLOWED_IPS` | whatsappWebhook (optional) | Comma-list egress IP allowlist |
| `BOSI_API` | whatsappWebhook agent handoff | employee_assistant agent key (**was hardcoded** — rotate) |
| `API_KEY_INTEGRATIONS` | api | Scoped machine key (CRUD-limited, no DELETE/backup) |
| `API_KEY_OPENCLAW` | openclawWebhook | Separate key (split from `api` — I-104) |
| `WEBHOOK_API_KEY` | receiveCustomerData | Mandatory now (fail closed — I-106) |
| `INVENTORY_API_KEY` | getInventory/getVehicleDetails | Mandatory if these stay non-public |
| `EMAIL_WEBHOOK_SECRET` | processInvoiceEmail | Move from query string to header |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | gmail/drive/calendar/contacts | OAuth |
| `GEMINI_API_KEY` | OCR / LLM extraction | Gemini |
| `GOOGLE_SHEETS_API_KEY` | sheet sync | Sheets |
| `ALLOWED_ORIGINS` | _shared/http | CORS allowlist (replaces `*` on mutating endpoints) |
| `BASE44_APP_ID`, `BASE44_APP_URL` | multiple | App identity |

## Removed / no longer allowed
- Any hardcoded API key, bot token, admin email, ops phone (`0549666666`), or
  office geofence literal. Admin recipients come from a settings entity, not
  duplicated across functions.

## Rotation checklist (Phase 5)
Rotate `BOSI_API` (was in source), and regenerate `API_KEY_INTEGRATIONS` /
`API_KEY_OPENCLAW` so the old shared `api_key` is dead. Re-register Telegram &
Meta webhooks with their new secrets **last**, then smoke-test each provider.
