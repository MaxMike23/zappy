import { useState, useEffect } from "react";
import { workflowApi } from "@/api/workflow";
import Spinner from "@/components/ui/Spinner";
import Modal from "@/components/ui/Modal";

const MODULES    = ["project", "work_order"];
const MODULE_LABEL = { project: "Project", work_order: "Work Order" };
const FIELD_TYPES = [
  { value: "text",         label: "Text" },
  { value: "textarea",     label: "Text Area" },
  { value: "number",       label: "Number" },
  { value: "date",         label: "Date" },
  { value: "checkbox",     label: "Checkbox (yes/no)" },
  { value: "select",       label: "Select (single)" },
  { value: "multi_select", label: "Select (multi)" },
  { value: "checklist",    label: "Checklist" },
  { value: "url",          label: "URL" },
];
const COLORS = ["#6B7280", "#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899", "#14B8A6"];

const ADMIN_ROLES = ["company_admin", "superadmin"];

export default function WorkflowPage() {
  const [tab, setTab]       = useState("stages"); // "stages" | "fields"
  const [module, setModule] = useState("project");

  return (
    <div>
      <div style={styles.header}>
        <h1 style={styles.title}>Workflow Configuration</h1>
        <p style={styles.subtitle}>Manage stages and custom fields for projects and work orders.</p>
      </div>

      {/* Tab bar */}
      <div style={styles.tabBar}>
        {["stages", "fields"].map((t) => (
          <button
            key={t}
            style={{ ...styles.tab, ...(tab === t ? styles.tabActive : {}) }}
            onClick={() => setTab(t)}
          >
            {t === "stages" ? "Stages" : "Custom Fields"}
          </button>
        ))}
      </div>

      {/* Module switcher */}
      <div style={styles.moduleBar}>
        {MODULES.map((m) => (
          <button
            key={m}
            style={{ ...styles.moduleBtn, ...(module === m ? styles.moduleBtnActive : {}) }}
            onClick={() => setModule(m)}
          >
            {MODULE_LABEL[m]}
          </button>
        ))}
      </div>

      {tab === "stages"
        ? <StagesPanel module={module} key={`stages-${module}`} />
        : <FieldsPanel module={module} key={`fields-${module}`} />
      }
    </div>
  );
}

/* ─── STAGES PANEL ─────────────────────────────────────────────────────────── */

