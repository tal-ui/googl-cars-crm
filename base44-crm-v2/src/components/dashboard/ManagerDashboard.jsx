/**
 * ManagerDashboard — the admin / sales_manager home.
 *
 * One of three role dashboards built from the shared StatCard widget, replacing
 * the forked legacy Dashboard that hardcoded a single manager view for everyone
 * (audit I-107). Everything reads through the bounded repositories in
 * @/api/entities — no direct base44 access, no polling, explicit limits.
 *
 * Widgets:
 *  - KPI row: approvals queue, overdue tasks, active pipeline, cash position.
 *  - Pipeline breakdown: live car counts grouped by status_code, each row a
 *    deep-link to the pre-filtered vehicles page. Colors + Hebrew come from the
 *    single status source (StatusBadge / statusLabel).
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BadgeCheck, AlarmClock, Car, TrendingUp } from 'lucide-react';
import StatCard from './StatCard';
import StatusBadge from '@/components/ui/StatusBadge';
import { Cars, Tasks, CashFlows } from '@/api/entities';
import { STATUS_CODES, ARCHIVED_STATUS_CODES } from '@/shared/vehicleStatus';
import { formatCurrency, daysUntil } from '@/lib/format';

const CAR_LIMIT = 200;
const TASK_LIMIT = 200;
const CASH_LIMIT = 200;

/** Net cash of the loaded (bounded) paid rows — a rough position placeholder. */
function cashPosition(rows) {
  return rows.reduce((acc, r) => {
    if (!r?.paid) return acc;
    const amt = Number(r.amount) || 0;
    return r.direction === 'out' ? acc - amt : acc + amt;
  }, 0);
}

export default function ManagerDashboard() {
  const [state, setState] = useState({ loading: true, error: false });
  const [cars, setCars] = useState([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [tasks, setTasks] = useState([]);
  const [cash, setCash] = useState([]);

  useEffect(() => {
    let alive = true;
    async function load() {
      setState({ loading: true, error: false });
      try {
        const [carRows, pendingRows, taskRows, cashRows] = await Promise.all([
          Cars.list({ limit: CAR_LIMIT }),
          Cars.filter({ approval_status: 'pending_approval' }, { limit: CAR_LIMIT }),
          Tasks.list({ limit: TASK_LIMIT }),
          CashFlows.list({ limit: CASH_LIMIT }),
        ]);
        if (!alive) return;
        setCars(Array.isArray(carRows) ? carRows : []);
        setPendingCount(Array.isArray(pendingRows) ? pendingRows.length : 0);
        setTasks(Array.isArray(taskRows) ? taskRows : []);
        setCash(Array.isArray(cashRows) ? cashRows : []);
        setState({ loading: false, error: false });
      } catch (err) {
        console.error('[ManagerDashboard.load]', err);
        if (alive) setState({ loading: false, error: true });
      }
    }
    load();
    return () => {
      alive = false;
    };
  }, []);

  const overdueCount = useMemo(
    () =>
      tasks.filter((t) => {
        if (t?.status === 'done' || !t?.due_date) return false;
        const d = daysUntil(t.due_date);
        return d != null && d < 0;
      }).length,
    [tasks],
  );

  const activeCount = useMemo(
    () => cars.filter((c) => !ARCHIVED_STATUS_CODES.includes(c?.status_code)).length,
    [cars],
  );

  /** Counts per status_code, ordered by the canonical lifecycle, nonzero only. */
  const pipeline = useMemo(() => {
    const counts = new Map();
    for (const c of cars) {
      const code = c?.status_code;
      if (!code) continue;
      counts.set(code, (counts.get(code) || 0) + 1);
    }
    return STATUS_CODES.map((code) => ({ code, count: counts.get(code) || 0 })).filter(
      (r) => r.count > 0,
    );
  }, [cars]);

  const cashNet = useMemo(() => cashPosition(cash), [cash]);

  if (state.loading) {
    return (
      <div dir="rtl" className="p-6 text-sm text-slate-400">
        טוען נתוני דשבורד…
      </div>
    );
  }

  if (state.error) {
    return (
      <div dir="rtl" className="p-6 text-sm text-rose-400">
        טעינת נתוני הדשבורד נכשלה. נסה לרענן את העמוד.
      </div>
    );
  }

  return (
    <div dir="rtl" className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-slate-100">דשבורד ניהול</h1>
        <p className="text-sm text-slate-400">תמונת מצב של המלאי, האישורים והמשימות</p>
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="ממתינים לאישור"
          value={pendingCount}
          hint="רכבים חדשים לבדיקה"
          icon={<BadgeCheck size={18} />}
          to="/vehicles/pending"
        />
        <StatCard
          label="משימות באיחור"
          value={overdueCount}
          hint="חרגו מתאריך היעד"
          trend={overdueCount > 0 ? { dir: 'down', label: 'טיפול' } : { dir: 'flat', label: 'תקין' }}
          icon={<AlarmClock size={18} />}
          to="/tasks"
        />
        <StatCard
          label="רכבים פעילים"
          value={activeCount}
          hint="לא בארכיון"
          icon={<Car size={18} />}
          to="/vehicles"
        />
        <StatCard
          label="מצב מזומנים (מוערך)"
          value={formatCurrency(cashNet)}
          hint="נטו משורות ששולמו"
          icon={<TrendingUp size={18} />}
          to="/cashflow"
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-300">צנרת לפי סטטוס</h2>
        {pipeline.length === 0 ? (
          <div className="rounded-xl border border-slate-800 bg-[#0d1117] p-6 text-sm text-slate-400">
            אין רכבים להצגה כרגע.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {pipeline.map(({ code, count }) => (
              <Link
                key={code}
                to={`/vehicles?status=${encodeURIComponent(code)}`}
                dir="rtl"
                className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-[#0d1117] px-3 py-3 transition hover:border-amber-400/40 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
              >
                <StatusBadge code={code} />
                <span dir="ltr" className="text-lg font-semibold text-slate-100">
                  {count}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
