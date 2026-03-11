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

### 2E — File Uploads UI
- File gallery on work order and project detail pages (already partially live — upload + download)
- Full delete with permission check (owner or admin)
- Checklist custom field type rendering (defined in Phase 1 schema)

### 2F — Workflow Configuration UI
- Manage stages: add, rename, reorder, set terminal/success flags
- Configure `stage_requirements` (min files, required fields before stage transition)
- Manage custom field definitions per module (project/work_order)

---

## Phase 3 — System Design Document Builder

**Goal:** Structured, per-project-type document builder for AV system specs as living job documents.

This is what differentiates Zappy from generic field service software.

- `SystemDesignTemplate` — company defines reusable templates (sections + field prompts) per project type
- `SystemDesignDocument` — instance of a template attached to a project, updated over job lifecycle
- Structured sections: input/output matrix, rack layout, network config, programming parameters, signal flow
- Commissioning checklists tied to document completion
- Document history / version tracking
- PDF export of completed system design doc

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

## Schema Notes

> Key decisions already locked into Phase 1 that affect all future phases:

- All primary keys are UUIDs
- Every tenant-scoped table has `company_id` for row-level isolation
- Superadmin has `company_id = NULL` and bypasses all tenant filters
- Soft deletes only: `is_archived` on projects/work orders, `is_active` on users
- Audit log is append-only — never updated or deleted
- `stage_requirements` JSONB on `WorkflowStage` — gates checked before stage transition (enforcement in Phase 2E)
- `FieldType.CHECKLIST` supported — UI rendering in Phase 2E
