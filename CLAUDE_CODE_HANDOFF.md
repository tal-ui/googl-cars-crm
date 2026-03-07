# Googl-Cars CRM — Claude Code Handoff

## Project Overview
A comprehensive luxury vehicle import CRM for an Israeli market, built as a single-page React app with Supabase backend for file storage.

## Tech Stack
- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui (40+ components)
- **Bundling**: Parcel (for single-file HTML artifact output)
- **Backend**: Supabase (Storage, Edge Functions, PostgreSQL)
- **Package Manager**: pnpm

## Repository Structure
```
googl-cars-crm/
├── src/
│   ├── App.tsx              # Main application (2667 lines, all features)
│   ├── index.css            # Tailwind + dark theme CSS variables
│   ├── main.tsx             # React entry point
│   ├── components/ui/       # 40+ shadcn/ui components
│   ├── hooks/               # Utility hooks
│   └── lib/                 # Utility functions
├── index.html               # HTML entry
├── bundle.html              # Built single-file artifact
├── package.json
├── tailwind.config.js
├── tsconfig.app.json
└── vite.config.ts
```

## Supabase Configuration

### Project
- **Name**: Googl-Cars CRM
- **Project ID**: `gspyasinnuxqtnmjzkch`
- **Region**: EU West (eu-west-1)
- **URL**: `https://gspyasinnuxqtnmjzkch.supabase.co`
- **Dashboard**: `https://supabase.com/dashboard/project/gspyasinnuxqtnmjzkch`

### API Keys
- **Anon Key**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdzcHlhc2lubnV4cXRubWp6a2NoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3NTE1ODAsImV4cCI6MjA4ODMyNzU4MH0.ie9AOOa_6o4XMAF1ZMQUGLlIEPOBjkYBWZHRqkYXGF0`
- **Publishable Key**: `sb_publishable_oFstO2FbOCfn_kuwh6E2Tg_xWNtlbXV`

### Storage
- **Bucket**: `crm-files` (public read, 50MB limit)
- **Allowed MIME types**: JPEG, PNG, WebP, GIF, PDF, Word, Excel, ZIP, TXT
- **Path convention**:
  ```
  crm-files/
  ├── vehicle_image/{vehicleId}/{timestamp}_{filename}
  ├── vehicle_attachment/{vehicleId}/{timestamp}_{filename}
  ├── customer_document/{customerId}/{timestamp}_{filename}
  └── import_document/{importId}/{timestamp}_{filename}
  ```

### Database Table: `crm_file_metadata`
| Column | Type | Description |
|--------|------|-------------|
| id | uuid (PK) | Auto-generated |
| storage_path | text | Path in crm-files bucket |
| original_name | text | Original filename |
| file_type | text | Extension (PDF, JPG, etc.) |
| file_size | bigint | Bytes |
| mime_type | text | MIME type |
| record_type | text | vehicle_image, vehicle_attachment, customer_document, import_document |
| record_id | text | Vehicle/customer/import ID |
| category | text | document, image, invoice, registration, etc. |
| uploaded_by | text | Uploader name |
| notes | text | Description |
| is_primary | boolean | Primary image flag |
| public_url | text (generated) | Auto-constructed Supabase URL |
| created_at | timestamptz | Auto |
| updated_at | timestamptz | Auto (trigger) |

RLS: Enabled with anon + authenticated read/write/delete policies.

### Edge Function: `upload-file`
- **URL**: `https://gspyasinnuxqtnmjzkch.supabase.co/functions/v1/upload-file`
- **JWT**: Disabled (for demo/dev usage)
- **Methods**:
  - `POST` (multipart/form-data): Upload file → storage + metadata
  - `GET` (?record_type=&record_id=): List files
  - `DELETE` (JSON body {id, storage_path}): Remove file + metadata

## App Architecture (src/App.tsx)

