/**
 * QuickAddCarDialog — the golden "add a car in ≤3 fields to first save" entry point.
 *
 * Replaces the legacy 1,955-line VehicleForm (audit I-121) as the way a new car
 * gets INTO the system. Everything else — purchase, shipping, customs, costs,
 * documents — is progressive enrichment later, tab-by-tab, in <CarWorkspace/>.
 *
 * The three fields that matter: make, model, status_code (a small select limited
 * to the intake stage, defaulting to the first sensible intake code). VIN is an
 * optional convenience. On submit we call Cars.create with just those; the
 * approval_status default (pending_approval) is applied server-side, so we do NOT
 * set it here. VIN / plate render in an LTR island; everything else is RTL.
 */
import { useEffect, useState } from 'react';
import { VEHICLE_STATUSES, statusLabel } from '@/shared/vehicleStatus';
import Field from '@/components/ui/Field';
import { Cars } from '@/api/entities';
import { toast } from '@/lib/toast';

/** A newly-added car starts at intake — the `purchase` lifecycle stage. */
const INTAKE_STAGES = ['purchase'];
const INTAKE_STATUSES = VEHICLE_STATUSES.filter((s) => INTAKE_STAGES.includes(s.stage));
/** First sensible intake code (awaiting_purchase) — the schema default. */
const DEFAULT_STATUS = INTAKE_STATUSES[0]?.code ?? 'awaiting_purchase';

const INPUT_CLASS =
  'min-h-[44px] w-full rounded-lg border border-slate-800 bg-[#0d1117] px-3 py-2 text-start text-sm text-slate-200 placeholder:text-slate-500 outline-none transition focus:border-amber-400 focus:ring-1 focus:ring-amber-400';

export default function QuickAddCarDialog({ open, onClose, onCreated }) {
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [vin, setVin] = useState('');
  const [statusCode, setStatusCode] = useState(DEFAULT_STATUS);
  const [saving, setSaving] = useState(false);

  // Close on Escape (unless mid-save). Supports both controlled `open` and
  // conditional-mount parents: only `open === false` short-circuits.
  useEffect(() => {
    if (open === false) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, saving]);

  if (open === false) return null;

  function reset() {
    setMake('');
    setModel('');
    setVin('');
    setStatusCode(DEFAULT_STATUS);
  }

  function close() {
    if (saving) return;
    reset();
    onClose?.();
  }

  async function handleSubmit(e) {
    e?.preventDefault();
    const m = make.trim();
    const md = model.trim();
    if (!m || !md) {
      toast.error('יש למלא יצרן ודגם');
      return;
    }

    setSaving(true);
    try {
      const payload = { make: m, model: md, status_code: statusCode };
      const v = vin.trim();
      if (v) payload.vin = v;
      // approval_status defaults to 'pending_approval' server-side — do not set it here.
      const car = await Cars.create(payload);
      toast.success('הרכב נוסף');
      onCreated?.(car);
      reset();
      onClose?.();
    } catch (err) {
      console.error('[QuickAddCarDialog.submit]', err);
      toast.error('הוספת הרכב נכשלה');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div dir="rtl" className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={close} aria-hidden="true" />

      <form
        onSubmit={handleSubmit}
        className="relative z-10 w-full max-w-md rounded-2xl border border-slate-800 bg-[#0d1117] p-5 shadow-xl"
      >
        <header className="mb-1 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-100">הוספת רכב מהירה</h2>
          <button
            type="button"
            onClick={close}
            disabled={saving}
            aria-label="סגירה"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-slate-400 transition hover:text-slate-100 disabled:opacity-60"
          >
            ✕
          </button>
        </header>

        <p className="mb-4 text-xs text-slate-500">
          שלושה שדות עד שמירה. שאר הפרטים מתעשרים בהמשך במרחב הרכב.
        </p>

        <div className="space-y-4">
          <Field label="יצרן" htmlFor="qa-make" required>
            <input
              id="qa-make"
              type="text"
              autoFocus
              className={INPUT_CLASS}
              value={make}
              onChange={(e) => setMake(e.target.value)}
              placeholder="Mercedes"
            />
          </Field>

          <Field label="דגם" htmlFor="qa-model" required>
            <input
              id="qa-model"
              type="text"
              className={INPUT_CLASS}
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="S 500"
            />
          </Field>

          <Field label="סטטוס" htmlFor="qa-status">
            <select
              id="qa-status"
              className={INPUT_CLASS}
              value={statusCode}
              onChange={(e) => setStatusCode(e.target.value)}
            >
              {INTAKE_STATUSES.map((s) => (
                <option key={s.code} value={s.code}>
                  {statusLabel(s.code)}
                </option>
              ))}
            </select>
          </Field>

          <Field label="מספר שלדה (VIN) — אופציונלי" htmlFor="qa-vin">
            <input
              id="qa-vin"
              dir="ltr"
              type="text"
              className={`${INPUT_CLASS} font-mono`}
              value={vin}
              onChange={(e) => setVin(e.target.value)}
            />
          </Field>
        </div>

        <footer className="mt-6 flex items-center justify-start gap-3">
          <button
            type="submit"
            disabled={saving}
            className="min-h-[44px] rounded-lg bg-amber-400 px-5 py-2 text-sm font-semibold text-slate-900 transition hover:bg-amber-300 disabled:opacity-60"
          >
            {saving ? 'שומר…' : 'הוסף רכב'}
          </button>
          <button
            type="button"
            onClick={close}
            disabled={saving}
            className="min-h-[44px] rounded-lg border border-slate-800 px-5 py-2 text-sm text-slate-300 transition hover:border-slate-700 hover:text-slate-100 disabled:opacity-60"
          >
            ביטול
          </button>
        </footer>
      </form>
    </div>
  );
}
