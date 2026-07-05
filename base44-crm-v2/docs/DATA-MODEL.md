# DATA-MODEL.md — Googl Cars CRM v2

The v2 entity model, the migration disposition of every legacy field, the status
machine, and the RLS matrix. Schemas live as JSON in `../entities/`; the status
machine lives in `../shared/vehicleStatus.js` (the single source of truth).

Design principles (from the audit): **decompose the `Car` god-entity into core +
satellites**, **store stable English codes not Hebrew display strings**, **compute
money and approval server-side**, **RLS on everything sensitive**, and **append-only
history instead of embedded unbounded arrays**. Migration is **additive-first** — no
legacy field is renamed or dropped in place; new fields/entities are added, data is
backfilled, reads switch with a legacy fallback, and only much later (post-cutover,
separately approved) are deprecated fields removed.

> Several modeling choices depend on owner answers to the open questions in
> `../audit/PROCESS-MAP.md` §7 (status pipeline, Orders-vs-Payments, location
> retention, trade-in as first-class). Those are flagged ❓ below and are safe to
> revise — the additive migration doesn't lock them in.

---

## 1. Entity overview

### Kept ~as-is (light cleanup + RLS)
`Customer`, `Contact`, `Supplier`, `CustomerInteraction`, `Order`, `Payment`,
`Invoice`, `CashFlow`, `Expense`, `ExpenseBudget`, `ExpenseAlertSettings`,
`Task`, `Notification`, `ReminderSetting`, `Employee`, `VehicleCatalog`,
`ContractArchive`, `VisitorLog`, `User`.

### Restructured
| Legacy | v2 |
|--------|-----|
| `Car` (~90 fields, embedded arrays/objects) | `Car` (core: identity, specs, `status_code`, current owner/customer/supplier links, money **summary** only) + satellites below |
| `Car.expense_invoices[]` | **`CarExpenseInvoice`** (one row per invoice, keeps OCR `extracted_data`) |
| `Car.documents[]`, `supplier_documents[]`, `sale_documents[]`, `invoices_receipts[]`, `images[]` | **`CarDocument`** (typed: `category` = image/document/supplier/sale/invoice/inspection) |
| `Car.history[]` (embedded, client-truncated to 20) | **`CarHistoryEvent`** (append-only) |
| `Car.delivery_prep{}` | **`DeliveryPrep`** (one per car; itoran/lab/registration/id/form sub-checklists) |
| `Car.certificates{}`, `maintenance_history[]` | `CarCertificate`, `CarMaintenance` (satellites) |
| `Customer.history[]` | **`CustomerHistoryEvent`** (append-only) |

### Unified (schema-drift fixes)
| Entity | Change |
|--------|--------|
| `AttendanceRecord` | Canonical = new schema (`check_in_time`, `check_out_time`, `status`, `check_in_lat/lng`). Legacy `timestamp`/`type`/`location` frozen (read-fallback only). All writers emit the new shape (fixes I-111 silent data loss). |
| `WhatsAppMessage` | Canonical = snake_case (`customer_id`, `customer_name`, `message_text`, `created_date`). camelCase twins frozen. |
| `LocationTracking` | Retention policy + coarser writes (see §4). |

### Retired (dead/duplicate — after owner confirm)
Frontend pages only, not entities: `VehiclesDebug`, `VehicleCRM`, one Warranty
page, `GmailInbox` stub, duplicate dashboards. No entity is deleted in v2.

---

## 2. `Car` core (v2) — the important restructure

Legacy `Car` mixed 8 concerns. v2 `Car` keeps **identity + current-state +
denormalized summaries**, everything else moves to satellites keyed by `car_id`.

**Kept on Car core:** `make`, `model`, `trim`, `year`, `vin`, `license_plate_number`,
`color`, `kilometers`, `hand`, `engine_volume`, `fuel_type`, catalog link
`catalog_id` (new — was unlinked, I-019); `status_code` (English, replaces Hebrew
`status`); `approval_status` (+ submit/approve audit fields) — **set server-side**;
current relations `customer_id`, `supplier_id`, `previous_owner_id`, `new_owner_id`;
`vehicle_source`, `is_import`, `import_type`; pricing shown to users
`list_price`, `required_price`, `sale_price`, `sale_date`; **money summary**
`cost_summary { total_cost, purchase_price_shekel, currency }` computed server-side
(not free text, I-112); `show_on_website`; `expected_arrival_date`,
`overseas_status`; `drive_folder_id/url`; `last_updated_by/at`.

**Moved off Car core:** every document/image array → `CarDocument`;
`expense_invoices[]` + `extra_expenses_list[]` → `CarExpenseInvoice`;
`history[]` → `CarHistoryEvent`; `delivery_prep{}` → `DeliveryPrep`;
`certificates{}` → `CarCertificate`; `maintenance_history[]` → `CarMaintenance`;
raw purchase detail (`purchase_price_foreign`, `exchange_rate`, `import_cost`,
`local_expenses`, invoice numbers, container info) → `CarPurchase`/`CarShipment`.

This turns the 1,955-line single-save form into a tabbed workspace where each tab
saves one small satellite (I-121), and stops every list fetch from dragging ~90
fields + embedded arrays per row.

---

## 3. Status machine

Defined once in `../shared/vehicleStatus.js` (validated). 21 canonical codes with
Hebrew labels, tones (→ the single color map, was 7×), `stage` grouping for the
workspace tabs, a permissive-but-guarded transition table, and the
`LEGACY_STATUS_TO_CODE` map (includes the `"טרייייד אין"` typo and out-of-enum
`"במלאי"`/`"הועבר לארכיון"`). Server enforces `canTransition(from,to)` on write;
the UI offers only `nextStatuses(from)`.

