/**
 * LogisticsDashboard — the logistics_employee home.
 *
 * The third role dashboard built from the shared StatCard widget (replaces the
 * forked legacy Dashboard — audit I-107). Reads only through the bounded
 * repositories in @/api/entities; no polling, explicit limits, loading/empty states.
 *
 * Widgets:
 *  - Incoming shipments: CarShipments still en route (no actual arrival yet),
 *    nearest expected arrival first.
 *  - Delivery-prep completion: share of DeliveryPrep checklists marked completed.
 *  - Document gaps: prep checklists still missing the customer-ID / registration
 *    paperwork — the logistics blocker before handover.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Ship, ClipboardCheck, FileWarning } from 'lucide-react';
import StatCard from './StatCard';
import { CarShipments, DeliveryPreps } from '@/api/entities';
import { formatDate, daysUntil } from '@/lib/format';

const SHIPMENT_LIMIT = 100;
const PREP_LIMIT = 200;

/** A shipment is "incoming" while it has no recorded actual arrival. */
const isIncoming = (s) => !s?.actual_arrival_date;

/** A prep has a document gap if either required paperwork item is missing. */
const hasDocGap = (p) => !p?.customer_id_doc_done || !p?.registration_form_done;

export default function LogisticsDashboard() {
  const [state, setState] = useState({ loading: true, error: false });
  const [shipments, setShipments] = useState([]);
  const [preps, setPreps] = useState([]);

  useEffect(() => {
    let alive = true;
    async function load() {
      setState({ loading: true, error: false });
      try {
        const [shipmentRows, prepRows] = await Promise.all([
          CarShipments.list({ limit: SHIPMENT_LIMIT }),
          DeliveryPreps.list({ limit: PREP_LIMIT }),
        ]);
        if (!alive) return;
        setShipments(Array.isArray(shipmentRows) ? shipmentRows : []);
        setPreps(Array.isArray(prepRows) ? prepRows : []);
        setState({ loading: false, error: false });
      } catch (err) {
        console.error('[LogisticsDashboard.load]', err);
        if (alive) setState({ loading: false, error: true });
      }
    }
    load();
    return () => {
      alive = false;
    };
  }, []);

  const incoming = useMemo(() => {
    return shipments
      .filter(isIncoming)
      .sort((a, b) => {
        const da = a?.expected_arrival_date ? new Date(a.expected_arrival_date).getTime() : Infinity;
        const db = b?.expected_arrival_date ? new Date(b.expected_arrival_date).getTime() : Infinity;
        return da - db;
      });
  }, [shipments]);

  const prepPct = useMemo(() => {
    if (preps.length === 0) return 0;
    const done = preps.filter((p) => p?.completed).length;
    return Math.round((done / preps.length) * 100);
  }, [preps]);

  const docGaps = useMemo(
    () => preps.filter((p) => !p?.completed && hasDocGap(p)).length,
    [preps],
  );

  if (state.loading) {
    return (
      <div dir="rtl" className="p-6 text-sm text-slate-400">
        טוען נתוני לוגיסטיקה…
      </div>
    );
  }

  if (state.error) {
    return (
      <div dir="rtl" className="p-6 text-sm text-rose-400">
        טעינת נתוני הלוגיסטיקה נכשלה. נסה לרענן את העמוד.
      </div>
    );
  }

  return (
    <div dir="rtl" className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-slate-100">דשבורד לוגיסטיקה</h1>
        <p className="text-sm text-slate-400">משלוחים נכנסים, הכנות למסירה ופערי מסמכים</p>
      </header>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          label="משלוחים בדרך"
          value={incoming.length}
          hint="טרם נרשמה הגעה בפועל"
          icon={<Ship size={18} />}
          to="/shipments"
        />
        <StatCard
          label="השלמת הכנות למסירה"
          value={`${prepPct}%`}
          hint={`${preps.length} צ'קליסטים`}
          icon={<ClipboardCheck size={18} />}
          to="/shipments"
        />
        <StatCard
          label="פערי מסמכים"
          value={docGaps}
          hint="חסרים ת.ז / טופס רישום"
          trend={docGaps > 0 ? { dir: 'down', label: 'לטפל' } : { dir: 'flat', label: 'תקין' }}
          icon={<FileWarning size={18} />}
          to="/shipments"
        />
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-300">משלוחים נכנסים</h2>
          <Link to="/shipments" className="text-xs text-amber-400 hover:text-amber-300">
            לכל המשלוחים
          </Link>
        </div>
        {incoming.length === 0 ? (
          <div className="rounded-xl border border-slate-800 bg-[#0d1117] p-6 text-sm text-slate-400">
            אין משלוחים בדרך כרגע.
          </div>
        ) : (
          <ul className="space-y-2">
            {incoming.map((s) => {
              const eta = s?.expected_arrival_date;
              const days = eta ? daysUntil(eta) : null;
              const late = days != null && days < 0;
              return (
                <li
                  key={s.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-[#0d1117] px-3 py-3"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="truncate text-sm font-medium text-slate-100">
                      {s?.ship_name || 'משלוח ללא שם אונייה'}
                    </div>
                    <div className="text-xs text-slate-500">
                      מכולה: <span dir="ltr">{s?.container_number || '—'}</span>
                    </div>
                  </div>
                  <div className="shrink-0 text-end">
                    <div className="text-xs text-slate-400">הגעה צפויה</div>
                    <div
                      dir="ltr"
                      className={`text-sm font-medium ${late ? 'text-rose-300' : 'text-slate-100'}`}
                    >
                      {formatDate(eta)}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
