/**
 * VehicleCard — compact inventory card for the Vehicles grid.
 *
 * Shows identity (make/model/year), the VIN in an LTR island (Latin digits read
 * left-to-right inside the RTL card), the single canonical <StatusBadge/>, and an
 * optional source label. The whole card is a react-router <Link> to the car
 * workspace at /vehicles/:id. Colors + Hebrew status text come only from the
 * shared source of truth via StatusBadge — no local status→color map (audit I-128).
 */
import { Link } from 'react-router-dom';
import StatusBadge from '@/components/ui/StatusBadge';
import { VEHICLE_SOURCE, labelOf } from '@/shared/labels';

export default function VehicleCard({ car }) {
  if (!car) return null;

  return (
    <Link
      to={`/vehicles/${car.id}`}
      dir="rtl"
      className="block rounded-xl border border-slate-800 bg-[#0d1117] p-4 transition hover:border-slate-700 hover:bg-[#111826] focus:outline-none focus-visible:ring-1 focus-visible:ring-amber-400"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-slate-100">
            {car.make} {car.model}
            {car.year ? <span className="ms-1 text-slate-400">{car.year}</span> : null}
          </h3>
          <p dir="ltr" className="mt-1 truncate text-start font-mono text-xs text-slate-500">
            {car.vin || '—'}
          </p>
        </div>
        <StatusBadge code={car.status_code} className="shrink-0" />
      </div>

      {car.vehicle_source ? (
        <div className="mt-3 flex items-center gap-1.5 text-xs text-slate-400">
          <span className="text-slate-500">מקור:</span>
          <span>{labelOf(VEHICLE_SOURCE, car.vehicle_source)}</span>
        </div>
      ) : null}
    </Link>
  );
}