---

## 4. RLS matrix (role × entity × op)

Uses Base44's real RLS mechanism (to be verified empirically on the preview app in
Phase 4 — the legacy `auth.role() IN (...)` on Invoice/Order is likely invalid,
I-002). Roles: `admin`, `sales_manager`, `employee`, `logistics_employee`,
`attendance_only`.

| Entity | read | create | update | delete |
|--------|------|--------|--------|--------|
| Car, CarDocument, DeliveryPrep, CarHistoryEvent | all staff | staff (not attendance_only) | staff w/ write | manager+ |
| CarPurchase, CarShipment, CarExpenseInvoice, cost_summary | manager+ (finance) | manager+ | manager+ | manager+ |
| Customer, Contact, CustomerInteraction | staff | staff | staff | manager+ |
| Order, Payment, Invoice, CashFlow | manager+ (finance) | manager+ | manager+ | manager+ |
| Expense | **owner** + approvers(manager+) | owner | owner(if pending) / approver | manager+ |
| Attendance​Record, LocationTracking | **own only**; manager+ = all | own | own | manager+ |
| WhatsAppMessage, WhatsAppSession, TelegramCache | manager+ / service | service | service | manager+ |
| ContractArchive | manager+ | manager+/service | manager+ | manager+ |
| Employee, User, ReminderSetting, ExpenseBudget | manager+ | admin | admin | admin |
| VehicleCatalog, VisitorLog | staff | service/manager+ | manager+ | admin |

"manager+" = admin or sales_manager. **Location/attendance own-only read is the
single biggest privacy fix** (I-001). RLS is the server backstop; the frontend also
gets real route guards (I-107).

**Location retention (I-017):** v2 writes a location point at most every N minutes
(configurable; default 5, up from the double 30-s writes), keeps raw points D days
(default 30), then keeps only per-shift summaries on the `AttendanceRecord`. A
scheduled prune enforces it. ❓ Confirm N and D with owner.

---

## 5. Legacy-field disposition (traceability — must reach 100% before Phase 5)

Status per field: **migrate** (copy to v2 shape), **map** (transform, e.g. status
string→code), **split** (move to a satellite entity), **freeze** (keep, never
written by v2), **drop-unused** (0% populated — confirm in Phase 4 seeding).

### Car (representative — full table maintained as `entities/Car.disposition.csv`)
| Legacy field | Disposition | v2 target |
|--------------|-------------|-----------|
| make, model, trim, year, vin, color, kilometers, hand, engine_volume, fuel_type | migrate | Car core |
| status | map | Car.`status_code` via `LEGACY_STATUS_TO_CODE` |
| approval_status, submitted_by/at, approved_by/at | migrate (but writes move server-side) | Car core |
| purchase_price_foreign, foreign_currency, exchange_rate, purchase_invoice_number, container_ship_info | split | `CarPurchase` / `CarShipment` |
| purchase_price_shekel, total_cost, import_cost, local_expenses, total_extracted_expenses | map→computed | Car.`cost_summary` (server-computed) |
| extra_expenses_list[], expense_invoices[] | split | `CarExpenseInvoice` (one row each) |
| images[], documents[], supplier_documents[], sale_documents[], invoices_receipts[], inspection_form | split | `CarDocument` (typed) |
| history[] | split | `CarHistoryEvent` (append-only) |
| delivery_prep{} | split | `DeliveryPrep` |
| certificates{}, maintenance_history[] | split | `CarCertificate`, `CarMaintenance` |
| trade_in_* , additional_payment | migrate | Car core (trade-in group) ❓ owner Q7 |
| model_code*, import_license*, itoran_code, richavit_file_number | migrate | Car core (compliance group) |
| drive_folder_id/url, show_on_website, overseas_status*, expected_arrival_date | migrate | Car core |
| status_paid_pending_at, paperwork_received*, invoice_issued/updated* | migrate | Car core (paperwork group) |

### AttendanceRecord
| Legacy field | Disposition | v2 target |
|--------------|-------------|-----------|
| checkInTime→check_in_time, checkOutTime→check_out_time, status, checkInLat/Lng, currentLat/Lng, user_email/name | migrate (canonical) | AttendanceRecord |
| timestamp, type, location{} | freeze | read-fallback only; v2 never writes |

### WhatsAppMessage
| Legacy field | Disposition | v2 target |
|--------------|-------------|-----------|
| customer_id, customer_name, message_text, phone, direction, is_read, media_* , message_id, replied_by | migrate (canonical) | WhatsAppMessage |
| customerId, customerName, message, timestamp | freeze | camelCase/legacy twins; read-fallback only |

Full per-entity CSVs for the remaining 22 entities are produced in Phase 1
continuation; the pattern above is the template.

---

## 6. Migration approach (executed only in Phase 5)

Numbered idempotent scripts in `../migrations/`, each: **(a)** additive schema
change → **(b)** batched backfill (read legacy → write v2, reconcile counts) →
**(c)** switch reads (v2 reads new field, falls back to legacy for un-migrated
rows) → **(d)** deprecate (mark in schema description; physical removal is a later,
separate, owner-approved cleanup). Embedded arrays (`history`, `expense_invoices`,
etc.) are copied into satellite rows but **left intact on the Car** as a backup.
See `../migrations/README.md` for the ordering and reconciliation checks.
