/**
 * Scheduler reliability helpers — fix the audit's P2 scheduler bugs:
 *  - I-115 non-idempotent overdue notification storms (no "sent" ledger,
 *    exact-day match → missed day = skipped),
 *  - I-116 batch-fatal loops (one failed recipient aborts the rest),
 *  - I-119 silent failures / no heartbeat.
 *
 * Pattern (adopted from the one good legacy function, checkTaskReminders):
 *  - `runBatch` wraps every item in try/catch (Promise.allSettled), collects
 *    errors, never aborts the batch.
 *  - `dueWithinWindow` matches a RANGE with catch-up, not exact-day equality.
 *  - `notifiedRecently` + `markNotified` form a per-item "sent" ledger so overdue
 *    items don't re-alert on every tick.
 *  - `heartbeat` records last-successful-run; a stale heartbeat is alertable.
 */
import { logLine } from "./http.ts";

export interface BatchResult<T> {
  ok: number;
  failed: number;
  errors: { item: string; error: string }[];
  results: T[];
}

/** Run `fn` over items concurrently, isolating failures. Never rejects. */
export async function runBatch<I, T>(
  fnName: string,
  items: I[],
  key: (i: I) => string,
  fn: (i: I) => Promise<T>,
  { concurrency = 5 }: { concurrency?: number } = {},
): Promise<BatchResult<T>> {
  const out: BatchResult<T> = { ok: 0, failed: 0, errors: [], results: [] };
  for (let i = 0; i < items.length; i += concurrency) {
    const slice = items.slice(i, i + concurrency);
    const settled = await Promise.allSettled(slice.map((it) => fn(it)));
    settled.forEach((s, j) => {
      if (s.status === "fulfilled") {
        out.ok++;
        out.results.push(s.value);
      } else {
        out.failed++;
        out.errors.push({ item: key(slice[j]), error: String(s.reason) });
      }
    });
  }
  logLine({ fn: fnName, batch_ok: out.ok, batch_failed: out.failed });
  return out;
}

/**
 * True if `dueDate` falls within [now-lookbackDays, now+within] — a RANGE, so a
 * skipped scheduler run still catches the item next tick (no missed-day gap).
 */
export function dueWithinWindow(
  dueDate: string | Date,
  { within = 7, lookbackDays = 3, now = new Date() }: {
    within?: number;
    lookbackDays?: number;
    now?: Date;
  } = {},
): boolean {
  const d = new Date(dueDate);
  if (Number.isNaN(d.getTime())) return false;
  const diffDays = Math.floor((d.getTime() - now.getTime()) / 86400000);
  return diffDays <= within && diffDays >= -lookbackDays;
}

/**
 * Per-item "sent" ledger to stop overdue re-notification storms. Caller supplies
 * the item's last-notified timestamp; returns true if we already notified within
 * `cooldownHours`.
 */
export function notifiedRecently(
  lastNotifiedAt: string | null | undefined,
  cooldownHours = 20,
  now = new Date(),
): boolean {
  if (!lastNotifiedAt) return false;
  const t = new Date(lastNotifiedAt).getTime();
  if (Number.isNaN(t)) return false;
  return now.getTime() - t < cooldownHours * 3600_000;
}

/** Record a successful scheduler run (heartbeat). `store` is any create-able entity. */
export async function heartbeat(
  store: { create: (d: Record<string, unknown>) => Promise<unknown> },
  fnName: string,
  summary: Record<string, unknown> = {},
): Promise<void> {
  await store.create({
    job: fnName,
    ran_at: new Date().toISOString(),
    ...summary,
  });
}
