# ISSUES.md — Ranked Defect Register

Severity scale: **P0** security · **P1** data-integrity · **P2** correctness · **P3** UX · **P4** hygiene

Status values: `verified` (confirmed from schema snapshot), `suspected` (needs file-level audit to confirm), `open`/`fixed-in-v2`/`deferred`/`wont-fix` (disposition, filled during Phases 1–4).

Source legend: `schema` = confirmed from the live 25-entity schema snapshot (2026-07-05, `audit/schemas/`); `audit` = to be confirmed by the Phase 0 file-level audit (currently blocked on MCP tool approval).

| ID | Sev | Area | Location | Description | Status | Fix phase |
|----|-----|------|----------|-------------|--------|-----------|
| I-001 | P0 | Security/RLS | `AttendanceRecord`, `LocationTracking` entities | No RLS at all on GPS entities. Employee locations (check-in/out coords + `currentLat`/`currentLng` updated every 2 minutes) are readable by any logged-in user. | verified (schema) | 1 |
| I-002 | P0 | Security/RLS | `Invoice.rls`, `Order.rls` | RLS uses `auth.role() IN ('admin','sales_manager')` syntax — not Base44's documented `user_condition` / `{{user.role}}` template style. Likely silently non-functional (either allowing or denying everything). Actual behavior must be probed empirically (Track D) before changing. | verified syntax (schema); behavior unknown | 0 → 1 |
| I-003 | P0 | Security/RLS | `Expense`, `Payment`, `CashFlow`, `WhatsAppMessage`, `WhatsAppSession`, `TelegramCache`, `ContractArchive` | No RLS. Financial records, customer chat logs, bot state, and signed contracts readable/writable by any authenticated user regardless of `custom_role`. | verified (schema) | 1 |
| I-004 | P0 | Security | `functions/` (all backend handlers) | Suspected hardcoded secrets (Telegram bot token, WhatsApp/Green-API keys, OpenClaw webhook). Requires grep sweep; any secret ever hardcoded must be rotated at deploy. | suspected (audit) | 0 → 3 |
| I-005 | P1 | Data integrity | `WhatsAppMessage` schema | Duplicate field pairs from schema drift: `customerId`/`customer_id`, `customerName`/`customer_name`, `message`/`message_text`. Different writers likely populate different halves → queries miss rows. Canonical: snake_case. | verified (schema) | 1 |
| I-006 | P1 | Data integrity | `Car.history`, `Customer.history` | Unbounded embedded history arrays (full `snapshot` object per change). Document bloat: every edit rewrites a growing blob; risks hitting record-size limits and slowing every list fetch. Replace with append-only `CarHistoryEvent`/`CustomerHistoryEvent` entities. | verified (schema) | 1 |
| I-007 | P1 | Data integrity | `Car` (~90 fields) | God entity mixing identity, purchase, shipping, customs, prep checklist, sale, trade-in, expenses, certificates, maintenance, Drive links, approval workflow. Overlapping expense fields: `extra_expenses_list` vs `expense_invoices` vs `local_expenses` vs `total_extracted_expenses` — unclear which feeds `total_cost`. | verified (schema) | 1 |
| I-008 | P1 | Data integrity | `AttendanceRecord` | Explicit backward-compat legacy fields (`timestamp`, `type`, `location`) coexisting with the new model (`checkInTime`/`checkOutTime`/`status`). Mixed writers suspected. | verified (schema); writers TBD (audit) | 1 |
| I-009 | P2 | Correctness | `Car.status` enum | 19-value Hebrew enum contains typo **"טרייייד אין"** (triple yud). Enum also mixes lifecycle stages, sale states, and exception states in one flat list with no transition rules. | verified (schema) | 1 |
| I-010 | P2 | Correctness | Money fields across `Car`, `Invoice`, `Payment`, `CashFlow`, `Expense` | No min ≥ 0 constraints; currency stored separately or not at all (`Payment` has no currency field); `purchase_price_shekel` and `total_cost` described as "auto-calculated" but calculation site unknown (client-side suspected → race/staleness bugs). | verified (schema); calc site TBD (audit) | 1 |
| I-011 | P2 | Correctness | `Car` approval workflow fields | `approval_status` defaults to `approved` — new records skip the approval flow unless the client remembers to set `pending_approval`. Server-side enforcement suspected missing. | verified default (schema) | 1/3 |
| I-012 | P2 | Reliability | Task nagging / reminders / expiry alerts | 30-min nagging, `reminders[]` with `sent` flags, `ReminderSetting`, certificate expiry alerts, monthly expense reminders — scheduling mechanism unknown; no heartbeat/observability implied by schema. Duplicate or missed sends likely. | suspected (audit) | 3 |
| I-013 | P2 | Reliability | Bot webhooks (Telegram, WhatsApp, OpenClaw `VisitorLog`) | No idempotency/signature-verification fields in schema; provider retries likely double-process. `TelegramCache` implements a 5-minute-TTL state machine — expiry handling TBD. | suspected (audit) | 3 |
| I-014 | P3 | UX | Car form | ~90 fields on one entity implies a monolithic form. Daily jobs (add car, advance status) buried. Replace with status-driven lifecycle workspace. | verified scale (schema); form structure TBD (audit) | 2 |
| I-015 | P3 | UX | Roles/navigation | `custom_role` (4 values) + free-form `permissions[]` array → ad-hoc gating, likely client-side only; menu clutter for restricted roles (`attendance_only` should see one screen). | verified model (schema); gating TBD (audit) | 2 |
| I-016 | P3 | UX/i18n | All enums | Mixed Hebrew/English enum values across entities (`Car.status` Hebrew; `Task.status` English; `Expense.status` Hebrew; `Order.status` Hebrew). Filtering/sorting/i18n inconsistent. v2: English codes + single Hebrew label map. | verified (schema) | 1/2 |
| I-017 | P1 | Performance | `LocationTracking` + `AttendanceRecord.currentLat/Lng` | GPS ping every 2 min per active employee with no retention policy → unbounded growth, slow queries. Define retention + coarser writes. | verified design (schema); volume TBD (audit) | 1/3 |
| I-018 | P4 | Hygiene | `VehicleCatalog` schema | Multiple truncated field descriptions (e.g. `power_hp`: "הספק (כ", `wheelbase_mm`: "בסיס גלגלים (מ") — sloppy authoring; harmless but indicative. | verified (schema) | 1 |
| I-019 | P4 | Hygiene | `Car` vs `VehicleCatalog` | Spec fields duplicated between the two (make/model/trim/engine/fuel) with no enforced relation (`Car` has no `catalog_id`). | verified (schema) | 1 |
| I-020 | P2 | Data integrity | `Car.trade_in_vehicle_id`, `previous_owner_id`, `new_owner_id`, `supplier_id`, `customer_id` | Free-text relation fields with no referential checks; orphaned references likely. | verified (schema); prevalence TBD (audit) | 1 |

