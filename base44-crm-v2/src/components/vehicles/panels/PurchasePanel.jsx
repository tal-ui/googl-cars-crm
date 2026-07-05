/**
 * PurchasePanel — the "רכישה" (purchase) stage of the Car workspace.
 *
 * Focused form that owns EXACTLY one satellite: the single CarPurchase for a car.
 * On mount it loads the existing CarPurchase (filter by car_id) and the supplier
 * list; on save it upserts (update when one exists, else create) so the write is
 * small and independent of the Car core (audit I-121).
 *
 * Money uses MoneyInput ({amount,currency}) → split into price_foreign +
 * foreign_currency on save. Dates use DateInputHe. All strings render RTL; the
 * numeric/date/code islands render LTR.
 */
import { useEffect, useState } from 'react';
import Field from '@/components/ui/Field';
import MoneyInput from '@/components/ui/MoneyInput';
import DateInputHe from '@/components/ui/DateInputHe';
import { CarPurchases, Suppliers } from '@/api/entities';
import { toast } from '@/lib/toast';

const INPUT_CLASS =
  'min-h-[44px] w-full rounded-lg border border-slate-800 bg-[#0d1117] px-3 py-2 text-start text-sm text-slate-200 placeholder:text-slate-500 outline-none transition focus:border-amber-400 focus:ring-1 focus:ring-amber-400';

const EMPTY = {
  purchase_date: '',
  purchase_invoice_number: '',
  supplier_id: '',
  price: { amount: null, currency: 'USD' },
  exchange_rate: '',
  import_cost: '',
  notes: '',
};

export default function PurchasePanel({ car, onSaved }) {
  const carId = car?.id;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [existingId, setExistingId] = useState(null);
  const [suppliers, setSuppliers] = useState([]);
  const [form, setForm] = useState(EMPTY);

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      try {
        const [rows, sup] = await Promise.all([
          carId ? CarPurchases.filter({ car_id: carId }, { limit: 1 }) : Promise.resolve([]),
          Suppliers.list({ limit: 200 }),
        ]);
        if (!alive) return;
        setSuppliers(Array.isArray(sup) ? sup : []);
        const rec = Array.isArray(rows) ? rows[0] : null;
        if (rec) {
          setExistingId(rec.id);
          setForm({
            purchase_date: rec.purchase_date || '',
            purchase_invoice_number: rec.purchase_invoice_number || '',
            supplier_id: rec.supplier_id || '',
            price: {
              amount: rec.price_foreign ?? null,
              currency: rec.foreign_currency || 'USD',
            },
            exchange_rate: rec.exchange_rate ?? '',
            import_cost: rec.import_cost ?? '',
            notes: rec.notes || '',
          });
        } else {
          setExistingId(null);
          setForm(EMPTY);
        }
      } catch (err) {
        console.error('[PurchasePanel.load]', err);
        toast.error('טעינת נתוני הרכישה נכשלה');
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    return () => {
      alive = false;
    };
  }, [carId]);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  async function handleSave() {
    if (!carId) return;
    setSaving(true);
    const patch = {
      car_id: carId,
      purchase_date: form.purchase_date || null,
      purchase_invoice_number: form.purchase_invoice_number.trim() || null,
      supplier_id: form.supplier_id || null,
      price_foreign: form.price.amount,
      foreign_currency: form.price.currency,
      exchange_rate: form.exchange_rate === '' ? null : Number(form.exchange_rate),
      import_cost: form.import_cost === '' ? null : Number(form.import_cost),
      notes: form.notes.trim() || null,
    };
    try {
      const saved = existingId
        ? await CarPurchases.update(existingId, patch)
        : await CarPurchases.create(patch);
      if (saved?.id) setExistingId(saved.id);
      toast.success('פרטי הרכישה נשמרו');
      onSaved?.(saved);
    } catch (err) {
      console.error('[PurchasePanel.save]', err);
      toast.error('שמירת פרטי הרכישה נכשלה');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div dir="rtl" className="p-6 text-sm text-slate-400">
        טוען נתוני רכישה…
      </div>
    );
  }

  const supplierName = (s) => s?.name || s?.company_name || s?.full_name || s?.id;

  return (
    <div dir="rtl" className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <DateInputHe
          id="purchase_date"
          label="תאריך רכישה"
          value={form.purchase_date}
          onChange={(iso) => set('purchase_date', iso)}
        />

        <Field label="מספר חשבונית רכישה" htmlFor="purchase_invoice_number">
          <input
            id="purchase_invoice_number"
            dir="ltr"
            type="text"
            className={INPUT_CLASS}
            value={form.purchase_invoice_number}
            onChange={(e) => set('purchase_invoice_number', e.target.value)}
            placeholder="INV-000000"
          />
        </Field>

        <Field label="ספק" htmlFor="supplier_id">
          <select
            id="supplier_id"
            className={INPUT_CLASS}
            value={form.supplier_id}
            onChange={(e) => set('supplier_id', e.target.value)}
          >
            <option value="">— ללא ספק —</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {supplierName(s)}
              </option>
            ))}
          </select>
        </Field>

        <MoneyInput
          id="price_foreign"
          label="מחיר רכישה (מטבע חוץ)"
          value={form.price}
          onChange={(next) => set('price', next)}
        />

        <Field label="שער חליפין" htmlFor="exchange_rate">
          <input
            id="exchange_rate"
            dir="ltr"
            type="text"
            inputMode="decimal"
            className={INPUT_CLASS}
            value={form.exchange_rate === null ? '' : String(form.exchange_rate)}
            onChange={(e) => set('exchange_rate', e.target.value)}
            placeholder="0.00"
          />
        </Field>

        <Field label="עלות יבוא (₪)" htmlFor="import_cost">
          <input
            id="import_cost"
            dir="ltr"
            type="text"
            inputMode="decimal"
            className={INPUT_CLASS}
            value={form.import_cost === null ? '' : String(form.import_cost)}
            onChange={(e) => set('import_cost', e.target.value)}
            placeholder="0"
          />
        </Field>
      </div>

      <Field label="הערות" htmlFor="notes">
        <textarea
          id="notes"
          rows={3}
          className={`${INPUT_CLASS} min-h-[88px] resize-y`}
          value={form.notes}
          onChange={(e) => set('notes', e.target.value)}
          placeholder="הערות פנימיות על הרכישה"
        />
      </Field>

      <div className="flex justify-start">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="min-h-[44px] rounded-lg bg-amber-400 px-5 py-2 text-sm font-semibold text-slate-900 transition hover:bg-amber-300 disabled:opacity-60"
        >
          {saving ? 'שומר…' : 'שמור פרטי רכישה'}
        </button>
      </div>
    </div>
  );
}
