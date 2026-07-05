/**
 * Customers page — the client roster.
 *
 * Loads customers through the bounded @/api/entities repository (never base44.*
 * directly) with an explicit-limit offset pager and a "load more" button — never
 * an unbounded whole-table fetch (audit I-127). When a status is selected we
 * narrow server-side via Customers.filter({ status }); otherwise we page the base
 * list. Free-text search (name / phone) is applied client-side over loaded rows.
 *
 * A grid/list toggle switches CustomerCard layout. The "+ הוסף לקוח" button is
 * gated on can(user,'customers.write') and opens a small inline dialog
 * (full_name, phone via PhoneInput, customer_type, email) → Customers.create.
 * Loading / empty / error states are handled; failures surface via toast, never
 * alert(). RTL root, logical properties throughout; phone is an LTR island.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { can } from '@/lib/permissions';
import { Customers } from '@/api/entities';
import { CUSTOMER_STATUS, CUSTOMER_TYPE, labelOf } from '@/shared/labels';
import { toast } from '@/lib/toast';
import Field from '@/components/ui/Field';
import PhoneInput from '@/components/ui/PhoneInput';
import CustomerCard from '@/components/customers/CustomerCard';

const PAGE_SIZE = 100;

const INPUT_CLASS =
  'min-h-[44px] w-full rounded-lg border border-slate-800 bg-[#0d1117] px-3 py-2 text-start text-sm text-slate-200 placeholder:text-slate-500 outline-none transition focus:border-amber-400 focus:ring-1 focus:ring-amber-400';

/**
 * AddCustomerDialog — the minimal "get a customer into the system" entry point.
 * Four fields; only a name is required. On save calls Customers.create and hands
 * the new record back so the list can refresh.
 */
