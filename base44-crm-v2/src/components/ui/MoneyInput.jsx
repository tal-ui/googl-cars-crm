import React from 'react';
import { parseAmount } from '@/lib/format';

/**
 * MoneyInput — numeric amount + currency selector.
 *
 * value:    { amount: number|null, currency: 'ILS'|'USD'|'EUR' }
 * onChange: (next) => void  with next = { amount, currency }
 * label:    optional label rendered above the control (text-start)
 *
 * The amount input is dir="ltr" (numbers read LTR); currency codes are LTR too.
 */
const CURRENCIES = ['ILS', 'EUR', 'USD'];

export default function MoneyInput({ value, onChange, label, id }) {
  const amount = value && value.amount != null ? value.amount : null;
  const currency = (value && value.currency) || 'ILS';

  const handleAmount = (e) => {
    const raw = e.target.value;
    const parsed = raw === '' ? null : parseAmount(raw);
    onChange({ amount: parsed, currency });
  };

  const handleCurrency = (e) => {
    onChange({ amount, currency: e.target.value });
  };

  return (
    <div dir="rtl" className="flex flex-col gap-1.5">
      {label ? (
        <label
          htmlFor={id}
          className="text-start text-sm font-medium text-slate-300"
        >
          {label}
        </label>
      ) : null}
      <div className="flex items-stretch gap-2">
        <input
          id={id}
          dir="ltr"
          type="text"
          inputMode="decimal"
          value={amount == null ? '' : String(amount)}
          onChange={handleAmount}
          placeholder="0"
          className="flex-1 min-h-[44px] rounded-lg border border-slate-800 bg-[#0d1117] px-3 py-2 text-start text-sm text-slate-200 placeholder:text-slate-500 outline-none transition focus:border-amber-400 focus:ring-1 focus:ring-amber-400"
        />
        <select
          value={currency}
          onChange={handleCurrency}
          dir="ltr"
          aria-label="Currency"
          className="min-h-[44px] rounded-lg border border-slate-800 bg-[#0d1117] px-3 py-2 text-sm text-slate-200 outline-none transition focus:border-amber-400 focus:ring-1 focus:ring-amber-400"
        >
          {CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
