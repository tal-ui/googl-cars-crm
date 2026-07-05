# PROCESS-MAP.md — Business Operations, Googl Cars CRM

How the business actually runs, reconstructed from source + sampled data
(read-only, 2026-07-05). **This is the document to validate first** — every
redesign decision in Phases 1–5 depends on it being correct. Where we inferred
rather than confirmed, it's marked ❓. No PII reproduced.

The business: a luxury/used **vehicle-import dealership** for the Israeli market.
Cars are sourced abroad, shipped, cleared through customs, prepped, and delivered
to customers; the CRM also runs trade-ins, brokerage, finance, employee
attendance, expenses, tasks, contracts, and customer messaging (WhatsApp-first).

---

## 1. The vehicle import lifecycle (the core process)

The `Car` entity is the spine. It carries a **19-value Hebrew status enum**, a
separate **`approval_status`** (`pending_approval`/`approved`/`rejected`), and an
embedded `history[]` audit trail.

**Intended pipeline** (from status ordering + auto-generated tasks + data):

```
ממתין לרכישת רכב        awaiting purchase decision
   → ממתין לחשבונית      awaiting (purchase) invoice
   → שולם ממתין          paid, pending
   → במחסן בחו״ל         overseas warehouse
   → ממתין למשלוח        awaiting shipping
   → בים                 at sea
   → בנמל בישראל ממתין לשחרור   at Israeli port, awaiting customs release
   → התקנות בארץ         local installations (itoran/lab/etc.)
   → במלאי במגרש         in-lot stock
   → מוכן ממתין למסירה / רכב בהכנה למסירה ללקוח   ready / prepping handover
   → נמסר ללקוח          delivered to customer
   → נמכר                sold
Terminal off-ramps: הוחזר (returned) · בוטל (cancelled) · טרייד אין (trade-in)
Ordering-flow statuses: זמין להזמנה · בהזמנה · בדרך לארץ (the schema default)
```

**Reality (from a 200-record recency-biased sample):** the pipeline collapses in
practice. `נמסר ללקוח` (delivered) ≈ 65%, then `בים`, `הוחזר`,
`ממתין לרכישת רכב`, `שולם ממתין`, `בוטל`, `התקנות בארץ`, `במלאי במגרש`, `נמכר`;
several nominal stages (`במחסן בחו״ל`, `זמין להזמנה`, `בהזמנה`, `בדרך לארץ`,
`מוכן ממתין למסירה`, `רכב בהכנה למסירה ללקוח`) barely appear. Real data also holds
**out-of-enum** values (`במלאי`, `הועבר לארכיון`) and the trade-in path writes
`"טרייד אין"` while the enum has the misspelled `"טרייייד אין"`.

**Who advances status & what fires on change:** any user with vehicle-write can
change status via `StatusSelect`. On change:
- `updateDocumentStatus` reorganizes the vehicle's Google Drive documents by phase.
- If a customer + phone are attached, a templated **WhatsApp status update** is
  sent to the customer (`VehicleForm.jsx` `getStatusMessage` → `sendWhatsAppMessage`).
- Server-side automations auto-create **follow-up Tasks** (e.g. entering "at port"
  → customs-clearance task; "local installations" → coordinate-installations task
  assigned to a manager with a due date).

**Delivery-prep sub-workflow** (`Car.delivery_prep`): a structured checklist with
boolean `done` + file arrays for `itoran` (GPS immobilizer), `lab_check`,
`registration_order`, `customer_id_doc`, `registration_form` — gates handover.

**Certificates** (`Car.certificates`): license / inspection / insurance with
expiry dates; `ReminderSetting` drives expiry alerts at [14, 7, 1] days.

**Vehicle sources** (`vehicle_source`): mostly `יבוא` (import), plus `תיווך`
(brokerage) and `טרייד אין` (trade-in); `is_import` + `import_type`
(`יבוא זעיר` / `יבוא עקיף`) further classify imports.

---

## 2. Sales, orders & trade-in

- **Order** entity (`חדשה/בתהליך/שולמה/נמסרה/בוטלה`) links customer + car +
  `total_price`. In practice used loosely as **payment-tranche records** (multiple
  per car, partial amounts, notes carry bank-transfer refs) rather than a formal
  sales header. ❓ Confirm whether Orders are meant to be the sales header or just
  payment tracking — this drives the v2 Order/Payment split.
