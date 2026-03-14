# Zappy — Product Roadmap

> **Rule:** Each phase and section is confirmed with the team before work begins.

---

## Phase 1 — Foundation ✅ COMPLETE

**Goal:** Working backend with auth, data models, and all core API endpoints. Minimal frontend shell.

- Multi-tenant architecture (row-level `company_id` isolation)
- JWT auth — login, register, refresh, logout with token blacklist
- All DB models: Company, User, Project, WorkOrder, TimeLog, File, WorkflowStage, AuditLog
- All REST API blueprints wired up and tested end-to-end
- Role-based access control: superadmin, company_admin, manager, technician
- Docker Compose dev environment (db + backend + frontend)
- Frontend: Login, Register, stub Dashboard
- **Company specializations:** `specializations` JSONB array on `Company`; companies declare their trade verticals (Audio/Visual, Security, Access Control, Surveillance/CCTV, Fire Alarm, Smart Home, Home Theater, Lighting Control, Shade Control, Custom Automation, Networking/Low Voltage, Live Sound, Live Video, Staging & Rigging, and more) at registration; validated and stored; returned on `/api/auth/login` and `/api/auth/me`

---

## Phase 2 — Core Operations UI

**Goal:** The app becomes usable by a real company. Primary day-to-day workflow for office staff and field techs.

**Design approach:** All UI is built responsive from day one — desktop layout (sidebar nav, wide content panels) and smartphone browser layout (bottom nav or hamburger menu, stacked single-column views) in the same codebase. No separate mobile app required; the web app adapts to screen size.

### 2A — Projects & Work Orders UI ✅ COMPLETE
- Projects list, detail view, create/edit forms
- Work orders list with filters (stage, priority, trade, assigned tech)
- Work order detail page: notes thread, file attachments, assigned techs
- Custom field rendering driven by `workflow_field_definitions`
- Responsive layout: desktop sidebar + wide content panels; mobile bottom-nav + card-based work order list; work order detail stacks sidebar below main content on mobile; visits within detail shown as tap-friendly cards with full-width clock-in/out buttons
- **Trade tagging:** projects and work orders each carry a `trade` field (from the shared 15-trade list); filter bar on both list pages; out-of-spec amber warning shown in edit/create forms when the selected trade is not in the company's declared specializations

### 2B — Visits (Scheduled On-Site Trips) ✅ COMPLETE
- Visit model: on-site trips under a work order OR directly under a project
- Clock-in / clock-out records actual arrival and departure times
- Per-visit assignees (can differ from work order assignees day-to-day)
- Status lifecycle: scheduled → in_progress → completed (or cancelled)
- Global visits list page with status and date-range filters
- Visits section inline on Work Order detail (quick create + clock-in/out per row)
- Direct Visits section inline on Project detail (site surveys, walkthroughs)
- **Mobile UX overhaul:** Role-aware dashboard — technicians see a card-based view of upcoming visits and assigned work orders with inline clock-in/out; admins/managers see stat cards and summary lists. Bottom tab navigation replaces hamburger menu on mobile (≤768px). Desktop sidebar unchanged.

### 2C — Team Management UI ✅ COMPLETE
- Users list (company-scoped) with role and active-status filters
- Initials avatar + role-colored badge per row
- Add User form (company_admin only): name, email, temporary password, role, phone
- Edit modal: name, phone (all); email, role, active status toggle (admin only)
- Deactivate / Reactivate actions with confirmation (admin only, self-protected)
- Managers see the team list read-only; admins get full write access

### 2D — Time Tracking UI ✅ COMPLETE
- Time logs list page: all logs for admin/manager; own logs only for technicians
- Log time modal: work order selector, start/end datetime, notes
- Manager controls: approve / reject individual logs; rejected logs revert to pending
- Hours summary cards by technician (total hours + log count)
- Filters: date range, approval status
- **Company-wide attendance clock-in/out:** separate from visit-level clock-in/out; tracks when a technician starts and ends their workday (e.g. arriving at the office, leaving after all jobs). `Attendance` model stores one record per user per day with `clock_in` / `clock_out` timestamps. Feature is opt-in per company — toggled by company admin in Settings (`/settings`). When enabled, technicians see a prominent "Clock In" / "Clock Out" bar at the top of their dashboard. Unique constraint prevents double clock-in per user per day.
- **Settings page** (`/settings`): company info panel + attendance_tracking toggle (admin only); uses `refreshUser()` in AuthContext so the change takes effect without re-login

