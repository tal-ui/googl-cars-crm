import React from 'react';

/**
 * Field — label + optional error wrapper for form inputs.
 * RTL-aware: label is text-start, error text in rose-400 below the control.
 *
 * Props:
 *  - label:    string shown above the children
 *  - error:    optional error message rendered below the children
 *  - required: renders a red asterisk after the label
 *  - htmlFor:  associates the label with a control id
 */
export default function Field({ label, error, required, htmlFor, children }) {
  return (
    <div dir="rtl" className="flex flex-col gap-1.5">
      {label ? (
        <label
          htmlFor={htmlFor}
          className="text-start text-sm font-medium text-slate-300"
        >
          {label}
          {required ? <span className="text-rose-400 ms-1">*</span> : null}
        </label>
      ) : null}
      {children}
      {error ? (
        <p className="text-start text-xs text-rose-400">{error}</p>
      ) : null}
    </div>
  );
}
