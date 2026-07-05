/**
 * CustomerCard — compact customer tile for the Customers list.
 *
 * Shows the customer's name, phone in an LTR island (Latin digits + '+' read
 * left-to-right inside the RTL card), a neutral status pill whose Hebrew text
 * comes from the shared CUSTOMER_STATUS map via labelOf(), and the customer type
 * (CUSTOMER_TYPE). Colors/labels come only from @/shared/labels — no local maps.
 *
 * Props:
 *  - customer: the record ({ full_name, phone, status, customer_type, email })
 *  - view:     'grid' (default) | 'list' — list packs identity + meta on one row.
 */
import { CUSTOMER_STATUS, CUSTOMER_TYPE, labelOf } from '@/shared/labels';

function initialOf(name) {
  const s = (name || '').trim();
  return s ? s[0].toUpperCase() : '?';
}

export default function CustomerCard({ customer, view = 'grid' }) {
  if (!customer) return null;

  const name = customer.full_name || 'ללא שם';
  const phone = customer.phone;
  const statusCode = customer.status;
  const typeCode = customer.customer_type;

  const avatar = (
    <span
      aria-hidden="true"
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-800 bg-[#111826] text-sm font-semibold text-amber-400"
    >
      {initialOf(name)}
    </span>
  );

  const statusPill = statusCode ? (
    <span className="inline-flex shrink-0 items-center rounded-full border border-slate-700 bg-slate-800/50 px-2.5 py-0.5 text-xs font-medium text-slate-300">
      {labelOf(CUSTOMER_STATUS, statusCode)}
    </span>
  ) : null;

  const phoneEl = phone ? (
    <a
      href={`tel:${phone}`}
      dir="ltr"
      className="inline-block text-start font-mono text-xs text-slate-400 transition hover:text-amber-400"
    >
      {phone}
    </a>
  ) : (
    <span className="text-xs text-slate-500">—</span>
  );

  if (view === 'list') {
    return (
      <div
        dir="rtl"
        className="flex items-center gap-3 rounded-xl border border-slate-800 bg-[#0d1117] p-3 transition hover:border-slate-700"
      >
        {avatar}
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-slate-100">{name}</h3>
          {phoneEl}
        </div>
        {typeCode ? (
          <span className="hidden shrink-0 text-xs text-slate-400 sm:inline">
            {labelOf(CUSTOMER_TYPE, typeCode)}
          </span>
        ) : null}
        {statusPill}
      </div>
    );
  }

  return (
    <div
      dir="rtl"
      className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-[#0d1117] p-4 transition hover:border-slate-700 hover:bg-[#111826]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {avatar}
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-slate-100">{name}</h3>
            <div className="mt-0.5">{phoneEl}</div>
          </div>
        </div>
        {statusPill}
      </div>

      <div className="flex items-center gap-1.5 text-xs text-slate-400">
        <span className="text-slate-500">סוג:</span>
        <span>{typeCode ? labelOf(CUSTOMER_TYPE, typeCode) : '—'}</span>
      </div>
    </div>
  );
}