### 2E — File Uploads UI ✅ COMPLETE
- File gallery on work order and project detail pages (upload + download + delete)
- Delete permission check: file owner (any role) OR admin/manager/superadmin
- Checklist custom field type rendering: checkbox list in edit mode, ✓/○ items read-only; value stored as `{ "item label": bool }` against `field_config.items`

### 2F — Workflow Configuration UI ✅ COMPLETE
- `/workflow` page (admin only) with two tabs: **Stages** and **Custom Fields**, each with a Project / Work Order module switcher
- Stages: add, rename, color picker, set terminal/success flags, reorder (↑↓), delete (with 409 guard if in use), `stage_requirements` editor (min_files + required_field_keys)
- Custom Fields: add (type selected at creation, immutable after), edit label/config/required, delete; type-aware `field_config` editor — options list for select/multi_select, items list for checklist, unit for number
- Sidebar nav link added for company_admin and superadmin

---

## Phase 3 — System Design Document Builder

**Goal:** Per-project living documentation of the full AV/low-voltage system — devices, credentials, signal connections, and network topology — exportable as a formatted document. This is what differentiates Zappy from generic field service software.

**Architecture decisions:**
- System design docs are scoped to a Project (searchable via project history)
- Device library is two-tier: global shared templates (`company_id = NULL`, visible to all tenants) + company-private templates; companies can contribute to the global pool via a superadmin-moderated submission flow
- Credentials stored as plain text behind JWT auth (no encryption overhead)
- Signal flow: react-flow canvas is the primary interface (interactive, editable); sidebar table is a secondary read reference
- Export: both browser-print (CSS `@media print`) and server-generated PDF download

---

### 3A — Device Library (Global Catalog)

**Ownership model:**
- `company_id = NULL` on `DeviceTemplate` = global shared record, visible to all tenants (same pattern as superadmin)
- `company_id = <uuid>` = company-private template, only visible to that company
- Superadmin can create, edit, and delete global templates
- Any company can contribute a device to the global catalog via a "Submit to Global Library" action — submitted records are marked `is_pending = True` until a superadmin approves them; approved records flip to `company_id = NULL`
- Companies can add private templates at any time without approval (scoped to their own `company_id`)

**Backend:**
- `DeviceTemplate` model — fields: `company_id` (nullable UUID FK — NULL = global), `make`, `model`, `category` (display, processor, matrix switcher, amplifier, camera, DSP, control processor, network switch, other), `notes`, `is_pending` (bool, default False — True while awaiting global approval)
- `ports` JSONB array on `DeviceTemplate` — each port object: `{ id, label, direction, signal_type, connector_type }` where:
  - `direction`: `input` | `output`
  - `signal_type`: `Video` | `Audio` | `Control` | `Network` | `Power` | `Data` | `Security` | `Access Control` | `Fire` | `Other`
  - `connector_type`: HDMI, SDI, DisplayPort, RS232, RS485, XLR, TRS, TS, RCA, Dante, AES67, Cat6, Fiber, Relay, IR, USB, Wiegand, OSDP, RS485 2-Wire, Dry Contact, NAC Circuit, SLC, Other (optional — used to suggest connection type when drawing edges)
  - `label`: free text (e.g. "HDMI Out 1", "RS232 Port", "Dante In 1–8")
- Query logic: device library list returns `company_id = NULL AND is_pending = False` (global) UNION `company_id = <current>` (private) — tenants never see other companies' private templates or unapproved submissions
- CRUD API:
  - `GET /api/devices/library` — returns global + company-private templates
  - `POST /api/devices/library` — creates a company-private template
  - `PUT/DELETE /api/devices/library/<id>` — company can only edit/delete their own private templates; superadmin can edit/delete any
  - `POST /api/devices/library/<id>/submit` — submits a company-private template for global approval (sets `is_pending = True`)
  - `POST /api/devices/library/<id>/approve` — superadmin only; sets `company_id = NULL`, `is_pending = False`
  - `GET /api/devices/library/pending` — superadmin only; list of pending submissions across all tenants

