/**
 * CarWorkspace — the tabbed vehicle workspace that replaces the legacy 1,955-line,
 * zero-tab VehicleForm (audit I-121). Each tab maps to a lifecycle stage and saves
 * its OWN satellite entity (Car core, CarPurchase, CarShipment, DeliveryPrep,
 * CarExpenseInvoice, CarDocument), so saves are small and independent.
 *
 * The tab matching the car's current status.stage is auto-focused; a status
 * stepper (legal transitions only) sits in the header. An "all fields" escape
 * hatch stays available during the transition period (risk R7).
 *
 * This is the shell + wiring; each <StagePanel> is a focused form built on the
 * shared inputs. Data goes through @/api/entities repositories, never
 * base44.entities.* directly.
 */
import { useState } from 'react';
import { statusStage } from '@/shared/vehicleStatus';
import StatusBadge from '@/components/ui/StatusBadge';
import StatusStepper from '@/components/ui/StatusStepper';
import { toast } from '@/lib/toast';
import { Cars } from '@/api/entities';

/** Lifecycle stages → tab metadata. Order matches the pipeline. */
const STAGES = [
  { key: 'purchase', label: 'רכישה', entity: 'CarPurchase' },
  { key: 'shipping', label: 'שילוח', entity: 'CarShipment' },
  { key: 'customs', label: 'שחרור ורישוי', entity: 'Car' },
  { key: 'prep', label: 'הכנה למסירה', entity: 'DeliveryPrep' },
  { key: 'stock', label: 'מלאי והזמנה', entity: 'Car' },
  { key: 'delivery', label: 'מסירה', entity: 'Car' },
  { key: 'costs', label: 'עלויות ומסמכים', entity: 'CarExpenseInvoice' },
];

export default function CarWorkspace({ car, onStatusAdvance, onClose }) {
  const currentStage = statusStage(car?.status_code) || 'purchase';
  const [activeTab, setActiveTab] = useState(currentStage);
  const [showAllFields, setShowAllFields] = useState(false);

  async function advance(nextCode) {
    try {
      // NOTE: the real write goes through a server function that re-validates the
      // transition, computes cost_summary, and fires customer WhatsApp + auto-tasks.
      // Here we optimistically reflect + delegate.
      await onStatusAdvance?.(nextCode);
      toast.success('הסטטוס עודכן');
    } catch (err) {
      toast.error('עדכון הסטטוס נכשל');
      console.error('[CarWorkspace.advance]', err);
    }
  }

  return (
    <div dir="rtl" className="flex h-full flex-col">
      {/* header: identity + status stepper */}
      <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <div>
          <div className="text-base font-semibold">
            {car?.make} {car?.model} <span className="text-slate-400">{car?.year}</span>
          </div>
          <div className="font-mono text-xs text-slate-500" dir="ltr">{car?.vin}</div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <StatusBadge code={car?.status_code} />
          <StatusStepper current={car?.status_code} onAdvance={advance} />
        </div>
      </header>

      {/* tabs */}
      <nav className="flex gap-1 overflow-x-auto border-b border-slate-800 px-2">
        {STAGES.map((s) => (
          <button
            key={s.key}
            onClick={() => setActiveTab(s.key)}
            className={`whitespace-nowrap px-3 py-2 text-sm transition ${
              activeTab === s.key
                ? 'border-b-2 border-amber-400 text-amber-300'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {s.label}
            {s.key === currentStage && <span className="ms-1 text-amber-400">●</span>}
          </button>
        ))}
        <button
          onClick={() => setShowAllFields((v) => !v)}
          className="ms-auto whitespace-nowrap px-3 py-2 text-xs text-slate-500 hover:text-slate-300"
        >
          {showAllFields ? 'תצוגת שלבים' : 'כל השדות'}
        </button>
      </nav>

      {/* body: the active stage panel (each is its own focused form, TBD) */}
      <div className="flex-1 overflow-y-auto p-4">
        {showAllFields ? (
          <AllFieldsFallback car={car} />
        ) : (
          <StagePanelPlaceholder stage={STAGES.find((s) => s.key === activeTab)} car={car} onAdvance={advance} />
        )}
      </div>
    </div>
  );
}

/** Placeholder until per-stage panels are built; documents the contract. */
function StagePanelPlaceholder({ stage, car, onAdvance }) {
  return (
    <div className="space-y-3 text-sm text-slate-400">
      <p>
        פאנל שלב <b className="text-slate-200">{stage?.label}</b> — טופס ממוקד ששומר ל-
        <code className="text-amber-300">{stage?.entity}</code> בלבד.
      </p>
      <p className="text-xs text-slate-500">
        (StagePanel per entity is built on the shared inputs — MoneyInput,
        FileUpload, DatePicker — in the next Phase 2 step.)
      </p>
    </div>
  );
}

/** Escape hatch: flat view of the whole Car during the migration window (R7). */
function AllFieldsFallback({ car }) {
  return (
    <pre dir="ltr" className="overflow-auto rounded bg-slate-900/60 p-3 text-xs text-slate-300">
      {JSON.stringify(car, null, 2)}
    </pre>
  );
}
