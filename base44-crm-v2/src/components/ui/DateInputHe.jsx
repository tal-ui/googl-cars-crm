import React from 'react';

/**
 * DateInputHe — native date picker with dark-theme styling.
 *
 * value:    ISO date string (yyyy-mm-dd) or ''
 * onChange: (iso) => void
 * label:    optional label rendered above the control (text-start)
 *
 * The field itself is dir="ltr" (ISO dates read LTR).
 */
export default function DateInputHe({ value, onChange, label, id }) {
  const handleChange = (e) => {
    onChange(e.target.value);
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
      <input
        id={id}
        dir="ltr"
        type="date"
        value={value || ''}
        onChange={handleChange}
        className="min-h-[44px] rounded-lg border border-slate-800 bg-[#0d1117] px-3 py-2 text-start text-sm text-slate-200 outline-none transition focus:border-amber-400 focus:ring-1 focus:ring-amber-400 [color-scheme:dark]"
      />
    </div>
  );
}
