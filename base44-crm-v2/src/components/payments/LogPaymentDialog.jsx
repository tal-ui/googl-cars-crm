/**
 * LogPaymentDialog — the golden "log a payment in ≤4 fields from a global +".
 *
 * A focused modal that captures exactly four visible inputs and writes one
 * Payment row: customer (typeahead → customer_id), amount+currency (MoneyInput),
 * payment_method (PAYMENT_METHOD codes → Hebrew via labelOf), and an OPTIONAL
 * related_vehicle_id. `date` is stamped to today (ISO date) on submit, so the
 * user never touches it. No cost/finance context is needed to file a receipt.
 *
 * Data access goes through the @/api/entities repositories (never base44.* ).
 * Customers/Cars are loaded once when the dialog opens (bounded lists) and the
 * customer typeahead filters client-side, so keystrokes never fan out to the API.
 *
 * RTL root; every LTR datum (phone, amount, currency, VIN) sits in its own LTR
 * island. Status/method labels are always English codes rendered via labelOf().
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import Field from '@/components/ui/Field';
import MoneyInput from '@/components/ui/MoneyInput';
import { Customers, Cars, Payments } from '@/api/entities';
import { PAYMENT_METHOD, labelOf } from '@/shared/labels';
import { toast } from '@/lib/toast';

const INPUT_CLASS =
  'min-h-[44px] w-full rounded-lg border border-slate-800 bg-[#0d1117] px-3 py-2 text-start text-sm text-slate-200 placeholder:text-slate-500 outline-none transition focus:border-amber-400 focus:ring-1 focus:ring-amber-400';

const PAYMENT_METHOD_CODES = Object.keys(PAYMENT_METHOD);

const todayIso = () => new Date().toISOString().slice(0, 10);

const customerName = (c) =>
  c?.full_name || c?.company_name || c?.phone || c?.id || '';

const carLabel = (car) =>
  [car?.year, car?.make, car?.model, car?.trim].filter(Boolean).join(' ') ||
  car?.vin ||
  car?.id;

export default function LogPaymentDialog({ open, onClose, onCreated }) {
  const [customers, setCustomers] = useState([]);
  const [cars, setCars] = useState([]);

  const [query, setQuery] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [showList, setShowList] = useState(false);

  const [money, setMoney] = useState({ amount: null, currency: 'ILS' });
  const [method, setMethod] = useState('cash');
  const [vehicleId, setVehicleId] = useState('');

  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const firstFieldRef = useRef(null);

  // Load the reference lists once per open, and reset the form to a clean slate.
  useEffect(() => {
    if (!open) return undefined;
    let alive = true;

    setQuery('');
    setCustomerId('');
    setShowList(false);
    setMoney({ amount: null, currency: 'ILS' });
    setMethod('cash');
    setVehicleId('');
    setErrors({});
    setSaving(false);

    async function load() {
      try {
        const [cust, cs] = await Promise.all([
          Customers.list({ limit: 500, sort: 'full_name' }),
          Cars.list({ limit: 500 }),
        ]);
        if (!alive) return;
        setCustomers(Array.isArray(cust) ? cust : []);
        setCars(Array.isArray(cs) ? cs : []);
      } catch (err) {
        console.error('[LogPaymentDialog.load]', err);
        if (alive) toast.error('טעינת הלקוחות נכשלה');
      }
    }
    load();

    return () => {
      alive = false;
    };
  }, [open]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return customers.slice(0, 8);
    return customers
      .filter((c) => {
        const hay = `${customerName(c)} ${c?.company_name || ''} ${c?.phone || ''}`.toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 8);
  }, [customers, query]);

  const selectCustomer = (c) => {
    setCustomerId(c.id);
    setQuery(customerName(c));
    setShowList(false);
    setErrors((e) => ({ ...e, customer: undefined }));
  };

  const onQueryChange = (value) => {
    setQuery(value);
    setCustomerId(''); // editing invalidates a prior pick — force a re-select
    setShowList(true);
  };

  async function handleSubmit() {
    const nextErrors = {};
    if (!customerId) nextErrors.customer = 'יש לבחור לקוח מהרשימה';
    if (money.amount == null || Number(money.amount) <= 0)
      nextErrors.amount = 'יש להזין סכום חיובי';
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }

    setSaving(true);
    const payload = {
      customer_id: customerId,
      amount: Number(money.amount),
      currency: money.currency,
      payment_method: method,
      date: todayIso(),
    };
    if (vehicleId) payload.related_vehicle_id = vehicleId;

    try {
      const saved = await Payments.create(payload);
      toast.success('התשלום נרשם');
      onCreated?.(saved);
      onClose?.();
    } catch (err) {
      console.error('[LogPaymentDialog.submit]', err);
      toast.error('רישום התשלום נכשל');
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 sm:items-center"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="רישום תשלום"
        className="w-full max-w-md rounded-2xl border border-slate-800 bg-[#0d1117] p-5 shadow-2xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-100">רישום תשלום</h2>
          <button
            type="button"
            onClick={() => onClose?.()}
            aria-label="סגירה"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4">
          {/* 1 — customer typeahead */}
          <Field label="לקוח" required htmlFor="payment-customer" error={errors.customer}>
            <div className="relative">
              <input
                id="payment-customer"
                ref={firstFieldRef}
                type="text"
                autoComplete="off"
                className={INPUT_CLASS}
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                onFocus={() => setShowList(true)}
                onBlur={() => setTimeout(() => setShowList(false), 120)}
                placeholder="חיפוש לפי שם או טלפון"
              />
              {showList && matches.length > 0 ? (
                <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-slate-800 bg-[#0d1117] py-1 shadow-xl">
                  {matches.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          selectCustomer(c);
                        }}
                        className="flex min-h-[44px] w-full items-center justify-between gap-3 px-3 py-2 text-start text-sm text-slate-200 transition hover:bg-slate-800"
                      >
                        <span className="truncate">{customerName(c)}</span>
                        {c?.phone ? (
                          <span dir="ltr" className="shrink-0 text-xs text-slate-500">
                            {c.phone}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </Field>

          {/* 2 — amount + currency (LTR island lives inside MoneyInput) */}
          <div>
            <MoneyInput
              id="payment-amount"
              label="סכום"
              value={money}
              onChange={setMoney}
            />
            {errors.amount ? (
              <p className="mt-1.5 text-start text-xs text-rose-400">{errors.amount}</p>
            ) : null}
          </div>

          {/* 3 — payment method */}
          <Field label="אמצעי תשלום" htmlFor="payment-method">
            <select
              id="payment-method"
              className={INPUT_CLASS}
              value={method}
              onChange={(e) => setMethod(e.target.value)}
            >
              {PAYMENT_METHOD_CODES.map((code) => (
                <option key={code} value={code}>
                  {labelOf(PAYMENT_METHOD, code)}
                </option>
              ))}
            </select>
          </Field>

          {/* 4 — optional related vehicle */}
          <Field label="רכב משויך (אופציונלי)" htmlFor="payment-vehicle">
            <select
              id="payment-vehicle"
              className={INPUT_CLASS}
              value={vehicleId}
              onChange={(e) => setVehicleId(e.target.value)}
            >
              <option value="">— ללא רכב —</option>
              {cars.map((car) => (
                <option key={car.id} value={car.id}>
                  {carLabel(car)}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="mt-6 flex items-center justify-start gap-3">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            className="min-h-[44px] rounded-lg bg-amber-400 px-5 py-2 text-sm font-semibold text-slate-900 transition hover:bg-amber-300 disabled:opacity-60"
          >
            {saving ? 'שומר…' : 'רישום תשלום'}
          </button>
          <button
            type="button"
            onClick={() => onClose?.()}
            className="min-h-[44px] rounded-lg border border-slate-800 px-5 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-800"
          >
            ביטול
          </button>
        </div>
      </div>
    </div>
  );
}
