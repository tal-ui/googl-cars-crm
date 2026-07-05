# Base44 CRM v2 — Audit, Fix & Upgrade Plan (app 68443d2c8f84772d77908ebe)

## Context

The live Base44 app is a Hebrew (RTL) vehicle-import & dealership CRM: import lifecycle (purchase abroad → shipping → port/customs → delivery prep → handover), sales/orders/trade-ins, customers, finance (invoices, payments, cashflow, employee expenses), GPS attendance, tasks with 30-min "nagging" escalation, WhatsApp/Telegram bots, contracts, camera/visitor webhook. Owner: it's "messy and not mature" — wants a full business/ops understanding, a code review with a fix plan, day-to-day UX simplification, and the upgrade staged **without touching the live app**, deployed to it only after approval.

**Constraint hit during planning:** plan mode blocked all Base44 MCP calls (even read-only), so the file-level code review runs as **Phase 0** immediately after approval. The complete 25-entity schema was retrieved before plan mode and already yields verified findings:

- **`Car` is a ~90-field god entity**: foreign-currency purchase, shipping, a 19-value Hebrew status enum **with a typo ("טרייייד אין")**, delivery-prep checklist, trade-ins, embedded unbounded `history` array, docs/images/expense-invoice arrays, Drive folder, approval workflow.
- **Schema drift**: `WhatsAppMessage` duplicate field pairs (`customerId`/`customer_id`, `customerName`/`customer_name`, `message`/`message_text`); `AttendanceRecord` legacy compat fields; Car overlapping expense fields.
- **Security**: only `Invoice`/`Order` have RLS and it uses `auth.role() IN (...)` — likely invalid Base44 syntax (real syntax is `user_condition`/`{{user.role}}` templates), so it may silently not apply. **GPS entities (`AttendanceRecord`, `LocationTracking` — every-2-min employee locations) have no RLS at all** — likely top-severity issue.
- Unbounded embedded history arrays (doc bloat), unconstrained money fields, mixed Hebrew/English enums, ad-hoc role gating (`custom_role` + free-form `permissions[]`).

## Staging & safety decisions

- **Code of the upgraded version**: GitHub `tal-ui/googl-cars-crm`, branch `claude/base44-access-test-7y2gf8`, new top-level folder `base44-crm-v2/` (the repo root holds an unrelated demo CRM — verified; no collision). PR opened only when the user asks.
- **Live preview**: a NEW Base44 app created with the v2 code + anonymized seed data for click-through review.
- **Live app deploy only after explicit approval**: `create_checkpoint` first + full entity export, additive-only schema migration (add → backfill → switch reads → deprecate; never rename/drop), rehearsed rollback.
- **Hard rule**: no PII (customer names/phones/GPS) ever committed to GitHub.

**Organizing UX principle**: per-role home screens; minimal clicks for the five golden flows — *add car, advance status, log payment, submit expense, clock in*.

---

## Phase 0 — Discovery & Audit (read-only; first execution step)

No writes of any kind to the live app.

