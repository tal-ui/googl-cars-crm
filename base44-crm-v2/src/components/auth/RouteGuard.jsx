/**
 * RouteGuard — real route-level authorization.
 *
 * Fixes audit I-107: the legacy app rendered every page for any authenticated
 * user (App.jsx mapped all PAGES with no per-route gate; ProtectedRoute.jsx was
 * dead code), so /Accounting, /DataBackup, /PendingVehicles, /VehiclesDebug were
 * URL-reachable regardless of role. Here each route declares the capability it
 * needs; users without it get a friendly block, not the page. Server RLS is the
 * backstop — this is defense in depth, not the only line.
 */
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { can, canAny } from '@/lib/permissions';

export default function RouteGuard({ capability, anyOf, children, fallback = '/' }) {
  const { user, loading } = useAuth();

  if (loading) return null; // or a spinner
  if (!user) return <Navigate to="/login" replace />;

  const ok = anyOf ? canAny(user, anyOf) : capability ? can(user, capability) : true;
  if (!ok) {
    return fallback === false ? (
      <div className="p-8 text-center text-slate-400" dir="rtl">
        אין לך הרשאה לצפות בעמוד זה.
      </div>
    ) : (
      <Navigate to={fallback} replace />
    );
  }

  return children;
}
