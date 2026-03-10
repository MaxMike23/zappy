import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/auth/AuthContext";
import { timeLogsApi } from "@/api/timeLogs";
import { workOrdersApi } from "@/api/workOrders";
import Badge from "@/components/ui/Badge";
import Spinner from "@/components/ui/Spinner";

const APPROVAL_COLORS = { true: "#10B981", false: "#9CA3AF" };

function fmtDateTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

function fmtDuration(minutes) {
  if (minutes == null) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function toLocalIso(date) {
  // Convert JS Date to a local datetime-local input value
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const EMPTY_FORM = { work_order_id: "", start_time: "", end_time: "", notes: "" };

export default function TimeLogsPage() {
  const { user } = useAuth();
  const isAdmin = ["company_admin", "manager", "superadmin"].includes(user?.role);

  const [logs, setLogs]               = useState([]);
  const [pagination, setPagination]   = useState(null);
  const [summary, setSummary]         = useState([]);
  const [workOrders, setWorkOrders]   = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState("");

  // Filters
  const [dateAfter, setDateAfter]     = useState("");
  const [dateBefore, setDateBefore]   = useState("");
  const [approvedFilter, setApproved] = useState("");
  const [page, setPage]               = useState(1);

  // Create modal
  const [showCreate, setShowCreate]   = useState(false);
  const [form, setForm]               = useState(EMPTY_FORM);
  const [creating, setCreating]       = useState(false);
  const [createError, setCreateError] = useState("");

  const buildParams = useCallback((pg = 1) => {
    const p = { page: pg, per_page: 20 };
    if (dateAfter)       p.date_after  = new Date(dateAfter).toISOString();
    if (dateBefore)      p.date_before = new Date(dateBefore).toISOString();
    if (approvedFilter !== "") p.is_approved = approvedFilter;
    return p;
  }, [dateAfter, dateBefore, approvedFilter]);

  const fetchLogs = useCallback(async (pg = 1) => {
    setLoading(true);
    setError("");
    try {
      const [logsRes, woRes] = await Promise.all([
        timeLogsApi.list(buildParams(pg)),
        workOrdersApi.list({ per_page: 100 }),
      ]);
      setLogs(logsRes.data.items);
      setPagination(logsRes.data.pagination);
      setWorkOrders(woRes.data.items);

      if (isAdmin) {
        const sumRes = await timeLogsApi.summary(buildParams(pg));
        setSummary(sumRes.data.summary);
      }
    } catch {
      setError("Failed to load time logs.");
    } finally {
      setLoading(false);
    }
  }, [buildParams, isAdmin]);

  useEffect(() => { fetchLogs(1); setPage(1); }, [dateAfter, dateBefore, approvedFilter]);

  const handleApprove = async (id, approve) => {
    try {
      await timeLogsApi.update(id, { is_approved: approve });
      setLogs((prev) => prev.map((l) => l.id === id ? { ...l, is_approved: approve } : l));
      if (isAdmin) {
        const sumRes = await timeLogsApi.summary(buildParams(page));
        setSummary(sumRes.data.summary);
      }
    } catch { /* ignore */ }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this time log?")) return;
    try {
      await timeLogsApi.delete(id);
      fetchLogs(page);
    } catch { /* ignore */ }
  };

  const handleCreate = async () => {
    if (!form.work_order_id || !form.start_time) {
      setCreateError("Work order and start time are required.");
      return;
    }
    setCreating(true);
    setCreateError("");
    try {
      const payload = {
        work_order_id: form.work_order_id,
        start_time: new Date(form.start_time).toISOString(),
        notes: form.notes || undefined,
      };
      if (form.end_time) payload.end_time = new Date(form.end_time).toISOString();
      await timeLogsApi.create(payload);
      setShowCreate(false);
      setForm(EMPTY_FORM);
      fetchLogs(page);
    } catch (e) {
      setCreateError(e.response?.data?.error || "Failed to create time log.");
    } finally {
      setCreating(false);
    }
  };

  const openCreate = () => {
    setForm({ ...EMPTY_FORM, start_time: toLocalIso(new Date()) });
    setCreateError("");
    setShowCreate(true);
  };

  return (
    <div>
      {/* Header */}
      <div style={st.header}>
        <h1 style={st.title}>Time Logs</h1>
        <button style={st.primaryBtn} onClick={openCreate}>+ Log Time</button>
      </div>

      {/* Filters */}
      <div style={st.filterBar}>
        <div style={st.filterGroup}>
          <label style={st.filterLabel}>From</label>
          <input type="date" style={st.input} value={dateAfter}
            onChange={(e) => { setDateAfter(e.target.value); setPage(1); }} />
        </div>
        <div style={st.filterGroup}>
          <label style={st.filterLabel}>To</label>
          <input type="date" style={st.input} value={dateBefore}
            onChange={(e) => { setDateBefore(e.target.value); setPage(1); }} />
        </div>
        {isAdmin && (
          <div style={st.filterGroup}>
            <label style={st.filterLabel}>Status</label>
            <select style={st.input} value={approvedFilter}
              onChange={(e) => { setApproved(e.target.value); setPage(1); }}>
              <option value="">All</option>
              <option value="false">Pending</option>
              <option value="true">Approved</option>
            </select>
          </div>
        )}
      </div>

      {loading ? (
        <div style={st.center}><Spinner size={28} /></div>
      ) : error ? (
        <div style={st.errorMsg}>{error}</div>
      ) : logs.length === 0 ? (
        <div style={st.empty}>No time logs found.</div>
      ) : (
        <>
          <div style={st.tableWrap}>
            <table style={st.table}>
              <thead>
                <tr>
                  {isAdmin && <th style={st.th}>Tech</th>}
                  <th style={st.th}>Work Order</th>
                  <th style={st.th}>Start</th>
                  <th style={st.th}>End</th>
                  <th style={st.th}>Duration</th>
                  <th style={st.th}>Notes</th>
                  <th style={st.th}>Status</th>
                  <th style={st.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} style={st.row}>
                    {isAdmin && <td style={st.td}>{log.user_name}</td>}
                    <td style={st.td}>
                      <a href={`/work-orders/${log.work_order_id}`} style={st.link}>
                        {workOrders.find((w) => w.id === log.work_order_id)?.title || "Work Order"}
                      </a>
                    </td>
                    <td style={st.td}>{fmtDateTime(log.start_time)}</td>
                    <td style={st.td}>{fmtDateTime(log.end_time)}</td>
                    <td style={st.td}>{fmtDuration(log.duration_minutes)}</td>
                    <td style={{ ...st.td, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {log.notes || <span style={st.muted}>—</span>}
                    </td>
                    <td style={st.td}>
                      <Badge
                        label={log.is_approved ? "Approved" : "Pending"}
                        color={APPROVAL_COLORS[log.is_approved]}
                      />
                    </td>
                    <td style={st.td}>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {isAdmin && !log.is_approved && (
                          <button style={st.approveBtn} onClick={() => handleApprove(log.id, true)}>
                            Approve
                          </button>
                        )}
                        {isAdmin && log.is_approved && (
                          <button style={st.rejectBtn} onClick={() => handleApprove(log.id, false)}>
                            Reject
                          </button>
                        )}
                        {(!log.is_approved) && (
                          <button style={st.deleteBtn} onClick={() => handleDelete(log.id)}>
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pagination && (pagination.has_prev || pagination.has_next) && (
            <div style={st.pagination}>
              <button style={{ ...st.pageBtn, opacity: pagination.has_prev ? 1 : 0.4 }}
                disabled={!pagination.has_prev}
                onClick={() => { const p = page - 1; setPage(p); fetchLogs(p); }}>← Prev</button>
              <span style={st.pageInfo}>Page {pagination.page} of {pagination.pages}</span>
              <button style={{ ...st.pageBtn, opacity: pagination.has_next ? 1 : 0.4 }}
                disabled={!pagination.has_next}
                onClick={() => { const p = page + 1; setPage(p); fetchLogs(p); }}>Next →</button>
            </div>
          )}
        </>
      )}

      {/* Hours summary (admin/manager only) */}
      {isAdmin && summary.length > 0 && (
        <div style={{ marginTop: 40 }}>
          <h2 style={st.sectionTitle}>Hours Summary</h2>
          <div style={st.summaryGrid}>
            {summary.map((row) => (
              <div key={row.user_id} style={st.summaryCard}>
                <div style={st.summaryName}>{row.user_name}</div>
                <div style={st.summaryHours}>{row.total_hours}h</div>
                <div style={st.summaryMeta}>{row.total_logs} log{row.total_logs !== 1 ? "s" : ""}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div style={st.overlay} onClick={() => setShowCreate(false)}>
          <div style={st.modal} onClick={(e) => e.stopPropagation()}>
            <h2 style={st.modalTitle}>Log Time</h2>

            <label style={st.label}>Work Order *</label>
            <select style={st.input} value={form.work_order_id}
              onChange={(e) => setForm((f) => ({ ...f, work_order_id: e.target.value }))}>
              <option value="">Select work order…</option>
              {workOrders.map((wo) => (
                <option key={wo.id} value={wo.id}>{wo.title}</option>
              ))}
            </select>

            <label style={st.label}>Start Time *</label>
            <input type="datetime-local" style={st.input} value={form.start_time}
              onChange={(e) => setForm((f) => ({ ...f, start_time: e.target.value }))} />

            <label style={st.label}>End Time</label>
            <input type="datetime-local" style={st.input} value={form.end_time}
              onChange={(e) => setForm((f) => ({ ...f, end_time: e.target.value }))} />

            <label style={st.label}>Notes</label>
            <textarea style={{ ...st.input, height: 72, resize: "vertical" }} value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Optional notes…" />

            {createError && <div style={st.errorMsg}>{createError}</div>}

            <div style={st.modalActions}>
              <button style={st.cancelBtn} onClick={() => setShowCreate(false)}>Cancel</button>
              <button style={st.primaryBtn} disabled={creating} onClick={handleCreate}>
                {creating ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const st = {
  header:      { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 },
  title:       { fontSize: 22, fontWeight: 700, color: "#111827", margin: 0 },
  primaryBtn:  { padding: "8px 18px", background: "#111827", color: "#fff", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer" },
  filterBar:   { display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20, alignItems: "flex-end" },
  filterGroup: { display: "flex", flexDirection: "column", gap: 4 },
  filterLabel: { fontSize: 11, fontWeight: 600, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.04em" },
  input:       { padding: "8px 10px", border: "1px solid #D1D5DB", borderRadius: 6, fontSize: 14, outline: "none", fontFamily: "inherit", width: "100%", boxSizing: "border-box" },
  center:      { display: "flex", justifyContent: "center", padding: 48 },
  errorMsg:    { color: "#EF4444", fontSize: 13, marginTop: 8 },
  empty:       { color: "#9CA3AF", fontSize: 14, padding: "32px 0", textAlign: "center" },
  tableWrap:   { overflowX: "auto" },
  table:       { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th:          { padding: "10px 14px", background: "#F9FAFB", textAlign: "left", fontWeight: 600, color: "#374151", borderBottom: "1px solid #E5E7EB", whiteSpace: "nowrap" },
  td:          { padding: "12px 14px", color: "#374151", verticalAlign: "middle", borderBottom: "1px solid #F3F4F6" },
  row:         { cursor: "default" },
  muted:       { color: "#9CA3AF" },
  link:        { color: "#3B82F6", textDecoration: "none" },
  approveBtn:  { padding: "4px 10px", background: "#ECFDF5", color: "#059669", border: "1px solid #6EE7B7", borderRadius: 4, fontSize: 12, cursor: "pointer" },
  rejectBtn:   { padding: "4px 10px", background: "#FEF3C7", color: "#D97706", border: "1px solid #FCD34D", borderRadius: 4, fontSize: 12, cursor: "pointer" },
  deleteBtn:   { padding: "4px 10px", background: "#fff", color: "#6B7280", border: "1px solid #D1D5DB", borderRadius: 4, fontSize: 12, cursor: "pointer" },
  pagination:  { display: "flex", alignItems: "center", gap: 12, justifyContent: "center", marginTop: 20 },
  pageBtn:     { padding: "6px 16px", border: "1px solid #D1D5DB", borderRadius: 6, fontSize: 13, cursor: "pointer", background: "#fff" },
  pageInfo:    { fontSize: 13, color: "#6B7280" },
  sectionTitle:{ fontSize: 16, fontWeight: 700, color: "#111827", margin: "0 0 12px" },
  summaryGrid: { display: "flex", flexWrap: "wrap", gap: 12 },
  summaryCard: { flex: "1 1 140px", background: "#fff", border: "1px solid #E5E7EB", borderRadius: 10, padding: "16px", textAlign: "center" },
  summaryName: { fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 },
  summaryHours:{ fontSize: 28, fontWeight: 700, color: "#111827", lineHeight: 1 },
  summaryMeta: { fontSize: 12, color: "#9CA3AF", marginTop: 4 },
  overlay:     { position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 },
  modal:       { background: "#fff", borderRadius: 10, padding: 28, width: "100%", maxWidth: 480, display: "flex", flexDirection: "column", gap: 10, maxHeight: "90vh", overflowY: "auto" },
  modalTitle:  { fontSize: 18, fontWeight: 700, color: "#111827", margin: "0 0 4px" },
  label:       { fontSize: 13, fontWeight: 600, color: "#374151" },
  modalActions:{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 6 },
  cancelBtn:   { padding: "8px 18px", background: "#fff", color: "#374151", border: "1px solid #D1D5DB", borderRadius: 6, fontSize: 13, cursor: "pointer" },
};
