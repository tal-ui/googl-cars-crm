# v2 Backend Functions

Consolidates the legacy ~96 Deno functions and fixes the P0 security + P2
reliability findings (audit AUDIT.md §2, §4; ISSUES I-101…I-120). The shared
middleware in `_shared/` is the backbone every function uses.

## `_shared/` (the backbone)
| Module | Fixes | What it gives |
|--------|-------|---------------|
| `http.ts` | I-103, I-109 | allowlist CORS (no `*`), `json()`, request ids, structured `logLine()` (never logs bodies/headers) |
| `withHandler.ts` | I-109, error hygiene | wraps every function: preflight, logging, generic error body (detail to logs only), no empty catches downstream |
| `verify.ts` | I-102, I-103, I-105, I-106 | `verifyTelegram` (secret token), `verifyMetaSignature` (HMAC), `verifyGreenApi` (secret+IP), `verifyApiKey` (scoped, fail-closed), constant-time compare |
| `idempotency.ts` | I-013 | dedupe inbound by provider message id; generic `runOnce` guard |
| `scheduler.ts` | I-115, I-116, I-119 | `runBatch` (per-item try/catch, never batch-fatal), `dueWithinWindow` (range + catch-up, not exact-day), `notifiedRecently`/ledger, `heartbeat` |

## Consolidation map (legacy → v2)
- **4 WhatsApp inbound handlers** (`whatsappWebhook`, `greenApiWebhook`,
  `receiveWhatsAppWebhook`, `whatsappBusinessWebhook`) → **one** `whatsappWebhook`
  (signature-verified, idempotent, single canonical write path).
- **`telegramWebhook`** (1,373-line god fn) → secured `entry.ts` + `router.ts` +
  per-command handlers + shared `telegramClient` (secret-token required, per-user
  Employee authorization). Entry is done; router/handlers are the next slice.
- **`api`** (full CRUD+DELETE+backup, one shared key) → scoped, default-deny,
  no-DELETE, no-backup `api` with `API_KEY_INTEGRATIONS`; backup moves to a
  separate admin-authed function; `openclawWebhook` gets its own key.
- **~11 backup/export variants** → **1 data backup + 1 code backup** (admin-authed).
- **Debug/test in prod** (`debugFunctionPaths`, `debugTelegramBot`,
  `debugWhatsAppWebhook`, `testGreenApiWebhook`, `sendTestTelegramMessage`) →
  **deleted** (or admin-gated dev-only).
- **Schedulers** (`checkCashFlowReminders`, `checkVehicleCertificates`,
  `checkStuckVehicles`, `autoPaymentReminders`, `sendMonthlyExpenseReminders`,
  `checkExpenseBudgetAlerts`) → rebuilt on `scheduler.ts` (ledger + range + batch
  isolation + heartbeat); the two admin-gated ones lose the `auth.me()` gate so
  they can run headless.
- **`setupTelegramWebhook`/`setupGreenApiWebhook`** → admin-gated, never accept a
  caller-supplied URL (built from `BASE44_APP_URL`).

## Status (this slice)
Done: `_shared/*`, secured `api/entry.ts`, consolidated `whatsappWebhook/entry.ts`,
secured `telegramWebhook/entry.ts`, `docs/ENV.md`. Pure logic self-tested
(`_shared/_selftest.mjs`). Remaining: the Telegram router/handlers, scheduler
rewrites on top of `scheduler.ts`, the single backup fn, and porting the Google
integrations behind `withHandler`. These follow the same patterns and touch no
live app until Phase 5.
