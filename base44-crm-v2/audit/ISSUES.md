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

## Pending audit tracks (blocked)

File-level findings (Tracks A–D of Phase 0) will be appended here with
`file:line` evidence once Base44 MCP tool access is approved. Expected additional
areas: duplicated fetch logic per page, dead pages, client-only permission
checks, RTL inconsistencies, empty catch blocks, webhook handlers without
signature verification, hardcoded secrets inventory.