## File-level findings (Phase 0 tracks A–C, complete)

Confirmed by read-only inspection on 2026-07-05. Evidence is `file:line` at
sandbox HEAD. Several P0 items are **live-exploitable now** — see
`docs/SECURITY-HOTFIX.md`.

| ID | Sev | Area | Location | Description | Status | Fix phase |
|----|-----|------|----------|-------------|--------|-----------|
| I-101 | P0 | Secrets | `base44/functions/whatsappWebhook/entry.ts:37` | Hardcoded live Base44 agent API key as env fallback (`Deno.env.get('bosi_api') \|\| '<literal>'`). Rotate + delete literal. | verified | Hotfix/3 |
| I-102 | P0 | Webhook auth | `telegramWebhook/entry.ts` | No Telegram `secret_token` check; only `chatId===TELEGRAM_CHAT_ID \|\| chat.type==='private'`. Anyone DMing the bot reaches full service-role mutate flows (payments, customers, status, docs). | verified | Hotfix/3 |
| I-103 | P0 | Webhook auth | `whatsappWebhook`, `greenApiWebhook`, `receiveWhatsAppWebhook`, `whatsappBusinessWebhook` (POST) | No provider signature verification (Meta `X-Hub-Signature-256`, GreenAPI gate). Spoofable inbound; billable agent replies; customer creation. | verified | Hotfix/3 |
| I-104 | P0 | Endpoint auth | `base44/functions/api/entry.ts` | Full CRUD + DELETE + backup over every entity behind one static `x-api-key`; same key reused by `openclawWebhook`. One leak = total data loss/exfiltration. Scope + split keys. | verified | Hotfix/3 |
| I-105 | P0 | Endpoint auth | `setupTelegramWebhook`, `debugFunctionPaths` | Unauthenticated. Former repoints bot webhook to caller URL (hijack); latter probes FS/env and dumps `BASE44*`. Delete/auth-gate. | verified | Hotfix/3 |
| I-106 | P0 | Endpoint auth | `receiveCustomerData`, `getVehicleDetails`, `getInventory` | Opt-in auth (`if (key && …)`) → open when env var unset. Make fail-closed. | verified | Hotfix/3 |
| I-107 | P0 | Frontend authz | `src/App.jsx:46`; `src/components/auth/ProtectedRoute.jsx` (dead) | No route-level role guard; every page URL-reachable by any authenticated user (Accounting, DataBackup, Settings, PendingVehicles, VehiclesDebug…). Gating is cosmetic. | verified | 2 |
| I-108 | P0 | Approval workflow | `src/components/vehicles/VehicleForm.jsx:756`; `ImportContractDialog.jsx:390`; `UsedCarContractDialog.jsx:377` | Client unconditionally sets `approval_status='approved'` with no role check; pending path only exists in `LogisticsVehicleForm.jsx:187`. Move server-side. | verified | 1/3 |
| I-109 | P0 | Info leak | `receiveCustomerData`, `debugTelegramBot` (+ default pattern) | Return `error.stack`/`error.message` to clients; `receiveCustomerData` logs all request headers. | verified | 3 |
| I-110 | P0 | Secrets/PII in bundle | `src/components/auth/PermissionGuard.jsx:6-9`; attendance/expense flows | Hardcoded superuser email allowlist in browser bundle; hardcoded ops phone `0549666666`; single hardcoded office geofence; admin-email recipient lists duplicated across ~8 schedulers. | verified | 2/3 |
| I-111 | P1 | Data loss | `AttendanceCard.jsx:139,180`; `ManualAttendanceDialog.jsx:61-76` (legacy-only writers) vs readers `LiveTracking.jsx:103`, `Attendance.jsx:55`, `AttendanceReportDialog.jsx:108` | Dual-schema drift: legacy-only punches invisible in live tracking + reports. Read-time patch at `Attendance.jsx:214` confirms. | verified | 1/2 |
| I-112 | P1 | Data integrity | `src/components/vehicles/VehicleForm.jsx:179-217,648-663` | `total_cost`/`purchase_price_shekel` are client free-text parsed at save; expense total recomputed per keystroke on currency casing. Concurrent editors last-write-wins. Compute server-side. | verified | 1/3 |
| I-113 | P1 | Data bloat | `VehicleForm.jsx:719-733` (`.slice(-20)`) | Embedded `history[]` on Car/Customer serialized+truncated client-side (silently lossy audit trail; row bloat). Replace with append-only event entity. | verified | 1 |
| I-114 | P1 | Auth | `src/lib/AuthContext.jsx` vs `src/components/auth/AuthContext.jsx`; `base44Client.js:12` (`requiresAuth:false`) | Two AuthContexts (two `me()` calls, divergent user state); router and PermissionGuard read different providers. | verified | 2 |
| I-115 | P2 | Reliability | `checkCashFlowReminders`, `checkVehicleCertificates`, `checkStuckVehicles`, `autoPaymentReminders` | Non-idempotent: overdue items re-notify every run (no "sent" ledger); exact-day match → missed day = skipped. | verified | 3 |
| I-116 | P2 | Reliability | `checkCashFlowReminders`, `checkVehicleCertificates`, `sendMonthlyExpenseReminders`, `checkExpenseBudgetAlerts` | Batch-fatal loops: per-recipient notify/email not wrapped; first failure aborts batch. Adopt `checkTaskReminders` pattern. | verified | 3 |
| I-117 | P2 | Reliability | `checkExpenseBudgetAlerts`, `sendMonthlyExpenseReminders` | Require `auth.me().role==='admin'` → return 403 headless, so scheduled "monthly" intent can't run. | verified | 3 |
| I-118 | P2 | Perf/correctness | `processScheduledBulkUpdates` | Reloads ≤10k customers inside per-update loop; double-send on timeout; swallowed `catch(_)`. | verified | 3 |
| I-119 | P2 | Reliability | `telegramWebhook` (always 200), `notifyAccountingOnPayment` (empty `catch {}`), fire-and-forget sends | Silent failures; no dead-letter/alerting. | verified | 3 |
| I-120 | P2 | Consistency | 4 `@base44/sdk` versions (0.8.6/0.8.23/0.8.25/0.8.31) across functions | Behavioral drift risk. Unify. | verified | 3 |
| I-121 | P3 | UX | `VehicleForm.jsx` (1,955 lines, zero `TabsTrigger`) | ~90-field car form on one scroll surface; overwhelming on mobile. Tabbed lifecycle workspace. | verified | 2 |
| I-122 | P3 | UX | 130+ `alert()` sites (e.g. `VehicleForm.jsx:285…1745`, `Dashboard.jsx`, `Vehicles.jsx`); validation as `\n`-joined alert at `VehicleForm.jsx:581` | Blocking LTR modal in RTL app; mixed with toast system. Replace with toast + inline errors. | verified | 2 |
| I-123 | P3 | RTL | ~190 physical `ml-/mr-/pl-/pr-/text-left/text-right` in `src/pages`, zero logical props | RTL by hand; brittle. Logical properties + `dir` inheritance. | verified | 2 |
| I-124 | P3 | UX | Accounting / CashFlow / VehicleFinance | Finance suite has no menu entry (URL-only) → undiscoverable. Surface per-role. | verified | 2 |
| I-125 | P3 | Perf | `LiveTracking.jsx:115` (30s), `NotificationBell.jsx:47` (120s), `CustomerViewDialog.jsx:44`; `Attendance.jsx:96` `updateLocation` 30s + `watchPosition` 88 | Polling refetches whole tables; double GPS writes per user. | verified | 2/3 |
| I-126 | P3 | Perf | `window.location.reload()` at `DeliveryFormDialog.jsx:15`, `ImportContractDialog.jsx:154`, `UsedCarContractDialog.jsx:230`, `LiveSpreadsheet.jsx:15` | Full reload as state refresh; discards cache, re-runs bootstrap. | verified | 2 |
| I-127 | P2 | Perf | `Attendance.jsx:55`, `Expenses.jsx:43` (no limit); `CashFlow.jsx:16` (5000); `Dashboard.jsx:289`, `useCoreData.js:50` (2000) | Unbounded/oversized `.list()` fetches into browser. Paginate. | verified | 2 |
| I-128 | P4 | Duplication | Status→color map 7×; status enum 4+×; WhatsApp templates 2×; upload ~30×; currency 25+×; attendance-grouping 4×; 3 dashboards; 3 report generators | Extract shared modules/components. | verified | 2 |
| I-129 | P4 | Duplication | ~11 backup/export functions; 4 WhatsApp inbound handlers; `telegramWebhook` inline send helpers (no Markdown sanitize → injection); agent-convo logic duplicated in `whatsappBusinessWebhook` | Consolidate to 1 data + 1 code backup, 1 WhatsApp + 1 Telegram entrypoint. | verified | 3 |
| I-130 | P4 | Dead code | `VehiclesDebug`, `VehicleCRM`, `Warranty` (vs `WarrantyTransparency`), `GmailInbox` stub, `EmployeeDashboard`/`LogisticsDashboard`, `App.css` (0 bytes, imported), `MyTasks` special-cased | Retire after owner confirms. | verified | 2 |

## Disposition tracking

During Phases 1–4 each item above gets a disposition (fixed-in-v2 / deferred /
wont-fix) recorded in the PR body's per-issue table. Items I-101…I-106 and
I-109 are the **security hotfix** candidates that can be applied to the live app
ahead of the rebuild (see `docs/SECURITY-HOTFIX.md`).
