/**
 * StockPanel — the "מלאי והזמנה" stage form. Edits pricing/visibility fields that
 * live on the Car core: list_price, required_price (both ILS), and the
 * show_on_website flag. Saves via Cars.update.
 *
 * Prices are stored as plain ILS numbers on the Car; MoneyInput is used purely as
 * the shared numeric control (currency pinned to ILS).
 *
 * Props: { car, onSaved }
 */
import { useState } from 'react';
import { Cars } from '@/api/entities';
import { toast } from '@/lib/toast';
import MoneyInput from '@/components/ui/MoneyInput';

export default function StockPanel({ car, onSaved }) {
  const [listPrice, setListPrice] = useState(
    car?.list_price != null ? Number(car.list_price) : null,
  );
  const [requiredPrice, setRequiredPrice] = useState(
    car?.required_price != null ? Number(car.required_price) : null,
  );
  const [showOnWebsite, setShowOnWebsite] = useState(!!car?.show_on_website);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!car?.id) return;
    setSaving(true);
    try {
      await Cars.update(car.id, {
        list_price: listPrice,
        required_price: requiredPrice,
        show_on_website: showOnWebsite,
      });
      toast.success('פרטי המלאי נשמרו');
      onSaved?.();
    } catch (err) {
      toast.error('שמירת פרטי המלאי נכשלה');
      console.error('[StockPanel.save]', err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div dir="rtl" className="space-y-4">
      <h3 className="text-sm font-semibold text-slate-200">מלאי והזמנה</h3>

      <MoneyInput
        id="list_price"
        label="מחיר מחירון"
        value={{ amount: listPrice, currency: 'ILS' }}
        onChange={(next) => setListPrice(next.amount)}
      />

      <MoneyInput
        id="required_price"
        label="מחיר נדרש"
        value={{ amount: requiredPrice, currency: 'ILS' }}
        onChange={(next) => setRequiredPrice(next.amount)}
      />

      <div className="rounded-lg border border-slate-800 bg-[#0d1117] p-3">
        <button
          type="button"
          role="switch"
          aria-checked={showOnWebsite}
          onClick={() => setShowOnWebsite((v) => !v)}
          className="flex min-h-[44px] w-full items-center justify-between gap-3 text-start text-sm text-slate-200"
        >
          <span>הצג באתר</span>
          <span
            className={`flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition ${
              showOnWebsite ? 'justify-end bg-amber-400' : 'justify-start bg-slate-700'
            }`}
          >
            <span className="h-5 w-5 rounded-full bg-white shadow" />
          </span>
        </button>
      </div>

      <div className="flex justify-start">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="min-h-[44px] rounded-lg bg-amber-400 px-5 py-2 text-sm font-semibold text-slate-900 transition hover:bg-amber-300 disabled:opacity-60"
        >
          {saving ? 'שומר…' : 'שמור'}
        </button>
      </div>
    </div>
  );
}
