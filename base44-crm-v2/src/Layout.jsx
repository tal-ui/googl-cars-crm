/**
 * Layout — the RTL application frame.
 *
 * One chrome for the whole CRM: a grouped sidebar built from navForUser(user)
 * (so the menu can never drift from the RouteGuard — both read @/lib/navigation),
 * a mobile top bar + slide-in drawer, and a global "+" quick-action menu that
 * opens QuickAddCarDialog / LogPaymentDialog gated by capability. Pages render
 * through <Outlet/>.
 *
 * The `attendance_only` role gets NO chrome — those users only ever see the
 * one-tap clock screen at /attendance, so we render the Outlet full-bleed.
 *
 * Everything is RTL with logical properties only (ms-/me-/ps-/pe-, start-/end-,
 * border-e). The active item is resolved by longest-path match so a nested route
 * (e.g. /vehicles/pending) highlights its own item, not the parent /vehicles.
 */
import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, CheckSquare, Clock, Receipt, Car, BadgeCheck, Ship, BookOpen,
  Users, Truck, MapPin, Calculator, TrendingUp, DollarSign, MessageCircle,
  FileSignature, ListTodo, UserCog, Settings, Menu, X, Plus, Circle,
} from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { navForUser } from '@/lib/navigation';
import { roleOf, can } from '@/lib/permissions';
import QuickAddCarDialog from '@/components/vehicles/QuickAddCarDialog';
import LogPaymentDialog from '@/components/payments/LogPaymentDialog';

/** Fixed lucide set keyed by NAV_ITEMS[].icon; unknown names fall back to a dot. */
const ICONS = {
  LayoutDashboard, CheckSquare, Clock, Receipt, Car, BadgeCheck, Ship, BookOpen,
  Users, Truck, MapPin, Calculator, TrendingUp, DollarSign, MessageCircle,
  FileSignature, ListTodo, UserCog, Settings,
};

const GROUP_LABELS = {
  work: 'עבודה',
  vehicles: 'רכבים',
  people: 'אנשים',
  finance: 'כספים',
  comms: 'תקשורת',
  admin: 'ניהול',
};

const ROLE_LABELS = {
  admin: 'מנהל מערכת',
  sales_manager: 'מנהל מכירות',
  employee: 'עובד',
  logistics_employee: 'עובד לוגיסטיקה',
  attendance_only: 'נוכחות בלבד',
};

const cx = (...a) => a.filter(Boolean).join(' ');

/** Longest matching nav path wins, so nested routes light their own item. */
function activeKeyFor(items, pathname) {
  let best = null;
  for (const it of items) {
    const match =
      it.path === '/' ? pathname === '/' : pathname === it.path || pathname.startsWith(`${it.path}/`);
    if (match && (!best || it.path.length > best.path.length)) best = it;
  }
  return best?.key ?? null;
}

function Brand() {
  return (
    <div className="flex items-center gap-2 px-4 py-4">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-amber-400/15 text-amber-300">
        <Car className="h-5 w-5" aria-hidden />
      </span>
      <span dir="ltr" className="text-base font-bold tracking-wide text-amber-300">
        Googl-Cars
      </span>
    </div>
  );
}

