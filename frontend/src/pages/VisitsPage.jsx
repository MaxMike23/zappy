import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { visitsApi } from "@/api/visits";
import { workOrdersApi } from "@/api/workOrders";
import { projectsApi } from "@/api/projects";
import Badge from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";
import Spinner from "@/components/ui/Spinner";
import EmptyState from "@/components/ui/EmptyState";

const STATUS_COLORS = {
  scheduled: "#3B82F6",
  in_progress: "#F59E0B",
  completed: "#10B981",
  cancelled: "#9CA3AF",
};
const STATUSES = ["scheduled", "in_progress", "completed", "cancelled"];
const ALLOWED_CREATE = ["company_admin", "manager", "superadmin"];

const VISIT_TIME_STEP = 15; // minutes; will be a settings value in a future phase

function snapMinutes(datetimeStr) {
  if (!datetimeStr) return datetimeStr;
  const d = new Date(datetimeStr);
  d.setMinutes(Math.round(d.getMinutes() / VISIT_TIME_STEP) * VISIT_TIME_STEP, 0, 0);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const EMPTY_FORM = {
  title: "",
  parent_type: "work_order",
  work_order_id: "",
  project_id: "",
  scheduled_start: "",
  scheduled_end: "",
  notes: "",
};

export default function VisitsPage() {
  const { user } = useAuth();

  const [visits, setVisits]         = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState("");

  const [statusFilter, setStatusFilter]   = useState("");
  const [afterFilter, setAfterFilter]     = useState("");
  const [beforeFilter, setBeforeFilter]   = useState("");
  const [page, setPage]                   = useState(1);

  const [showCreate, setShowCreate]     = useState(false);
  const [createForm, setCreateForm]     = useState(EMPTY_FORM);
  const [creating, setCreating]         = useState(false);
  const [createError, setCreateError]   = useState("");

  const [workOrders, setWorkOrders] = useState([]);
  const [projects, setProjects]     = useState([]);

  const canCreate = ALLOWED_CREATE.includes(user?.role);

  const fetchVisits = useCallback(async (status, after, before, pg) => {
    setLoading(true);
    setError("");
    try {
      const params = { page: pg, per_page: 25 };
      if (status) params.status           = status;
      if (after)  params.scheduled_after  = after;
      if (before) params.scheduled_before = before;
      const res = await visitsApi.list(params);
      setVisits(res.data.items);
      setPagination(res.data.pagination);
    } catch {
      setError("Failed to load visits.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVisits("", "", "", 1);
    Promise.all([
      workOrdersApi.list({ per_page: 100 }),
      projectsApi.list({ per_page: 100 }),
    ]).then(([woRes, projRes]) => {
      setWorkOrders(woRes.data.items);
      setProjects(projRes.data.items);
    }).catch(() => {});
  }, [fetchVisits]);

  const handleCreate = async (e) => {
    e.preventDefault();
    setCreateError("");
    setCreating(true);
    try {
      const payload = {
        title: createForm.title.trim(),
        scheduled_start: createForm.scheduled_start,
        scheduled_end: createForm.scheduled_end,
      };
      if (createForm.parent_type === "work_order") {
        payload.work_order_id = createForm.work_order_id;
      } else {
        payload.project_id = createForm.project_id;
      }
      if (createForm.notes.trim()) payload.notes = createForm.notes.trim();
      await visitsApi.create(payload);
      setShowCreate(false);
      fetchVisits(statusFilter, afterFilter, beforeFilter, page);
    } catch (err) {
      setCreateError(err.response?.data?.error || "Failed to create visit.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div>
      {/* Header */}
      <div style={styles.header}>
        <h1 style={styles.title}>Visits</h1>
        {canCreate && (
          <button style={styles.primaryBtn} onClick={() => { setShowCreate(true); setCreateForm(EMPTY_FORM); setCreateError(""); }}>
            + New Visit
          </button>
        )}
      </div>

      {/* Filters */}
      <div style={styles.filterBar}>
        <select
          style={styles.select}
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); fetchVisits(e.target.value, afterFilter, beforeFilter, 1); }}
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
        </select>
        <input
          type="date"
          style={styles.select}
          value={afterFilter}
          title="Scheduled after"
          onChange={(e) => { setAfterFilter(e.target.value); setPage(1); fetchVisits(statusFilter, e.target.value, beforeFilter, 1); }}
        />
        <input
          type="date"
          style={styles.select}
          value={beforeFilter}
          title="Scheduled before"
          onChange={(e) => { setBeforeFilter(e.target.value); setPage(1); fetchVisits(statusFilter, afterFilter, e.target.value, 1); }}
        />
      </div>

      {error && <div style={styles.errorMsg}>{error}</div>}

      {loading ? (
        <div style={styles.loadingWrap}><Spinner size={24} /></div>
      ) : visits.length === 0 ? (
        <EmptyState
          message="No visits found."
          action={canCreate ? "+ New Visit" : undefined}
          onAction={() => setShowCreate(true)}
        />
      ) : (
        <>
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  {["Title", "Parent", "Status", "Assignees", "Scheduled Start", "Duration"].map((h) => (
                    <th key={h} style={styles.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visits.map((v) => (
                  <tr key={v.id} style={styles.tr}>
                    <td style={{ ...styles.td, fontWeight: 600, color: "#111827" }}>{v.title}</td>
                    <td style={styles.td}>
                      {v.work_order_id ? (
                        <Link to={`/work-orders/${v.work_order_id}`} style={styles.link} onClick={(e) => e.stopPropagation()}>{v.work_order_title || "Work Order"}</Link>
                      ) : v.project_id ? (
                        <Link to={`/projects/${v.project_id}`} style={styles.link} onClick={(e) => e.stopPropagation()}>{v.project_name || "Project"}</Link>
                      ) : <span style={styles.muted}>—</span>}
                    </td>
                    <td style={styles.td}><Badge label={v.status.replace("_", " ")} color={STATUS_COLORS[v.status]} /></td>
                    <td style={styles.td}>{v.assignees?.length ? v.assignees.map((a) => a.full_name).join(", ") : <span style={styles.muted}>Unassigned</span>}</td>
                    <td style={styles.td}>{formatDateTime(v.scheduled_start)}</td>
                    <td style={styles.td}>{v.duration_minutes != null ? `${v.duration_minutes} min` : <span style={styles.muted}>—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pagination && (pagination.has_prev || pagination.has_next) && (
            <div style={styles.pagination}>
              <button style={{ ...styles.pageBtn, opacity: pagination.has_prev ? 1 : 0.4 }} disabled={!pagination.has_prev} onClick={() => { setPage(page - 1); fetchVisits(statusFilter, afterFilter, beforeFilter, page - 1); }}>← Prev</button>
              <span style={styles.pageInfo}>Page {pagination.page} of {pagination.pages}</span>
              <button style={{ ...styles.pageBtn, opacity: pagination.has_next ? 1 : 0.4 }} disabled={!pagination.has_next} onClick={() => { setPage(page + 1); fetchVisits(statusFilter, afterFilter, beforeFilter, page + 1); }}>Next →</button>
            </div>
          )}
        </>
      )}

      {/* Create Modal */}
      {showCreate && (
        <Modal title="New Visit" onClose={() => setShowCreate(false)}>
          <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column" }}>
            {createError && <div style={styles.errorMsg}>{createError}</div>}

            <FormField label="Title" required>
              <input style={styles.input} required value={createForm.title} onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })} placeholder="e.g. Site Survey" />
            </FormField>

            <FormField label="Parent Type" required>
              <select style={styles.input} value={createForm.parent_type} onChange={(e) => setCreateForm({ ...createForm, parent_type: e.target.value, work_order_id: "", project_id: "" })}>
                <option value="work_order">Under Work Order</option>
                <option value="project">Under Project</option>
              </select>
            </FormField>

            {createForm.parent_type === "work_order" ? (
              <FormField label="Work Order" required>
                <select style={styles.input} required value={createForm.work_order_id} onChange={(e) => setCreateForm({ ...createForm, work_order_id: e.target.value })}>
                  <option value="">— select work order —</option>
                  {workOrders.map((wo) => <option key={wo.id} value={wo.id}>{wo.title}</option>)}
                </select>
              </FormField>
            ) : (
              <FormField label="Project" required>
                <select style={styles.input} required value={createForm.project_id} onChange={(e) => setCreateForm({ ...createForm, project_id: e.target.value })}>
                  <option value="">— select project —</option>
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </FormField>
            )}

            <div style={styles.row2}>
              <FormField label="Scheduled Start" required>
                <input type="datetime-local" step={VISIT_TIME_STEP * 60} style={styles.input} required value={createForm.scheduled_start} onChange={(e) => setCreateForm({ ...createForm, scheduled_start: snapMinutes(e.target.value) })} />
              </FormField>
              <FormField label="Scheduled End" required>
                <input type="datetime-local" step={VISIT_TIME_STEP * 60} style={styles.input} required value={createForm.scheduled_end} onChange={(e) => setCreateForm({ ...createForm, scheduled_end: snapMinutes(e.target.value) })} />
              </FormField>
            </div>

            <FormField label="Notes">
              <textarea style={{ ...styles.input, resize: "vertical" }} rows={3} value={createForm.notes} onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })} />
            </FormField>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
              <button type="button" style={styles.cancelBtn} onClick={() => setShowCreate(false)}>Cancel</button>
              <button type="submit" style={styles.primaryBtn} disabled={creating}>{creating ? "Creating…" : "Create Visit"}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function FormField({ label, required, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 12, flex: 1 }}>
      <label style={{ fontSize: 13, fontWeight: 500, color: "#374151" }}>
        {label}{required && <span style={{ color: "#EF4444" }}> *</span>}
      </label>
      {children}
    </div>
  );
}

function formatDateTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
  });
}

const styles = {
  header:      { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 },
  title:       { fontSize: 22, fontWeight: 700, color: "#111827", margin: 0 },
  primaryBtn:  { padding: "8px 18px", background: "#111827", color: "#fff", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer" },
  filterBar:   { display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" },
  select:      { padding: "8px 12px", border: "1px solid #D1D5DB", borderRadius: 6, fontSize: 13, outline: "none", background: "#fff" },
  loadingWrap: { display: "flex", justifyContent: "center", padding: 48 },
  errorMsg:    { color: "#B91C1C", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 6, padding: "10px 14px", marginBottom: 16, fontSize: 13 },
  tableWrap:   { overflowX: "auto" },
  table:       { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th:          { textAlign: "left", padding: "10px 14px", background: "#F9FAFB", borderBottom: "1px solid #E5E7EB", fontSize: 12, fontWeight: 600, color: "#6B7280", whiteSpace: "nowrap" },
  tr:          { borderBottom: "1px solid #F3F4F6" },
  td:          { padding: "12px 14px", color: "#374151", verticalAlign: "middle" },
  muted:       { color: "#9CA3AF" },
  link:        { color: "#3B82F6", textDecoration: "none" },
  pagination:  { display: "flex", alignItems: "center", gap: 12, justifyContent: "center", marginTop: 20 },
  pageBtn:     { padding: "6px 16px", border: "1px solid #D1D5DB", borderRadius: 6, fontSize: 13, cursor: "pointer", background: "#fff" },
  pageInfo:    { fontSize: 13, color: "#6B7280" },
  row2:        { display: "flex", gap: 12 },
  input:       { padding: "8px 10px", border: "1px solid #D1D5DB", borderRadius: 6, fontSize: 14, outline: "none", fontFamily: "inherit", width: "100%" },
  cancelBtn:   { padding: "8px 18px", background: "#fff", color: "#374151", border: "1px solid #D1D5DB", borderRadius: 6, fontSize: 13, cursor: "pointer" },
};
