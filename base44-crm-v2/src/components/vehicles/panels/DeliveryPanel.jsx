/**
 * DeliveryPanel — the "מסירה" stage form. Records the sale/hand-off details that
 * live on the Car core: customer_id, sale_price, sale_date, additional_payment,
 * trade_in_value. Saves via Cars.update.
 *
 * customer_id is a plain text field for now (a customer picker replaces it later);
 * the id is LTR data so its input is dir="ltr". Money amounts are stored as plain
 * ILS numbers via the shared MoneyInput.
 *
 * Props: { car, onSaved }
 */
import { useState } from 'react';
import { Cars } from '@/api/entities';
import { toast } from '@/lib/toast';
import Field from '@/components/ui/Field';
import MoneyInput from '@/components/ui/MoneyInput';
import DateInputHe from '@/components/ui/DateInputHe';

export default function DeliveryPanel({ car, onSaved }) {
  const [customerId, setCustomerId] = useState(car?.customer_id || '');
  const [salePrice, setSalePrice] = useState(
    car?.sale_price != null ? Number(car.sale_price) : null,
  );
  const [saleDate, setSaleDate] = useState(car?.sale_date || '');
  const [additionalPayment, setAdditionalPayment] = useState(
    car?.additional_payment != null ? Number(car.additional_payment) : null,
  );
  const [tradeInValue, setTradeInValue] = useState(
    car?.trade_in_value != null ? Number(car.trade_in_value) : null,
  );
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!car?.id) return;
    setSaving(true);
    try {
      await Cars.update(car.id, {
        customer_id: customerId || null,
        sale_price: salePrice,
        sale_date: saleDate || null,
        additional_payment: additionalPayment,
        trade_in_value: tradeInValue,
      });
      toast.success('פרטי המסירה נשמרו');
      onSaved?.();
    } catch (err) {
      toast.error('שמירת פרטי המסירה נכשלה');
      console.error('[DeliveryPanel.save]', err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div dir="rtl" className="space-y-4">
      <h3 className="text-sm font-semibold text-slate-200">מסירה</h3>

      <Field label="מזהה לקוח" htmlFor="customer_id">
        <input
          id="customer_id"
          dir="ltr"
          type="text"
          value={customerId}
          onChange={(e) => setCustomerId(e.target.value)}
          placeholder="—"
          className="min-h-[44px] w-full rounded-lg border border-slate-800 bg-[#0d1117] px-3 py-2 text-start text-sm text-slate-200 placeholder:text-slate-500 outline-none transition focus:border-amber-400 focus:ring-1 focus:ring-amber-400"
        />
      </Field>

      <MoneyInput
        id="sale_price"
        label="מחיר מכירה"
        value={{ amount: salePrice, currency: 'ILS' }}
        onChange={(next) => setSalePrice(next.amount)}
      />

      <DateInputHe id="sale_date" label="תאריך מכירה" value={saleDate} onChange={setSaleDate} />

      <MoneyInput
        id="additional_payment"
        label="תשלום נוסף"
        value={{ amount: additionalPayment, currency: 'ILS' }}
        onChange={(next) => setAdditionalPayment(next.amount)}
      />

      <MoneyInput
        id="trade_in_value"
        label="שווי טרייד-אין"
        value={{ amount: tradeInValue, currency: 'ILS' }}
        onChange={(next) => setTradeInValue(next.amount)}
      />

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
