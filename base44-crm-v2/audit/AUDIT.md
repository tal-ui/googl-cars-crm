# AUDIT.md — Googl Cars CRM (Base44 app `68443d2c8f84772d77908ebe`)

Phase 0 consolidated audit. Read-only inspection of the live app on 2026-07-05.
Evidence is `file:line` against the sandbox HEAD at audit time. No PII (names,
phones, ID numbers, GPS coordinates, VINs) is reproduced here — only structure,
counts, and locations. Secret **values** are never printed; only their location
and type.

Companion documents: `ISSUES.md` (ranked defect register), `PROCESS-MAP.md`
(business-operations map), `schemas/entity-schemas.snapshot.json` (verbatim
entity schemas).

---

## 1. Architecture at a glance

| Layer | Shape |
|-------|-------|
| Frontend | React + Vite + Tailwind + shadcn/ui, RTL Hebrew. **37 pages** (`src/pages/`), **~130 components** (`src/components/`). |
| Biggest UI files | `components/vehicles/VehicleViewDialog.jsx` **135 KB**, `components/vehicles/VehicleForm.jsx` **121 KB / 1,955 lines**, `components/contracts/UsedCarContractDialog.jsx` 92 KB, `ImportContractDialog.jsx` 92 KB, `pages/Dashboard.jsx` 88 KB, `pages/Vehicles.jsx` 57 KB. |
| Data access | **No real data layer.** `src/api/entities.js` (9 lines) doesn't even export the entity models; pages call `base44.entities.<Model>.<op>()` directly. A partial react-query layer (`src/hooks/useCoreData.js`) is only half-adopted. SDK client created with `requiresAuth:false` (`src/api/base44Client.js:12`). |
| Backend | **~96 Deno functions** (`base44/functions/*/entry.ts`). Biggest: `telegramWebhook` **53 KB / 1,373 lines**, `exportFullCodeBackup` 17 KB, `generateOrderForm` 16 KB, `uploadDocumentToDrive` 14 KB, `sendDailyVehicleReport` 14 KB, `fullSystemBackup` 13 KB, `checkTaskReminders` 13 KB, `api` 12 KB. |
| Data model | **25 entities** (`base44/entities/*.jsonc`). `Car` is a ~90-field god entity. |
| Connectors | Gmail, Google Drive, Google Calendar (`base44/connectors/*.jsonc`). |
| AI agent | `employee_assistant` (`base44/agents/employee_assistant.jsonc`) — WhatsApp/Telegram assistant with entity CRUD + `createCarPayment` + `updateCarById`. |
| SDK versions | **4 different `@base44/sdk` versions** in use across functions (0.8.6 / 0.8.23 / 0.8.25 / 0.8.31). |
| Scale | ~200+ Car records, active daily attendance, live customer WhatsApp broadcasts, dozens of expenses. A real production business system. |

---

## 2. Security posture (the headline)

**Enforcement is overwhelmingly client-side.** Only two entities carry RLS
(`Invoice`, `Order`), and both use `auth.role() IN (...)` syntax that does not
match Base44's documented `user_condition` / `{{user.role}}` template style —
so those rules likely evaluate to silently allow/deny rather than the intended
gate. Every other access control is a UI affordance (hidden buttons), not a
server rule.

### 2.1 Live-exploitable now (P0)

1. **Hardcoded live Base44 agent API key** — `whatsappWebhook/entry.ts:37` reads
   `Deno.env.get('bosi_api') || '<32-hex-key literal>'`. A working credential is
   committed in source. Rotate + delete the fallback.
2. **Unauthenticated mutating webhooks running as service-role** (bypass all RLS):
   - `telegramWebhook` — "auth" is only `chatId===TELEGRAM_CHAT_ID || chat.type==='private'`. **Anyone who opens a private chat with the bot** reaches add-payment / add-customer / change-status / upload-document flows. No Telegram `secret_token` verification.
   - `whatsappWebhook`, `greenApiWebhook`, `receiveWhatsAppWebhook`, `whatsappBusinessWebhook` (POST) — no provider signature verification (`X-Hub-Signature-256` for Meta, secret token / IP gate for GreenAPI). Spoofable inbound messages; billable agent replies; customer creation.
