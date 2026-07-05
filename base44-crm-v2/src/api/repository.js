/**
 * Repository — the thin data layer that was missing in legacy (audit P3).
 *
 * Every entity gets a repository via `makeRepo(entityName)`. Pages/components use
 * these instead of touching `base44.entities.*` directly, so pagination, sane
 * default limits, legacy-field fallback reads, and write-shaping live in ONE place.
 *
 * Legacy-field fallback: several entities carry frozen legacy twins during the
 * migration window (AttendanceRecord timestamp/type/location, WhatsAppMessage
 * message/customerId, un-migrated Car.status). `readField()` centralizes the
 * "prefer canonical, fall back to legacy" logic so no component re-implements the
 * drift patch (which legacy did inline at Attendance.jsx:214, etc.).
 */
import { base44 } from './base44Client';

/** Default page size — legacy fetched whole tables (audit I-127). */
const DEFAULT_LIMIT = 100;

export function makeRepo(entityName) {
  const model = () => base44.entities[entityName];

  return {
    entityName,

    /** Paginated list. Always bounded; callers page explicitly. */
    async list({ sort = '-created_date', limit = DEFAULT_LIMIT, offset = 0 } = {}) {
      return model().list(sort, limit, offset);
    },

    /** Filtered query, bounded. */
    async filter(where, { sort = '-created_date', limit = DEFAULT_LIMIT, offset = 0 } = {}) {
      return model().filter(where, sort, limit, offset);
    },

    async get(id) {
      return model().get(id);
    },

    async create(data) {
      return model().create(data);
    },

    async update(id, patch) {
      return model().update(id, patch);
    },

    async remove(id) {
      return model().delete(id);
    },

    /**
     * Page through everything in bounded batches (for exports/reports only —
     * never for rendering a list). Caps total to avoid runaway.
     */
    async listAll({ sort = '-created_date', batch = 200, max = 5000 } = {}) {
      const out = [];
      for (let offset = 0; offset < max; offset += batch) {
        const page = await model().list(sort, batch, offset);
        out.push(...page);
        if (page.length < batch) break;
      }
      return out;
    },
  };
}

/**
 * Prefer a canonical field, fall back to legacy twins. Keeps drift-handling out
 * of components.
 * @example readField(rec, 'message_text', ['message'])
 */
export function readField(record, canonical, legacyKeys = []) {
  if (record == null) return undefined;
  if (record[canonical] != null) return record[canonical];
  for (const k of legacyKeys) if (record[k] != null) return record[k];
  return undefined;
}

/** Attendance: canonical check-in time with legacy fallback (fixes I-111 reads). */
export const attendanceCheckIn = (r) =>
  readField(r, 'check_in_time', ['checkInTime', '_legacy_timestamp', 'timestamp']);

/** WhatsApp: canonical body / customer with legacy fallback. */
export const waBody = (r) => readField(r, 'message_text', ['message', '_legacy_message']);
export const waCustomerId = (r) => readField(r, 'customer_id', ['customerId', '_legacy_customerId']);
export const waTimestamp = (r) => readField(r, 'created_date', ['timestamp', '_legacy_timestamp']);
