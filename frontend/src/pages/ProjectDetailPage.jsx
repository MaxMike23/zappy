import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { TRADES, TRADE_LABEL } from "@/constants/trades";
import { projectsApi } from "@/api/projects";
import { workOrdersApi } from "@/api/workOrders";
import { workflowApi } from "@/api/workflow";
import { visitsApi } from "@/api/visits";
import Badge from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";
import Spinner from "@/components/ui/Spinner";
import EmptyState from "@/components/ui/EmptyState";
import CustomFieldRenderer from "@/components/CustomFieldRenderer";

const PRIORITY_COLORS = { low: "#10B981", medium: "#3B82F6", high: "#F59E0B", urgent: "#EF4444" };
const STATUS_COLORS   = { scheduled: "#3B82F6", in_progress: "#F59E0B", completed: "#10B981", cancelled: "#9CA3AF" };
const EDIT_ROLES = ["company_admin", "manager", "superadmin"];

export default function ProjectDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [project, setProject]     = useState(null);
  const [workOrders, setWorkOrders] = useState([]);
  const [stages, setStages]       = useState([]);
  const [fieldDefs, setFieldDefs] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState("");
  const [editing, setEditing]     = useState(false);
  const [editForm, setEditForm]   = useState({});
  const [saving, setSaving]       = useState(false);
  const [saveError, setSaveError] = useState("");
  const [showWoModal, setShowWoModal] = useState(false);
  const [woStages, setWoStages]   = useState([]);
  const [woForm, setWoForm]       = useState({ title: "", stage_id: "", priority: "medium", description: "" });
  const [woCreating, setWoCreating] = useState(false);
  const [woError, setWoError]     = useState("");
  const [directVisits, setDirectVisits]         = useState([]);
  const [showVisitModal, setShowVisitModal]     = useState(false);
  const [visitForm, setVisitForm]               = useState({ title: "", scheduled_start: "", scheduled_end: "", notes: "" });
  const [visitCreating, setVisitCreating]       = useState(false);
  const [visitError, setVisitError]             = useState("");

  const { user, company } = useAuth();
  const canEdit = EDIT_ROLES.includes(user?.role);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      projectsApi.get(id),
      workflowApi.listStages("project"),
      workflowApi.listFields("project"),
      workOrdersApi.list({ project_id: id, per_page: 50 }),
      workflowApi.listStages("work_order"),
      visitsApi.list({ project_id: id, per_page: 50 }),
    ]).then(([projRes, stagesRes, fieldsRes, wosRes, woStagesRes, visitsRes]) => {
      const p = projRes.data.project;
      setProject(p);
      setEditForm(toEditForm(p));
      setStages(stagesRes.data.stages);
      setFieldDefs(fieldsRes.data.fields);
      setWorkOrders(wosRes.data.items);
      setWoStages(woStagesRes.data.stages);
      setDirectVisits(visitsRes.data.items.filter((v) => !v.work_order_id));
    }).catch(() => setError("Failed to load project."))
      .finally(() => setLoading(false));
  }, [id]);

  const handleSave = async () => {
    setSaving(true);
    setSaveError("");
    try {
      const res = await projectsApi.update(id, buildPayload(editForm));
      setProject(res.data.project);
      setEditing(false);
    } catch (err) {
      setSaveError(err.response?.data?.error || "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const handleCustomFieldChange = (key, val) => {
    setEditForm((f) => ({
      ...f,
      custom_fields: { ...(f.custom_fields || {}), [key]: val },
    }));
  };

  const handleCreateWo = async (e) => {
    e.preventDefault();
    setWoError("");
    setWoCreating(true);
    try {
      const payload = {
        title: woForm.title.trim(),
        project_id: id,
        priority: woForm.priority,
      };
      if (woForm.stage_id) payload.stage_id = woForm.stage_id;
      if (woForm.description) payload.description = woForm.description;
      const res = await workOrdersApi.create(payload);
      navigate(`/work-orders/${res.data.work_order.id}`);
    } catch (err) {
      setWoError(err.response?.data?.error || "Failed to create work order.");
    } finally {
      setWoCreating(false);
    }
  };

  const handleCreateVisit = async (e) => {
    e.preventDefault();
    setVisitError("");
    setVisitCreating(true);
    try {
      const res = await visitsApi.create({ project_id: id, ...visitForm });
      setDirectVisits((prev) => [...prev, res.data.visit]);
      setShowVisitModal(false);
    } catch (err) {
      setVisitError(err.response?.data?.error || "Failed to create visit.");
    } finally {
      setVisitCreating(false);
    }
  };

  const handleClockIn = async (visitId) => {
    try {
      const res = await visitsApi.clockIn(visitId);
      setDirectVisits((prev) => prev.map((v) => v.id === visitId ? res.data.visit : v));
    } catch {/* no-op */}
  };

  const handleClockOut = async (visitId) => {
    try {
      const res = await visitsApi.clockOut(visitId);
      setDirectVisits((prev) => prev.map((v) => v.id === visitId ? res.data.visit : v));
    } catch {/* no-op */}
  };

  if (loading) return <div style={{ display: "flex", justifyContent: "center", padding: 48 }}><Spinner size={28} /></div>;
  if (error)   return <div style={{ color: "#B91C1C", padding: 24 }}>{error}</div>;
  if (!project) return null;

  const stage = stages.find((s) => s.id === (editing ? editForm.stage_id : project.stage_id)) || project.stage;

  return (
    <div>
      {/* Breadcrumb */}
      <div style={styles.breadcrumb}>
        <Link to="/projects" style={styles.breadcrumbLink}>← Projects</Link>
        <span style={styles.breadcrumbSep}>/</span>
        <span style={styles.breadcrumbCurrent}>{project.name}</span>
      </div>

      {/* Title row */}
      <div style={styles.titleRow}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>
          {editing ? (
            <input
              style={{ ...styles.input, fontSize: 20, fontWeight: 700, flex: 1 }}
              value={editForm.name}
              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
            />
          ) : (
            <h1 style={styles.title}>{project.name}</h1>
          )}
          {stage && <Badge label={editing ? (stages.find((s) => s.id === editForm.stage_id)?.name ?? stage.name) : stage.name} color={stage.color} />}
        </div>
        {canEdit && (
          <div style={{ display: "flex", gap: 8 }}>
            {editing ? (
              <>
                <button style={styles.cancelBtn} onClick={() => { setEditing(false); setEditForm(toEditForm(project)); setSaveError(""); }}>Cancel</button>
                <button style={styles.primaryBtn} disabled={saving} onClick={handleSave}>{saving ? "Saving…" : "Save"}</button>
              </>
            ) : (
              <button style={styles.secondaryBtn} onClick={() => setEditing(true)}>Edit</button>
            )}
          </div>
        )}
      </div>
      {saveError && <div style={styles.errorMsg}>{saveError}</div>}

      {/* Info grid */}
      <div style={styles.infoGrid}>
        {editing ? (
          <>
            <InfoField label="Stage">
              <select style={styles.input} value={editForm.stage_id || ""} onChange={(e) => setEditForm({ ...editForm, stage_id: e.target.value })}>
                <option value="">— no stage —</option>
                {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </InfoField>
            <InfoField label="Trades / Specializations" wide>
              <div style={checkGridStyle}>
                {TRADES.map((t) => (
                  <label key={t.key} style={checkLabelStyle}>
                    <input
                      type="checkbox"
                      checked={(editForm.trades || []).includes(t.key)}
                      onChange={() => {
                        const cur = editForm.trades || [];
                        setEditForm({ ...editForm, trades: cur.includes(t.key) ? cur.filter((k) => k !== t.key) : [...cur, t.key] });
                      }}
                    />
                    {t.label}
                  </label>
                ))}
              </div>
              {(company?.specializations || []).length > 0 && (editForm.trades || []).some((k) => !(company?.specializations || []).includes(k)) && (
                <div style={tradeWarnStyle}>⚠ One or more selected trades are not listed under your company's declared specializations.</div>
              )}
            </InfoField>
            <InfoField label="Client Name">
              <input style={styles.input} value={editForm.client_name} onChange={(e) => setEditForm({ ...editForm, client_name: e.target.value })} />
            </InfoField>
            <InfoField label="Client Email">
              <input type="email" style={styles.input} value={editForm.client_email} onChange={(e) => setEditForm({ ...editForm, client_email: e.target.value })} />
            </InfoField>
            <InfoField label="Client Phone">
              <input style={styles.input} value={editForm.client_phone} onChange={(e) => setEditForm({ ...editForm, client_phone: e.target.value })} />
            </InfoField>
            <InfoField label="Start Date">
              <input type="date" style={styles.input} value={editForm.start_date} onChange={(e) => setEditForm({ ...editForm, start_date: e.target.value })} />
            </InfoField>
            <InfoField label="End Date">
              <input type="date" style={styles.input} value={editForm.end_date} onChange={(e) => setEditForm({ ...editForm, end_date: e.target.value })} />
            </InfoField>
            <InfoField label="Site Address" wide>
              <input style={styles.input} value={editForm.site_address} onChange={(e) => setEditForm({ ...editForm, site_address: e.target.value })} placeholder="Street address" />
            </InfoField>
            <InfoField label="Description" wide>
              <textarea style={{ ...styles.input, resize: "vertical" }} rows={3} value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} />
            </InfoField>
          </>
        ) : (
          <>
            <InfoItem label="Stage" value={stage?.name} />
            <InfoItem label="Trades" value={project.trades?.length ? project.trades.map((t) => TRADE_LABEL[t] || t).join(", ") : null} />
            <InfoItem label="Client" value={project.client_name} />
            <InfoItem label="Client Email" value={project.client_email} />
            <InfoItem label="Client Phone" value={project.client_phone} />
            <InfoItem label="Start Date" value={project.start_date ? formatDate(project.start_date) : null} />
            <InfoItem label="End Date" value={project.end_date ? formatDate(project.end_date) : null} />
            <InfoItem label="Site Address" value={[project.site_address, project.site_city, project.site_state].filter(Boolean).join(", ") || null} wide />
            <InfoItem label="Description" value={project.description} wide />
          </>
        )}
      </div>

      {/* Custom Fields */}
      <CustomFieldRenderer
        fieldDefs={fieldDefs}
        values={editing ? (editForm.custom_fields || {}) : (project.custom_fields || {})}
        editing={editing}
        onChange={handleCustomFieldChange}
      />

      {/* Work Orders */}
      <div style={styles.section}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <h2 style={styles.sectionTitle}>Work Orders</h2>
          {canEdit && (
            <button style={styles.secondaryBtn} onClick={() => { setShowWoModal(true); setWoForm({ title: "", stage_id: "", priority: "medium", description: "" }); setWoError(""); }}>
              + New Work Order
            </button>
          )}
        </div>
        {workOrders.length === 0 ? (
          <EmptyState message="No work orders for this project yet." action={canEdit ? "+ New Work Order" : undefined} onAction={() => setShowWoModal(true)} />
        ) : (
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  {["Title", "Stage", "Priority", "Assignees"].map((h) => (
                    <th key={h} style={styles.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {workOrders.map((wo) => (
                  <tr key={wo.id} style={styles.tr} onClick={() => navigate(`/work-orders/${wo.id}`)}>
                    <td style={{ ...styles.td, fontWeight: 600 }}>{wo.title}</td>
                    <td style={styles.td}>{wo.stage ? <Badge label={wo.stage.name} color={wo.stage.color} /> : <span style={styles.muted}>—</span>}</td>
                    <td style={styles.td}>{wo.priority ? <Badge label={wo.priority} color={PRIORITY_COLORS[wo.priority]} /> : <span style={styles.muted}>—</span>}</td>
                    <td style={styles.td}>{wo.assignees?.map((a) => a.full_name).join(", ") || <span style={styles.muted}>Unassigned</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Direct Visits */}
      <div style={styles.section}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <h2 style={styles.sectionTitle}>Direct Visits</h2>
          {canEdit && (
            <button style={styles.secondaryBtn} onClick={() => { setShowVisitModal(true); setVisitForm({ title: "", scheduled_start: "", scheduled_end: "", notes: "" }); setVisitError(""); }}>
              + New Visit
            </button>
          )}
        </div>
        {directVisits.length === 0 ? (
          <p style={{ fontSize: 14, color: "#9CA3AF" }}>No direct visits yet (e.g. site surveys, walkthroughs).</p>
        ) : (
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  {["Title", "Scheduled Start", "Status", "Assignees", "Duration", ""].map((h) => (
                    <th key={h} style={styles.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {directVisits.map((v) => {
                  const isAssigned = v.assignees?.some((a) => a.id === user?.id);
                  const canClock = isAssigned || canEdit;
                  return (
                    <tr key={v.id} style={styles.tr}>
                      <td style={{ ...styles.td, fontWeight: 600 }}>{v.title}</td>
                      <td style={styles.td}>{formatVisitDateTime(v.scheduled_start)}</td>
                      <td style={styles.td}><Badge label={v.status.replace("_", " ")} color={STATUS_COLORS[v.status]} /></td>
                      <td style={styles.td}>{v.assignees?.length ? v.assignees.map((a) => a.full_name).join(", ") : <span style={styles.muted}>Unassigned</span>}</td>
                      <td style={styles.td}>{v.duration_minutes != null ? `${v.duration_minutes} min` : <span style={styles.muted}>—</span>}</td>
                      <td style={{ ...styles.td, whiteSpace: "nowrap" }}>
                        {canClock && v.status === "scheduled" && (
                          <button style={visitClockBtn} onClick={() => handleClockIn(v.id)}>Clock In</button>
                        )}
                        {canClock && v.is_running && (
                          <button style={{ ...visitClockBtn, background: "#F59E0B" }} onClick={() => handleClockOut(v.id)}>Clock Out</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* New Work Order Modal */}
      {showWoModal && (
        <Modal title="New Work Order" onClose={() => setShowWoModal(false)}>
          <form onSubmit={handleCreateWo} style={{ display: "flex", flexDirection: "column" }}>
            {woError && <div style={styles.errorMsg}>{woError}</div>}
            <FormField label="Title" required>
              <input style={styles.input} required value={woForm.title} onChange={(e) => setWoForm({ ...woForm, title: e.target.value })} placeholder="e.g. Rack Build Day 1" />
            </FormField>
            <FormField label="Stage">
              <select style={styles.input} value={woForm.stage_id} onChange={(e) => setWoForm({ ...woForm, stage_id: e.target.value })}>
                <option value="">— select stage —</option>
                {woStages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </FormField>
            <FormField label="Priority">
              <select style={styles.input} value={woForm.priority} onChange={(e) => setWoForm({ ...woForm, priority: e.target.value })}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </FormField>
            <FormField label="Description">
              <textarea style={{ ...styles.input, resize: "vertical" }} rows={3} value={woForm.description} onChange={(e) => setWoForm({ ...woForm, description: e.target.value })} />
            </FormField>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
              <button type="button" style={styles.cancelBtn} onClick={() => setShowWoModal(false)}>Cancel</button>
              <button type="submit" style={styles.primaryBtn} disabled={woCreating}>{woCreating ? "Creating…" : "Create Work Order"}</button>
            </div>
          </form>
        </Modal>
      )}
      {/* New Visit Modal */}
      {showVisitModal && (
        <Modal title="New Direct Visit" onClose={() => setShowVisitModal(false)}>
          <form onSubmit={handleCreateVisit} style={{ display: "flex", flexDirection: "column" }}>
            {visitError && <div style={styles.errorMsg}>{visitError}</div>}
            <FormField label="Title" required>
              <input style={styles.input} required value={visitForm.title} onChange={(e) => setVisitForm({ ...visitForm, title: e.target.value })} placeholder="e.g. Site Survey" />
            </FormField>
            <FormField label="Scheduled Start" required>
              <input type="datetime-local" style={styles.input} required value={visitForm.scheduled_start} onChange={(e) => setVisitForm({ ...visitForm, scheduled_start: e.target.value })} />
            </FormField>
            <FormField label="Scheduled End" required>
              <input type="datetime-local" style={styles.input} required value={visitForm.scheduled_end} onChange={(e) => setVisitForm({ ...visitForm, scheduled_end: e.target.value })} />
            </FormField>
            <FormField label="Notes">
              <textarea style={{ ...styles.input, resize: "vertical" }} rows={3} value={visitForm.notes} onChange={(e) => setVisitForm({ ...visitForm, notes: e.target.value })} />
            </FormField>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
              <button type="button" style={styles.cancelBtn} onClick={() => setShowVisitModal(false)}>Cancel</button>
              <button type="submit" style={styles.primaryBtn} disabled={visitCreating}>{visitCreating ? "Creating…" : "Create Visit"}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function InfoItem({ label, value, wide }) {
  return (
    <div style={{ gridColumn: wide ? "1 / -1" : undefined }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 14, color: value ? "#111827" : "#9CA3AF" }}>{value || "—"}</div>
    </div>
  );
}

function InfoField({ label, children, wide }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, gridColumn: wide ? "1 / -1" : undefined }}>
      <label style={{ fontSize: 11, fontWeight: 600, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</label>
      {children}
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

function toEditForm(p) {
  return {
    name: p.name || "",
    description: p.description || "",
    stage_id: p.stage_id || "",
    trades: p.trades || [],
    client_name: p.client_name || "",
    client_email: p.client_email || "",
    client_phone: p.client_phone || "",
    start_date: p.start_date || "",
    end_date: p.end_date || "",
    site_address: p.site_address || "",
    site_city: p.site_city || "",
    site_state: p.site_state || "",
    site_zip: p.site_zip || "",
    custom_fields: { ...(p.custom_fields || {}) },
  };
}

function buildPayload(f) {
  const p = {};
  if (f.name !== undefined)         p.name         = f.name;
  if (f.description !== undefined)  p.description  = f.description;
  if (f.stage_id !== undefined)     p.stage_id     = f.stage_id || null;
  if (f.client_name !== undefined)  p.client_name  = f.client_name;
  if (f.client_email !== undefined) p.client_email = f.client_email;
  if (f.client_phone !== undefined) p.client_phone = f.client_phone;
  if (f.trades !== undefined)       p.trades       = f.trades;
  if (f.start_date !== undefined)   p.start_date   = f.start_date || null;
  if (f.end_date !== undefined)     p.end_date     = f.end_date || null;
  if (f.site_address !== undefined) p.site_address = f.site_address;
  if (f.site_city !== undefined)    p.site_city    = f.site_city;
  if (f.site_state !== undefined)   p.site_state   = f.site_state;
  if (f.site_zip !== undefined)     p.site_zip     = f.site_zip;
  if (f.custom_fields !== undefined) p.custom_fields = f.custom_fields;
  return p;
}

const tradeWarnStyle = {
  fontSize: 12, color: "#92400E", background: "#FFFBEB",
  border: "1px solid #FDE68A", borderRadius: 4, padding: "6px 10px", marginTop: 4,
};

const checkGridStyle = {
  display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "6px 12px", padding: "8px 0",
};

const checkLabelStyle = {
  display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#374151", cursor: "pointer",
};

function formatDate(dateStr) {
  if (!dateStr) return "";
  return new Date(dateStr + "T00:00:00").toLocaleDateString(undefined, {
    year: "numeric", month: "short", day: "numeric",
  });
}

function formatVisitDateTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
  });
}

const visitClockBtn = {
  padding: "4px 12px", background: "#111827", color: "#fff",
  border: "none", borderRadius: 5, fontSize: 12, fontWeight: 600, cursor: "pointer",
};

const styles = {
  breadcrumb:        { display: "flex", alignItems: "center", gap: 6, marginBottom: 16, fontSize: 13 },
  breadcrumbLink:    { color: "#6B7280", cursor: "pointer" },
  breadcrumbSep:     { color: "#D1D5DB" },
  breadcrumbCurrent: { color: "#374151", fontWeight: 500 },
  titleRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 20, flexWrap: "wrap" },
  title:  { fontSize: 22, fontWeight: 700, color: "#111827", margin: 0 },
  infoGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    gap: 16,
    background: "#fff",
    border: "1px solid #E5E7EB",
    borderRadius: 10,
    padding: 20,
    marginBottom: 24,
  },
  section:      { marginTop: 28 },
  sectionTitle: { fontSize: 16, fontWeight: 700, color: "#111827", margin: 0 },
  tableWrap:    { overflowX: "auto", marginTop: 4 },
  table:        { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: {
    textAlign: "left", padding: "10px 14px",
    background: "#F9FAFB", borderBottom: "1px solid #E5E7EB",
    fontSize: 12, fontWeight: 600, color: "#6B7280",
  },
  tr:   { cursor: "pointer", borderBottom: "1px solid #F3F4F6" },
  td:   { padding: "12px 14px", color: "#374151", verticalAlign: "middle" },
  muted: { color: "#9CA3AF" },
  primaryBtn: { padding: "8px 18px", background: "#111827", color: "#fff", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer" },
  secondaryBtn: { padding: "8px 18px", background: "#fff", color: "#374151", border: "1px solid #D1D5DB", borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: "pointer" },
  cancelBtn: { padding: "8px 18px", background: "#fff", color: "#374151", border: "1px solid #D1D5DB", borderRadius: 6, fontSize: 13, cursor: "pointer" },
  errorMsg: { color: "#B91C1C", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 6, padding: "10px 14px", fontSize: 13, marginBottom: 12 },
  input: { padding: "8px 10px", border: "1px solid #D1D5DB", borderRadius: 6, fontSize: 14, outline: "none", fontFamily: "inherit", width: "100%" },
};
