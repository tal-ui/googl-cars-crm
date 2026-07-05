/**
 * Migration 01 — add v2 schemas (additive).
 *
 * Declarative manifest of the schema changes to apply. Additive only: new
 * entities are created; new fields are added to existing entities; NOTHING is
 * renamed or dropped. Safe to run repeatedly (create_entity_schema is a no-op if
 * the entity already exists; field adds are idempotent).
 *
 * Execution: driven by the Base44 MCP tools (`create_entity_schema`,
 * `update_entity_schema`) against the PREVIEW app first (Phase 4), then the live
 * app during the approved deploy (Phase 5). This file is the source of record for
 * what those calls do, in order.
 *
 * Run `node 01-add-schemas.mjs` to print the manifest and validate every
 * referenced entity JSON parses.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ENTITIES_DIR = join(HERE, '..', 'entities');

/** New satellite/decomposition entities created in v2 (order matters for FKs). */
export const NEW_ENTITIES = [
  'CarPurchase', 'CarShipment', 'CarExpenseInvoice', 'CarDocument',
  'CarHistoryEvent', 'CarCertificate', 'CarMaintenance',
  'DeliveryPrep', 'CustomerHistoryEvent',
];

/** Additive fields on EXISTING live entities (legacy fields stay untouched). */
export const ADDED_FIELDS = {
  Car: ['status_code', 'status_changed_at', 'catalog_id', 'cost_summary', 'trade_in_of_car_id'],
  AttendanceRecord: ['check_in_time', 'check_out_time', 'check_in_lat', 'check_in_lng',
                     'check_out_lat', 'check_out_lng', 'check_in_address', 'source'],
  WhatsAppMessage: ['message_text', 'customer_id', 'customer_name'],
  Payment: ['currency', 'order_id'],
  Invoice: ['/* RLS replacement only — no new data field */'],
  CashFlow: ['currency'],
  Expense: ['currency'],
  LocationTracking: ['retain_until'],
};

export function manifest() {
  return { newEntities: NEW_ENTITIES, addedFields: ADDED_FIELDS };
}

// --- self-test / preview -----------------------------------------------------
if (import.meta.url === `file://${process.argv[1]}`) {
  const files = new Set(readdirSync(ENTITIES_DIR).filter((f) => f.endsWith('.json')));
  const missing = NEW_ENTITIES.filter((e) => !files.has(`${e}.json`));
  for (const f of files) JSON.parse(readFileSync(join(ENTITIES_DIR, f), 'utf8')); // throws on bad JSON
  console.log('Migration 01 — additive schema manifest');
  console.log('  new entities:', NEW_ENTITIES.length, missing.length ? `MISSING: ${missing}` : '(all have JSON)');
  console.log('  entities with added fields:', Object.keys(ADDED_FIELDS).join(', '));
  if (missing.length) process.exit(1);
  console.log('OK');
}