function AddCustomerDialog({ open, onClose, onCreated }) {
  const typeCodes = Object.keys(CUSTOMER_TYPE || {});
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [customerType, setCustomerType] = useState(typeCodes[0] || '');
  const [saving, setSaving] = useState(false);

  // Close on Escape unless mid-save.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape' && !saving) doClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, saving]);

  if (!open) return null;

  function reset() {
    setFullName('');
    setPhone('');
    setEmail('');
    setCustomerType(typeCodes[0] || '');
  }

  function doClose() {
    if (saving) return;
    reset();
    onClose?.();
  }

  async function handleSubmit(e) {
    e?.preventDefault();
    const name = fullName.trim();
    if (!name) {
      toast.error('יש למלא שם לקוח');
      return;
    }

    setSaving(true);
    try {
      const payload = { full_name: name };
      const ph = phone.trim();
      const em = email.trim();
      if (ph) payload.phone = ph;
      if (em) payload.email = em;
      if (customerType) payload.customer_type = customerType;
      const created = await Customers.create(payload);
      toast.success('הלקוח נוסף');
      onCreated?.(created);
      reset();
      onClose?.();
    } catch (err) {
      console.error('[AddCustomerDialog.submit]', err);
      toast.error('הוספת הלקוח נכשלה');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div dir="rtl" className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={doClose} aria-hidden="true" />

      <form
        onSubmit={handleSubmit}
        className="relative z-10 w-full max-w-md rounded-2xl border border-slate-800 bg-[#0d1117] p-5 shadow-xl"
      >
        <header className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-100">הוספת לקוח</h2>
          <button
            type="button"
            onClick={doClose}
            disabled={saving}
            aria-label="סגירה"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-slate-400 transition hover:text-slate-100 disabled:opacity-60"
          >
            ✕
          </button>
        </header>

        <div className="space-y-4">
          <Field label="שם מלא" htmlFor="ac-name" required>
            <input
              id="ac-name"
              type="text"
              autoFocus
              className={INPUT_CLASS}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="ישראל ישראלי"
            />
          </Field>

          <PhoneInput id="ac-phone" label="טלפון" value={phone} onChange={setPhone} />

          <Field label="סוג לקוח" htmlFor="ac-type">
            <select
              id="ac-type"
              className={INPUT_CLASS}
              value={customerType}
              onChange={(e) => setCustomerType(e.target.value)}
            >
              {Object.entries(CUSTOMER_TYPE || {}).map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="דוא״ל — אופציונלי" htmlFor="ac-email">
            <input
              id="ac-email"
              dir="ltr"
              type="email"
              className={`${INPUT_CLASS} font-mono`}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
            />
          </Field>
        </div>

        <footer className="mt-6 flex items-center justify-start gap-3">
          <button
            type="submit"
            disabled={saving}
            className="min-h-[44px] rounded-lg bg-amber-400 px-5 py-2 text-sm font-semibold text-slate-900 transition hover:bg-amber-300 disabled:opacity-60"
          >
            {saving ? 'שומר…' : 'הוסף לקוח'}
          </button>
          <button
            type="button"
            onClick={doClose}
            disabled={saving}
            className="min-h-[44px] rounded-lg border border-slate-800 px-5 py-2 text-sm text-slate-300 transition hover:border-slate-700 hover:text-slate-100 disabled:opacity-60"
          >
            ביטול
          </button>
        </footer>
      </form>
    </div>
  );
}

export default function CustomersPage() {
  const { user } = useAuth();
  const canWrite = can(user, 'customers.write');

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [view, setView] = useState('grid');
  const [dialogOpen, setDialogOpen] = useState(false);

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState(null);

  // A chosen status narrows the query server-side; "all" pages the base list.
  const serverStatus = statusFilter || null;

  const fetchPage = useCallback(
    (offset) =>
      serverStatus
        ? Customers.filter(
            { status: serverStatus },
            { sort: '-created_date', limit: PAGE_SIZE, offset },
          )
        : Customers.list({ sort: '-created_date', limit: PAGE_SIZE, offset }),
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
      console.error('[CustomersPage.reload]', err);
      setError(err);
      toast.error('טעינת הלקוחות נכשלה');
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
      console.error('[CustomersPage.loadMore]', err);
      toast.error('טעינת לקוחות נוספים נכשלה');
    } finally {
      setLoadingMore(false);
    }
  }, [fetchPage, rows.length]);

  // Client-side text search (name / phone) over the loaded rows.
  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((c) => {
      const hay = [c.full_name, c.phone].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [rows, search]);

  const filtersActive = Boolean(statusFilter) || Boolean(search.trim());

  function handleCreated() {
    setDialogOpen(false);
    reload();
  }

  return (
    <div dir="rtl" className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">לקוחות</h1>
          <p className="mt-1 text-sm text-slate-400">
            {loading ? 'טוען…' : `${visibleRows.length} לקוחות מוצגים`}
          </p>
        </div>

        {canWrite ? (
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="min-h-[44px] rounded-lg bg-amber-400 px-5 py-2 text-sm font-semibold text-slate-900 transition hover:bg-amber-300"
          >
            + הוסף לקוח
          </button>
        ) : null}
      </header>

      {/* Filters row */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[12rem] flex-1">
          <Field label="חיפוש" htmlFor="cust-search">
            <input
              id="cust-search"
              type="search"
              className={INPUT_CLASS}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="שם או טלפון"
            />
          </Field>
        </div>

        <div className="min-w-[10rem]">
          <Field label="סטטוס" htmlFor="cust-status">
            <select
              id="cust-status"
              className={INPUT_CLASS}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">כל הסטטוסים</option>
              {Object.entries(CUSTOMER_STATUS || {}).map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="flex gap-1 rounded-lg border border-slate-800 bg-[#0d1117] p-1">
          {['grid', 'list'].map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setView(mode)}
              aria-pressed={view === mode}
              className={`min-h-[38px] rounded-md px-3 py-1.5 text-sm transition ${
                view === mode
                  ? 'bg-amber-400 font-semibold text-slate-900'
                  : 'text-slate-300 hover:text-slate-100'
              }`}
            >
              {mode === 'grid' ? 'רשת' : 'רשימה'}
            </button>
          ))}
        </div>
      </div>

      {/* Body: error / loading / empty / results */}
      {error && rows.length === 0 ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-6 text-center">
          <p className="text-sm text-rose-300">טעינת הלקוחות נכשלה.</p>
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
          טוען לקוחות…
        </p>
      ) : visibleRows.length === 0 ? (
        <p className="rounded-xl border border-slate-800 bg-[#0d1117] p-8 text-center text-sm text-slate-400">
          {rows.length === 0 && !filtersActive
            ? 'אין לקוחות להצגה עדיין.'
            : 'לא נמצאו לקוחות התואמים לסינון.'}
        </p>
      ) : view === 'grid' ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleRows.map((customer) => (
            <CustomerCard key={customer.id} customer={customer} view="grid" />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {visibleRows.map((customer) => (
            <CustomerCard key={customer.id} customer={customer} view="list" />
          ))}
        </div>
      )}

      {/* Load more — paginates the base query (bounded), regardless of text search */}
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

      <AddCustomerDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onCreated={handleCreated}
      />
    </div>
  );
}
