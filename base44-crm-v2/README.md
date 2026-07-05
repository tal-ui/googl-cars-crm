# Base44 CRM v2 — Upgrade Project

Staging area for the upgraded version of the live Base44 vehicle-import CRM
(app `68443d2c8f84772d77908ebe`). The live app is **never modified** from this
project until the owner explicitly approves deployment (see `docs/PLAN.md`,
Phase 5).

This folder is independent of the demo CRM at the repository root — do not mix
the two.

## Structure

```
base44-crm-v2/
├── audit/               # Phase 0 deliverables (read-only findings)
│   ├── schemas/         # Verbatim entity-schema snapshots from the live app
│   ├── AUDIT.md         # Consolidated audit report          (pending)
│   ├── ISSUES.md        # Ranked defect register             (seeded)
│   └── PROCESS-MAP.md   # Business-ops map, owner-validated  (pending)
├── entities/            # v2 entity schemas (JSON)            (Phase 1)
├── migrations/          # Numbered idempotent migration scripts (Phase 1/5)
├── src/                 # v2 frontend (mirrors Base44 pages/ + components/) (Phase 2)
├── functions/           # v2 backend functions (Deno)         (Phase 3)
└── docs/                # PLAN.md, DATA-MODEL.md, IA.md, UX-FLOWS.md, ENV.md
```

## Status

- [x] Plan approved (`docs/PLAN.md`)
- [x] Entity-schema snapshot captured (25 entities) — `audit/schemas/`
- [x] ISSUES.md seeded with schema-level findings
- [ ] Phase 0 file-level audit — **blocked**: Base44 MCP tool calls currently
      require an approval that the session cannot obtain (see PLAN.md context)
- [ ] Phases 1–5

## Hard rules

- No customer PII (names, phones, ID numbers, GPS coordinates) is ever
  committed to this repository. Schema snapshots contain structure only.
- All schema migrations are additive-first; nothing is renamed or dropped in
  place on the live app.