function SidebarNav({ groups, activeKey, onNavigate }) {
  return (
    <nav className="flex-1 overflow-y-auto px-2 py-2">
      {groups.map(({ group, items }) => (
        <div key={group} className="mb-4">
          <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            {GROUP_LABELS[group] || group}
          </div>
          <ul className="space-y-0.5">
            {items.map((it) => {
              const Icon = ICONS[it.icon] || Circle;
              const active = it.key === activeKey;
              return (
                <li key={it.key}>
                  <Link
                    to={it.path}
                    onClick={onNavigate}
                    aria-current={active ? 'page' : undefined}
                    className={cx(
                      'flex min-h-[44px] items-center gap-3 rounded-lg px-3 py-2 text-sm transition',
                      active
                        ? 'bg-amber-400/10 text-amber-300'
                        : 'text-slate-300 hover:bg-slate-800/60 hover:text-slate-100',
                    )}
                  >
                    <Icon className="h-5 w-5 shrink-0" aria-hidden />
                    <span className="truncate">{it.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function UserFooter({ user }) {
  const role = roleOf(user);
  const name = user?.full_name || user?.name || user?.email || 'משתמש';
  const initial = String(name).trim().charAt(0) || '?';
  return (
    <div className="flex items-center gap-3 border-t border-slate-800 px-4 py-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-800 text-sm font-semibold text-slate-200">
        {initial}
      </span>
      <div className="min-w-0">
        <div className="truncate text-sm text-slate-200">{name}</div>
        <div className="truncate text-xs text-slate-500">{ROLE_LABELS[role] || role}</div>
      </div>
    </div>
  );
}

/** Self-contained "+" popover. Parent owns the dialogs; this just picks an action. */
function QuickMenu({ canCar, canPay, onAddCar, onLogPayment }) {
  const [open, setOpen] = useState(false);
  if (!canCar && !canPay) return null;

  const pick = (fn) => {
    setOpen(false);
    fn();
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex min-h-[44px] items-center gap-1.5 rounded-lg bg-amber-400 px-3 py-2 text-sm font-medium text-slate-900 transition hover:bg-amber-300"
      >
        <Plus className="h-4 w-4" aria-hidden />
        <span>הוסף</span>
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-30 cursor-default"
          />
          <div
            role="menu"
            className="absolute end-0 z-40 mt-2 w-52 overflow-hidden rounded-xl border border-slate-800 bg-[#0d1117] p-1 shadow-xl"
          >
            {canCar && (
              <button
                type="button"
                role="menuitem"
                onClick={() => pick(onAddCar)}
                className="flex w-full min-h-[44px] items-center gap-3 rounded-lg px-3 py-2 text-start text-sm text-slate-200 transition hover:bg-slate-800"
              >
                <Car className="h-4 w-4 text-amber-300" aria-hidden />
                <span>הוסף רכב</span>
              </button>
            )}
            {canPay && (
              <button
                type="button"
                role="menuitem"
                onClick={() => pick(onLogPayment)}
                className="flex w-full min-h-[44px] items-center gap-3 rounded-lg px-3 py-2 text-start text-sm text-slate-200 transition hover:bg-slate-800"
              >
                <DollarSign className="h-4 w-4 text-amber-300" aria-hidden />
                <span>רשום תשלום</span>
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default function Layout() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [carOpen, setCarOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);

  // Close the mobile drawer on any navigation.
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  if (loading) {
    return (
      <div
        dir="rtl"
        className="flex min-h-screen items-center justify-center bg-[#080b12] text-sm text-slate-400"
      >
        טוען…
      </div>
    );
  }

  // attendance_only: no chrome — the clock screen owns the whole viewport.
  if (roleOf(user) === 'attendance_only') {
    return (
      <div dir="rtl" className="min-h-screen bg-[#080b12] text-slate-200">
        <Outlet />
      </div>
    );
  }

  const groups = navForUser(user);
  const flat = groups.flatMap((g) => g.items);
  const activeKey = activeKeyFor(flat, location.pathname);
  const activeLabel = flat.find((it) => it.key === activeKey)?.label || 'גוגל־קארס';

  const canCar = can(user, 'vehicles.create');
  const canPay = can(user, 'finance.write');

  const quick = (
    <QuickMenu
      canCar={canCar}
      canPay={canPay}
      onAddCar={() => setCarOpen(true)}
      onLogPayment={() => setPayOpen(true)}
    />
  );

  return (
    <div dir="rtl" className="flex min-h-screen bg-[#080b12] text-slate-200">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-e border-slate-800 bg-[#0d1117] md:flex">
        <Brand />
        <SidebarNav groups={groups} activeKey={activeKey} />
        <UserFooter user={user} />
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="סגור תפריט"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 bg-black/60"
          />
          <aside className="absolute inset-y-0 start-0 flex w-72 max-w-[85%] flex-col border-e border-slate-800 bg-[#0d1117]">
            <div className="flex items-center justify-between">
              <Brand />
              <button
                type="button"
                aria-label="סגור"
                onClick={() => setDrawerOpen(false)}
                className="me-2 grid h-10 w-10 place-items-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-slate-100"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
            <SidebarNav groups={groups} activeKey={activeKey} onNavigate={() => setDrawerOpen(false)} />
            <UserFooter user={user} />
          </aside>
        </div>
      )}

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-slate-800 bg-[#0d1117] px-3 md:hidden">
          <button
            type="button"
            aria-label="פתח תפריט"
            onClick={() => setDrawerOpen(true)}
            className="-ms-1 grid h-11 w-11 place-items-center rounded-lg text-slate-300 hover:bg-slate-800"
          >
            <Menu className="h-6 w-6" aria-hidden />
          </button>
          <span className="truncate text-sm font-semibold text-slate-100">{activeLabel}</span>
          <div className="ms-auto">{quick}</div>
        </header>

        {/* Desktop top bar */}
        <header className="hidden h-14 items-center justify-between border-b border-slate-800 bg-[#0d1117]/60 px-6 md:flex">
          <h1 className="truncate text-sm font-semibold text-slate-200">{activeLabel}</h1>
          {quick}
        </header>

        <main className="flex-1">
          <Outlet />
        </main>
      </div>

      {/* Global quick-action dialogs */}
      <QuickAddCarDialog
        open={carOpen}
        onClose={() => setCarOpen(false)}
        onCreated={(car) => {
          if (car?.id) navigate(`/vehicles/${car.id}`);
        }}
      />
      <LogPaymentDialog open={payOpen} onClose={() => setPayOpen(false)} onCreated={() => {}} />
    </div>
  );
}
