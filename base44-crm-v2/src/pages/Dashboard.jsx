/**
 * Dashboard — the role-aware home ("/").
 *
 * Fixes the legacy split where three forked dashboards drifted apart (audit
 * I-107). Here one page reads the signed-in user once (useAuth), resolves the
 * canonical role (roleOf — no email allowlists, no inline custom_role checks),
 * and renders the matching dashboard. Each dashboard is built from the shared
 * StatCard widget and pulls its own data through bounded repositories.
 *
 * Route access is enforced by RouteGuard (dashboard.view); this component only
 * decides WHICH dashboard a permitted user sees.
 */
import { useAuth } from '@/lib/AuthContext';
import { roleOf } from '@/lib/permissions';
import ManagerDashboard from '@/components/dashboard/ManagerDashboard';
import SalesDashboard from '@/components/dashboard/SalesDashboard';
import LogisticsDashboard from '@/components/dashboard/LogisticsDashboard';

export default function Dashboard() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div dir="rtl" className="p-6 text-sm text-slate-400">
        טוען…
      </div>
    );
  }

  if (!user) {
    return (
      <div dir="rtl" className="p-6 text-sm text-slate-400">
        יש להתחבר כדי לצפות בדשבורד.
      </div>
    );
  }

  const role = roleOf(user);

  return (
    <div dir="rtl" className="mx-auto w-full max-w-6xl px-4 py-6">
      {role === 'admin' || role === 'sales_manager' ? (
        <ManagerDashboard />
      ) : role === 'logistics_employee' ? (
        <LogisticsDashboard />
      ) : (
        <SalesDashboard user={user} />
      )}
    </div>
  );
}
