# Migrations — additive-first, executed only in Phase 5

These scripts run against the **live** Base44 app only during the approved
deployment (Phase 5), after a `create_checkpoint` + full data export. They are
**dry-run first on the preview app** in Phase 4. Nothing here touches the live app
until the owner authorizes deployment.

## Rules

1. **Additive only.** Never rename or drop a legacy field/entity in place. Add new
   fields/entities, backfill, switch reads, then deprecate (physical removal is a
   later, separately-approved cleanup).
2. **Idempotent.** Every script is safe to re-run: it checks whether a row is
   already migrated (e.g. `status_code` already set, or a satellite row already
   exists keyed by `car_id` + a natural key) and skips it.
3. **Batched + reconciled.** Read/write in pages; after each script, compare
   per-entity counts against the Phase-5 export baseline and log any drift.
4. **Backup-in-place.** Embedded arrays (`Car.history`, `Car.expense_invoices`,
   `Car.documents`, `Customer.history`, …) are copied into satellite rows but left
   intact on the source record as a backup until the post-cutover cleanup.
5. **No PII in logs or in the repo.** Scripts log counts and ids, never names/
   phones/GPS.

## Planned ordering

| # | Script | Reads | Writes | Reconcile |
|---|--------|-------|--------|-----------|
| 01 | `add-schemas` | — | create v2 satellite entities + additive fields on Car/Attendance/WhatsApp | schema present |
| 02 | `backfill-car-status` | Car.status (Hebrew) | Car.status_code via `LEGACY_STATUS_TO_CODE` | every Car has a valid status_code; count of unmapped = 0 |
| 03 | `backfill-car-satellites` | Car embedded arrays/objects | CarPurchase, CarShipment, CarExpenseInvoice, CarDocument, DeliveryPrep, CarHistoryEvent rows | sum(satellite rows) == sum(array lengths) |
| 04 | `compute-cost-summary` | CarPurchase + CarExpenseInvoice + CashFlow | Car.cost_summary | recompute matches legacy total_cost within tolerance (report deltas) |
| 05 | `backfill-attendance` | AttendanceRecord legacy-only rows (timestamp/type/location) | check_in_time/check_out_time/status | count of rows with no check_in_time and a timestamp = 0 after |
| 06 | `backfill-whatsapp` | WhatsAppMessage camelCase/`message` rows | message_text/customer_id/customer_name | canonical fields populated on all rows |
| 07 | `backfill-customer-history` | Customer.history[] | CustomerHistoryEvent rows | sum matches |
| 08 | `set-rls` | — | apply verified RLS to all sensitive entities | per-role read/write probe passes |

Scripts are added here as numbered files (`01-add-schemas.mjs`, …) during Phase 1
continuation. Each carries its own `--dry-run` (default) and `--commit` flags and a
`--app-id` so it can target the preview app first, then live.

## Reconciliation baseline

`00-export-baseline` (run in Phase 5 step 2) writes per-entity counts + a full JSON
export to a local, git-ignored path. All later reconciliation compares against it.
