/**
 * DeliveryPrepPanel — the "הכנה למסירה" stage form. Saves to the DeliveryPreps
 * satellite (one record per car_id, upserted). Each prep item is a toggle row;
 * two items carry a secondary detail (lab check date, registration order number).
 * `completed` is derived from all toggles being on and stored on the record.
 *
 * Props: { car, onSaved }
 */
import { useEffect, useState } from 'react';
import { DeliveryPreps } from '@/api/entities';
import { toast } from '@/lib/toast';
import Field from '@/components/ui/Field';
import DateInputHe from '@/components/ui/DateInputHe';

const EMPTY = {
  itoran_done: false,
  lab_check_done: false,
  lab_check_date: '',
  registration_order_done: false,
  registration_order_number: '',
  customer_id_doc_done: false,
  registration_form_done: false,
};

/** A single toggle row. `justify-start/end` are logical, so the knob mirrors in RTL. */
function ToggleRow({ label, checked, onChange, children }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-[#0d1117] p-3">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className="flex min-h-[44px] w-full items-center justify-between gap-3 text-start text-sm text-slate-200"
      >
        <span>{label}</span>
        <span
          className={`flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition ${
            checked ? 'justify-end bg-amber-400' : 'justify-start bg-slate-700'
          }`}
        >
          <span className="h-5 w-5 rounded-full bg-white shadow" />
        </span>
      </button>
      {checked && children ? <div className="mt-3">{children}</div> : null}
    </div>
  );
}

export default function DeliveryPrepPanel({ car, onSaved }) {
  const [form, setForm] = useState(EMPTY);
  const [recordId, setRecordId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      if (!car?.id) {
        if (alive) setLoading(false);
        return;
      }
      try {
        const rows = await DeliveryPreps.filter({ car_id: car.id }, { limit: 1 });
        const r = rows && rows[0];
        if (alive && r) {
          setRecordId(r.id);
          setForm({
            itoran_done: !!r.itoran_done,
            lab_check_done: !!r.lab_check_done,
            lab_check_date: r.lab_check_date || '',
            registration_order_done: !!r.registration_order_done,
            registration_order_number: r.registration_order_number || '',
            customer_id_doc_done: !!r.customer_id_doc_done,
            registration_form_done: !!r.registration_form_done,
          });
        }
      } catch (err) {
        console.error('[DeliveryPrepPanel.load]', err);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [car?.id]);

  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));

  const completed =
    form.itoran_done &&
    form.lab_check_done &&
    form.registration_order_done &&
    form.customer_id_doc_done &&
    form.registration_form_done;

  async function handleSave() {
    if (!car?.id) return;
    setSaving(true);
    try {
      const payload = { ...form, car_id: car.id, completed };
      if (recordId) {
        await DeliveryPreps.update(recordId, payload);
      } else {
        const created = await DeliveryPreps.create(payload);
        if (created?.id) setRecordId(created.id);
      }
      toast.success('ההכנה למסירה נשמרה');
      onSaved?.();
    } catch (err) {
      toast.error('שמירת ההכנה למסירה נכשלה');
      console.error('[DeliveryPrepPanel.save]', err);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div dir="rtl" className="p-2 text-sm text-slate-400">
        טוען…
      </div>
    );
  }

  return (
    <div dir="rtl" className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-200">הכנה למסירה</h3>
        <span
          className={`rounded-full px-2.5 py-1 text-xs ${
            completed ? 'bg-emerald-400/10 text-emerald-300' : 'bg-slate-700/40 text-slate-400'
          }`}
        >
          {completed ? 'הושלם' : 'בתהליך'}
        </span>
      </div>

      <div className="space-y-3">
        <ToggleRow label="איתוראן הותקן" checked={form.itoran_done} onChange={set('itoran_done')} />

        <ToggleRow label="בדיקת מעבדה" checked={form.lab_check_done} onChange={set('lab_check_done')}>
          <DateInputHe
            id="lab_check_date"
            label="תאריך בדיקת מעבדה"
            value={form.lab_check_date}
            onChange={set('lab_check_date')}
          />
        </ToggleRow>

        <ToggleRow
          label="הזמנת רישוי"
          checked={form.registration_order_done}
          onChange={set('registration_order_done')}
        >
          <Field label="מספר הזמנת רישוי" htmlFor="registration_order_number">
            <input
              id="registration_order_number"
              dir="ltr"
              type="text"
              value={form.registration_order_number}
              onChange={(e) => set('registration_order_number')(e.target.value)}
              placeholder="—"
              className="min-h-[44px] w-full rounded-lg border border-slate-800 bg-[#0d1117] px-3 py-2 text-start text-sm text-slate-200 placeholder:text-slate-500 outline-none transition focus:border-amber-400 focus:ring-1 focus:ring-amber-400"
            />
          </Field>
        </ToggleRow>

        <ToggleRow
          label="מסמך זהות לקוח התקבל"
          checked={form.customer_id_doc_done}
          onChange={set('customer_id_doc_done')}
        />

        <ToggleRow
          label="טופס רישום הושלם"
          checked={form.registration_form_done}
          onChange={set('registration_form_done')}
        />
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
