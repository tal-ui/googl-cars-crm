/**
 * Navigation / IA registry — one declarative source for routes, the capability
 * each needs, and which nav group it belongs to. Drives BOTH the sidebar and the
 * RouteGuard, so a page can never be in the menu but unguarded (or vice-versa).
 *
 * Fixes: two divergent legacy nav systems + finance suite reachable only by URL
 * (audit I-124) + cosmetic-only gating (I-107). Role sees a route iff `can(user,
 * cap)`; RouteGuard enforces the same cap on the route element.
 */

/**
 * @typedef {{ key:string, path:string, label:string, icon:string,
 *   capability?:string, anyOf?:string[], group:string }} NavItem
 */

/** Groups render as labeled sections in the sidebar, in this order. */
export const NAV_GROUPS = ['work', 'vehicles', 'people', 'finance', 'comms', 'admin'];

/** @type {NavItem[]} */
export const NAV_ITEMS = [
  // work
  { key: 'dashboard', path: '/', label: 'דשבורד', icon: 'LayoutDashboard', capability: 'dashboard.view', group: 'work' },
  { key: 'my-tasks', path: '/tasks/mine', label: 'המשימות שלי', icon: 'CheckSquare', anyOf: ['tasks.own', 'tasks.manage'], group: 'work' },
  { key: 'attendance', path: '/attendance', label: 'שעון נוכחות', icon: 'Clock', capability: 'attendance.mark', group: 'work' },
  { key: 'expenses', path: '/expenses', label: 'הוצאות', icon: 'Receipt', capability: 'expenses.submit', group: 'work' },

  // vehicles
  { key: 'vehicles', path: '/vehicles', label: 'רכבים', icon: 'Car', capability: 'vehicles.read', group: 'vehicles' },
  { key: 'pending', path: '/vehicles/pending', label: 'אישור רכבים', icon: 'BadgeCheck', capability: 'vehicles.approve', group: 'vehicles' },
  { key: 'shipments', path: '/shipments', label: 'משלוחים', icon: 'Ship', capability: 'shipments.manage', group: 'vehicles' },
  { key: 'catalog', path: '/catalog', label: 'קטלוג דגמים', icon: 'BookOpen', capability: 'vehicles.read', group: 'vehicles' },

  // people
  { key: 'customers', path: '/customers', label: 'לקוחות', icon: 'Users', capability: 'customers.read', group: 'people' },
  { key: 'suppliers', path: '/suppliers', label: 'ספקים', icon: 'Truck', capability: 'suppliers.read', group: 'people' },
  { key: 'live-tracking', path: '/tracking', label: 'מעקב עובדים', icon: 'MapPin', capability: 'attendance.view_all', group: 'people' },

  // finance (was URL-only in legacy — now surfaced for finance roles)
  { key: 'accounting', path: '/accounting', label: 'הנהלת חשבונות', icon: 'Calculator', capability: 'finance.read', group: 'finance' },
  { key: 'cashflow', path: '/cashflow', label: 'תזרים מזומנים', icon: 'TrendingUp', capability: 'finance.read', group: 'finance' },
  { key: 'vehicle-finance', path: '/finance/vehicles', label: 'רווחיות רכבים', icon: 'DollarSign', capability: 'finance.read', group: 'finance' },

  // comms
  { key: 'whatsapp', path: '/whatsapp', label: 'שיחות WhatsApp', icon: 'MessageCircle', capability: 'customers.read', group: 'comms' },
  { key: 'contracts', path: '/contracts', label: 'ארכיון הסכמים', icon: 'FileSignature', capability: 'finance.read', group: 'comms' },

  // admin
  { key: 'tasks-admin', path: '/tasks', label: 'ניהול משימות', icon: 'ListTodo', capability: 'tasks.manage', group: 'admin' },
  { key: 'users', path: '/settings/users', label: 'משתמשים', icon: 'UserCog', capability: 'users.manage', group: 'admin' },
  { key: 'settings', path: '/settings', label: 'הגדרות', icon: 'Settings', capability: 'users.manage', group: 'admin' },
];

import { can, canAny } from './permissions';

/** Nav items this user may see, grouped and ordered. */
export function navForUser(user) {
  const visible = NAV_ITEMS.filter((it) =>
    it.anyOf ? canAny(user, it.anyOf) : it.capability ? can(user, it.capability) : true,
  );
  return NAV_GROUPS.map((group) => ({
    group,
    items: visible.filter((it) => it.group === group),
  })).filter((g) => g.items.length > 0);
}

/** attendance_only lands on a single screen — no chrome. */
export const homePathFor = (user) => {
  const role = user?.custom_role || user?.role;
  if (role === 'attendance_only') return '/attendance';
  if (role === 'logistics_employee') return '/shipments';
  return '/';
};
