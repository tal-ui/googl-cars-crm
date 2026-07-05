/**
 * App — the router root.
 *
 * <AuthProvider> wraps <BrowserRouter>, so every route (and the RouteGuard inside
 * each) reads the single auth context. EVERY protected route is wrapped in
 * <RouteGuard> with the SAME capability the nav declares in @/lib/navigation —
 * the menu and the guard can never disagree (audit I-107: legacy rendered every
 * page for any authenticated user). Paths that don't have a full page yet render
 * a friendly "בקרוב" stub, still behind their capability guard, so no nav link
 * 404s and none is silently ungated.
 *
 * The single <Toaster/> lives here so toast.* (the app's only feedback channel,
 * replacing 130+ alert()s — audit I-122) has a mount point, themed dark + RTL.
 */
import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { homePathFor } from '@/lib/navigation';
import RouteGuard from '@/components/auth/RouteGuard';
import Layout from '@/Layout';

import Dashboard from '@/pages/Dashboard';
import Vehicles from '@/pages/Vehicles';
import VehicleDetail from '@/pages/VehicleDetail';
import Customers from '@/pages/Customers';
import Attendance from '@/pages/Attendance';
import Expenses from '@/pages/Expenses';

/** Placeholder for nav destinations whose full screen isn't built yet. */
function StubPage({ title }) {
  return (
    <div
      dir="rtl"
      className="mx-auto flex min-h-[60vh] max-w-3xl flex-col items-center justify-center px-4 text-center"
    >
      <h1 className="mb-2 text-2xl font-semibold text-slate-100">{title}</h1>
      <p className="text-sm text-slate-400">העמוד בבנייה — בקרוב.</p>
    </div>
  );
}

/**
 * Dashboard route. Guarded on dashboard.view, but its fallback is the user's OWN
 * home (homePathFor) rather than "/", so roles without a dashboard
 * (logistics_employee → /shipments, attendance_only → /attendance) are redirected
 * instead of looping back onto "/".
 */
function DashboardRoute() {
  const { user } = useAuth();
  return (
    <RouteGuard capability="dashboard.view" fallback={homePathFor(user)}>
      <Dashboard />
    </RouteGuard>
  );
}

function Login() {
  const { refresh, loading } = useAuth();
  return (
    <div
      dir="rtl"
      className="flex min-h-screen flex-col items-center justify-center bg-[#080b12] px-4 text-center"
    >
      <div className="w-full max-w-sm rounded-2xl border border-slate-800 bg-[#0d1117] p-8">
        <div dir="ltr" className="mb-1 text-lg font-bold tracking-wide text-amber-300">
          Googl-Cars CRM
        </div>
        <h1 className="mb-4 text-xl font-semibold text-slate-100">התחברות</h1>
        <p className="mb-6 text-sm text-slate-400">יש להתחבר כדי להמשיך.</p>
        <button
          type="button"
          onClick={() => refresh()}
          disabled={loading}
          className="min-h-[44px] w-full rounded-lg bg-amber-400 px-4 py-2 font-medium text-slate-900 transition hover:bg-amber-300 disabled:opacity-60"
        >
          {loading ? 'טוען…' : 'התחבר'}
        </button>
      </div>
    </div>
  );
}

function NotFound() {
  return (
    <div
      dir="rtl"
      className="flex min-h-screen flex-col items-center justify-center bg-[#080b12] px-4 text-center"
    >
      <div dir="ltr" className="mb-2 text-5xl font-bold text-amber-300">
        404
      </div>
      <p className="mb-4 text-slate-300">הדף לא נמצא.</p>
      <Link
        to="/"
        className="min-h-[44px] rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-200 transition hover:bg-slate-800"
      >
        חזרה לדשבורד
      </Link>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route element={<Layout />}>
            {/* work */}
            <Route index element={<DashboardRoute />} />
            <Route
              path="tasks/mine"
              element={
                <RouteGuard anyOf={['tasks.own', 'tasks.manage']}>
                  <StubPage title="המשימות שלי" />
                </RouteGuard>
              }
            />
            <Route
              path="attendance"
              element={
                <RouteGuard capability="attendance.mark">
                  <Attendance />
                </RouteGuard>
              }
            />
            <Route
              path="expenses"
              element={
                <RouteGuard capability="expenses.submit">
                  <Expenses />
                </RouteGuard>
              }
            />

            {/* vehicles */}
            <Route
              path="vehicles"
              element={
                <RouteGuard capability="vehicles.read">
                  <Vehicles />
                </RouteGuard>
              }
            />
            <Route
              path="vehicles/pending"
              element={
                <RouteGuard capability="vehicles.approve">
                  <StubPage title="אישור רכבים" />
                </RouteGuard>
              }
            />
            <Route
              path="vehicles/:id"
              element={
                <RouteGuard capability="vehicles.read">
                  <VehicleDetail />
                </RouteGuard>
              }
            />
            <Route
              path="shipments"
              element={
                <RouteGuard capability="shipments.manage">
                  <StubPage title="משלוחים" />
                </RouteGuard>
              }
            />
            <Route
              path="catalog"
              element={
                <RouteGuard capability="vehicles.read">
                  <StubPage title="קטלוג דגמים" />
                </RouteGuard>
              }
            />

            {/* people */}
            <Route
              path="customers"
              element={
                <RouteGuard capability="customers.read">
                  <Customers />
                </RouteGuard>
              }
            />
            <Route
              path="suppliers"
              element={
                <RouteGuard capability="suppliers.read">
                  <StubPage title="ספקים" />
                </RouteGuard>
              }
            />
            <Route
              path="tracking"
              element={
                <RouteGuard capability="attendance.view_all">
                  <StubPage title="מעקב עובדים" />
                </RouteGuard>
              }
            />

            {/* finance */}
            <Route
              path="accounting"
              element={
                <RouteGuard capability="finance.read">
                  <StubPage title="הנהלת חשבונות" />
                </RouteGuard>
              }
            />
            <Route
              path="cashflow"
              element={
                <RouteGuard capability="finance.read">
                  <StubPage title="תזרים מזומנים" />
                </RouteGuard>
              }
            />
            <Route
              path="finance/vehicles"
              element={
                <RouteGuard capability="finance.read">
                  <StubPage title="רווחיות רכבים" />
                </RouteGuard>
              }
            />

            {/* comms */}
            <Route
              path="whatsapp"
              element={
                <RouteGuard capability="customers.read">
                  <StubPage title="שיחות WhatsApp" />
                </RouteGuard>
              }
            />
            <Route
              path="contracts"
              element={
                <RouteGuard capability="finance.read">
                  <StubPage title="ארכיון הסכמים" />
                </RouteGuard>
              }
            />

            {/* admin */}
            <Route
              path="tasks"
              element={
                <RouteGuard capability="tasks.manage">
                  <StubPage title="ניהול משימות" />
                </RouteGuard>
              }
            />
            <Route
              path="settings/users"
              element={
                <RouteGuard capability="users.manage">
                  <StubPage title="משתמשים" />
                </RouteGuard>
              }
            />
            <Route
              path="settings"
              element={
                <RouteGuard capability="users.manage">
                  <StubPage title="הגדרות" />
                </RouteGuard>
              }
            />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
      <Toaster theme="dark" position="top-center" dir="rtl" richColors closeButton />
    </AuthProvider>
  );
}