- **Trade-in:** creating a car with a trade-in (`LogisticsVehicleForm.jsx:195+`)
  flips the old vehicle to trade-in status, sets its `new_owner_id`, appends a
  history entry; the new car stores `trade_in_value` + `additional_payment`.
- **Contracts:** `ContractArchive` + generator dialogs (import agreement, used-car
  sale, standard sale, service, MoU) → backend `generateContract` → WhatsApp
  signing link → `SignAgreement` public page captures the signature → signed URL +
  date land on the contract and `Car.signed_agreement`.

---

## 3. Finance

Three pages, **URL-only (no menu entry)**, admin/sales-manager oriented:

- **Accounting** — CRUD over `Invoice` (types רכישה/מכירה/הוצאה/הכנסה, VAT,
  `allocation_number`, `YYYY-MM` bucket). Hosts Monthly / Inventory /
  Pending-Purchase report generators (→ PDF/Excel/Docs to Drive). `Invoice` has
  RLS restricting to admin/sales_manager.
- **CashFlow** — `CashFlow` rows (`direction` in/out, category, `due_date`,
  `paid`). UI computes overdue / due-soon (≤7 days). Marking an inflow paid
  **auto-creates a `Payment`** when the row is tied to a vehicle+customer
  (`CashFlow.jsx:41-60`). Reminder cadence [7, 3, 1] days.
- **VehicleFinance** — per-vehicle P&L, computed by backend `vehicleFinancialReport`
  (cost_breakdown = purchase / import_tax / local / extra / invoices / cashflow;
  revenue; profit; profit_pct; monthly series; top-profit / top-loss). Client only
  filters/sorts/CSV-exports.

**Cost inputs on `Car`:** `purchase_price_foreign` × `exchange_rate` →
`purchase_price_shekel`; `import_cost`; `local_expenses`; `extra_expenses_list[]`;
`expense_invoices[].extracted_data` (OCR); `total_cost`. ⚠️ These are
**sparsely populated on active cars** and client-computed as free text — so P&L
is unreliable until money handling moves server-side (Phase 1/3).

