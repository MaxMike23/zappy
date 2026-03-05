import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { projectsApi } from "@/api/projects";
import { workflowApi } from "@/api/workflow";
import Badge from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";
import Spinner from "@/components/ui/Spinner";
import EmptyState from "@/components/ui/EmptyState";

const ALLOWED_CREATE = ["company_admin", "manager", "superadmin"];

const EMPTY_FORM = {
  name: "", description: "", stage_id: "",
  client_name: "", client_email: "", start_date: "",
};

export default function ProjectsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [projects, setProjects]       = useState([]);
  const [pagination, setPagination]   = useState(null);
  const [stages, setStages]           = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState("");
  const [search, setSearch]           = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [page, setPage]               = useState(1);
  const [showCreate, setShowCreate]   = useState(false);
  const [createForm, setCreateForm]   = useState(EMPTY_FORM);
  const [creating, setCreating]       = useState(false);
  const [createError, setCreateError] = useState("");

  const searchTimer = useRef(null);

  const fetchProjects = useCallback(async (q, stageId, pg) => {
    setLoading(true);
    setError("");
    try {
      const params = { page: pg, per_page: 25 };
      if (q)       params.search   = q;
      if (stageId) params.stage_id = stageId;
      const res = await projectsApi.list(params);
      setProjects(res.data.items);
      setPagination(res.data.pagination);
    } catch {
      setError("Failed to load projects.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    workflowApi.listStages("project").then((r) => setStages(r.data.stages)).catch(() => {});
    fetchProjects("", "", 1);
  }, [fetchProjects]);

  // Debounced search
  const handleSearch = (val) => {
    setSearch(val);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setPage(1);
      fetchProjects(val, stageFilter, 1);
    }, 300);
  };

  const handleStageFilter = (val) => {
    setStageFilter(val);
    setPage(1);
    fetchProjects(search, val, 1);
  };

  const handlePage = (newPage) => {
    setPage(newPage);
    fetchProjects(search, stageFilter, newPage);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setCreateError("");
    setCreating(true);
    try {
      const payload = { name: createForm.name.trim() };
      if (createForm.description) payload.description  = createForm.description;
      if (createForm.stage_id)    payload.stage_id     = createForm.stage_id;
      if (createForm.client_name) payload.client_name  = createForm.client_name;
      if (createForm.client_email) payload.client_email = createForm.client_email;
      if (createForm.start_date)  payload.start_date   = createForm.start_date;
      const res = await projectsApi.create(payload);
      navigate(`/projects/${res.data.project.id}`);
    } catch (err) {
      setCreateError(err.response?.data?.error || "Failed to create project.");
    } finally {
      setCreating(false);
    }
  };

  const canCreate = ALLOWED_CREATE.includes(user?.role);

  return (
    <div>
      {/* Header */}
      <div style={styles.header}>
        <h1 style={styles.title}>Projects</h1>
        {canCreate && (
          <button style={styles.primaryBtn} onClick={() => { setShowCreate(true); setCreateForm(EMPTY_FORM); setCreateError(""); }}>
            + New Project
          </button>
        )}
      </div>

      {/* Filter bar */}
      <div style={styles.filterBar}>
        <input
          style={styles.searchInput}
          type="search"
          placeholder="Search projects…"
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
        />
        <select
          style={styles.select}
          value={stageFilter}
          onChange={(e) => handleStageFilter(e.target.value)}
        >
          <option value="">All stages</option>
          {stages.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      {/* Content */}
      {error && <div style={styles.errorMsg}>{error}</div>}

      {loading ? (
        <div style={styles.loadingWrap}><Spinner size={24} /></div>
      ) : projects.length === 0 ? (
        <EmptyState
          message="No projects yet."
          action={canCreate ? "+ New Project" : undefined}
          onAction={() => setShowCreate(true)}
        />
      ) : (
        <>
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  {["Name", "Stage", "Client", "Manager", "Start Date", "WOs"].map((h) => (
                    <th key={h} style={styles.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {projects.map((p) => (
                  <tr
                    key={p.id}
                    style={styles.tr}
                    onClick={() => navigate(`/projects/${p.id}`)}
                  >
                    <td style={{ ...styles.td, fontWeight: 600, color: "#111827" }}>{p.name}</td>
                    <td style={styles.td}>
                      {p.stage
                        ? <Badge label={p.stage.name} color={p.stage.color} />
                        : <span style={styles.muted}>—</span>}
                    </td>
                    <td style={styles.td}>{p.client_name || <span style={styles.muted}>—</span>}</td>
                    <td style={styles.td}>{p.manager?.full_name || <span style={styles.muted}>—</span>}</td>
                    <td style={styles.td}>{p.start_date ? formatDate(p.start_date) : <span style={styles.muted}>—</span>}</td>
                    <td style={styles.td}>{p.work_order_count ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pagination && (pagination.has_prev || pagination.has_next) && (
            <div style={styles.pagination}>
              <button
                style={{ ...styles.pageBtn, opacity: pagination.has_prev ? 1 : 0.4 }}
                disabled={!pagination.has_prev}
                onClick={() => handlePage(page - 1)}
              >
                ← Prev
              </button>
              <span style={styles.pageInfo}>Page {pagination.page} of {pagination.pages}</span>
              <button
                style={{ ...styles.pageBtn, opacity: pagination.has_next ? 1 : 0.4 }}
                disabled={!pagination.has_next}
                onClick={() => handlePage(page + 1)}
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}

      {/* Create Modal */}
      {showCreate && (
        <Modal title="New Project" onClose={() => setShowCreate(false)}>
          <form onSubmit={handleCreate} style={styles.form}>
            {createError && <div style={styles.formError}>{createError}</div>}

            <FormField label="Project Name" required>
              <input
                style={styles.input}
                required
                value={createForm.name}
                onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                placeholder="e.g. Boardroom AV Install"
              />
            </FormField>

            <FormField label="Description">
              <textarea
                style={{ ...styles.input, resize: "vertical" }}
                rows={3}
                value={createForm.description}
                onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
              />
            </FormField>

            <FormField label="Stage">
              <select
                style={styles.input}
                value={createForm.stage_id}
                onChange={(e) => setCreateForm({ ...createForm, stage_id: e.target.value })}
              >
                <option value="">— select stage —</option>
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </FormField>

            <div style={styles.row2}>
              <FormField label="Client Name">
                <input
                  style={styles.input}
                  value={createForm.client_name}
                  onChange={(e) => setCreateForm({ ...createForm, client_name: e.target.value })}
                />
              </FormField>
              <FormField label="Client Email">
                <input
                  type="email"
                  style={styles.input}
                  value={createForm.client_email}
                  onChange={(e) => setCreateForm({ ...createForm, client_email: e.target.value })}
                />
              </FormField>
            </div>

            <FormField label="Start Date">
              <input
                type="date"
                style={styles.input}
                value={createForm.start_date}
                onChange={(e) => setCreateForm({ ...createForm, start_date: e.target.value })}
              />
            </FormField>

            <div style={styles.formActions}>
              <button type="button" style={styles.cancelBtn} onClick={() => setShowCreate(false)}>Cancel</button>
              <button type="submit" style={styles.primaryBtn} disabled={creating}>
                {creating ? "Creating…" : "Create Project"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function FormField({ label, required, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 12 }}>
      <label style={{ fontSize: 13, fontWeight: 500, color: "#374151" }}>
        {label}{required && <span style={{ color: "#EF4444" }}> *</span>}
      </label>
      {children}
    </div>
  );
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  return new Date(dateStr + "T00:00:00").toLocaleDateString(undefined, {
    year: "numeric", month: "short", day: "numeric",
  });
}

const styles = {
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 },
  title:  { fontSize: 22, fontWeight: 700, color: "#111827", margin: 0 },
  primaryBtn: {
    padding: "8px 18px", background: "#111827", color: "#fff",
    border: "none", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer",
  },
  filterBar:   { display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" },
  searchInput: {
    flex: 1, minWidth: 180, padding: "8px 12px",
    border: "1px solid #D1D5DB", borderRadius: 6, fontSize: 13, outline: "none",
  },
  select: {
    padding: "8px 12px", border: "1px solid #D1D5DB",
    borderRadius: 6, fontSize: 13, outline: "none", background: "#fff",
  },
  loadingWrap: { display: "flex", justifyContent: "center", padding: 48 },
  errorMsg:    { color: "#B91C1C", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 6, padding: "10px 14px", marginBottom: 16, fontSize: 13 },
  tableWrap:   { overflowX: "auto" },
  table:       { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: {
    textAlign: "left", padding: "10px 14px",
    background: "#F9FAFB", borderBottom: "1px solid #E5E7EB",
    fontSize: 12, fontWeight: 600, color: "#6B7280", whiteSpace: "nowrap",
  },
  tr: { cursor: "pointer", borderBottom: "1px solid #F3F4F6" },
  td: { padding: "12px 14px", color: "#374151", verticalAlign: "middle" },
  muted: { color: "#9CA3AF" },
  pagination: { display: "flex", alignItems: "center", gap: 12, justifyContent: "center", marginTop: 20 },
  pageBtn: {
    padding: "6px 16px", border: "1px solid #D1D5DB",
    borderRadius: 6, fontSize: 13, cursor: "pointer", background: "#fff",
  },
  pageInfo: { fontSize: 13, color: "#6B7280" },
  form:       { display: "flex", flexDirection: "column" },
  formError:  { background: "#FEF2F2", color: "#B91C1C", border: "1px solid #FECACA", borderRadius: 6, padding: "10px 14px", fontSize: 13, marginBottom: 12 },
  row2:       { display: "flex", gap: 12 },
  input: {
    padding: "8px 10px", border: "1px solid #D1D5DB",
    borderRadius: 6, fontSize: 14, outline: "none", fontFamily: "inherit", width: "100%",
  },
  formActions: { display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 },
  cancelBtn: {
    padding: "8px 18px", background: "#fff", color: "#374151",
    border: "1px solid #D1D5DB", borderRadius: 6, fontSize: 13, cursor: "pointer",
  },
};