function StagesPanel({ module }) {
  const [stages, setStages]           = useState([]);
  const [loading, setLoading]         = useState(true);
  const [showModal, setShowModal]     = useState(false);
  const [editTarget, setEditTarget]   = useState(null); // null = create, object = edit
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    setLoading(true);
    workflowApi.listStages(module)
      .then((res) => setStages(res.data.stages))
      .finally(() => setLoading(false));
  }, [module]);

  const openCreate = () => { setEditTarget(null); setShowModal(true); };
  const openEdit   = (s) => { setEditTarget(s);   setShowModal(true); };

  const handleSave = (stage) => {
    setStages((prev) => {
      const idx = prev.findIndex((s) => s.id === stage.id);
      if (idx === -1) return [...prev, stage].sort((a, b) => a.sort_order - b.sort_order);
      const next = [...prev];
      next[idx] = stage;
      return next;
    });
    setShowModal(false);
  };

  const handleDelete = async (stageId) => {
    setDeleteError("");
    try {
      await workflowApi.deleteStage(stageId);
      setStages((prev) => prev.filter((s) => s.id !== stageId));
    } catch (err) {
      const msg = err.response?.data?.error || "Delete failed.";
      setDeleteError(msg);
    }
  };

  const move = async (idx, dir) => {
    const next = [...stages];
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= next.length) return;
    [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
    setStages(next);
    try {
      await workflowApi.reorderStages(module, next.map((s) => s.id));
    } catch {/* revert on next load */}
  };

  if (loading) return <div style={{ padding: 32, display: "flex", justifyContent: "center" }}><Spinner size={24} /></div>;

  return (
    <div style={styles.panel}>
      <div style={styles.panelHeader}>
        <span style={styles.panelCount}>{stages.length} stage{stages.length !== 1 ? "s" : ""}</span>
        <button style={styles.primaryBtn} onClick={openCreate}>+ Add Stage</button>
      </div>

      {deleteError && <div style={styles.errorMsg}>{deleteError}</div>}

      {stages.length === 0 ? (
        <p style={styles.empty}>No stages defined for {MODULE_LABEL[module].toLowerCase()}s yet.</p>
      ) : (
        <div style={styles.list}>
          {stages.map((s, idx) => (
            <div key={s.id} style={styles.row}>
              {/* Color dot + name */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
                <span style={{ width: 12, height: 12, borderRadius: "50%", background: s.color, flexShrink: 0 }} />
                <span style={styles.stageName}>{s.name}</span>
                <span style={{ fontSize: 11, color: "#9CA3AF" }}>{s.slug}</span>
              </div>
              {/* Flags */}
              <div style={{ display: "flex", gap: 6, flexShrink: 0, flexWrap: "wrap" }}>
                {s.is_terminal && (
                  <span style={{ ...styles.flag, background: s.is_success ? "#D1FAE5" : "#FEE2E2", color: s.is_success ? "#065F46" : "#991B1B" }}>
                    {s.is_success ? "success" : "terminal"}
                  </span>
                )}
              </div>
              {/* Controls */}
              <div style={styles.rowActions}>
                <button style={styles.arrowBtn} onClick={() => move(idx, -1)} disabled={idx === 0} title="Move up">↑</button>
                <button style={styles.arrowBtn} onClick={() => move(idx, 1)} disabled={idx === stages.length - 1} title="Move down">↓</button>
                <button style={styles.editBtn} onClick={() => openEdit(s)}>Edit</button>
                <button style={styles.deleteBtn} onClick={() => handleDelete(s.id)}>✕</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <StageModal
          module={module}
          stage={editTarget}
          onSave={handleSave}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}

function StageModal({ module, stage, onSave, onClose }) {
  const isEdit = !!stage;
  const [form, setForm] = useState({
    name:               stage?.name        ?? "",
    color:              stage?.color       ?? "#6B7280",
    is_terminal:        stage?.is_terminal ?? false,
    is_success:         stage?.is_success  ?? false,
    min_files:          stage?.stage_requirements?.min_files ?? "",
    required_fields:    (stage?.stage_requirements?.required_field_keys ?? []).join(", "),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSaving(true);

    const stage_requirements = {};
    if (form.min_files !== "" && form.min_files !== null) {
      const n = parseInt(form.min_files, 10);
      if (!isNaN(n) && n > 0) stage_requirements.min_files = n;
    }
    const keys = form.required_fields.split(",").map((k) => k.trim()).filter(Boolean);
    if (keys.length) stage_requirements.required_field_keys = keys;

    const payload = {
      name: form.name.trim(),
      color: form.color,
      is_terminal: form.is_terminal,
      is_success: form.is_terminal ? form.is_success : false,
      stage_requirements: Object.keys(stage_requirements).length ? stage_requirements : null,
    };
    if (!isEdit) payload.module = module;

    try {
      const res = isEdit
        ? await workflowApi.updateStage(stage.id, payload)
        : await workflowApi.createStage(payload);
      onSave(isEdit ? res.data.stage : res.data.stage);
    } catch (err) {
      setError(err.response?.data?.error || "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={isEdit ? "Edit Stage" : "New Stage"} onClose={onClose}>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {error && <div style={styles.errorMsg}>{error}</div>}

        <ModalField label="Name" required>
          <input style={styles.input} required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. In Progress" />
        </ModalField>

        <ModalField label="Color">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setForm({ ...form, color: c })}
                style={{
                  width: 24, height: 24, borderRadius: "50%", background: c, border: "none", cursor: "pointer",
                  outline: form.color === c ? `3px solid ${c}` : "none",
                  outlineOffset: 2,
                }}
              />
            ))}
            <input
              type="color"
              value={form.color}
              onChange={(e) => setForm({ ...form, color: e.target.value })}
              style={{ width: 32, height: 28, border: "1px solid #D1D5DB", borderRadius: 4, cursor: "pointer", padding: 2 }}
              title="Custom color"
            />
          </div>
        </ModalField>

        <ModalField label="Flags">
          <label style={checkLabel}>
            <input type="checkbox" checked={form.is_terminal} onChange={(e) => setForm({ ...form, is_terminal: e.target.checked, is_success: e.target.checked ? form.is_success : false })} />
            Terminal stage (end of workflow)
          </label>
          {form.is_terminal && (
            <label style={{ ...checkLabel, marginTop: 6 }}>
              <input type="checkbox" checked={form.is_success} onChange={(e) => setForm({ ...form, is_success: e.target.checked })} />
              Mark as success (vs. cancelled/failed)
            </label>
          )}
        </ModalField>

        <ModalField label="Stage Requirements" hint="Optional gates before a record can enter this stage">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <label style={{ fontSize: 13, color: "#374151", whiteSpace: "nowrap" }}>Min files:</label>
              <input
                type="number"
                min="0"
                style={{ ...styles.input, width: 80 }}
                value={form.min_files}
                onChange={(e) => setForm({ ...form, min_files: e.target.value })}
                placeholder="0"
              />
            </div>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
              <label style={{ fontSize: 13, color: "#374151", whiteSpace: "nowrap", paddingTop: 8 }}>Required field keys:</label>
              <input
                style={styles.input}
                value={form.required_fields}
                onChange={(e) => setForm({ ...form, required_fields: e.target.value })}
                placeholder="e.g. cable_label, rack_photo (comma-separated)"
              />
            </div>
          </div>
        </ModalField>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
          <button type="button" style={styles.cancelBtn} onClick={onClose}>Cancel</button>
          <button type="submit" style={styles.primaryBtn} disabled={saving}>{saving ? "Saving…" : isEdit ? "Save Changes" : "Create Stage"}</button>
        </div>
      </form>
    </Modal>
  );
}

/* ─── FIELDS PANEL ─────────────────────────────────────────────────────────── */

function FieldsPanel({ module }) {
  const [fields, setFields]           = useState([]);
  const [loading, setLoading]         = useState(true);
  const [showModal, setShowModal]     = useState(false);
  const [editTarget, setEditTarget]   = useState(null);
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    setLoading(true);
    workflowApi.listFields(module)
      .then((res) => setFields(res.data.fields))
      .finally(() => setLoading(false));
  }, [module]);

  const openCreate = () => { setEditTarget(null); setShowModal(true); };
  const openEdit   = (f) => { setEditTarget(f);   setShowModal(true); };

  const handleSave = (field) => {
    setFields((prev) => {
      const idx = prev.findIndex((f) => f.id === field.id);
      if (idx === -1) return [...prev, field].sort((a, b) => a.sort_order - b.sort_order);
      const next = [...prev];
      next[idx] = field;
      return next;
    });
    setShowModal(false);
  };

  const handleDelete = async (fieldId) => {
    setDeleteError("");
    try {
      await workflowApi.deleteField(fieldId);
      setFields((prev) => prev.filter((f) => f.id !== fieldId));
    } catch (err) {
      setDeleteError(err.response?.data?.error || "Delete failed.");
    }
  };

  if (loading) return <div style={{ padding: 32, display: "flex", justifyContent: "center" }}><Spinner size={24} /></div>;

  return (
    <div style={styles.panel}>
      <div style={styles.panelHeader}>
        <span style={styles.panelCount}>{fields.length} field{fields.length !== 1 ? "s" : ""}</span>
        <button style={styles.primaryBtn} onClick={openCreate}>+ Add Field</button>
      </div>

      {deleteError && <div style={styles.errorMsg}>{deleteError}</div>}

      {fields.length === 0 ? (
        <p style={styles.empty}>No custom fields defined for {MODULE_LABEL[module].toLowerCase()}s yet.</p>
      ) : (
        <div style={styles.list}>
          {/* Header row */}
          <div style={{ ...styles.row, background: "#F9FAFB", fontWeight: 600, fontSize: 12, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            <div style={{ flex: 1 }}>Label / Key</div>
            <div style={{ width: 120 }}>Type</div>
            <div style={{ width: 70 }}>Required</div>
            <div style={{ width: 100 }} />
          </div>
          {fields.map((f) => (
            <div key={f.id} style={styles.row}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>{f.field_label}</span>
                <span style={{ fontSize: 11, color: "#9CA3AF", marginLeft: 8 }}>{f.field_key}</span>
              </div>
              <div style={{ width: 120, fontSize: 13, color: "#374151" }}>{fieldTypeLabel(f.field_type)}</div>
              <div style={{ width: 70, fontSize: 13, color: f.is_required ? "#111827" : "#9CA3AF" }}>
                {f.is_required ? "Yes" : "No"}
              </div>
              <div style={{ ...styles.rowActions, width: 100 }}>
                <button style={styles.editBtn} onClick={() => openEdit(f)}>Edit</button>
                <button style={styles.deleteBtn} onClick={() => handleDelete(f.id)}>✕</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <FieldModal
          module={module}
          field={editTarget}
          onSave={handleSave}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}

function FieldModal({ module, field, onSave, onClose }) {
  const isEdit = !!field;
  const [form, setForm] = useState({
    field_label: field?.field_label ?? "",
    field_type:  field?.field_type  ?? "text",
    is_required: field?.is_required ?? false,
    // SELECT/MULTI_SELECT: options as newline-separated string
    options:     (field?.field_config?.options ?? []).join("\n"),
    // NUMBER: unit
    unit:        field?.field_config?.unit ?? "",
    // CHECKLIST: items as newline-separated string
    items:       (field?.field_config?.items ?? []).join("\n"),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState("");

  const buildFieldConfig = () => {
    if (form.field_type === "select" || form.field_type === "multi_select") {
      const options = form.options.split("\n").map((o) => o.trim()).filter(Boolean);
      return options.length ? { options } : null;
    }
    if (form.field_type === "number") {
      return form.unit.trim() ? { unit: form.unit.trim() } : null;
    }
    if (form.field_type === "checklist") {
      const items = form.items.split("\n").map((i) => i.trim()).filter(Boolean);
      return items.length ? { items } : null;
    }
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSaving(true);

    const field_config = buildFieldConfig();
    const payload = isEdit
      ? { field_label: form.field_label.trim(), is_required: form.is_required, field_config }
      : { field_label: form.field_label.trim(), field_type: form.field_type, is_required: form.is_required, field_config, module };

    try {
      const res = isEdit
        ? await workflowApi.updateField(field.id, payload)
        : await workflowApi.createField(payload);
      onSave(res.data.field);
    } catch (err) {
      setError(err.response?.data?.error || "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const needsOptions   = form.field_type === "select" || form.field_type === "multi_select";
  const needsUnit      = form.field_type === "number";
  const needsItems     = form.field_type === "checklist";

  return (
    <Modal title={isEdit ? "Edit Field" : "New Custom Field"} onClose={onClose}>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {error && <div style={styles.errorMsg}>{error}</div>}

        <ModalField label="Label" required>
          <input style={styles.input} required value={form.field_label} onChange={(e) => setForm({ ...form, field_label: e.target.value })} placeholder="e.g. Cable Label Photo" />
        </ModalField>

        <ModalField label="Type" required>
          {isEdit ? (
            <div style={{ fontSize: 14, color: "#374151", padding: "8px 10px", background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 6 }}>
              {fieldTypeLabel(form.field_type)} <span style={{ fontSize: 12, color: "#9CA3AF" }}>(cannot change type after creation)</span>
            </div>
          ) : (
            <select
              style={styles.input}
              value={form.field_type}
              onChange={(e) => setForm({ ...form, field_type: e.target.value })}
            >
              {FIELD_TYPES.map((ft) => (
                <option key={ft.value} value={ft.value}>{ft.label}</option>
              ))}
            </select>
          )}
        </ModalField>

        {needsOptions && (
          <ModalField label="Options" hint="One option per line" required>
            <textarea
              style={{ ...styles.input, resize: "vertical", fontFamily: "inherit" }}
              rows={5}
              value={form.options}
              onChange={(e) => setForm({ ...form, options: e.target.value })}
              placeholder={"Option A\nOption B\nOption C"}
            />
          </ModalField>
        )}

        {needsUnit && (
          <ModalField label="Unit" hint="Optional, e.g. ft, lbs, V">
            <input style={styles.input} value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="e.g. ft" />
          </ModalField>
        )}

        {needsItems && (
          <ModalField label="Checklist Items" hint="One item per line" required>
            <textarea
              style={{ ...styles.input, resize: "vertical", fontFamily: "inherit" }}
              rows={5}
              value={form.items}
              onChange={(e) => setForm({ ...form, items: e.target.value })}
              placeholder={"Label all cables\nTest signal path\nPower cycle rack"}
            />
          </ModalField>
        )}

        <ModalField label="Required">
          <label style={checkLabel}>
            <input type="checkbox" checked={form.is_required} onChange={(e) => setForm({ ...form, is_required: e.target.checked })} />
            This field is required
          </label>
        </ModalField>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
          <button type="button" style={styles.cancelBtn} onClick={onClose}>Cancel</button>
          <button type="submit" style={styles.primaryBtn} disabled={saving}>{saving ? "Saving…" : isEdit ? "Save Changes" : "Create Field"}</button>
        </div>
      </form>
    </Modal>
  );
}

/* ─── SHARED HELPERS ────────────────────────────────────────────────────────── */

function ModalField({ label, required, hint, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label style={{ fontSize: 13, fontWeight: 500, color: "#374151" }}>
        {label}{required && <span style={{ color: "#EF4444" }}> *</span>}
        {hint && <span style={{ fontSize: 11, color: "#9CA3AF", fontWeight: 400, marginLeft: 6 }}>— {hint}</span>}
      </label>
      {children}
    </div>
  );
}

function fieldTypeLabel(type) {
  return FIELD_TYPES.find((ft) => ft.value === type)?.label ?? type;
}

const checkLabel = { display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#374151", cursor: "pointer" };

/* ─── STYLES ────────────────────────────────────────────────────────────────── */

const styles = {
  header:      { marginBottom: 24 },
  title:       { fontSize: 22, fontWeight: 700, color: "#111827", margin: "0 0 4px" },
  subtitle:    { fontSize: 14, color: "#6B7280", margin: 0 },
  tabBar:      { display: "flex", gap: 4, borderBottom: "2px solid #E5E7EB", marginBottom: 20 },
  tab: {
    padding: "8px 18px", background: "none", border: "none", cursor: "pointer",
    fontSize: 14, fontWeight: 500, color: "#6B7280", borderBottom: "2px solid transparent",
    marginBottom: -2,
  },
  tabActive:   { color: "#111827", borderBottomColor: "#111827" },
  moduleBar:   { display: "flex", gap: 8, marginBottom: 20 },
  moduleBtn: {
    padding: "6px 14px", background: "#F3F4F6", border: "1px solid #E5E7EB",
    borderRadius: 20, cursor: "pointer", fontSize: 13, color: "#374151",
  },
  moduleBtnActive: { background: "#111827", color: "#fff", borderColor: "#111827" },
  panel:       { background: "#fff", border: "1px solid #E5E7EB", borderRadius: 10, overflow: "hidden" },
  panelHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid #E5E7EB" },
  panelCount:  { fontSize: 13, color: "#6B7280" },
  list:        { display: "flex", flexDirection: "column" },
  row: {
    display: "flex", alignItems: "center", gap: 12,
    padding: "12px 16px", borderBottom: "1px solid #F3F4F6",
  },
  stageName:   { fontSize: 14, fontWeight: 600, color: "#111827" },
  flag: {
    fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em",
    padding: "2px 6px", borderRadius: 4,
  },
  rowActions:  { display: "flex", alignItems: "center", gap: 6, flexShrink: 0 },
  arrowBtn: {
    background: "none", border: "1px solid #E5E7EB", borderRadius: 4, cursor: "pointer",
    color: "#6B7280", fontSize: 13, padding: "2px 6px", lineHeight: 1,
  },
  editBtn: {
    padding: "4px 10px", background: "#fff", border: "1px solid #D1D5DB",
    borderRadius: 5, cursor: "pointer", fontSize: 12, color: "#374151",
  },
  deleteBtn: {
    background: "none", border: "none", cursor: "pointer", color: "#9CA3AF",
    fontSize: 13, padding: "2px 6px",
  },
  empty:       { padding: "24px 16px", fontSize: 14, color: "#9CA3AF", margin: 0 },
  primaryBtn:  { padding: "8px 16px", background: "#111827", color: "#fff", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer" },
  cancelBtn:   { padding: "8px 16px", background: "#fff", color: "#374151", border: "1px solid #D1D5DB", borderRadius: 6, fontSize: 13, cursor: "pointer" },
  input: {
    padding: "8px 10px", border: "1px solid #D1D5DB", borderRadius: 6,
    fontSize: 14, outline: "none", fontFamily: "inherit", width: "100%",
  },
  errorMsg:    { color: "#B91C1C", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 6, padding: "10px 14px", fontSize: 13, margin: "0 16px 0" },
};