3. **`api/entry.ts` = unrestricted CRUD + DELETE + full backup over every entity**
   behind a single static `x-api-key`, and **the same `api_key` is reused by
   `openclawWebhook`** — one key leak = total read/write/delete/exfiltration.
4. **`setupTelegramWebhook` unauthenticated** → repoints the bot webhook to a
   caller-supplied URL (**bot-webhook hijack**). **`debugFunctionPaths`
   unauthenticated** → probes filesystem, reads `/src/main.ts`, dumps `BASE44*`
   env. Several debug/test functions shipped to prod (`debugTelegramBot`,
   `debugWhatsAppWebhook`, `testGreenApiWebhook`, `sendTestTelegramMessage`).
5. **Opt-in auth that defaults open** — `receiveCustomerData` (`WEBHOOK_API_KEY`),
   `getVehicleDetails` / `getInventory` (`INVENTORY_API_KEY`) use `if (key && …)`,
   so a missing env var = wide open. Must fail closed.
6. **No route-level authorization in the frontend** — `App.jsx:46` renders every
   page for any authenticated user; `ProtectedRoute.jsx` exists but is **dead
   code**. `/Accounting`, `/DataBackup`, `/Settings`, `/PendingVehicles`
   (approval queue), `/CrmBulkUpdate`, `/VehiclesDebug`, `/VehicleFinance` are all
   URL-reachable regardless of role.
7. **Client self-asserts approval** — `VehicleForm.jsx:756` unconditionally sets
   `approval_status='approved'` with no role check; the pending path only exists
   because a different component (`LogisticsVehicleForm.jsx:187`) writes
   `'pending_approval'`. Approval routing depends on which form mounts, not on the
   server. Contract dialogs also self-approve (`ImportContractDialog.jsx:390`,
   `UsedCarContractDialog.jsx:377`).
8. **Sensitive data readable by any authenticated user** — no RLS on
   `AttendanceRecord`, `LocationTracking` (employee GPS every 2 min), `Expense`,
   `Payment`, `CashFlow`, `WhatsAppMessage`, `WhatsAppSession`, `TelegramCache`,
   `ContractArchive`.
9. **Secrets/PII embedded in source/bundle** — hardcoded superuser email allowlist
   (`PermissionGuard.jsx:6-9`), hardcoded ops phone (`0549666666`) in attendance +
   expense flows, a single hardcoded office geofence, and duplicated admin-email
   recipient lists across ~8 scheduler functions.

### 2.2 Information leakage

- `receiveCustomerData` and `debugTelegramBot` return `error.stack` to callers;
  the default pattern everywhere returns raw `error.message` to clients.
- `receiveCustomerData` logs all request headers (including any auth header);
  message bodies logged verbatim in several webhooks.
- `exportFullCodeBackup` exports full source (CORS `*`, no observed auth gate).

---

## 3. Data integrity

- **AttendanceRecord dual-schema drift (P1, causing real data loss today).**
  Writers disagree: `Attendance.jsx:120-146` writes both new (`checkInTime`,
  `status`) and legacy (`timestamp`, `type`, `location`); but `AttendanceCard.jsx:139,180`
  and `ManualAttendanceDialog.jsx:61-76` write **legacy only**. Readers filter on
  the new shape (`LiveTracking.jsx:103` `{status:'active'}`, `Attendance.jsx:55`
  `-checkInTime`, `AttendanceReportDialog.jsx:108`). Result: punches from the
  logistics card / manual dialog are **invisible in live tracking and reports**.
  `Attendance.jsx:214` already contains a read-time patch confirming the drift.
- **WhatsAppMessage** carries duplicate field pairs (`customerId`/`customer_id`,
  `customerName`/`customer_name`, `message`/`message_text`) and timestamp-vs-
  `created_date` drift. DB columns are consistently snake_case; the camelCase
  twins are function-argument naming — lower severity than Attendance but still
  schema clutter.
- **Embedded unbounded `history[]` on Car and Customer** — every save serializes a
  diff + snapshot of every field; client truncates to the last 20
  (`VehicleForm.jsx:733` `.slice(-20)`), so the audit trail is silently lossy and
  the row bloats.
