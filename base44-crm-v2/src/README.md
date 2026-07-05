# base44-crm-v2/src — v2 frontend

Mirrors the Base44 app's `src/` layout so files map 1:1 when synced in Phase 4.

## Import aliases / sync mapping
The Base44 app maps `@` → `src` (see legacy `jsconfig.json`). During the Phase 4
sync:
- `base44-crm-v2/src/*` → app `src/*`
- `base44-crm-v2/shared/*` → app `src/shared/*`  (so `@/shared/...` resolves)

So v2 frontend code imports domain logic as `@/shared/vehicleStatus` and
`@/shared/labels` — the SAME canonical modules the migration scripts import via a
relative path. One source of truth, two consumers.

## Architecture (fixes the audit's structural gaps)
- **`api/`** — the data layer that was missing (audit P3). `entities.js` exports
  every model + a thin repository per entity (pagination, legacy-field fallback).
  Pages NEVER call `base44.entities.*` directly.
- **`lib/permissions.js`** — one role→capability registry (replaces the 7 ad-hoc
  role checks + the hardcoded superuser email allowlist). `admin` is a role now.
- **`components/auth/RouteGuard.jsx`** — real route-level authorization (the legacy
  `ProtectedRoute` was dead code; every page was URL-reachable).
- **`components/ui/`** — the shared library that de-duplicates the 7× status maps,
  25× currency formatters, 30× uploaders, and the 130+ `alert()` sites (→ toast).
  RTL-correct by construction (logical properties only).

## Status
Foundation slice in progress: data layer, permissions, route guard, StatusBadge,
formatters. Then the tabbed Car workspace, per-role dashboards, and the five golden
flows (see `../docs/PLAN.md` Phase 2).
