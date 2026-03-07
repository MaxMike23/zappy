import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { TRADES, TRADE_LABEL } from "@/constants/trades";
import { workOrdersApi } from "@/api/workOrders";
import { workflowApi } from "@/api/workflow";
import { filesApi } from "@/api/files";
import client from "@/api/client";
import Badge from "@/components/ui/Badge";
import Spinner from "@/components/ui/Spinner";
import CustomFieldRenderer from "@/components/CustomFieldRenderer";

const PRIORITY_COLORS = { low: "#10B981", medium: "#3B82F6", high: "#F59E0B", urgent: "#EF4444" };
const PRIORITIES      = ["low", "medium", "high", "urgent"];
const EDIT_ROLES      = ["company_admin", "manager", "superadmin"];

export default function WorkOrderDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [wo, setWo]               = useState(null);
  const [stages, setStages]       = useState([]);
  const [fieldDefs, setFieldDefs] = useState([]);
  const [notes, setNotes]         = useState([]);
  const [files, setFiles]         = useState([]);
  const [users, setUsers]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState("");

  const [editing, setEditing]     = useState(false);
  const [editForm, setEditForm]   = useState({});
  const [saving, setSaving]       = useState(false);
  const [saveError, setSaveError] = useState("");

  const [noteContent, setNoteContent] = useState("");
  const [noteInternal, setNoteInternal] = useState(true);
  const [addingNote, setAddingNote]   = useState(false);

  const [fileUploading, setFileUploading] = useState(false);
  const fileInputRef = useRef(null);

  const [editingAssignees, setEditingAssignees] = useState(false);
  const [assigneeIds, setAssigneeIds]           = useState([]);
  const [savingAssignees, setSavingAssignees]   = useState(false);

  const { user, company } = useAuth();
  const canEdit = EDIT_ROLES.includes(user?.role);
  const isTech = user?.role === "technician";

  useEffect(() => {
    setLoading(true);
    Promise.all([
      workOrdersApi.get(id),
      workflowApi.listStages("work_order"),
      workflowApi.listFields("work_order"),
      workOrdersApi.listNotes(id),
      filesApi.list({ work_order_id: id }),
      client.get("/users/"),
    ]).then(([woRes, stagesRes, fieldsRes, notesRes, filesRes, usersRes]) => {
      const w = woRes.data.work_order;
      setWo(w);
      setEditForm(toEditForm(w));
      setAssigneeIds((w.assignees || []).map((a) => a.id));
      setStages(stagesRes.data.stages);
      setFieldDefs(fieldsRes.data.fields);
      setNotes(notesRes.data.notes);
      setFiles(filesRes.data.files);
      setUsers((usersRes.data.items || []).filter((u) => ["technician", "manager", "company_admin"].includes(u.role)));
    }).catch(() => setError("Failed to load work order."))
      .finally(() => setLoading(false));
  }, [id]);

  const handleSave = async () => {
    setSaving(true);
    setSaveError("");
    try {
      const res = await workOrdersApi.update(id, buildPayload(editForm));
      setWo(res.data.work_order);
      setEditing(false);
    } catch (err) {
      setSaveError(err.response?.data?.error || "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const handleCustomFieldChange = (key, val) => {
    setEditForm((f) => ({ ...f, custom_fields: { ...(f.custom_fields || {}), [key]: val } }));
  };

  const handleAddNote = async () => {
    if (!noteContent.trim()) return;
    setAddingNote(true);
    try {
      const res = await workOrdersApi.addNote(id, { content: noteContent.trim(), is_internal: noteInternal });
      setNotes((prev) => [...prev, res.data.note]);
      setNoteContent("");
    } catch {
      // Note errors are rare — silent fail with no-op
    } finally {
      setAddingNote(false);
    }
  };

  const handleDeleteNote = async (noteId) => {
    try {
      await workOrdersApi.deleteNote(id, noteId);
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
    } catch {/* no-op */}
  };

  const handleFileUpload = async (e) => {
    const uploadFiles = Array.from(e.target.files);
    if (!uploadFiles.length) return;
    setFileUploading(true);
    try {
      for (const file of uploadFiles) {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("work_order_id", id);
        const res = await filesApi.upload(fd);
        setFiles((prev) => [res.data.file, ...prev]);
      }
    } catch {/* no-op */} finally {
      setFileUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleFileDownload = async (file) => {
    try {
      const res = await filesApi.download(file.id);
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = file.original_filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch {/* no-op */}
  };

  const handleSaveAssignees = async () => {
    setSavingAssignees(true);
    try {
      const res = await workOrdersApi.update(id, { assignee_ids: assigneeIds });
      setWo(res.data.work_order);
      setEditingAssignees(false);
    } catch {/* no-op */} finally {
      setSavingAssignees(false);
    }
  };

  if (loading) return <div style={{ display: "flex", justifyContent: "center", padding: 48 }}><Spinner size={28} /></div>;
  if (error)   return <div style={{ color: "#B91C1C", padding: 24 }}>{error}</div>;
  if (!wo)     return null;

  const stage = stages.find((s) => s.id === (editing ? editForm.stage_id : wo.stage_id)) || wo.stage;

  return (
    <div style={styles.page}>
      {/* Main column */}
      <div style={styles.main}>
        {/* Breadcrumb */}
        <div style={styles.breadcrumb}>
          <Link to="/work-orders" style={styles.breadcrumbLink}>← Work Orders</Link>
          {wo.project_id && (
            <>
              <span style={styles.sep}>/</span>
              <Link to={`/projects/${wo.project_id}`} style={styles.breadcrumbLink}>Project</Link>
            </>
          )}
        </div>

        {/* Title + badges + edit controls */}
        <div style={styles.titleRow}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0, flexWrap: "wrap" }}>
            {editing ? (
              <input
                style={{ ...styles.input, fontSize: 18, fontWeight: 700, flex: 1 }}
                value={editForm.title}
                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
              />
            ) : (
              <h1 style={styles.title}>{wo.title}</h1>
            )}
            {stage && <Badge label={stage.name} color={stage.color} />}
            <Badge label={editing ? editForm.priority : wo.priority} color={PRIORITY_COLORS[editing ? editForm.priority : wo.priority]} />
          </div>
          {(canEdit || (isTech && wo.assignees?.some((a) => a.id === user?.id))) && (
            <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
              {editing ? (
                <>
                  <button style={styles.cancelBtn} onClick={() => { setEditing(false); setEditForm(toEditForm(wo)); setSaveError(""); }}>Cancel</button>
                  <button style={styles.primaryBtn} disabled={saving} onClick={handleSave}>{saving ? "Saving…" : "Save"}</button>
                </>
              ) : (
                <button style={styles.secondaryBtn} onClick={() => setEditing(true)}>Edit</button>
              )}
            </div>
          )}
        </div>
        {saveError && <div style={styles.errorMsg}>{saveError}</div>}

        {/* Edit fields */}
        {editing && (
          <div style={styles.editGrid}>
            <EditField label="Stage">
              <select style={styles.input} value={editForm.stage_id || ""} onChange={(e) => setEditForm({ ...editForm, stage_id: e.target.value })}>
                <option value="">— no stage —</option>
                {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </EditField>
            <EditField label="Priority">
              <select style={styles.input} value={editForm.priority} onChange={(e) => setEditForm({ ...editForm, priority: e.target.value })}>
                {PRIORITIES.map((p) => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
              </select>
            </EditField>
            <EditField label="Trades / Specializations" wide>
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
            </EditField>
            <EditField label="Scheduled Start">
              <input type="datetime-local" style={styles.input} value={editForm.scheduled_start} onChange={(e) => setEditForm({ ...editForm, scheduled_start: e.target.value })} />
            </EditField>
            <EditField label="Scheduled End">
              <input type="datetime-local" style={styles.input} value={editForm.scheduled_end} onChange={(e) => setEditForm({ ...editForm, scheduled_end: e.target.value })} />
            </EditField>
            <EditField label="Description" wide>
              <textarea style={{ ...styles.input, resize: "vertical" }} rows={3} value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} />
            </EditField>
            <EditField label="Site Address" wide>
              <input style={styles.input} value={editForm.site_address} onChange={(e) => setEditForm({ ...editForm, site_address: e.target.value })} placeholder="Street address" />
            </EditField>
          </div>
        )}

        {/* Read-only info when not editing */}
        {!editing && (
          <div style={styles.infoRow}>
            {wo.description && <p style={{ margin: "0 0 4px", fontSize: 14, color: "#374151" }}>{wo.description}</p>}
            <div style={styles.metaGrid}>
              {wo.trades?.length > 0 && <MetaItem label="Trades" value={wo.trades.map((t) => TRADE_LABEL[t] || t).join(", ")} />}
              {wo.scheduled_start && <MetaItem label="Scheduled" value={formatDateTime(wo.scheduled_start)} />}
              {wo.site_address && <MetaItem label="Site" value={[wo.site_address, wo.site_city, wo.site_state].filter(Boolean).join(", ")} />}
            </div>
          </div>
        )}

        {/* Custom fields */}
        <CustomFieldRenderer
          fieldDefs={fieldDefs}
          values={editing ? (editForm.custom_fields || {}) : (wo.custom_fields || {})}
          editing={editing}
          onChange={handleCustomFieldChange}
        />

        {/* Notes */}
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>Notes</h2>
          {notes.length === 0 && <p style={{ fontSize: 14, color: "#9CA3AF" }}>No notes yet.</p>}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {notes.map((note) => (
              <div key={note.id} style={{ ...styles.noteCard, borderLeft: `3px solid ${note.is_internal ? "#6B7280" : "#3B82F6"}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <span style={styles.noteAuthor}>{note.author_name}</span>
                    <span style={styles.noteTime}> · {formatTimeAgo(note.created_at)}</span>
                    {note.is_internal && <span style={styles.internalBadge}>internal</span>}
                  </div>
                  {(note.author_id === user?.id || canEdit) && (
                    <button style={styles.deleteBtn} onClick={() => handleDeleteNote(note.id)}>✕</button>
                  )}
                </div>
                <p style={styles.noteContent}>{note.content}</p>
              </div>
            ))}
          </div>

          {/* Add note */}
          <div style={styles.addNoteWrap}>
            <textarea
              style={{ ...styles.input, resize: "vertical", marginBottom: 8 }}
              rows={3}
              placeholder="Add a note…"
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
            />
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#6B7280", cursor: "pointer" }}>
                <input type="checkbox" checked={noteInternal} onChange={(e) => setNoteInternal(e.target.checked)} />
                Internal only
              </label>
              <button style={{ ...styles.primaryBtn, marginLeft: "auto" }} disabled={addingNote || !noteContent.trim()} onClick={handleAddNote}>
                {addingNote ? "Adding…" : "Add Note"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Right sidebar */}
      <div style={styles.sidebar}>
        {/* Assignees */}
        <div style={styles.card}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <h3 style={styles.cardTitle}>Assignees</h3>
            {canEdit && !editingAssignees && (
              <button style={styles.linkBtn} onClick={() => { setEditingAssignees(true); setAssigneeIds((wo.assignees || []).map((a) => a.id)); }}>Edit</button>
            )}
          </div>
          {editingAssignees ? (
            <>
              <div style={{ maxHeight: 200, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
                {users.map((u) => (
                  <label key={u.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={assigneeIds.includes(u.id)}
                      onChange={(e) => setAssigneeIds((prev) => e.target.checked ? [...prev, u.id] : prev.filter((x) => x !== u.id))}
                    />
                    <span>{u.full_name}</span>
                    <span style={{ color: "#9CA3AF", fontSize: 11 }}>({u.role.replace("_", " ")})</span>
                  </label>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button style={styles.cancelBtn} onClick={() => setEditingAssignees(false)}>Cancel</button>
                <button style={styles.primaryBtn} disabled={savingAssignees} onClick={handleSaveAssignees}>{savingAssignees ? "Saving…" : "Save"}</button>
              </div>
            </>
          ) : (
            wo.assignees?.length ? (
              wo.assignees.map((a) => (
                <div key={a.id} style={{ fontSize: 13, color: "#374151", marginBottom: 6 }}>
                  {a.full_name} <span style={{ color: "#9CA3AF", fontSize: 11 }}>({a.role?.replace("_", " ")})</span>
                </div>
              ))
            ) : (
              <p style={{ fontSize: 13, color: "#9CA3AF", margin: 0 }}>No assignees.</p>
            )
          )}
        </div>

        {/* Files */}
        <div style={styles.card}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <h3 style={styles.cardTitle}>Files</h3>
            <button style={styles.linkBtn} onClick={() => fileInputRef.current?.click()} disabled={fileUploading}>
              {fileUploading ? "Uploading…" : "Upload"}
            </button>
          </div>
          <input ref={fileInputRef} type="file" multiple style={{ display: "none" }} onChange={handleFileUpload} />
          {files.length === 0 ? (
            <p style={{ fontSize: 13, color: "#9CA3AF", margin: 0 }}>No files attached.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {files.map((f) => (
                <div key={f.id} style={styles.fileRow}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <button style={styles.fileLink} onClick={() => handleFileDownload(f)}>{f.original_filename}</button>
                    <div style={{ fontSize: 11, color: "#9CA3AF" }}>
                      {formatBytes(f.file_size)} · {f.uploaded_by_name} · {formatTimeAgo(f.created_at)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EditField({ label, children, wide }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, gridColumn: wide ? "1 / -1" : undefined }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</label>
      {children}
    </div>
  );
}

function MetaItem({ label, value }) {
  return (
    <div>
      <span style={{ fontSize: 12, color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase" }}>{label}: </span>
      <span style={{ fontSize: 13, color: "#374151" }}>{value}</span>
    </div>
  );
}

function toEditForm(w) {
  return {
    title: w.title || "",
    description: w.description || "",
    stage_id: w.stage_id || "",
    priority: w.priority || "medium",
    trades: w.trades || [],
    scheduled_start: w.scheduled_start ? toLocalDatetimeInput(w.scheduled_start) : "",
    scheduled_end: w.scheduled_end ? toLocalDatetimeInput(w.scheduled_end) : "",
    site_address: w.site_address || "",
    site_city: w.site_city || "",
    site_state: w.site_state || "",
    site_zip: w.site_zip || "",
    custom_fields: { ...(w.custom_fields || {}) },
  };
}

function buildPayload(f) {
  const p = {};
  if (f.title !== undefined)       p.title       = f.title;
  if (f.description !== undefined) p.description = f.description;
  if (f.stage_id !== undefined)    p.stage_id    = f.stage_id || null;
  if (f.priority !== undefined)    p.priority    = f.priority;
  if (f.trades !== undefined)      p.trades      = f.trades;
  if (f.scheduled_start !== undefined) p.scheduled_start = f.scheduled_start || null;
  if (f.scheduled_end !== undefined)   p.scheduled_end   = f.scheduled_end || null;
  if (f.site_address !== undefined) p.site_address = f.site_address;
  if (f.site_city !== undefined)    p.site_city    = f.site_city;
  if (f.site_state !== undefined)   p.site_state   = f.site_state;
  if (f.site_zip !== undefined)     p.site_zip     = f.site_zip;
  if (f.custom_fields !== undefined) p.custom_fields = f.custom_fields;
  return p;
}

function toLocalDatetimeInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toISOString().slice(0, 16);
}

function formatDateTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
  });
}

function formatTimeAgo(iso) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatBytes(bytes) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
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

const styles = {
  page:         { display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" },
  main:         { flex: 1, minWidth: 0 },
  sidebar:      { width: 280, flexShrink: 0, display: "flex", flexDirection: "column", gap: 16 },
  breadcrumb:   { display: "flex", alignItems: "center", gap: 6, marginBottom: 16, fontSize: 13 },
  breadcrumbLink: { color: "#6B7280" },
  sep:          { color: "#D1D5DB" },
  titleRow:     { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16, flexWrap: "wrap" },
  title:        { fontSize: 20, fontWeight: 700, color: "#111827", margin: 0 },
  editGrid:     { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, background: "#fff", border: "1px solid #E5E7EB", borderRadius: 10, padding: 16, marginBottom: 20 },
  infoRow:      { marginBottom: 16 },
  metaGrid:     { display: "flex", flexWrap: "wrap", gap: "4px 20px", marginTop: 8 },
  section:      { marginTop: 28 },
  sectionTitle: { fontSize: 16, fontWeight: 700, color: "#111827", margin: "0 0 14px" },
  noteCard:     { background: "#fff", border: "1px solid #E5E7EB", borderRadius: 8, padding: "12px 14px" },
  noteAuthor:   { fontSize: 13, fontWeight: 600, color: "#374151" },
  noteTime:     { fontSize: 12, color: "#9CA3AF" },
  internalBadge: { marginLeft: 8, fontSize: 10, background: "#F3F4F6", color: "#6B7280", padding: "2px 6px", borderRadius: 4, fontWeight: 600, textTransform: "uppercase" },
  deleteBtn:    { background: "none", border: "none", cursor: "pointer", color: "#9CA3AF", fontSize: 12, padding: "0 4px" },
  noteContent:  { fontSize: 14, color: "#374151", margin: "8px 0 0", lineHeight: 1.5, whiteSpace: "pre-wrap" },
  addNoteWrap:  { marginTop: 16 },
  card:         { background: "#fff", border: "1px solid #E5E7EB", borderRadius: 10, padding: 16 },
  cardTitle:    { fontSize: 14, fontWeight: 700, color: "#111827", margin: 0 },
  fileRow:      { display: "flex", alignItems: "flex-start", gap: 8 },
  fileLink:     { background: "none", border: "none", cursor: "pointer", color: "#3B82F6", fontSize: 13, padding: 0, textAlign: "left", fontFamily: "inherit", textDecoration: "underline", wordBreak: "break-all" },
  primaryBtn:   { padding: "8px 16px", background: "#111827", color: "#fff", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer" },
  secondaryBtn: { padding: "8px 16px", background: "#fff", color: "#374151", border: "1px solid #D1D5DB", borderRadius: 6, fontSize: 13, cursor: "pointer" },
  cancelBtn:    { padding: "8px 16px", background: "#fff", color: "#374151", border: "1px solid #D1D5DB", borderRadius: 6, fontSize: 13, cursor: "pointer" },
  linkBtn:      { background: "none", border: "none", cursor: "pointer", color: "#3B82F6", fontSize: 13, fontWeight: 600, padding: 0 },
  errorMsg:     { color: "#B91C1C", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 6, padding: "10px 14px", fontSize: 13, marginBottom: 12 },
  input:        { padding: "8px 10px", border: "1px solid #D1D5DB", borderRadius: 6, fontSize: 14, outline: "none", fontFamily: "inherit", width: "100%" },
};
