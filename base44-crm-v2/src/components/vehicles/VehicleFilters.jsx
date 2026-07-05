/**
 * VehicleFilters — controlled filter bar for the Vehicles list.
 *
 * Fully controlled: the parent owns the `value` ({ statuses, source, search }) and
 * every change calls `onChange(next)` with the whole shape. Status is a multi-select
 * of chips built from the canonical VEHICLE_STATUSES (colors + Hebrew labels via the
 * shared source of truth); source is a single select from VEHICLE_SOURCE; search is
 * free text matched (by the parent) against make/model/vin.
 *
 * No data access or filtering happens here — this component only reports intent.
 */
import { VEHICLE_STATUSES, statusLabel, statusClasses } from '@/shared/vehicleStatus';
import { VEHICLE_SOURCE, labelOf } from '@/shared/labels';

const INPUT_CLASS =
  'min-h-[44px] w-full rounded-lg border border-slate-800 bg-[#0d1117] px-3 py-2 text-start text-sm text-slate-200 placeholder:text-slate-500 outline-none transition focus:border-amber-400 focus:ring-1 focus:ring-amber-400';

export default function VehicleFilters({ value, onChange }) {
  const statuses = value?.statuses ?? [];
  const source = value?.source ?? '';
  const search = value?.search ?? '';

  const patch = (next) => onChange({ statuses, source, search, ...next });

  const toggleStatus = (code) => {
    const next = statuses.includes(code)
      ? statuses.filter((c) => c !== code)
      : [...statuses, code];
    patch({ statuses: next });
  };

  const hasActive = statuses.length > 0 || Boolean(source) || Boolean(search.trim());

  return (
    <div dir="rtl" className="space-y-4 rounded-xl border border-slate-800 bg-[#0d1117] p-4">
      {/* search + source */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="veh-search" className="mb-1.5 block text-start text-xs font-medium text-slate-400">
            חיפוש
          </label>
          <input
            id="veh-search"
            type="search"
            value={search}
            onChange={(e) => patch({ search: e.target.value })}
            placeholder="יצרן, דגם או מספר שלדה"
            className={INPUT_CLASS}
          />
        </div>

        <div>
          <label htmlFor="veh-source" className="mb-1.5 block text-start text-xs font-medium text-slate-400">
            מקור
          </label>
          <select
            id="veh-source"
            value={source}
            onChange={(e) => patch({ source: e.target.value })}
            className={INPUT_CLASS}
          >
            <option value="">כל המקורות</option>
            {Object.keys(VEHICLE_SOURCE).map((code) => (
              <option key={code} value={code}>
                {labelOf(VEHICLE_SOURCE, code)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* status multi-select */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-start text-xs font-medium text-slate-400">סטטוס</span>
          {hasActive ? (
            <button
              type="button"
              onClick={() => onChange({ statuses: [], source: '', search: '' })}
              className="min-h-[32px] text-xs font-medium text-amber-300 transition hover:text-amber-200"
            >
              נקה סינון
            </button>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          {VEHICLE_STATUSES.map((s) => {
            const active = statuses.includes(s.code);
            return (
              <button
                key={s.code}
                type="button"
                onClick={() => toggleStatus(s.code)}
                aria-pressed={active}
                className={`min-h-[40px] rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  active
                    ? `${statusClasses(s.code)} ring-1 ring-amber-400/40`
                    : 'border-slate-800 bg-[#0d1117] text-slate-400 hover:border-slate-700 hover:text-slate-200'
                }`}
              >
                {statusLabel(s.code)}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