**Frontend:**
- Device Library page (`/device-library`) — searchable/filterable table by make, model, category
- Global templates shown with a "Global" badge; company-private shown with a "Private" badge; pending submissions shown with a "Pending" badge (visible only to the submitting company and superadmin)
- Add / Edit modal:
  - Top section: make, model, category
  - Ports section: dynamic list — "Add Input Port" / "Add Output Port" buttons; each row has label, signal type dropdown, connector type dropdown (optional); rows can be reordered and deleted
- "Submit to Global Library" button on company-private templates — sends for superadmin review
- Admin/manager write access for private templates; all roles read-only for global templates
- Superadmin sees a "Pending Submissions" section at the top with approve/reject actions

---

### 3B — Project Device Instances

**Backend:**
- `ProjectDevice` model — links `DeviceTemplate` to a `Project`; instance-specific fields: label/nickname, room/location, rack position, IP address (control), Dante IP (nullable), stream URLs (JSONB array, nullable), username, password, firmware version, RS232 settings (port, baud rate, data bits, parity — JSONB), notes
- Ports are inherited from `DeviceTemplate.ports` at read time — no port duplication on the instance; if a port is added to the template later it appears on all existing instances
- CRUD API: `GET/POST /api/projects/<id>/devices`, `PUT/DELETE /api/projects/<id>/devices/<device_id>`

**Frontend:**
- "System Design" tab on Project Detail page
- Device list: search/select from library; port summary shown per row (e.g. "3 in / 4 out")
- Edit modal grouped by section: Identity, Network (control IP, Dante IP, stream URLs), Credentials (username/password), Control (RS232 params if applicable), Location (room, rack position), Notes
- Read-only port list shown in modal (ports are managed on the template, not the instance)
- All roles can view; admin/manager can add/edit/delete

---

### 3C — Signal Flow & Connections

**Backend:**
- `DeviceConnection` model — `source_device_id`, `source_port` (text), `destination_device_id`, `destination_port` (text), `connection_type` (enum: HDMI, SDI, DisplayPort, VGA, DVI, RS232, RS485, RS422, RCA, XLR, TRS, TS, Dante, AES67, Cat6, Cat6A, Fiber, Relay, IR, USB, Other), `notes`
- `node_position` JSONB on `ProjectDevice` — stores `{ x, y }` canvas coordinates so layout persists across sessions
- CRUD API: `GET/POST /api/projects/<id>/connections`, `PUT/DELETE /api/projects/<id>/connections/<conn_id>`
- `PATCH /api/projects/<id>/devices/<device_id>/position` — lightweight endpoint to save node position on drag-end

**Trade scoping on devices:**
- `trade` field on `ProjectDevice` — same trade enum used across the rest of Zappy (Audio/Visual, Security, Access Control, Fire Alarm, etc.); required when adding a device to a project
- `node_position` JSONB is stored per trade diagram — `{ "Audio/Visual": { x, y }, "Security": { x, y } }` so each trade canvas has its own layout