- **Car cost fields are client-computed free text** — `total_cost` /
  `purchase_price_shekel` are text inputs parsed at save (`VehicleForm.jsx:648-663`);
  a separate `useEffect` (`:179-217`) recomputes an expense total on every
  keystroke depending on per-invoice currency casing. Concurrent editors →
  last-write-wins divergence. These are the fields the finance suite depends on,
  and they are **sparsely populated** on active cars.
- **Status enum reality** — code writes `"טרייד אין"` while the enum defines the
  misspelled `"טרייייד אין"`; real data contains out-of-enum values (`במלאי`,
  `הועבר לארכיון`); ~7 enum statuses are never used. The declared enum and the
  effective status set disagree.
- **Two divergent `AuthContext` implementations** (`src/lib/AuthContext.jsx` vs
  `src/components/auth/AuthContext.jsx`) — two `me()` calls, two user states;
  `PermissionGuard` reads a different provider than the router.

---

## 4. Backend reliability

- **Scheduler non-idempotency → notification storms.** `checkCashFlowReminders`,
  `checkVehicleCertificates`, `checkStuckVehicles`, `autoPaymentReminders` re-fire
  for overdue items on **every run** (condition includes `diff<0`) with no
  "already notified" ledger. Exact-day matching (`[7,3,0]`) also means a **missed
  scheduler day = reminder skipped entirely** (no catch-up).
- **Batch-fatal loops.** `checkCashFlowReminders`, `checkVehicleCertificates`,
  `sendMonthlyExpenseReminders`, `checkExpenseBudgetAlerts` don't wrap per-recipient
  `Notification.create`/`SendEmail` in try/catch — the first failure aborts the
  rest of the batch. The good pattern (`Promise.allSettled` + per-item try/catch,
  concurrency cap) already exists in `checkTaskReminders` and `sendDailyReminders`.
- **Schedulers gated behind `auth.me().role==='admin'`** — `checkExpenseBudgetAlerts`
  and `sendMonthlyExpenseReminders` return 403 without an admin user, so they
  **cannot run headless** from a platform scheduler; their "monthly reminder"
  intent is defeated.
- **`processScheduledBulkUpdates`** reloads up to 10,000 customers *inside* the
  per-update loop and can double-send on timeout (dedupe only if it finishes).
- **Error handling** — `telegramWebhook` swallows all errors and always returns
  200 (silent failures); empty `catch {}` in `notifyAccountingOnPayment`;
  swallowed `catch(_)` in `processScheduledBulkUpdates`; fire-and-forget
  notification sends throughout.
- **No scheduler/cron config in the repo** — trigger types are inferred from code
  shape; the actual wiring must be confirmed in the Base44 dashboard.

---

## 5. Redundancy & dead surface

**Frontend**
- Status→color map copied **7×** (`Dashboard.jsx:75`, `Vehicles.jsx:78`,
  `VehicleViewDialog.jsx:226`, `VehicleCard.jsx:21`, `StatusSelect.jsx:23`,
  `PortalVehicleTab.jsx:8`, `CustomReportExporter.jsx:107`) — colors already
  disagree. Status enum list defined 4+× (some divergent).
- File-upload logic ~30 sites across 15 files (two import spellings); a shared
  `DragDropUpload.jsx` exists but most sites bypass it.
- Currency formatting 25+ ad-hoc sites with inconsistent rounding
  (`Expenses.jsx:393` `.toFixed(2)` vs `:602` `.toFixed(0)`).
- Attendance-grouping algorithm re-implemented 4× (`Attendance.jsx:167`,
  `AttendanceManagement.jsx:85`, `AttendanceReportDialog.jsx:101`,
  `EmployeeDashboard.jsx:41`).
- Per-status WhatsApp templates 2× (`VehicleForm.jsx:493`,
  `VehicleWhatsAppMessages.jsx:17`). Marketing header copy-pasted across ≥5 public
  pages. Three near-identical dashboards; three near-identical report generators.
- `VehicleForm.jsx` (121 KB) vs `LogisticsVehicleForm.jsx` (35 KB) — same form
  forked with a different approval branch.
