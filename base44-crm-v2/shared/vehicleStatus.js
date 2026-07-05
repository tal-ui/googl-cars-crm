/**
 * Canonical vehicle status machine — the single source of truth.
 *
 * Replaces the 7 divergent status→color maps and 4+ enum copies found in the
 * legacy app (audit ISSUES I-128). Legacy stored Hebrew display strings AS the
 * status value, which caused the typo bug ("טרייייד אין"), out-of-enum values
 * ("במלאי", "הועבר לארכיון"), and impossible i18n/filtering.
 *
 * v2 stores a stable English `code` on the record; Hebrew is presentation only.
 * The transition table is enforced server-side (see functions/_shared) — the UI
 * only ever offers legal next steps.
 *
 * Import both in frontend (src/) and backend (functions/) — keep this file the
 * ONLY place these definitions live.
 */

/** Ordered lifecycle. `stage` groups statuses for the tabbed Car workspace. */
export const VEHICLE_STATUSES = [
  // stage: intake
  { code: 'awaiting_purchase',   he: 'ממתין לרכישת רכב',              stage: 'purchase',  tone: 'slate'  },
  { code: 'awaiting_invoice',    he: 'ממתין לחשבונית',                stage: 'purchase',  tone: 'slate'  },
  { code: 'paid_pending',        he: 'שולם ממתין',                    stage: 'purchase',  tone: 'amber'  },
  { code: 'paid_temporary',      he: 'שולם זמנית',                    stage: 'purchase',  tone: 'amber'  },
  // stage: shipping
  { code: 'overseas_warehouse',  he: 'במחסן בחו״ל',                   stage: 'shipping',  tone: 'violet' },
  { code: 'awaiting_shipment',   he: 'ממתין למשלוח',                  stage: 'shipping',  tone: 'violet' },
  { code: 'at_sea',              he: 'בים',                           stage: 'shipping',  tone: 'sky'    },
  { code: 'in_transit',          he: 'בדרך לארץ',                     stage: 'shipping',  tone: 'sky'    },
  // stage: customs / registration
  { code: 'at_port',             he: 'בנמל בישראל ממתין לשחרור',      stage: 'customs',   tone: 'sky'    },
  { code: 'local_installations', he: 'התקנות בארץ',                   stage: 'prep',      tone: 'violet' },
  // stage: inventory / order
  { code: 'in_stock',            he: 'במלאי במגרש',                   stage: 'stock',     tone: 'emerald'},
  { code: 'available_to_order',  he: 'זמין להזמנה',                   stage: 'stock',     tone: 'emerald'},
  { code: 'on_order',            he: 'בהזמנה',                        stage: 'stock',     tone: 'amber'  },
  // stage: handover
  { code: 'ready_for_delivery',  he: 'מוכן ממתין למסירה',             stage: 'delivery',  tone: 'emerald'},
  { code: 'prepping_delivery',   he: 'רכב בהכנה למסירה ללקוח',        stage: 'delivery',  tone: 'amber'  },
  { code: 'delivered',           he: 'נמסר ללקוח',                    stage: 'closed',    tone: 'emerald'},
  { code: 'sold',                he: 'נמכר',                          stage: 'closed',    tone: 'emerald'},
  // terminal off-ramps
  { code: 'trade_in',            he: 'טרייד אין',                     stage: 'closed',    tone: 'slate'  },
  { code: 'returned',            he: 'הוחזר',                         stage: 'closed',    tone: 'rose'   },
  { code: 'cancelled',           he: 'בוטל',                          stage: 'closed',    tone: 'rose'   },
  { code: 'archived',            he: 'הועבר לארכיון',                 stage: 'closed',    tone: 'slate'  },
];

export const STATUS_CODES = VEHICLE_STATUSES.map((s) => s.code);

const BY_CODE = Object.fromEntries(VEHICLE_STATUSES.map((s) => [s.code, s]));

/**
 * Legacy Hebrew-string → v2 code map, used only by the backfill migration and by
 * v2 read-fallback for un-migrated rows. Includes the typo and out-of-enum values
 * seen in real data (audit I-009, PROCESS-MAP §1).
 */
