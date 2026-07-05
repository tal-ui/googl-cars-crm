/**
 * Single role → capability registry — the ONE place authorization is defined.
 *
 * Replaces the legacy client-side `ROLE_PERMISSIONS` map PLUS the ~7 ad-hoc
 * inline `user.custom_role === '...'` checks scattered across pages, PLUS the
 * hardcoded superuser email allowlist shipped in the bundle (audit I-107, I-110,
 * I-115). In v2, `admin` is a role — not an email literal. This registry drives
 * both the nav and the route guard; the server-side RLS (entities/*.json
 * rls_intended) is the real backstop.
 */

export const ROLES = ['admin', 'sales_manager', 'employee', 'logistics_employee', 'attendance_only'];

/** Capability keys are the vocabulary the whole app checks against. */
const P = {
  admin: ['*'],

  sales_manager: [
    'dashboard.view', 'vehicles.read', 'vehicles.write', 'vehicles.delete',
    'vehicles.pricing', 'vehicles.approve', 'customers.read', 'customers.write',
    'customers.delete', 'suppliers.read', 'suppliers.write', 'finance.read',
    'finance.write', 'documents.all', 'attendance.mark', 'attendance.view_all',
    'expenses.submit', 'expenses.manage', 'tasks.manage', 'users.manage',
    'messaging.send',
  ],

  employee: [
    'dashboard.view', 'vehicles.read', 'vehicles.create', 'vehicles.update_status',
    'customers.read', 'customers.write', 'suppliers.read', 'documents.general',
    'documents.sales', 'attendance.mark', 'attendance.view_own', 'expenses.submit',
    'tasks.own', 'messaging.send',
  ],

  logistics_employee: [
    'vehicles.read', 'vehicles.write', 'vehicles.update_status', 'shipments.manage',
    'delivery_prep.manage', 'documents.general', 'customers.read',
    'attendance.mark', 'attendance.view_own', 'expenses.submit', 'tasks.own',
  ],

  attendance_only: ['attendance.mark', 'attendance.view_own'],
};

/** Normalize whatever the user object carries into a known role. */
export function roleOf(user) {
  const r = user?.custom_role || user?.role;
  return ROLES.includes(r) ? r : 'employee'; // unknown → least-privilege staff
}

/**
 * Does `user` have `capability`? Supports the admin wildcard and per-user
 * `permissions[]` overrides. No email allowlist.
 */
export function can(user, capability) {
  if (!user) return false;
  const role = roleOf(user);
  const granted = P[role] || [];
  if (granted.includes('*')) return true;
  if (granted.includes(capability)) return true;
  if (Array.isArray(user.permissions) && user.permissions.includes(capability)) return true;
  return false;
}

/** Convenience for route guards: any of a set. */
export const canAny = (user, caps) => caps.some((c) => can(user, c));

export const capabilitiesFor = (role) => P[role] || [];
