/**
 * Vehicles page — the inventory board.
 *
 * Loads cars through the bounded @/api/entities repository (never base44.* directly)
 * with explicit-limit offset pagination and a "load more" button — never an
 * unbounded whole-table fetch (audit I-127). When exactly one status is selected we
 * refetch server-side via Cars.filter({ status_code }); otherwise we page the base
 * list and apply the active filters (multi-status, source, text) client-side.
 *
 * The default view hides ARCHIVED_STATUS_CODES (delivered/sold/returned/…); a toggle
 * brings them back. Explicitly selecting an archived status always shows it. The
 * "+ הוסף רכב" button is gated on can(user,'vehicles.create') and opens
 * <QuickAddCarDialog/>. Loading / empty / error states are all handled; failures
 * surface via toast, never alert(). RTL root, logical properties, LTR VIN islands
 * live inside <VehicleCard/>.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { can } from '@/lib/permissions';
import { Cars } from '@/api/entities';
import { ARCHIVED_STATUS_CODES } from '@/shared/vehicleStatus';
import { toast } from '@/lib/toast';
import VehicleCard from '@/components/vehicles/VehicleCard';
import VehicleFilters from '@/components/vehicles/VehicleFilters';
import QuickAddCarDialog from '@/components/vehicles/QuickAddCarDialog';

const PAGE_SIZE = 100;
const EMPTY_FILTERS = { statuses: [], source: '', search: '' };

export default function VehiclesPage() {
  const { user, loading: authLoading } = useAuth();
  const canCreate = can(user, 'vehicles.create');

  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState(null);

  // Server-side narrowing only when a single status is selected; multi-status is
  // resolved client-side (the equality `where` can't express an OR cleanly).
  const serverStatus = filters.statuses.length === 1 ? filters.statuses[0] : null;

  const fetchPage = useCallback(
    (offset) =>
      serverStatus
        ? Cars.filter({ status_code: serverStatus }, { sort: '-created_date', limit: PAGE_SIZE, offset })
        : Cars.list({ sort: '-created_date', limit: PAGE_SIZE, offset }),
    [serverStatus],
  );

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const page = await fetchPage(0);
      const arr = Array.isArray(page) ? page : [];
      setRows(arr);
      setHasMore(arr.length === PAGE_SIZE);
    } catch (err) {
      console.error('[VehiclesPage.reload]', err);
      setError(err);
      toast.error('טעינת הרכבים נכשלה');
    } finally {
      setLoading(false);
    }
  }, [fetchPage]);

  useEffect(() => {
    reload();
  }, [reload]);

  const loadMore = useCallback(async () => {
    setLoadingMore(true);
    try {
      const page = await fetchPage(rows.length);
      const arr = Array.isArray(page) ? page : [];
      setRows((prev) => [...prev, ...arr]);
      setHasMore(arr.length === PAGE_SIZE);
    } catch (err) {
      console.error('[VehiclesPage.loadMore]', err);
      toast.error('טעינת רכבים נוספים נכשלה');
    } finally {
      setLoadingMore(false);
    }
  }, [fetchPage, rows.length]);

  // Client-side filtering over the loaded (base) rows.
  const visibleRows = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return rows.filter((car) => {
      const code = car.status_code;
      if (filters.statuses.length && !filters.statuses.includes(code)) return false;
      if (filters.source && car.vehicle_source !== filters.source) return false;
      // Hide archived by default, unless the user asked to include them or is
      // explicitly filtering to that archived status.
      if (
        !includeArchived &&
        ARCHIVED_STATUS_CODES.includes(code) &&
        !filters.statuses.includes(code)
      ) {
        return false;
      }
      if (q) {
        const hay = [car.make, car.model, car.vin].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, filters, includeArchived]);

  const filtersActive =
    filters.statuses.length > 0 || Boolean(filters.source) || Boolean(filters.search.trim());

  function handleCreated() {
    setDialogOpen(false);
    reload();
  }

  return (
    <div dir="rtl" className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">רכבים</h1>
          <p className="mt-1 text-sm text-slate-400">
            {loading ? 'טוען…' : `${visibleRows.length} רכבים מוצגים`}
          </p>
        </div>

        {canCreate ? (
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="min-h-[44px] rounded-lg bg-amber-400 px-5 py-2 text-sm font-semibold text-slate-900 transition hover:bg-amber-300"
          >
            + הוסף רכב
          </button>
        ) : null}
      </header>

      <VehicleFilters value={filters} onChange={setFilters} />

      <label className="flex min-h-[44px] w-fit cursor-pointer items-center gap-2 text-sm text-slate-300">
        <input
          type="checkbox"
          checked={includeArchived}
          onChange={(e) => setIncludeArchived(e.target.checked)}
          className="h-4 w-4 accent-amber-400"
        />
        הצג רכבים בארכיון
      </label>

      {/* Body: error / loading / empty / grid */}
      {error && rows.length === 0 ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-6 text-center">
          <p className="text-sm text-rose-300">טעינת הרכבים נכשלה.</p>
          <button
            type="button"
            onClick={reload}
            className="mt-3 min-h-[44px] rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-200 transition hover:border-slate-600"
          >
            נסה שוב
          </button>
        </div>
      ) : loading ? (
        <p className="rounded-xl border border-slate-800 bg-[#0d1117] p-6 text-center text-sm text-slate-400">
          טוען רכבים…
        </p>
      ) : visibleRows.length === 0 ? (
        <p className="rounded-xl border border-slate-800 bg-[#0d1117] p-8 text-center text-sm text-slate-400">
          {rows.length === 0 && !filtersActive
            ? 'אין רכבים להצגה עדיין.'
            : 'לא נמצאו רכבים התואמים לסינון.'}
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleRows.map((car) => (
            <VehicleCard key={car.id} car={car} />
          ))}
        </div>
      )}

      {/* Load more — paginates the base query (bounded), regardless of client filters */}
      {!loading && hasMore ? (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={loadMore}
            disabled={loadingMore}
            className="min-h-[44px] rounded-lg border border-slate-800 px-5 py-2 text-sm text-slate-200 transition hover:border-slate-700 disabled:opacity-60"
          >
            {loadingMore ? 'טוען…' : 'טען עוד'}
          </button>
        </div>
      ) : null}

      <QuickAddCarDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onCreated={handleCreated}
      />
    </div>
  );
}