export const LEGACY_STATUS_TO_CODE = {
  'ממתין לרכישת רכב': 'awaiting_purchase',
  'ממתין לחשבונית': 'awaiting_invoice',
  'שולם ממתין': 'paid_pending',
  'שולם זמנית': 'paid_temporary',
  'במחסן בחו״ל': 'overseas_warehouse',
  'במחסן בחו"ל': 'overseas_warehouse',   // straight-quote variant seen in data
  'ממתין למשלוח': 'awaiting_shipment',
  'בים': 'at_sea',
  'בדרך לארץ': 'in_transit',
  'בנמל בישראל ממתין לשחרור': 'at_port',
  'התקנות בארץ': 'local_installations',
  'במלאי במגרש': 'in_stock',
  'במלאי': 'in_stock',                    // out-of-enum legacy value
  'זמין להזמנה': 'available_to_order',
  'בהזמנה': 'on_order',
  'מוכן ממתין למסירה': 'ready_for_delivery',
  'רכב בהכנה למסירה ללקוח': 'prepping_delivery',
  'נמסר ללקוח': 'delivered',
  'נמכר': 'sold',
  'טרייד אין': 'trade_in',
  'טרייייד אין': 'trade_in',              // typo (triple yud) → canonical
  'הוחזר': 'returned',
  'בוטל': 'cancelled',
  'הועבר לארכיון': 'archived',            // out-of-enum legacy value
};

/**
 * Allowed transitions. Kept intentionally permissive (the real pipeline collapses
 * stages — PROCESS-MAP §1), but blocks nonsense like reviving a delivered car.
 * `*` from any non-terminal to cancelled/archived is always allowed. Pending
 * owner validation of the true pipeline (PROCESS-MAP open question #1).
 */
export const STATUS_TRANSITIONS = {
  awaiting_purchase:   ['awaiting_invoice', 'paid_pending', 'cancelled'],
  awaiting_invoice:    ['paid_pending', 'paid_temporary', 'cancelled'],
  paid_pending:        ['paid_temporary', 'overseas_warehouse', 'awaiting_shipment', 'cancelled'],
  paid_temporary:      ['paid_pending', 'overseas_warehouse', 'awaiting_shipment', 'cancelled'],
  overseas_warehouse:  ['awaiting_shipment', 'at_sea', 'in_transit', 'cancelled'],
  awaiting_shipment:   ['at_sea', 'in_transit', 'cancelled'],
  at_sea:              ['in_transit', 'at_port', 'cancelled'],
  in_transit:          ['at_port', 'local_installations', 'cancelled'],
  at_port:             ['local_installations', 'in_stock', 'cancelled'],
  local_installations: ['in_stock', 'ready_for_delivery', 'prepping_delivery', 'cancelled'],
  in_stock:            ['available_to_order', 'on_order', 'prepping_delivery', 'ready_for_delivery', 'trade_in', 'cancelled'],
  available_to_order:  ['on_order', 'prepping_delivery', 'in_stock', 'cancelled'],
  on_order:            ['prepping_delivery', 'ready_for_delivery', 'in_stock', 'cancelled'],
  ready_for_delivery:  ['prepping_delivery', 'delivered', 'cancelled'],
  prepping_delivery:   ['ready_for_delivery', 'delivered', 'cancelled'],
  delivered:           ['sold', 'returned', 'archived'],
  sold:                ['returned', 'archived'],
  trade_in:            ['in_stock', 'archived'],
  returned:            ['archived', 'in_stock'],
  cancelled:           ['archived', 'awaiting_purchase'],
  archived:            [],
};

/** Statuses that count as "archived / off the active board" (replaces the two
 *  divergent inline arrays in useCoreData.js:16 and VehicleForm.jsx:606). */
export const ARCHIVED_STATUS_CODES = ['delivered', 'sold', 'returned', 'cancelled', 'archived', 'trade_in'];

export const statusLabel = (code) => BY_CODE[code]?.he ?? code;
export const statusTone = (code) => BY_CODE[code]?.tone ?? 'slate';
export const statusStage = (code) => BY_CODE[code]?.stage ?? null;
export const isArchivedStatus = (code) => ARCHIVED_STATUS_CODES.includes(code);
export const canTransition = (from, to) => (STATUS_TRANSITIONS[from] ?? []).includes(to);
export const nextStatuses = (from) => STATUS_TRANSITIONS[from] ?? [];
export const codeFromLegacy = (heOrCode) =>
  BY_CODE[heOrCode] ? heOrCode : (LEGACY_STATUS_TO_CODE[heOrCode] ?? null);

/** Tailwind classes per tone — the ONE place status colors are defined (was 7×). */
export const TONE_CLASSES = {
  slate:   'bg-slate-500/15 text-slate-300 border-slate-500/30',
  amber:   'bg-amber-500/15 text-amber-300 border-amber-500/30',
  sky:     'bg-sky-500/15 text-sky-300 border-sky-500/30',
  violet:  'bg-violet-500/15 text-violet-300 border-violet-500/30',
  emerald: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  rose:    'bg-rose-500/15 text-rose-300 border-rose-500/30',
};
export const statusClasses = (code) => TONE_CLASSES[statusTone(code)];
