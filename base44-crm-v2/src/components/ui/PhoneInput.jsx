import React from 'react';

/**
 * PhoneInput — phone number entry in an LTR island.
 *
 * value:    string
 * onChange: (str) => void
 * label:    optional label rendered above the control (text-start)
 *
 * The input is wrapped/rendered dir="ltr" with tel inputMode so digits and
 * '+' prefixes read left-to-right even inside an RTL screen.
 */
export default function PhoneInput({ value, onChange, label, id }) {
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
      <div dir="ltr" className="flex">
        <input
          id={id}
          dir="ltr"
          type="tel"
          inputMode="tel"
          value={value || ''}
          onChange={handleChange}
          placeholder="+972"
          className="w-full min-h-[44px] rounded-lg border border-slate-800 bg-[#0d1117] px-3 py-2 text-start text-sm text-slate-200 placeholder:text-slate-500 outline-none transition focus:border-amber-400 focus:ring-1 focus:ring-amber-400"
        />
      </div>
    </div>
  );
}