`Payment` entity tracks customer receipts (methods מזומן/העברה/אשראי/צ'ק) +
receipt issuance.

---

## 4. People & operations

**Attendance (GPS):**
- **Geofenced auto-clock** (`GeoAttendance.jsx`): a single hardcoded office
  geofence (lat/lng, 300 m radius, haversine). `watchPosition` auto-creates an
  entrance record on entering and an exit on leaving; reverse-geocodes via OSM
  Nominatim; notifies a **hardcoded ops number `0549666666`** over WhatsApp.
- **Manual clock** (`EmployeeDashboard.jsx`): entrance/exit button with geolocation.
- Live positions also stream to `LocationTracking` for the `LiveTracking` map.
- ⚠️ Dual-schema drift means some punches are invisible in tracking/reports (see
  `ISSUES.md` I-004 / AUDIT §3). ❓ Confirm whether continuous location tracking of
  employees is a deliberate, consented policy — it affects the v2 retention + RLS
  design.

**Expenses:** employee submits (`Expense`: name, amount incl. VAT, category,
mandatory receipt image, optional vehicle plate) → receipt OCR pre-fills →
manager with `accounting.write` approves (`ממתין לאישור → אושר/נדחה → שולם`) → on
approval the receipt is pushed to the ops WhatsApp number; manager sets
`payment_date` when marking paid. `ExpenseBudget` (per-category monthly budget +
alert threshold) and `ExpenseAlertSettings` (per-user channels + reminder day)
support it.

**Tasks:** `Task` (todo/in_progress/done, priority, `assigned_to`, category,
optional related vehicle/customer or manual plate/contact, Waze address).
Reminders (`reminders[]`: before_due / specific_time, channels) plus a **nagging
mode** (every 30 min in work hours). Tasks are both user-created and
automation-created (on status transitions). `MyTasks` gives employees a focused
view; `sendMyUrgentTasks` pushes a WhatsApp digest.

---

## 5. Communication

- **WhatsApp is primary.** `WhatsAppMessage` logs inbound/outbound; `sendWhatsAppMessage`
  is invoked from ~15 places (contracts, status changes, attendance, expenses,
  bulk updates). `CrmBulkUpdate` → `sendBulkUpdate` for mass messaging. Config in
  `WhatsAppSetup` / `Integrations`. Provider: GreenAPI (plus a Meta Cloud webhook).
- **Telegram bot** (`telegramWebhook`, 1,373 lines): quick-menu + slash commands
  (customers, vehicles, tasks, stats, daily report, status change), VIN lookup
  (last-6 match), photo/document upload → Drive, add-payment / add-customer via
  free text, and fallback to the `employee_assistant` AI agent. State machine in
  `TelegramCache` (5-min TTL).
- **`employee_assistant` agent:** WhatsApp/Telegram AI assistant with read/create/
  update on Car, Customer, Task, Supplier, Order (+ create/read on Notification,
  CustomerInteraction, AttendanceRecord, Expense, Payment, Contact), plus custom
  tools `createCarPayment` and `updateCarById` (the latter runs as **service role**
  to edit cars owned by others — a privilege-escalation convenience to revisit).
- **Gmail** (`GmailInbox`, `sendGmailEmail`, `receiveGmailEmails`,
  `processInvoiceEmail`, `checkPaperworkEmail`, `autoLinkGmailToVehicles`).
- **CustomerInteraction** logs calls/meetings/emails/WhatsApp per customer.
- **Notification** entity + `NotificationBell` for in-app alerts.
- **VisitorLog** — an OpenClaw AI camera webhook records recognized visitors.

---

## 6. Roles & who does what

Client-side `ROLE_PERMISSIONS` map (`PermissionGuard.jsx`) + hardcoded superuser
emails. Server enforcement exists only on `Invoice`/`Order` (and via service-role
functions). **All other gating is advisory (UI-only).**

| Capability | admin | sales_manager | employee | logistics_employee | attendance_only |
|---|---|---|---|---|---|
| Vehicles read | ✓ | ✓ | ✓ | ✓ | – |
| Vehicles write / edit | ✓ | ✓ | (create/status only) | ✓ | – |
| Vehicles delete / pricing / costs | ✓ | ✓ | – | – | – |
| Customers read/write | ✓ | ✓ | ✓ | ✓ | – |
| Customers delete | ✓ | ✓ | – | – | – |
| Suppliers read / write | ✓ | ✓ / ✓ | ✓ / – | – | – |
| Dashboard | ✓ | ✓ | ✓ | – | – |
| Accounting read/write | ✓ | ✓ | – | – | – |
| Users admin | ✓ | ✓ | – | – | – |
| Attendance mark / view own | ✓ | ✓ | ✓ | ✓ | ✓ |
| Attendance view all / reports | ✓ | ✓ | – | – | – |
| Expenses submit | ✓ | ✓ | ✓ | ✓ | – |
| Expenses manage / reports | ✓ | ✓ | – | – | – |
| Telegram send | ✓ | ✓ | – | – | – |

Notes: unknown role → falls back to `employee` (fail-open-ish). The permission
vocabulary is inconsistent (`vehicles.write` vs `vehicles.create`/`update_status`)
so an `employee` can be blocked by a permission they were never evaluated against
while `logistics_employee` gets broader write. **Daily-work personas** the v2 IA
should serve: (1) sales/office employee, (2) sales manager/admin, (3) logistics
field worker, (4) attendance-only field worker.

---

## 7. Open questions for the owner (validate before redesign)

1. **Status pipeline** — is the collapsed real-world flow (many nominal stages
   skipped) intentional, or should v2 enforce the full staged pipeline? Which
   statuses are genuinely in use?
2. **Orders vs Payments** — is `Order` meant to be the sales header, or just
   payment tranches? (Drives the v2 model.)
3. **Employee location tracking** — is continuous GPS (every 2 min) a deliberate,
   consented policy? Retention expectations?
4. **`employee_assistant` `updateCarById` service-role bypass** — keep the
   convenience (any employee edits any car via the bot) or scope it?
5. **Finance suite** — should Accounting/CashFlow/VehicleFinance be promoted into
   the main menu for managers (currently URL-only)?
6. **Dead pages** — confirm `VehicleCRM`, `VehiclesDebug`, one of Warranty/
   WarrantyTransparency, `GmailInbox`, duplicate dashboards can be retired.
7. **Trade-in / brokerage** — are these first-class flows needing dedicated UI, or
   edge cases handled within the vehicle form?
