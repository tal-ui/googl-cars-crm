/**
 * ShippingPanel — the "שילוח" (shipping) stage of the Car workspace.
 *
 * Owns EXACTLY one satellite: the single CarShipment for a car. Loads the
 * existing shipment on mount (filter by car_id) and upserts on save (update when
 * one exists, else create), keeping the write independent of Car core (I-121).
 *
 * Dates use DateInputHe. Container number is an LTR code island; the rest are
 * plain RTL text fields.
 */
import { useEffect, useState } from 'react';
import Field from '@/components/ui/Field';
import DateInputHe from '@/components/ui/DateInputHe';
import { CarShipments } from '@/api/entities';
import { toast } from '@/lib/toast';

const INPUT_CLASS =
  'min-h-[44px] w-full rounded-lg border border-slate-800 bg-[#0d1117] px-3 py-2 text-start text-sm text-slate-200 placeholder:text-slate-500 outline-none transition focus:border-amber-400 focus:ring-1 focus:ring-amber-400';

const EMPTY = {
  container_number: '',
  ship_name: '',
  departure_date: '',
  expected_arrival_date: '',
  actual_arrival_date: '',
  port_release_date: '',
  customs_status: '',
  notes: '',
};

export default function ShippingPanel({ car, onSaved }) {
  const carId = car?.id;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [existingId, setExistingId] = useState(null);
  const [form, setForm] = useState(EMPTY);

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      try {
        const rows = carId
          ? await CarShipments.filter({ car_id: carId }, { limit: 1 })
          : [];
        if (!alive) return;
        const rec = Array.isArray(rows) ? rows[0] : null;
        if (rec) {
          setExistingId(rec.id);
          setForm({
            container_number: rec.container_number || '',
            ship_name: rec.ship_name || '',
            departure_date: rec.departure_date || '',
            expected_arrival_date: rec.expected_arrival_date || '',
            actual_arrival_date: rec.actual_arrival_date || '',
            port_release_date: rec.port_release_date || '',
            customs_status: rec.customs_status || '',
            notes: rec.notes || '',
          });
        } else {
          setExistingId(null);
          setForm(EMPTY);
        }
      } catch (err) {
        console.error('[ShippingPanel.load]', err);
        toast.error('טעינת נתוני השילוח נכשלה');
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
      container_number: form.container_number.trim() || null,
      ship_name: form.ship_name.trim() || null,
      departure_date: form.departure_date || null,
      expected_arrival_date: form.expected_arrival_date || null,
      actual_arrival_date: form.actual_arrival_date || null,
      port_release_date: form.port_release_date || null,
      customs_status: form.customs_status.trim() || null,
      notes: form.notes.trim() || null,
    };
    try {
      const saved = existingId
        ? await CarShipments.update(existingId, patch)
        : await CarShipments.create(patch);
      if (saved?.id) setExistingId(saved.id);
      toast.success('פרטי השילוח נשמרו');
      onSaved?.(saved);
    } catch (err) {
      console.error('[ShippingPanel.save]', err);
      toast.error('שמירת פרטי השילוח נכשלה');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div dir="rtl" className="p-6 text-sm text-slate-400">
        טוען נתוני שילוח…
      </div>
    );
  }

  return (
    <div dir="rtl" className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="מספר מכולה" htmlFor="container_number">
          <input
            id="container_number"
            dir="ltr"
            type="text"
            className={INPUT_CLASS}
            value={form.container_number}
            onChange={(e) => set('container_number', e.target.value)}
            placeholder="ABCD1234567"
          />
        </Field>

        <Field label="שם האונייה" htmlFor="ship_name">
          <input
            id="ship_name"
            type="text"
            className={INPUT_CLASS}
            value={form.ship_name}
            onChange={(e) => set('ship_name', e.target.value)}
            placeholder="שם כלי השיט"
          />
        </Field>

        <DateInputHe
          id="departure_date"
          label="תאריך הפלגה"
          value={form.departure_date}
          onChange={(iso) => set('departure_date', iso)}
        />

        <DateInputHe
          id="expected_arrival_date"
          label="תאריך הגעה צפוי"
          value={form.expected_arrival_date}
          onChange={(iso) => set('expected_arrival_date', iso)}
        />

        <DateInputHe
          id="actual_arrival_date"
          label="תאריך הגעה בפועל"
          value={form.actual_arrival_date}
          onChange={(iso) => set('actual_arrival_date', iso)}
        />

        <DateInputHe
          id="port_release_date"
          label="תאריך שחרור מהנמל"
          value={form.port_release_date}
          onChange={(iso) => set('port_release_date', iso)}
        />

        <Field label="סטטוס מכס" htmlFor="customs_status">
          <input
            id="customs_status"
            type="text"
            className={INPUT_CLASS}
            value={form.customs_status}
            onChange={(e) => set('customs_status', e.target.value)}
            placeholder="לדוגמה: ממתין לשחרור"
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
          placeholder="הערות פנימיות על השילוח"
        />
      </Field>

      <div className="flex justify-start">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="min-h-[44px] rounded-lg bg-amber-400 px-5 py-2 text-sm font-semibold text-slate-900 transition hover:bg-amber-300 disabled:opacity-60"
        >
          {saving ? 'שומר…' : 'שמור פרטי שילוח'}
        </button>
      </div>
    </div>
  );
}
