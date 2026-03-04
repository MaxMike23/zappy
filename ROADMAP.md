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

---

## Phase 2 — Core Operations UI

**Goal:** The app becomes usable by a real company. Primary day-to-day workflow for office staff and field techs.

### 2A — Projects & Work Orders UI
- Projects list, detail view, create/edit forms
- Work orders list with filters (stage, priority, assigned tech, date range)
- Work order detail page: notes thread, file attachments, assigned techs
- Workflow stage kanban or list view with drag-to-update stage
- Custom field rendering driven by `workflow_field_definitions`

### 2B — Team Management UI
- Users list (company-scoped)
- Invite/create user form (company_admin only)
- Edit user profile, role, and active status

### 2C — Time Tracking UI
- Log time against a work order
- Technician view: own logs only
- Manager view: all logs, approve/reject, export summary
- Time summary widget on dashboard

### 2D — File Uploads UI
- Upload files to a work order or project
- File gallery/list with download links
- Delete with permission check
- Checklist field type rendering (defined in Phase 1 schema)

### 2E — Workflow Configuration UI
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

## Phase 10 — Mobile PWA for Technicians

**Goal:** Field techs use Zappy on-site from their phone without installing an app.

- PWA manifest and service worker
- Mobile-optimized layouts for WO detail, time logging, and file upload
- Offline capability: view cached work orders when signal is unavailable
- GPS location capture for site arrival confirmation

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
- `FieldType.CHECKLIST` supported — UI rendering in Phase 2D