**Diagram metadata (per trade, per project):**
- `SignalDiagram` model — one record per trade per project; fields: `project_id`, `trade`, `drawing_title` (e.g. "AV Signal Flow — Main Conference Room"), `location` (e.g. "2nd Floor, Suite 200"), `company_name_override` (nullable — defaults to company name from profile), `revision` (text, e.g. "Rev A"), `drawn_by` (text, defaults to current user's name), `drawing_date` (date, defaults to today)
- Company logo stored as an uploaded file referenced from `Company.settings.logo_file_id` — uploaded once in Settings, used on all diagrams
- CRUD API: `GET/PUT /api/projects/<id>/diagrams/<trade>` — upsert diagram metadata for a trade

**Frontend (react-flow canvas):**
- **Trade tabs** above the canvas — one tab per trade that has at least one device on the project (e.g. "Audio/Visual", "Security", "Access Control"); switching tabs shows only the devices and connections for that trade
- **"Diagram Info" button** on each trade canvas — opens a modal to set: Drawing Title, Location, Company Name (pre-filled from profile, overridable), Revision, Drawn By, Drawing Date
- Devices that span trades (e.g. a network switch used by both AV and security) appear in both trade diagrams — editing from either view updates the same DB record
- Interactive signal flow diagram using `react-flow` with custom nodes — one node per project device in the active trade tab, one edge per connection between devices in that trade
- **Title block overlay** rendered at the bottom of the canvas (non-interactive, positioned outside the react-flow node space): bordered frame containing company logo (left), drawing title + project name (center), location / revision / date / drawn by (right) — mimics a standard CAD title block
- **Custom node card layout:**
  - Header: device label + make/model
  - Left column: input ports as named react-flow `Handle` components, each labeled and color-coded by signal type:
    - Video = blue, Audio = green, Control = orange, Network = gray, Data = yellow, Power = red, Security = slate, Access Control = indigo, Fire = rose, Other = neutral
  - Right column: output ports as named `Handle` components, same color coding
- **Auto-layout on first open per trade:** dagre algorithm places nodes automatically when no saved positions exist for that trade; user drags to refine
- **Drawing connections:** drag from an output handle to an input handle; on drop a modal confirms the connection (pre-fills connector type from the port's `connector_type`, allows override) and saves to DB
- **Deleting:** select an edge and press Delete to remove the connection from DB; select a node and press Delete to remove the device instance from the project (with confirmation)
- **Double-click node:** opens the device instance edit modal
- **Edge labels:** show connector type (e.g. "HDMI", "RS232", "Wiegand") on hover; edge color inherits from source port signal type
- **Sidebar panel** alongside canvas: connection table scoped to the active trade (source device + port → dest device + port + connector type)
- Positions auto-saved to backend on drag-end (debounced 500ms) keyed to the active trade tab

---

### 3D — Network Documentation

**Backend:**
- `NetworkSegment` model — `project_id`, `vlan_id` (nullable int), `vlan_name`, `subnet` (CIDR text), `gateway` (nullable), `dns_primary` (nullable), `dns_secondary` (nullable), `purpose`, `notes`
- CRUD API: `GET/POST /api/projects/<id>/network`, `PUT/DELETE /api/projects/<id>/network/<seg_id>`
- Device instances can reference a `network_segment_id` (nullable FK) to show subnet association

**Frontend:**
- Network tab within System Design section — table of VLAN/subnet entries with inline add/edit
- Each device instance shows a "Network Segment" dropdown to associate it with a VLAN

---

### 3E — Document Export & Company Configuration

**Backend:**
- `GET /api/projects/<id>/system-design/export` — assembles all devices, connections, network segments, and rack layout into a structured payload
- Server-side PDF generation (WeasyPrint) returning a downloadable `.pdf` — renders the same structured sections as the print view
- Company settings additions in `Company.settings` JSONB: `sysdesign_show_dante`, `sysdesign_show_streams`, `sysdesign_show_vlans`, `sysdesign_show_credentials` (all bool, default `true`)

**Frontend — two export artifacts:**

1. **Connection Diagram (CAD-style):** react-flow canvas exported to SVG via `toSvg()` (react-flow built-in); title block is rendered as a fixed SVG element appended below the diagram before export — includes company logo, drawing title, project name, location, revision, drawn by, and date exactly as shown on screen. One diagram page exported per trade. Printable via browser or embedded in the PDF export. Preserves node positions exactly as arranged by the user.

2. **System Design Document:** print-optimized HTML view (`@media print`) with sections: Device List (table: label, make/model, IP, location, credentials), Signal Connections (table), Network Segments (table), and the embedded connection diagram SVG. "Print Document" button opens this view; "Download PDF" calls the backend export endpoint.

**Settings page additions:**
- Company logo upload (PNG/JPG, displayed in diagram title blocks and on exported documents)
- System Design section with toggles for which sections appear in exports (Dante fields, stream URLs, VLAN table, credential visibility)

---

## Phase 4 — CRM & Client Management

**Goal:** Track clients and contacts, link them to projects, support the sales relationship.

- Client records (company or individual, contact info, full history)
- Multiple contacts per client
- Link clients to projects (replaces plain-text `client_name` on Project)
- Activity feed per client (calls, emails, notes, job history)
- Read-only client portal login (clients view their own project status)

---

## Phase 5 — Invoicing & Financials

**Goal:** Generate invoices from completed work, track payments.

- Invoice builder with line items from time logs and manual entries
- Invoice PDF generation
- Invoice status lifecycle: draft → sent → paid → overdue
- Payment recording
- Basic accounts receivable reporting

---

## Phase 6 — Equipment Tracking

**Goal:** Track AV gear inventory, assign to jobs, flag maintenance needs.

- Equipment catalog (item, serial number, status, current location)
- Assign equipment to work orders (check-out / check-in log)
- Maintenance scheduling and flagging
- Equipment history per item

---

## Phase 7 — Scheduling & Calendar

**Goal:** Visual scheduling for project managers and dispatchers.

- Calendar view (day / week / month) for work orders
- Drag-to-reschedule
- Technician availability and workload view
- Conflict detection when scheduling overlaps

---

## Phase 8 — Analytics & Reporting

**Goal:** Business intelligence for company admins.

- Revenue by period, client, and project type
- Technician utilization and hours summary
- Work order completion rates and SLA tracking
- Exportable reports (CSV and PDF)

---

## Phase 9 — Notifications & Integrations

**Goal:** Keep the whole team informed; connect to external tools.

- In-app notifications (new WO assigned, status change, approval needed)
- Email notifications via SendGrid or similar
- Outbound webhooks for external system integration
- QuickBooks / Xero export for invoices
- Google Calendar sync for scheduling

---

## Phase 10 — PWA Enhancements for Field Technicians

**Goal:** Build on the already-responsive mobile web experience with PWA-specific capabilities for on-site use — offline access, installability, and native device integration.

- PWA manifest and service worker (makes the app installable to home screen)
- Offline capability: cache and serve work orders when signal is unavailable
- Background sync: queue time logs and notes offline, push when connection returns
- GPS location capture for site arrival confirmation
- Push notifications for work order assignments and status changes
- Camera integration for faster photo uploads from mobile

---

## Phase 11 — Superadmin Platform Tools

**Goal:** Internal tools for managing all Zappy tenants at the platform level.

- Superadmin dashboard: all companies, subscription status, usage stats
- Impersonate company (view as their admin without credentials)
- Subscription plan management and billing hooks
- Bulk operations: deactivate company, export data, purge tenant
- Platform-wide audit log viewer

---

## Phase 12 — Bid Intelligence (AI Bid Document Analyzer)

**Goal:** Automatically extract and structure requirements from bid documents (RFPs, ITBs, specs) so estimators can quickly assess fit, flag gaps, and pre-populate project data.

*Designed to function as a standalone module or a fully integrated Zappy sub-app. When embedded, bid analysis results link directly to a Project and pre-fill custom fields, trade tags, and scope notes.*

- **PDF ingestion:** upload one or more bid documents (RFP, invitation to bid, spec sheets) per opportunity
- **AI extraction pipeline:** parse and extract structured data — required device manufacturers/brands, certification requirements (e.g. AVIXA CTS, low-voltage license), scope sections (AV, security, networking), submission deadlines, bonding/insurance requirements, prevailing wage flags
- **Requirement summary view:** human-readable card per extracted requirement with confidence score and source page reference; click to jump to the source location in the PDF
- **Gap analysis:** compare extracted requirements against company profile (specializations, certifications on file) and flag mismatches — e.g. "Bid requires Crestron dealer certification — not on file"
- **Pre-populate project:** one-click create a Project in Zappy from the bid, with trade tag, extracted scope as description, and deadline set from the bid due date
- **Bid library:** searchable history of all analyzed bids with win/loss tracking once linked to a project outcome
- **Standalone mode:** can be packaged and marketed as a separate SaaS tool ("Zappy Bid Intel") with its own login, pointing at the same backend or a lightweight independent service

---

## Schema Notes

> Key decisions already locked into Phase 1 that affect all future phases:

- All primary keys are UUIDs
- Every tenant-scoped table has `company_id` for row-level isolation
- Superadmin has `company_id = NULL` and bypasses all tenant filters
- Soft deletes only: `is_archived` on projects/work orders, `is_active` on users
- Audit log is append-only — never updated or deleted
- `stage_requirements` JSONB on `WorkflowStage` — gates checked before stage transition (enforcement in Phase 2E)
- `FieldType.CHECKLIST` supported — UI rendering in Phase 2E
