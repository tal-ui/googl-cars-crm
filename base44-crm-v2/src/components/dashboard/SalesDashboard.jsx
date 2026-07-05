/**
 * SalesDashboard — the employee (sales) home.
 *
 * Built from the shared StatCard widget (one of three role dashboards, replacing
 * the forked legacy Dashboard — audit I-107). Everything reads through the bounded
 * repositories in @/api/entities; no polling, explicit limits, loading/empty states.
 *
 * Widgets:
 *  - My active cars: non-archived cars, each with a next-action hint derived from
 *    the status STAGE (single source: statusStage) so the rep always knows the
 *    move. Rows deep-link to the vehicle workspace.
 *  - Today's tasks: the signed-in user's open tasks due today or overdue.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Car, CheckSquare } from 'lucide-react';
import StatCard from './StatCard';
import StatusBadge from '@/components/ui/StatusBadge';
import { Cars, Tasks } from '@/api/entities';
import { ARCHIVED_STATUS_CODES, statusStage } from '@/shared/vehicleStatus';
import { formatDate, daysUntil } from '@/lib/format';

const CAR_LIMIT = 100;
const TASK_LIMIT = 100;

/** Next-action hint keyed by the canonical lifecycle stage. */
const STAGE_HINT = {
  purchase: 'להשלים רכישה ותשלום',
  shipping: 'לעדכן פרטי שילוח',
  customs: 'לשחרר מהמכס',
  prep: 'התקנות והכנה בארץ',
  stock: 'לשווק או להזמין',
  delivery: 'לתאם מסירה ללקוח',
  closed: 'התהליך הסתיים',
};

const nextAction = (code) => STAGE_HINT[statusStage(code)] || 'להמשיך בטיפול';

const carTitle = (c) =>
  [c?.make, c?.model, c?.year].filter(Boolean).join(' ') || 'רכב ללא שם';

export default function SalesDashboard({ user }) {
  const email = user?.email || '';
  const [state, setState] = useState({ loading: true, error: false });
  const [cars, setCars] = useState([]);
  const [tasks, setTasks] = useState([]);

  useEffect(() => {
    let alive = true;
    async function load() {
      setState({ loading: true, error: false });
      try {
        const [carRows, taskRows] = await Promise.all([
          Cars.list({ limit: CAR_LIMIT }),
          email ? Tasks.filter({ assigned_to: email }, { limit: TASK_LIMIT }) : [],
        ]);
        if (!alive) return;
        setCars(Array.isArray(carRows) ? carRows : []);
        setTasks(Array.isArray(taskRows) ? taskRows : []);
        setState({ loading: false, error: false });
      } catch (err) {
        console.error('[SalesDashboard.load]', err);
        if (alive) setState({ loading: false, error: true });
      }
    }
    load();
    return () => {
      alive = false;
    };
  }, [email]);

  const activeCars = useMemo(
    () => cars.filter((c) => !ARCHIVED_STATUS_CODES.includes(c?.status_code)),
    [cars],
  );

  /** Open tasks due today or already overdue, soonest first. */
  const todayTasks = useMemo(() => {
    const rows = tasks
      .filter((t) => {
        if (t?.status === 'done' || !t?.due_date) return false;
        const d = daysUntil(t.due_date);
        return d != null && d <= 0;
      })
      .sort((a, b) => (daysUntil(a.due_date) ?? 0) - (daysUntil(b.due_date) ?? 0));
    return rows;
  }, [tasks]);

  if (state.loading) {
    return (
      <div dir="rtl" className="p-6 text-sm text-slate-400">
        טוען את הדשבורד שלך…
      </div>
    );
  }

  if (state.error) {
    return (
      <div dir="rtl" className="p-6 text-sm text-rose-400">
        טעינת הדשבורד נכשלה. נסה לרענן את העמוד.
      </div>
    );
  }

  return (
    <div dir="rtl" className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-slate-100">הדשבורד שלי</h1>
        <p className="text-sm text-slate-400">הרכבים הפעילים והמשימות של היום</p>
      </header>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard
          label="רכבים פעילים"
          value={activeCars.length}
          hint="לא בארכיון"
          icon={<Car size={18} />}
          to="/vehicles"
        />
        <StatCard
          label="משימות להיום"
          value={todayTasks.length}
          hint="פתוחות, להיום או באיחור"
          icon={<CheckSquare size={18} />}
          to="/tasks/mine"
        />
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-300">הרכבים הפעילים שלי</h2>
          <Link to="/vehicles" className="text-xs text-amber-400 hover:text-amber-300">
            לכל הרכבים
          </Link>
        </div>
        {activeCars.length === 0 ? (
          <div className="rounded-xl border border-slate-800 bg-[#0d1117] p-6 text-sm text-slate-400">
            אין רכבים פעילים כרגע.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            {activeCars.map((c) => (
              <Link
                key={c.id}
                to={`/vehicles/${c.id}`}
                dir="rtl"
                className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-[#0d1117] px-3 py-3 transition hover:border-amber-400/40 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
              >
                <div className="min-w-0 space-y-1">
                  <div className="truncate text-sm font-medium text-slate-100">
                    {carTitle(c)}
                  </div>
                  <div className="text-xs text-amber-400/90">{nextAction(c?.status_code)}</div>
                </div>
                <StatusBadge code={c?.status_code} />
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-300">המשימות של היום</h2>
          <Link to="/tasks/mine" className="text-xs text-amber-400 hover:text-amber-300">
            לכל המשימות שלי
          </Link>
        </div>
        {todayTasks.length === 0 ? (
          <div className="rounded-xl border border-slate-800 bg-[#0d1117] p-6 text-sm text-slate-400">
            אין משימות פתוחות להיום. כל הכבוד!
          </div>
        ) : (
          <ul className="space-y-2">
            {todayTasks.map((t) => {
              const overdue = (daysUntil(t.due_date) ?? 0) < 0;
              return (
                <li
                  key={t.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-[#0d1117] px-3 py-3"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="truncate text-sm font-medium text-slate-100">
                      {t.title || 'משימה'}
                    </div>
                    <div className="text-xs text-slate-500">
                      יעד: <span dir="ltr">{formatDate(t.due_date)}</span>
                    </div>
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                      overdue
                        ? 'border-rose-500/30 bg-rose-500/15 text-rose-300'
                        : 'border-amber-500/30 bg-amber-500/15 text-amber-300'
                    }`}
                  >
                    {overdue ? 'באיחור' : 'להיום'}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
