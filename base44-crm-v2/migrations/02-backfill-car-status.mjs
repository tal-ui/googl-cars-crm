/**
 * Migration 02 — backfill Car.status_code from the legacy Hebrew Car.status.
 *
 * Idempotent: skips any Car that already has a valid status_code. Additive: the
 * legacy `status` string is left untouched (read-fallback + backup). Maps the
 * typo "טרייייד אין" and out-of-enum values ("במלאי", "הועבר לארכיון") to
 * canonical codes via LEGACY_STATUS_TO_CODE.
 *
 * Execution (Phase 4 preview, then Phase 5 live): pass a `client` with
 * list/update backed by the Base44 MCP `query_entities`/`update_entities` tools.
 * Defaults to dryRun — reports what WOULD change and any unmapped values without
 * writing. Run `node 02-backfill-car-status.mjs` for the built-in self-test.
 */
import { codeFromLegacy, STATUS_CODES } from '../shared/vehicleStatus.js';

/**
 * @param {{ list:(entity,opts)=>Promise<object[]>, update:(entity,id,patch)=>Promise<void> }} client
 * @param {{ dryRun?:boolean, pageSize?:number }} [opts]
 */
export async function run(client, { dryRun = true, pageSize = 200 } = {}) {
  const stats = { scanned: 0, migrated: 0, skipped: 0, unmapped: [] };
  let page = 0;
  for (;;) {
    const cars = await client.list('Car', { limit: pageSize, offset: page * pageSize });
    if (!cars.length) break;
    for (const car of cars) {
      stats.scanned++;
      if (car.status_code && STATUS_CODES.includes(car.status_code)) { stats.skipped++; continue; }
      const code = codeFromLegacy(car.status);
      if (!code) { stats.unmapped.push({ id: car.id, status: car.status }); continue; }
      if (!dryRun) await client.update('Car', car.id, { status_code: code });
      stats.migrated++;
    }
    if (cars.length < pageSize) break;
    page++;
  }
  return stats;
}

// --- self-test (no app; in-memory fake client) -------------------------------
if (import.meta.url === `file://${process.argv[1]}`) {
  const rows = [
    { id: '1', status: 'נמסר ללקוח' },
    { id: '2', status: 'טרייייד אין' },        // typo → trade_in
    { id: '3', status: 'במלאי' },               // out-of-enum → in_stock
    { id: '4', status: 'בים' },
    { id: '5', status: 'ערך לא ידוע' },         // unmapped
    { id: '6', status: 'נמכר', status_code: 'sold' }, // already migrated → skip
  ];
  const writes = [];
  const client = {
    list: async (_e, { offset }) => (offset ? [] : rows),
    update: async (_e, id, patch) => writes.push({ id, ...patch }),
  };
  const dry = await run(client, { dryRun: true });
  console.assert(dry.migrated === 4 && dry.skipped === 1 && dry.unmapped.length === 1,
    'dry-run stats wrong', dry);
  console.assert(writes.length === 0, 'dry-run must not write');
  const wet = await run(client, { dryRun: false });
  console.assert(writes.length === 4, 'wet run should write 4', writes);
  console.assert(writes.find((w) => w.id === '2').status_code === 'trade_in', 'typo not mapped');
  console.assert(writes.find((w) => w.id === '3').status_code === 'in_stock', 'out-of-enum not mapped');
  console.log('Migration 02 self-test OK —', JSON.stringify(wet));
}
