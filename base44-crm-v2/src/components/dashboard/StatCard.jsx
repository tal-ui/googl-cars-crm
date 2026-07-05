/**
 * StatCard — the ONE reusable KPI tile for every role dashboard.
 *
 * Replaces the three forked legacy dashboards' bespoke stat boxes (each with its
 * own markup, color logic, and deep-link handling — audit I-107). A card shows a
 * label, a big value, an optional hint and trend, and — when `to` is given — the
 * whole tile becomes a react-router <Link> to the pre-filtered page.
 *
 * RTL-first: numeric/currency values live in an LTR island so digits and symbols
 * read correctly inside the Hebrew layout. Touch-friendly (min 44px tap target).
 */
import { Link } from 'react-router-dom';

const TREND_TONE = {
  up: 'text-emerald-400',
  down: 'text-rose-400',
  flat: 'text-slate-400',
};

const TREND_GLYPH = { up: '▲', down: '▼', flat: '■' };

function CardBody({ label, value, hint, trend, icon, ltrValue }) {
  return (
    <div className="flex h-full min-h-[88px] flex-col justify-between gap-2">
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium text-slate-400">{label}</span>
        {icon ? <span className="text-slate-500">{icon}</span> : null}
      </div>

      <div className="flex items-end justify-between gap-2">
        {ltrValue ? (
          <span dir="ltr" className="text-2xl font-semibold text-slate-100">
            {value}
          </span>
        ) : (
          <span className="text-2xl font-semibold text-slate-100">{value}</span>
        )}

        {trend ? (
          <span className={`text-xs font-medium ${TREND_TONE[trend.dir] || TREND_TONE.flat}`}>
            <span dir="ltr">{TREND_GLYPH[trend.dir] || ''} {trend.label}</span>
          </span>
        ) : null}
      </div>

      {hint ? <span className="text-xs text-slate-500">{hint}</span> : null}
    </div>
  );
}

export default function StatCard({
  label,
  value,
  hint,
  trend,
  to,
  icon,
  ltrValue = true,
}) {
  const base =
    'block rounded-xl border border-slate-800 bg-[#0d1117] p-4 transition';

  if (to) {
    return (
      <Link
        to={to}
        dir="rtl"
        className={`${base} hover:border-amber-400/40 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400`}
      >
        <CardBody
          label={label}
          value={value}
          hint={hint}
          trend={trend}
          icon={icon}
          ltrValue={ltrValue}
        />
      </Link>
    );
  }

  return (
    <div dir="rtl" className={base}>
      <CardBody
        label={label}
        value={value}
        hint={hint}
        trend={trend}
        icon={icon}
        ltrValue={ltrValue}
      />
    </div>
  );
}