- **Dead / duplicative pages**: `VehiclesDebug` (debug in prod), `VehicleCRM` vs
  `Vehicles`, `Warranty` vs `WarrantyTransparency`, `GmailInbox` stub (0.8 KB),
  `EmployeeDashboard`/`LogisticsDashboard` vs `Dashboard`, `CustomerPortal` vs
  `Showroom`, `Tasks` vs `MyTasks`. `App.css` is 0 bytes but imported.

**Backend**
- **~11 backup/export variants** doing overlapping entity→Drive/JSON dumps
  (`fullSystemBackup`, `backupAllVehiclesToDrive`, `backupActiveVehiclesDrive`,
  `backupDocumentsToDrive`, `backupEntitiesAsJson`, `backupAllFiles`,
  `exportBackup`, `exportDataBackup`, `exportCodeBackup`, `exportFullCodeBackup`,
  `api GET /backup`).
- **4 overlapping WhatsApp inbound handlers**; generate/export report pairs
  duplicated; the `employee_assistant` conversation logic duplicated verbatim in
  `whatsappBusinessWebhook`; Telegram send helpers reimplemented inline in
  `telegramWebhook` (and, unlike `sendTelegramNotification`, without Markdown
  sanitization → Markdown injection from user text).

---

## 6. UX (the "simplify daily work" mandate)

- **The Car form is 1,955 lines on one scroll surface with zero tabs** — every
  field group (details, pricing, costs, import, trade-in, 6 upload categories,
  inspection) renders at once; overwhelming on mobile.
- **`alert()` is the primary feedback channel — 130+ call sites** (blocking,
  LTR-native modal in an RTL app), mixed with a real toast system that also exists.
  Validation is surfaced as one `\n`-joined alert string
  (`VehicleForm.jsx:581`) instead of inline field errors.
- **RTL by hand** — ~190 physical `ml-/mr-/pl-/pr-/text-left/text-right`
  occurrences in `src/pages` alone and **zero logical properties**; `text-right`
  hand-applied to nearly every heading/cell.
- **The entire finance suite (Accounting / CashFlow / VehicleFinance) has no menu
  entry** — reachable by URL only, so it's undiscoverable through the UI.
- **Polling loops refetch whole tables** — `LiveTracking.jsx:115` every 30 s,
  `NotificationBell.jsx:47` every 120 s, dialog-open polls; `Attendance.jsx:96`
  fires `updateLocation` every 30 s *in addition* to `watchPosition` (double GPS
  writes per user).
- **`window.location.reload()` used as a state-refresh** after mutations
  (`DeliveryFormDialog.jsx:15`, `ImportContractDialog.jsx:154`,
  `UsedCarContractDialog.jsx:230`, `LiveSpreadsheet.jsx:15`).
- **Unbounded / oversized fetches** — `Attendance.jsx:55` and `Expenses.jsx:43`
  have no limit; `CashFlow.jsx:16` pulls 5000; `Dashboard.jsx:289` and
  `useCoreData.js:50` pull 2000 each.

---

## 7. Recommended remediation ordering

1. **Security hotfix (can precede the full rebuild, on the live app with a
   checkpoint):** rotate + remove the hardcoded agent key; add webhook signature
   verification (Telegram secret token, Meta signature, GreenAPI gate); make
   opt-in auth fail closed; delete/auth-gate `setupTelegramWebhook`,
   `debugFunctionPaths`, and all debug/test functions; split & scope the `api` key.
   See `docs/SECURITY-HOTFIX.md`.
2. **Data model v2 (Phase 1):** decompose `Car`, status machine, RLS everywhere,
   unify Attendance/WhatsApp schemas, server-side money + approval.
3. **Frontend v2 (Phase 2):** real data layer, route-level authz, shared
   component library (kills the 7× status maps / 30× uploads / 25× currency
   sites), role-based IA, the five golden flows, tabbed Car workspace.
4. **Backend v2 (Phase 3):** consolidate bots/backups, scheduler reliability
   (ledger + per-item try/catch + range matching), `withHandler` wrapper.
5. **Preview + gated deploy (Phases 4–5).**

Full item-by-item register with severities and fix phases: `ISSUES.md`.
