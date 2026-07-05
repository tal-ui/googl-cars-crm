/**
 * CustomsRegistrationPanel — the "שחרור ורישוי" (customs & registration) stage.
 *
 * Unlike the purchase/shipping panels, these compliance fields live on the Car
 * CORE (not a satellite), so this panel updates the Car itself via
 * Cars.update(car.id, patch). It loads the freshest Car on mount and edits only
 * the seven regulatory fields — a small, targeted write (audit I-121).
 *
 * Number fields are LTR code islands; the *_completed / paperwork_received flags
 * are boolean toggles.
 */
import { useEffect, useState } from 'react';
import Field from '@/components/ui/Field';
import { Cars } from '@/api/entities';
import { toast } from '@/lib/toast';

const INPUT_CLASS =
  'min-h-[44px] w-full rounded-lg border border-slate-800 bg-[#0d1117] px-3 py-2 text-start text-sm text-slate-200 placeholder:text-slate-500 outline-none transition focus:border-amber-400 focus:ring-1 focus:ring-amber-400';

const seed = (src) => ({
  model_code_number: src?.model_code_number || '',
  model_code_completed: !!src?.model_code_completed,
  import_license_number: src?.import_license_number || '',
  import_license_completed: !!src?.import_license_completed,
  itoran_code: src?.itoran_code || '',
  richavit_file_number: src?.richavit_file_number || '',
  paperwork_received: !!src?.paperwork_received,
});

export default function CustomsRegistrationPanel({ car, onSaved }) {
  const carId = car?.id;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(() => seed(car));

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      try {
        // Compliance lives on Car core — refresh the record, fall back to prop.
        const rec = carId ? await Cars.get(carId) : null;
        if (!alive) return;
        setForm(seed(rec || car));
      } catch (err) {
        console.error('[CustomsRegistrationPanel.load]', err);
        if (alive) setForm(seed(car));
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
      model_code_number: form.model_code_number.trim() || null,
      model_code_completed: form.model_code_completed,
      import_license_number: form.import_license_number.trim() || null,
      import_license_completed: form.import_license_completed,
      itoran_code: form.itoran_code.trim() || null,
      richavit_file_number: form.richavit_file_number.trim() || null,
      paperwork_received: form.paperwork_received,
    };
    try {
      const saved = await Cars.update(carId, patch);
      toast.success('פרטי השחרור והרישוי נשמרו');
      onSaved?.(saved);
    } catch (err) {
      console.error('[CustomsRegistrationPanel.save]', err);
      toast.error('שמירת פרטי השחרור והרישוי נכשלה');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div dir="rtl" className="p-6 text-sm text-slate-400">
        טוען נתוני שחרור ורישוי…
      </div>
    );
  }

  return (
    <div dir="rtl" className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="מספר קוד דגם" htmlFor="model_code_number">
          <input
            id="model_code_number"
            dir="ltr"
            type="text"
            className={INPUT_CLASS}
            value={form.model_code_number}
            onChange={(e) => set('model_code_number', e.target.value)}
          />
        </Field>

        <Field label="מספר רישיון יבוא" htmlFor="import_license_number">
          <input
            id="import_license_number"
            dir="ltr"
            type="text"
            className={INPUT_CLASS}
            value={form.import_license_number}
            onChange={(e) => set('import_license_number', e.target.value)}
          />
        </Field>

        <Field label="קוד איתוראן" htmlFor="itoran_code">
          <input
            id="itoran_code"
            dir="ltr"
            type="text"
            className={INPUT_CLASS}
            value={form.itoran_code}
            onChange={(e) => set('itoran_code', e.target.value)}
          />
        </Field>

        <Field label="מספר תיק רכיבות" htmlFor="richavit_file_number">
          <input
            id="richavit_file_number"
            dir="ltr"
            type="text"
            className={INPUT_CLASS}
            value={form.richavit_file_number}
            onChange={(e) => set('richavit_file_number', e.target.value)}
          />
        </Field>
      </div>

      <fieldset className="space-y-2 rounded-lg border border-slate-800 p-4">
        <legend className="px-1 text-xs font-medium text-slate-400">סטטוס השלמה</legend>
        <ToggleRow
          id="model_code_completed"
          label="קוד דגם הושלם"
          checked={form.model_code_completed}
          onChange={(v) => set('model_code_completed', v)}
        />
        <ToggleRow
          id="import_license_completed"
          label="רישיון יבוא הושלם"
          checked={form.import_license_completed}
          onChange={(v) => set('import_license_completed', v)}
        />
        <ToggleRow
          id="paperwork_received"
          label="ניירת התקבלה"
          checked={form.paperwork_received}
          onChange={(v) => set('paperwork_received', v)}
        />
      </fieldset>

      <div className="flex justify-start">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="min-h-[44px] rounded-lg bg-amber-400 px-5 py-2 text-sm font-semibold text-slate-900 transition hover:bg-amber-300 disabled:opacity-60"
        >
          {saving ? 'שומר…' : 'שמור שחרור ורישוי'}
        </button>
      </div>
    </div>
  );
}

/** Local boolean toggle row — RTL, 44px tap target. */
function ToggleRow({ id, label, checked, onChange }) {
  return (
    <label htmlFor={id} className="flex min-h-[44px] cursor-pointer items-center gap-3">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-5 w-5 accent-amber-400"
      />
      <span className="text-sm text-slate-200">{label}</span>
    </label>
  );
}
