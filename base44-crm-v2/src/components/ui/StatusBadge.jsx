/**
 * StatusBadge — the ONE vehicle-status pill.
 *
 * Replaces the 7 divergent status→color maps found across the legacy app
 * (Dashboard, Vehicles, VehicleViewDialog, VehicleCard, StatusSelect,
 * PortalVehicleTab, CustomReportExporter — audit I-128), whose colors already
 * disagreed. Colors + Hebrew label come from the single source of truth,
 * `@/shared/vehicleStatus`.
 */
import { statusLabel, statusClasses } from '@/shared/vehicleStatus';

export default function StatusBadge({ code, className = '' }) {
  return (
    <span
      dir="rtl"
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusClasses(
        code,
      )} ${className}`}
    >
      {statusLabel(code)}
    </span>
  );
}