1. **Snapshot ground truth**: `list_entity_schemas` (save verbatim to `base44-crm-v2/audit/schemas/`), recursive `list_directory` file inventory with sizes, `list_connectors`, small `query_entities` samples per entity → record counts + populated-field ratios (tells us which of Car's ~90 fields are real vs dead).
2. **Parallel subagent fan-out**:
   - **Track A — Business-ops map** → `PROCESS-MAP.md`: per-role "day in the life", status-transition diagram (which of the 19 statuses actually occur in data), money/people/bot flows.
   - **Track B — Backend/integrations audit**: every `functions/` file (purpose, trigger, entities, external calls); grep sweeps for hardcoded secrets (`token|api_key|secret|Bearer|sk-`, bot-token patterns — locations committed, values never), empty catches, missing webhook signature checks, nagging-scheduler mechanism, GPS write volume.
   - **Track C — Frontend quality review**: god-components, duplicated fetching, direct entity calls in components, Car-form structure, RTL inconsistencies (`ml-`/`mr-` vs logical props), dead pages, client-only permission checks. Findings as `file:line — issue — severity — fix`.
   - **Track D (after A–C) — RLS/security probe**: empirically test the `auth.role()` rules' actual behavior; confirm GPS/Expense/Payment/CashFlow/WhatsAppMessage readability by ordinary users; test what `create_checkpoint` actually restores (code vs schema vs data) **on the preview app** — the rollback design depends on it.
3. **Deliverables** (committed to branch under `base44-crm-v2/audit/`): `AUDIT.md`, `ISSUES.md` (ranked: P0 security / P1 data-integrity / P2 correctness / P3 UX / P4 hygiene — seeded with the verified findings above), `PROCESS-MAP.md`.
4. **Hard gate**: owner confirms/corrects PROCESS-MAP.md ("we believe X works like Y — correct?") before redesign is finalized. ISSUES.md re-baselines Phases 1–5.

## Phase 1 — Data Model v2 (`base44-crm-v2/entities/*.json`, docs, migrations)

- **Decompose `Car`**: keep core (identity, specs, current status, money summary); satellites keyed by `car_id`: `CarPurchase`, `CarShipment`, `CarExpenseInvoice` (one per invoice), `CarDocument`/`CarImage`, `CarHistoryEvent` (append-only, replaces embedded history — same for Customer), `DeliveryPrep`. 0%-populated fields get deprecated, not migrated.
- **Status machine, not enum**: English snake_case codes + single Hebrew label map in one shared module; allowed-transition table enforced server-side; typo value maps to canonical `trade_in` in code until backfill normalizes.
- **Unify duplicates**: snake_case canonical on `WhatsAppMessage`; camelCase twins + AttendanceRecord legacy fields frozen (never written by v2).
- **Money discipline**: amount+currency together, ≥0 constraints, exchange rate stored with the transaction.
- **RLS everywhere it matters** using verified-working syntax: employees read own attendance/GPS only; Expense = owner+approvers; finance entities = finance roles; bot entities = service+managers.
- **Volume control**: GPS ping retention policy; coarser v2 writes.
- **Migration strategy (executed only in Phase 5)**: numbered idempotent scripts in `base44-crm-v2/migrations/` — add → backfill (batched, count-reconciled) → switch reads (with legacy fallback) → deprecate. Embedded history arrays left intact as backup.
- **Verification**: 100% legacy-field disposition table in `docs/DATA-MODEL.md`; dry-run migrations on preview with PII-scrubbed clones of real records; per-role RLS matrix tested empirically on preview.

## Phase 2 — Frontend Architecture & UX (`base44-crm-v2/src/` mirroring Base44 `pages/`+`components/` layout)

- **Shared API layer**: one module per entity wrapping the Base44 SDK (fetching, caching, legacy-field fallback, status machine + label maps). Pages never call entities directly.
- **Component library**: money input w/ currency, Hebrew date picker, phone input, status stepper, uploader — RTL-correct by construction (logical properties `ms-/me-/ps-/pe-`; explicit LTR islands for phones/VINs/plates).
- **Role-based IA** from a single route+permission registry: sales_manager (full), employee (my cars/customers/tasks + quick actions), logistics_employee (shipments, prep checklists, documents), attendance_only (exactly one clock-in screen).
- **Five golden flows with click budgets**: add car ≤3 fields to first save (quick-add modal, progressive enrichment); advance status = 1 click via stepper showing only legal transitions + inline required fields; log payment ≤4 fields from a global "+"; submit expense = camera-first mobile (photo → auto-extract → confirm 2 fields); clock-in = 1 tap giant button.
- **Car workspace instead of 90-field form**: lifecycle tabs (Purchase • Shipping • Customs/Registration • Prep • Sale • Delivery); current-status tab auto-focused, completed stages collapse to summaries; each tab saves its own satellite entity. Keep an "all fields" fallback view during transition (risk R7).
- **Per-role dashboards** (manager: pipeline/cash/approvals/attendance; sales: next-action-per-car; logistics: ETAs + checklist %), every widget deep-links to a pre-filtered list.
- **Mobile-first** attendance & expenses (360px, offline-tolerant clock-in queue).
- **Verification**: click-budget measurement per flow in preview; RTL sweep; per-role login asserts nav+data match IA matrix (`docs/IA.md`, `docs/UX-FLOWS.md`).

## Phase 3 — Backend/Functions Cleanup (`base44-crm-v2/functions/`)

- All secrets → `Deno.env`; `docs/ENV.md` lists them; **rotate any token that was ever hardcoded**.
- One Telegram + one WhatsApp entrypoint with shared middleware: signature verification, idempotency (dedupe by provider message id), structured logging, single canonical snake_case write path.
- Scheduler reliability: heartbeat record, per-item try/catch, stale-heartbeat admin alert; GPS ingestion validation + retention.
- `withHandler` wrapper on every function (validation, structured JSON logs, no empty catches); server-side enforcement of status transitions + money validation.
- Webhook hardening (OpenClaw/Telegram/WhatsApp): origin verification, rate-limit, reject malformed.
- **Verification**: smoke harness on preview (happy + malformed payloads, mid-batch failure survives), grep proves zero hardcoded secrets in v2.

## Phase 4 — Preview App + Review Loop

1. `create_base44_app` (minimal shell) → sync repo v2 files via `write_file`; `create_entity_schema` for v2 entities. Repo = source of truth.
2. Seed via `create_entities`: PII-scrubbed clones of ~10–20 real cars across statuses + synthetic edge cases (typo status, camelCase-only WhatsApp rows, open attendance record, pending expense).
3. Dry-run migrations on the seeded legacy-shaped data. Bots run with **test tokens/dry-run flags only** — preview never messages real people.
4. PR opened **only when the user asks**; body links AUDIT/ISSUES/PROCESS-MAP + preview URL + per-issue disposition table (fixed/deferred/won't-fix). Iterate on owner feedback. New asks → "v2.1 backlog" unless P0/P1.
5. **Gate**: owner completes the five golden flows in preview within budgets + explicit approval message.

## Phase 5 — Approved Deployment to Live App (strictly serial, low-activity window — never mid-shift)

1. Freeze + `create_checkpoint` (`pre-v2-YYYYMMDD`).
2. Full paginated entity export → local JSON (NOT committed — PII); per-entity counts = reconciliation baseline.
3. Additive-only schema changes (old code keeps working — independently safe step).
4. Backfill scripts, count-reconciled after each.
5. File sync in dependency order (shared libs → components → functions → pages), mid-way checkpoint.
6. Env vars set, hardcoded tokens rotated, webhooks re-pointed **last**.
7. Go/no-go (~30 min): entity spot-checks vs baseline; bot end-to-end tests; manual nag-scheduler trigger; five golden flows live; RLS check (employee cannot read another's GPS); one full scheduler cycle in logs.
8. **Rollback (pre-rehearsed on preview)**: restore checkpoint; additive migrations mean legacy code just ignores new entities; re-point webhooks back; any P0/P1 failure → immediate rollback, no live debugging.
9. Monitor one week (heartbeats, bot logs, attendance completeness) before the separate deprecated-field cleanup.

## Sequencing

Phase 0 → owner gate → Phases 1/2/3 largely parallel (2 & 3 start once Phase 1's schema *drafts* land; migration scripts continue in parallel) → Phase 4 absorbs output incrementally → approval gate → Phase 5 serial. Effort ≈ 0:15%, 1:15%, 2:35%, 3:15%, 4:10%, 5:10%.

## Top risks & mitigations

- **Bots break at cutover** → re-point webhooks last, sandbox tokens in preview, e2e smoke in go/no-go.
- **Attendance corrupted mid-shift** → deploy off-hours, additive schema, explicit handling of open records, next-day completeness check.
- **Checkpoint semantics differ from assumption** → tested on preview in Phase 0 Track D; independent JSON export as safety net.
- **RLS lockout / behavior change on Invoice-Order** → Track D establishes current behavior first; per-role preview tests; RLS staged last with fast toggle-off.
- **Hidden in-use Car fields** → populated-field analysis + owner walkthrough + "all fields" fallback view.
- **PII in GitHub** → scrub rule enforced on every committed artifact.

## Critical files

- `base44-crm-v2/audit/{AUDIT,ISSUES,PROCESS-MAP}.md` — Phase 0 deliverables and the re-baselining contract
- `base44-crm-v2/entities/*.json`, `docs/DATA-MODEL.md` — v2 schema + field-disposition table
- `base44-crm-v2/migrations/` + `MIGRATION-RUNBOOK.md` — additive migration & rollback
- `base44-crm-v2/src/`, `docs/{IA,UX-FLOWS,ENV}.md`, `functions/` — the v2 app itself
- Existing live-app files: inventoried in Phase 0 (currently unreadable due to plan-mode gate)

## Verification (end-to-end)

Each phase carries its own checks (above); the overall proof chain is: owner-validated PROCESS-MAP → ISSUES.md disposition table 100% covered → migrations dry-run + RLS matrix green on preview → owner completes the five golden flows in preview → go/no-go checklist green on live → one-week monitoring clean.
