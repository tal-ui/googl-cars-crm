/**
 * Self-test for the pure logic in the Deno middleware. Re-implements the tiny
 * pure functions here (the .ts files import Deno/@base44 which node can't load)
 * and asserts their behavior, so the security-critical logic is verified in CI-
 * less node. Run: node _selftest.mjs
 */

// --- mirror of verify.ts timingSafeEqual ---
function timingSafeEqual(a, b) {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ eb[i];
  return diff === 0;
}

// --- mirror of api/entry.ts isAllowed ---
const INTEGRATION_SCOPES = {
  Car: ['read', 'update'],
  Customer: ['read', 'create', 'update'],
  Order: ['read', 'create'],
  Payment: ['read', 'create'],
  CustomerInteraction: ['read', 'create'],
  VehicleCatalog: ['read'],
};
const METHOD_TO_OP = { GET: 'read', POST: 'create', PATCH: 'update', PUT: 'update' };
function isAllowed(entity, method) {
  const op = METHOD_TO_OP[method];
  if (!op) return false;
  return (INTEGRATION_SCOPES[entity] ?? []).includes(op);
}

// --- mirror of scheduler.ts pure helpers ---
function dueWithinWindow(dueDate, { within = 7, lookbackDays = 3, now = new Date() } = {}) {
  const d = new Date(dueDate);
  if (Number.isNaN(d.getTime())) return false;
  const diffDays = Math.floor((d.getTime() - now.getTime()) / 86400000);
  return diffDays <= within && diffDays >= -lookbackDays;
}
function notifiedRecently(lastNotifiedAt, cooldownHours = 20, now = new Date()) {
  if (!lastNotifiedAt) return false;
  const t = new Date(lastNotifiedAt).getTime();
  if (Number.isNaN(t)) return false;
  return now.getTime() - t < cooldownHours * 3600_000;
}

let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.error('FAIL:', msg); } };

// timingSafeEqual
ok(timingSafeEqual('abc', 'abc'), 'equal strings match');
ok(!timingSafeEqual('abc', 'abd'), 'different strings differ');
ok(!timingSafeEqual('abc', 'abcd'), 'different lengths differ');

// isAllowed — the security core of the api endpoint
ok(isAllowed('Car', 'GET'), 'Car GET allowed');
ok(isAllowed('Car', 'PATCH'), 'Car PATCH allowed');
ok(!isAllowed('Car', 'POST'), 'Car POST denied (not in scope)');
ok(!isAllowed('Car', 'DELETE'), 'DELETE always denied');
ok(!isAllowed('Invoice', 'GET'), 'unlisted entity denied (default-deny)');
ok(!isAllowed('User', 'POST'), 'User creation not exposed');
ok(isAllowed('Customer', 'POST'), 'Customer POST allowed');

// scheduler window — RANGE with catch-up (no missed-day gap)
const now = new Date('2026-07-05T12:00:00Z');
ok(dueWithinWindow('2026-07-10', { now }), 'due in 5d within window');
ok(dueWithinWindow('2026-07-03', { now }), 'overdue 2d still caught (catch-up)');
ok(!dueWithinWindow('2026-07-20', { now }), 'due in 15d not yet');
ok(!dueWithinWindow('2026-06-25', { now }), 'overdue 10d past lookback (ledger stops storm)');

// notified ledger — stops re-notification storms
ok(notifiedRecently('2026-07-05T06:00:00Z', 20, now), 'notified 6h ago → skip');
ok(!notifiedRecently('2026-07-03T06:00:00Z', 20, now), 'notified 2d ago → allowed again');
ok(!notifiedRecently(null, 20, now), 'never notified → allowed');

if (fails) { console.error(`\n${fails} assertion(s) failed`); process.exit(1); }
console.log('backend _shared self-test OK — all assertions passed');