### Type System
- `UserRole`: super_admin | standard | customer
- `VehicleCategory`: imported | trade_in | local
- `ImportStage`: 8 stages from sourced → delivered
- `LeadStatus`: 6 stages from new → won/lost
- `TaskPriority/Status`: standard CRUD
- `ObjectType`: vehicle | lead | customer | vendor | task (for custom fields)
- `CustomFieldDef`: Dynamic field definitions with type, order, visibility
- `Notification`: Multi-channel notification records
- `WishlistItem`: Client dream-car matching
- `VehicleImage/VehicleAttachment`: File metadata on records

### Context (AppCtx)
All state is managed via React Context with useState hooks:
- user, vehicles, imports, leads, customers, vendors, tasks
- wishlist, compareIds, customFields, notifications
- All have corresponding setter functions

### Key Components & Features

**Role-Based Access (3 roles)**:
- Super Admin: Full access including costs, vendors, custom fields builder
- Standard User: Full CRM without cost/vendor data
- Customer: Portal with vehicle tracking, document upload, messages

**Vehicle Management**:
- Card grid with filters, search, compare checkboxes
- Grid/gallery view toggle
- Detail dialog with 3 tabs: Details (edit mode), Attachments, Relationships
- VIN Decoder (simulated, prefix-based lookup)
- Image Gallery with drag-and-drop, Supabase upload, primary selection
- Comparison tool (side-by-side spec table, best-value highlighting)

**Import Management**:
- List view with 8-stage visual timeline
- "Advance Stage" button triggers:
  - Auto-task generation (2-3 tasks per stage with templates)
  - WhatsApp + Email auto-send to linked customer
  - Notification creation
- Gantt chart view (timeline bars, milestones, today marker)

**Lead Pipeline**: Kanban board, 6 stages, inline status update

**Customer Communication Hub**:
- WhatsApp/Email/SMS compose panel with message templates
- Full communication timeline (inbound/outbound, delivery status, auto badges)
- Auto-messaging on import stage transitions

**Customer Portal** (3 tabs):
- My Vehicle: specs, gallery, import progress
- Upload Documents: 5 category cards (ID, PoA, payment, insurance, other) → Supabase
- Messages: notification + communication feed

**Wish List**: Dream car matching against inventory (makes, year range, budget, body type)

**Task Manager**: Deadline alerts (overdue red, 48hr amber, 7-day blue), auto-overdue marking

**Custom Fields Builder** (Settings, Super Admin):
- Add text/number/select/date fields to any object
- Drag-and-drop reorder
- Visibility toggle, required flag
- Live preview panel
- Stored in `customData` JSON on records

**Notification System**:
- Bell dropdown in TopBar with unread count
- Types: whatsapp, email, sms, import_update, system
- Mark all read, per-notification read toggle

### Seed Data
- 7 vehicles (Mercedes, BMW, Porsche, Audi, Range Rover, Lamborghini, Tesla)
- 3 import processes (different stages)
- 5 leads, 2 customers, 4 vendors, 5 tasks, 3 wishlist items
- Pre-loaded attachments on multiple vehicles
- 8 custom field definitions across all object types
- 3 initial notifications

## Design System
- **Background**: #080b12 (deep dark)
- **Card bg**: #0d1117
- **Borders**: #1a2030
- **Accent**: #c9a962 (gold)
- **Fonts**: Playfair Display (headings), DM Sans (body)
- **Status colors**: emerald (available/won), amber (reserved/contacted), sky (sold/new), violet (in_transit/qualified), etc.

## Build Commands
```bash
# Development
pnpm dev

# Build single-file HTML artifact
bash /path/to/scripts/bundle-artifact.sh
# Output: bundle.html
```

## What's Next (Suggested)
- Financial & Tax Intelligence (tax calculator, exchange rates, margin analyzer)
- Analytics & Reporting dashboard (cycle time, conversion rates, revenue forecasting)
- Public Site & Marketing (blog/SEO, inquiry→lead auto-creation, Instagram feed)
- Supabase Auth integration (replace demo login with real authentication)
- Move all CRM data to Supabase PostgreSQL tables (currently in-memory state)
