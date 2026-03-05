import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { workOrdersApi } from "@/api/workOrders";
import { projectsApi } from "@/api/projects";
import { workflowApi } from "@/api/workflow";
import Badge from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";
import Spinner from "@/components/ui/Spinner";
import EmptyState from "@/components/ui/EmptyState";

const PRIORITY_COLORS = { low: "#10B981", medium: "#3B82F6", high: "#F59E0B", urgent: "#EF4444" };
const PRIORITIES = ["low", "medium", "high", "urgent"];
const ALLOWED_CREATE = ["company_admin", "manager", "superadmin"];

const EMPTY_FORM = {
  title: "", project_id: "", description: "",
  stage_id: "", priority: "medium",
  scheduled_start: "", scheduled_end: "",
};

export default function WorkOrdersPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [workOrders, setWorkOrders] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [stages, setStages]         = useState([]);
  const [projects, setProjects]     = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState("");

  const [search, setSearch]             = useState("");
  const [stageFilter, setStageFilter]   = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [page, setPage]                 = useState(1);

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState(EMPTY_FORM);
  const [creating, setCreating]     = useState(false);
  const [createError, setCreateError] = useState("");

  const searchTimer = useRef(null);
  const canCreate = ALLOWED_CREATE.includes(user?.role);

  const fetchWOs = useCallback(async (q, stageId, priority, pg) => {
    setLoading(true);
    setError("");
    try {
      const params = { page: pg, per_page: 25 };
      if (q)        params.search    = q;
      if (stageId)  params.stage_id  = stageId;
      if (priority) params.priority  = priority;
      const res = await workOrdersApi.list(params);
      setWorkOrders(res.data.items);
      setPagination(res.data.pagination);
    } catch {
      setError("Failed to load work orders.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    Promise.all([
      workflowApi.listStages("work_order"),
      projectsApi.list({ per_page: 100 }),
    ]).then(([stagesRes, projRes]) => {
      setStages(stagesRes.data.stages);
      setProjects(projRes.data.items);
    }).catch(() => {});
    fetchWOs("", "", "", 1);
  }, [fetchWOs]);

  const handleSearch = (val) => {
    setSearch(val);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setPage(1);
      fetchWOs(val, stageFilter, priorityFilter, 1);
    }, 300);
  };

  const applyFilter = (newStage, newPriority) => {
    setPage(1);
    fetchWOs(search, newStage, newPriority, 1);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setCreateError("");
    setCreating(true);
    try {
      const payload = { title: createForm.title.trim(), priority: createForm.priority };
      if (createForm.project_id)    payload.project_id    = createForm.project_id;
      if (createForm.description)   payload.description   = createForm.description;
      if (createForm.stage_id)      payload.stage_id      = createForm.stage_id;
      if (createForm.scheduled_start) payload.scheduled_start = createForm.scheduled_start;
      if (createForm.scheduled_end)   payload.scheduled_end   = createForm.scheduled_end;
      const res = await workOrdersApi.create(payload);
      navigate(`/work-orders/${res.data.work_order.id}`);
    } catch (err) {
      setCreateError(err.response?.data?.error || "Failed to create work order.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div>
      {/* Header */}
      <div style={styles.header}>
        <h1 style={styles.title}>Work Orders</h1>
        {canCreate && (
          <button style={styles.primaryBtn} onClick={() => { setShowCreate(true); setCreateForm(EMPTY_FORM); setCreateError(""); }}>
            + New Work Order
          </button>
        )}
      </div>

      {/* Filters */}
      <div style={styles.filterBar}>
        <input
          style={styles.searchInput}
          type="search"
          placeholder="Search work orders…"
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
        />
        <select
          style={styles.select}
          value={stageFilter}
          onChange={(e) => { setStageFilter(e.target.value); applyFilter(e.target.value, priorityFilter); }}
        >
          <option value="">All stages</option>
          {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select
          style={styles.select}
          value={priorityFilter}
          onChange={(e) => { setPriorityFilter(e.target.value); applyFilter(stageFilter, e.target.value); }}
        >
          <option value="">All priorities</option>
          {PRIORITIES.map((p) => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
        </select>
      </div>

      {error && <div style={styles.errorMsg}>{error}</div>}

      {loading ? (
        <div style={styles.loadingWrap}><Spinner size={24} /></div>
      ) : workOrders.length === 0 ? (
        <EmptyState
          message="No work orders found."
          action={canCreate ? "+ New Work Order" : undefined}
          onAction={() => setShowCreate(true)}
        />
      ) : (
        <>
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  {["Title", "Project", "Stage", "Priority", "Assignees", "Scheduled"].map((h) => (
                    <th key={h} style={styles.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {workOrders.map((wo) => (
                  <tr key={wo.id} style={styles.tr} onClick={() => navigate(`/work-orders/${wo.id}`)}>
                    <td style={{ ...styles.td, fontWeight: 600, color: "#111827" }}>{wo.title}</td>
                    <td style={styles.td}>{wo.project_id ? <span style={{ color: "#3B82F6" }}>{wo.project_name || "—"}</span> : <span style={styles.muted}>—</span>}</td>
                    <td style={styles.td}>{wo.stage ? <Badge label={wo.stage.name} color={wo.stage.color} /> : <span style={styles.muted}>—</span>}</td>
                    <td style={styles.td}><Badge label={wo.priority} color={PRIORITY_COLORS[wo.priority]} /></td>
                    <td style={styles.td}>{wo.assignees?.length ? wo.assignees.map((a) => a.full_name).join(", ") : <span style={styles.muted}>Unassigned</span>}</td>
                    <td style={styles.td}>{wo.scheduled_start ? formatDateTime(wo.scheduled_start) : <span style={styles.muted}>—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pagination && (pagination.has_prev || pagination.has_next) && (
            <div style={styles.pagination}>
              <button style={{ ...styles.pageBtn, opacity: pagination.has_prev ? 1 : 0.4 }} disabled={!pagination.has_prev} onClick={() => { setPage(page - 1); fetchWOs(search, stageFilter, priorityFilter, page - 1); }}>← Prev</button>
              <span style={styles.pageInfo}>Page {pagination.page} of {pagination.pages}</span>
              <button style={{ ...styles.pageBtn, opacity: pagination.has_next ? 1 : 0.4 }} disabled={!pagination.has_next} onClick={() => { setPage(page + 1); fetchWOs(search, stageFilter, priorityFilter, page + 1); }}>Next →</button>
            </div>
          )}
        </>
      )}

      {/* Create Modal */}
      {showCreate && (
        <Modal title="New Work Order" onClose={() => setShowCreate(false)}>
          <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column" }}>
            {createError && <div style={styles.errorMsg}>{createError}</div>}

            <FormField label="Title" required>
              <input style={styles.input} required value={createForm.title} onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })} placeholder="e.g. Rack Build Day 1" />
            </FormField>

            <FormField label="Project (optional)">
              <select style={styles.input} value={createForm.project_id} onChange={(e) => setCreateForm({ ...createForm, project_id: e.target.value })}>
                <option value="">— standalone (no project) —</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </FormField>

            <FormField label="Description">
              <textarea style={{ ...styles.input, resize: "vertical" }} rows={3} value={createForm.description} onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })} />
            </FormField>

            <div style={styles.row2}>
              <FormField label="Stage">
                <select style={styles.input} value={createForm.stage_id} onChange={(e) => setCreateForm({ ...createForm, stage_id: e.target.value })}>
                  <option value="">— select stage —</option>
                  {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </FormField>
              <FormField label="Priority">
                <select style={styles.input} value={createForm.priority} onChange={(e) => setCreateForm({ ...createForm, priority: e.target.value })}>
                  {PRIORITIES.map((p) => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                </select>
              </FormField>
            </div>

            <div style={styles.row2}>
              <FormField label="Scheduled Start">
                <input type="datetime-local" style={styles.input} value={createForm.scheduled_start} onChange={(e) => setCreateForm({ ...createForm, scheduled_start: e.target.value })} />
              </FormField>
              <FormField label="Scheduled End">
                <input type="datetime-local" style={styles.input} value={createForm.scheduled_end} onChange={(e) => setCreateForm({ ...createForm, scheduled_end: e.target.value })} />
              </FormField>
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
              <button type="button" style={styles.cancelBtn} onClick={() => setShowCreate(false)}>Cancel</button>
              <button type="submit" style={styles.primaryBtn} disabled={creating}>{creating ? "Creating…" : "Create Work Order"}</button>
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
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short", day: "numeric", year: "numeric",
  });
}

const styles = {
  header:       { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 },
  title:        { fontSize: 22, fontWeight: 700, color: "#111827", margin: 0 },
  primaryBtn:   { padding: "8px 18px", background: "#111827", color: "#fff", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer" },
  filterBar:    { display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" },
  searchInput:  { flex: 1, minWidth: 180, padding: "8px 12px", border: "1px solid #D1D5DB", borderRadius: 6, fontSize: 13, outline: "none" },
  select:       { padding: "8px 12px", border: "1px solid #D1D5DB", borderRadius: 6, fontSize: 13, outline: "none", background: "#fff" },
  loadingWrap:  { display: "flex", justifyContent: "center", padding: 48 },
  errorMsg:     { color: "#B91C1C", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 6, padding: "10px 14px", marginBottom: 16, fontSize: 13 },
  tableWrap:    { overflowX: "auto" },
  table:        { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th:           { textAlign: "left", padding: "10px 14px", background: "#F9FAFB", borderBottom: "1px solid #E5E7EB", fontSize: 12, fontWeight: 600, color: "#6B7280", whiteSpace: "nowrap" },
  tr:           { cursor: "pointer", borderBottom: "1px solid #F3F4F6" },
  td:           { padding: "12px 14px", color: "#374151", verticalAlign: "middle" },
  muted:        { color: "#9CA3AF" },
  pagination:   { display: "flex", alignItems: "center", gap: 12, justifyContent: "center", marginTop: 20 },
  pageBtn:      { padding: "6px 16px", border: "1px solid #D1D5DB", borderRadius: 6, fontSize: 13, cursor: "pointer", background: "#fff" },
  pageInfo:     { fontSize: 13, color: "#6B7280" },
  row2:         { display: "flex", gap: 12 },
  input:        { padding: "8px 10px", border: "1px solid #D1D5DB", borderRadius: 6, fontSize: 14, outline: "none", fontFamily: "inherit", width: "100%" },
  cancelBtn:    { padding: "8px 18px", background: "#fff", color: "#374151", border: "1px solid #D1D5DB", borderRadius: 6, fontSize: 13, cursor: "pointer" },
};
