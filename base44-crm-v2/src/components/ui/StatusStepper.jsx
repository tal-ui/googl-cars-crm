/**
 * StatusStepper — advance a vehicle's status in ONE click.
 *
 * Implements the golden flow "advance status = 1 click via a stepper showing only
 * legal transitions" (PLAN Phase 2). Offers exactly `nextStatuses(current)` from
 * the status machine — no free-form dropdown of all 21 codes, no illegal jumps.
 * The actual write goes through a server function that re-validates the transition
 * (client is not trusted), plus fires the customer WhatsApp + auto-tasks.
 */
import { nextStatuses, statusLabel, statusClasses } from '@/shared/vehicleStatus';

export default function StatusStepper({ current, onAdvance, disabled = false }) {
  const options = nextStatuses(current);

  return (
    <div dir="rtl" className="flex flex-col gap-2">
      <div className="text-xs text-slate-400">סטטוס נוכחי</div>
      <span className={`inline-flex w-fit items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusClasses(current)}`}>
        {statusLabel(current)}
      </span>

      {options.length > 0 ? (
        <>
          <div className="mt-2 text-xs text-slate-400">העבר ל…</div>
          <div className="flex flex-wrap gap-2">
            {options.map((code) => (
              <button
                key={code}
                type="button"
                disabled={disabled}
                onClick={() => onAdvance(code)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition hover:brightness-125 disabled:opacity-50 ${statusClasses(code)}`}
              >
                {statusLabel(code)}
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="mt-1 text-xs text-slate-500">סטטוס סופי — אין מעברים.</div>
      )}
    </div>
  );
}
