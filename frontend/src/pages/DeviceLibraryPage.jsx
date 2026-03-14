import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/auth/AuthContext";
import { devicesApi } from "@/api/devices";

const CATEGORIES = [
  { value: "display",          label: "Display" },
  { value: "processor",        label: "Processor / Scaler" },
  { value: "matrix_switcher",  label: "Matrix Switcher" },
  { value: "amplifier",        label: "Amplifier" },
  { value: "camera",           label: "Camera" },
  { value: "dsp",              label: "DSP / Audio Processor" },
  { value: "control_processor",label: "Control Processor" },
  { value: "network_switch",   label: "Network Switch" },
  { value: "other",            label: "Other" },
];

const SIGNAL_TYPES = [
  "Video", "Audio", "Control", "Network", "Power",
  "Data", "Security", "Access Control", "Fire", "Other",
];

const CONNECTOR_TYPES = [
  "HDMI", "SDI", "DisplayPort", "RS232", "RS485", "XLR", "TRS", "TS",
  "RCA", "Dante", "AES67", "Cat6", "Fiber", "Relay", "IR", "USB",
  "Wiegand", "OSDP", "RS485 2-Wire", "Dry Contact", "NAC Circuit", "SLC", "Other",
];

const EMPTY_FORM = {
  make: "", model: "", category: "other", notes: "", ports: [],
};

function newPort(direction) {
  return {
    id: crypto.randomUUID(),
    label: "",
    direction,
    signal_type: "Video",
    connector_type: "",
  };
}

export default function DeviceLibraryPage() {
  const { user } = useAuth();
  const isSuperadmin = user?.role === "superadmin";
  const canWrite = ["company_admin", "manager", "superadmin"].includes(user?.role);

  const [devices, setDevices]   = useState([]);
  const [pending, setPending]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing]   = useState(null);   // DeviceTemplate or null
  const [form, setForm]         = useState(EMPTY_FORM);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [devRes, pendRes] = await Promise.all([
        devicesApi.list(),
        isSuperadmin ? devicesApi.listPending() : Promise.resolve({ data: { devices: [] } }),
      ]);
      setDevices(devRes.data.devices);
      setPending(pendRes.data.devices);
    } finally {
      setLoading(false);
    }
  }, [isSuperadmin]);

  useEffect(() => { load(); }, [load]);

  // ── Filter ──────────────────────────────────────────────────────────────────

  const filtered = devices.filter((d) => {
    const term = search.toLowerCase();
    const matchSearch = !term || (
      d.make.toLowerCase().includes(term) ||
      d.model.toLowerCase().includes(term) ||
      (d.category_label || "").toLowerCase().includes(term)
    );
    const matchCat = !catFilter || d.category === catFilter;
    return matchSearch && matchCat;
  });

  // ── Modal helpers ────────────────────────────────────────────────────────────

  function openAdd() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setError("");
    setModalOpen(true);
  }

  function openEdit(device) {
    setEditing(device);
    setForm({
      make: device.make,
      model: device.model,
      category: device.category,
      notes: device.notes || "",
      ports: device.ports.map((p) => ({ ...p })),
    });
    setError("");
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditing(null);
    setForm(EMPTY_FORM);
    setError("");
  }

  // ── Port helpers ─────────────────────────────────────────────────────────────

  function addPort(direction) {
    setForm((f) => ({ ...f, ports: [...f.ports, newPort(direction)] }));
  }

  function updatePort(id, field, value) {
    setForm((f) => ({
      ...f,
      ports: f.ports.map((p) => p.id === id ? { ...p, [field]: value } : p),
    }));
  }

  function removePort(id) {
    setForm((f) => ({ ...f, ports: f.ports.filter((p) => p.id !== id) }));
  }

  // ── Save ─────────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!form.make.trim() || !form.model.trim()) {
      setError("Make and model are required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (editing) {
        await devicesApi.update(editing.id, form);
      } else {
        await devicesApi.create(form);
      }
      closeModal();
      load();
    } catch (e) {
      setError(e.response?.data?.error || "Failed to save device.");
    } finally {
      setSaving(false);
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────────

  async function handleDelete(device) {
    if (!confirm(`Delete ${device.make} ${device.model}?`)) return;
    try {
      await devicesApi.delete(device.id);
      load();
    } catch (e) {
      alert(e.response?.data?.error || "Failed to delete.");
    }
  }

  // ── Submit for global library ─────────────────────────────────────────────────

  async function handleSubmit(device) {
    if (!confirm(`Submit "${device.make} ${device.model}" for global library review?`)) return;
    try {
      await devicesApi.submit(device.id);
      load();
    } catch (e) {
      alert(e.response?.data?.error || "Failed to submit.");
    }
  }

  // ── Approve / Reject (superadmin) ─────────────────────────────────────────────

  async function handleApprove(device) {
    try {
      await devicesApi.approve(device.id);
      load();
    } catch (e) {
      alert(e.response?.data?.error || "Failed to approve.");
    }
  }

  async function handleReject(device) {
    if (!confirm(`Reject "${device.make} ${device.model}" and return to private?`)) return;
    try {
      await devicesApi.reject(device.id);
      load();
    } catch (e) {
      alert(e.response?.data?.error || "Failed to reject.");
    }
  }

  // ── Port counts ───────────────────────────────────────────────────────────────

  function portSummary(ports) {
    const ins  = ports.filter((p) => p.direction === "input").length;
    const outs = ports.filter((p) => p.direction === "output").length;
    if (!ins && !outs) return <span style={{ color: "#9CA3AF" }}>—</span>;
    return `${ins} in / ${outs} out`;
  }

  // ── Badge ──────────────────────────────────────────────────────────────────────

  function ScopeBadge({ device }) {
    if (device.is_pending) return <span style={styles.badgePending}>Pending</span>;
    if (device.is_global)  return <span style={styles.badgeGlobal}>Global</span>;
    return <span style={styles.badgePrivate}>Private</span>;
  }

  // ── Can edit/delete this device? ──────────────────────────────────────────────

  function canEdit(device) {
    if (isSuperadmin) return true;
    if (!canWrite) return false;
    // Company users can only edit their own private templates
    return device.company_id === user?.company_id && !device.is_global;
  }

  // ── Input Ports / Output Ports in modal ───────────────────────────────────────

  const inputPorts  = form.ports.filter((p) => p.direction === "input");
  const outputPorts = form.ports.filter((p) => p.direction === "output");

  const isReadOnlyModal = editing && editing.is_global && !isSuperadmin;

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Device Library</h1>
          <p style={styles.subtitle}>Global and company-private device templates</p>
        </div>
        {canWrite && (
          <button style={styles.addBtn} onClick={openAdd}>+ Add Device</button>
        )}
      </div>

      {/* Pending submissions (superadmin only) */}
      {isSuperadmin && pending.length > 0 && (
        <div style={styles.pendingSection}>
          <h2 style={styles.pendingTitle}>Pending Submissions ({pending.length})</h2>
          <table style={styles.table}>
            <thead>
              <tr>
                {["Make", "Model", "Category", "Ports", "Actions"].map((h) => (
                  <th key={h} style={styles.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pending.map((d) => (
                <tr key={d.id} style={styles.tr}>
                  <td style={styles.td}>{d.make}</td>
                  <td style={styles.td}>{d.model}</td>
                  <td style={styles.td}>{d.category_label}</td>
                  <td style={styles.td}>{portSummary(d.ports)}</td>
                  <td style={styles.td}>
                    <div style={styles.actions}>
                      <button style={styles.approveBtn} onClick={() => handleApprove(d)}>Approve</button>
                      <button style={styles.rejectBtn}  onClick={() => handleReject(d)}>Reject</button>
                      <button style={styles.editBtn}    onClick={() => openEdit(d)}>Edit</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Filter bar */}
      <div style={styles.filterBar}>
        <input
          style={styles.searchInput}
          placeholder="Search make, model, category..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          style={styles.catSelect}
          value={catFilter}
          onChange={(e) => setCatFilter(e.target.value)}
        >
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </div>

      {/* Device table */}
      {loading ? (
        <p style={{ color: "#6B7280", fontSize: 14 }}>Loading...</p>
      ) : filtered.length === 0 ? (
        <div style={styles.empty}>
          {devices.length === 0
            ? "No devices yet. Add your first device to get started."
            : "No devices match your search."}
        </div>
      ) : (
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                {["Make", "Model", "Category", "Ports", "Scope", "Actions"].map((h) => (
                  <th key={h} style={styles.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((d) => (
                <tr key={d.id} style={styles.tr}>
                  <td style={{ ...styles.td, fontWeight: 600 }}>{d.make}</td>
                  <td style={styles.td}>{d.model}</td>
                  <td style={styles.td}>{d.category_label}</td>
                  <td style={styles.td}>{portSummary(d.ports)}</td>
                  <td style={styles.td}><ScopeBadge device={d} /></td>
                  <td style={styles.td}>
                    <div style={styles.actions}>
                      <button style={styles.viewBtn} onClick={() => openEdit(d)}>
                        {canEdit(d) ? "Edit" : "View"}
                      </button>
                      {canEdit(d) && (
                        <button style={styles.deleteBtn} onClick={() => handleDelete(d)}>Delete</button>
                      )}
                      {canWrite && d.company_id && !d.is_global && !d.is_pending && (
                        <button style={styles.submitBtn} onClick={() => handleSubmit(d)}>
                          Submit Global
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <div style={styles.overlay} onClick={closeModal}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>
                {isReadOnlyModal ? "View Device" : editing ? "Edit Device" : "Add Device"}
              </h2>
              <button style={styles.closeBtn} onClick={closeModal}>✕</button>
            </div>

            <div style={styles.modalBody}>
              {/* Identity */}
              <div style={styles.row}>
                <div style={styles.field}>
                  <label style={styles.label}>Make *</label>
                  <input
                    style={styles.input}
                    value={form.make}
                    onChange={(e) => setForm((f) => ({ ...f, make: e.target.value }))}
                    disabled={isReadOnlyModal}
                    placeholder="e.g. Samsung"
                  />
                </div>
                <div style={styles.field}>
                  <label style={styles.label}>Model *</label>
                  <input
                    style={styles.input}
                    value={form.model}
                    onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
                    disabled={isReadOnlyModal}
                    placeholder="e.g. QN85B"
                  />
                </div>
              </div>

              <div style={styles.field}>
                <label style={styles.label}>Category</label>
                <select
                  style={styles.input}
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  disabled={isReadOnlyModal}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>

              <div style={styles.field}>
                <label style={styles.label}>Notes</label>
                <textarea
                  style={{ ...styles.input, height: 60, resize: "vertical" }}
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  disabled={isReadOnlyModal}
                  placeholder="Optional notes about this device"
                />
              </div>

              {/* Ports */}
              <div style={styles.portsSection}>
                <PortList
                  title="Input Ports"
                  ports={inputPorts}
                  direction="input"
                  readOnly={isReadOnlyModal}
                  onAdd={() => addPort("input")}
                  onUpdate={updatePort}
                  onRemove={removePort}
                />
                <PortList
                  title="Output Ports"
                  ports={outputPorts}
                  direction="output"
                  readOnly={isReadOnlyModal}
                  onAdd={() => addPort("output")}
                  onUpdate={updatePort}
                  onRemove={removePort}
                />
              </div>

              {error && <p style={styles.errorMsg}>{error}</p>}
            </div>

            {!isReadOnlyModal && (
              <div style={styles.modalFooter}>
                <button style={styles.cancelBtn} onClick={closeModal}>Cancel</button>
                <button style={styles.saveBtn} onClick={handleSave} disabled={saving}>
                  {saving ? "Saving..." : editing ? "Save Changes" : "Add Device"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── PortList sub-component ────────────────────────────────────────────────────

function PortList({ title, ports, direction, readOnly, onAdd, onUpdate, onRemove }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>{title}</span>
        {!readOnly && (
          <button style={portStyles.addPortBtn} onClick={onAdd}>+ Add</button>
        )}
      </div>

      {ports.length === 0 && (
        <p style={{ fontSize: 12, color: "#9CA3AF", margin: "4px 0 0" }}>
          {readOnly ? "None defined." : `No ${direction} ports yet.`}
        </p>
      )}

      {ports.map((port) => (
        <div key={port.id} style={portStyles.portRow}>
          <input
            style={portStyles.labelInput}
            placeholder="Label (e.g. HDMI In 1)"
            value={port.label}
            onChange={(e) => onUpdate(port.id, "label", e.target.value)}
            disabled={readOnly}
          />
          <select
            style={portStyles.select}
            value={port.signal_type}
            onChange={(e) => onUpdate(port.id, "signal_type", e.target.value)}
            disabled={readOnly}
          >
            {SIGNAL_TYPES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select
            style={portStyles.select}
            value={port.connector_type || ""}
            onChange={(e) => onUpdate(port.id, "connector_type", e.target.value)}
            disabled={readOnly}
          >
            <option value="">Connector (optional)</option>
            {CONNECTOR_TYPES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          {!readOnly && (
            <button style={portStyles.removeBtn} onClick={() => onRemove(port.id)}>✕</button>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = {
  page: { padding: "24px 28px", maxWidth: 1100, margin: "0 auto" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 },
  title: { fontSize: 22, fontWeight: 700, color: "#111827", margin: 0 },
  subtitle: { fontSize: 13, color: "#6B7280", marginTop: 4 },
  addBtn: {
    background: "#2563EB", color: "#fff", border: "none", borderRadius: 6,
    padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer",
  },

  // Pending section
  pendingSection: {
    background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 8,
    padding: "16px 20px", marginBottom: 24,
  },
  pendingTitle: { fontSize: 14, fontWeight: 700, color: "#92400E", margin: "0 0 12px" },

  // Filter bar
  filterBar: { display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" },
  searchInput: {
    flex: 1, minWidth: 200, padding: "8px 12px", border: "1px solid #D1D5DB",
    borderRadius: 6, fontSize: 13, outline: "none",
  },
  catSelect: {
    padding: "8px 12px", border: "1px solid #D1D5DB", borderRadius: 6,
    fontSize: 13, background: "#fff", cursor: "pointer",
  },

  // Table
  tableWrap: { overflowX: "auto" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: {
    textAlign: "left", padding: "10px 12px", borderBottom: "2px solid #E5E7EB",
    color: "#6B7280", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap",
  },
  tr: { borderBottom: "1px solid #F3F4F6" },
  td: { padding: "10px 12px", color: "#374151", verticalAlign: "middle" },

  // Actions
  actions: { display: "flex", gap: 6, flexWrap: "wrap" },
  viewBtn: {
    padding: "4px 10px", fontSize: 12, border: "1px solid #D1D5DB",
    borderRadius: 4, background: "#fff", cursor: "pointer", color: "#374151",
  },
  editBtn: {
    padding: "4px 10px", fontSize: 12, border: "1px solid #D1D5DB",
    borderRadius: 4, background: "#fff", cursor: "pointer", color: "#374151",
  },
  deleteBtn: {
    padding: "4px 10px", fontSize: 12, border: "1px solid #FCA5A5",
    borderRadius: 4, background: "#FEF2F2", cursor: "pointer", color: "#DC2626",
  },
  submitBtn: {
    padding: "4px 10px", fontSize: 12, border: "1px solid #93C5FD",
    borderRadius: 4, background: "#EFF6FF", cursor: "pointer", color: "#1D4ED8",
  },
  approveBtn: {
    padding: "4px 10px", fontSize: 12, border: "none",
    borderRadius: 4, background: "#D1FAE5", cursor: "pointer", color: "#065F46", fontWeight: 600,
  },
  rejectBtn: {
    padding: "4px 10px", fontSize: 12, border: "none",
    borderRadius: 4, background: "#FEE2E2", cursor: "pointer", color: "#991B1B", fontWeight: 600,
  },

  // Badges
  badgeGlobal: {
    fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 999,
    background: "#DBEAFE", color: "#1D4ED8",
  },
  badgePrivate: {
    fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 999,
    background: "#F3F4F6", color: "#374151",
  },
  badgePending: {
    fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 999,
    background: "#FEF3C7", color: "#92400E",
  },

  empty: {
    padding: "40px 0", textAlign: "center", color: "#9CA3AF", fontSize: 14,
    border: "1px dashed #E5E7EB", borderRadius: 8,
  },

  // Modal
  overlay: {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
    display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
    padding: 16,
  },
  modal: {
    background: "#fff", borderRadius: 10, width: "100%", maxWidth: 720,
    maxHeight: "90vh", display: "flex", flexDirection: "column",
    boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
  },
  modalHeader: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "18px 24px", borderBottom: "1px solid #E5E7EB",
  },
  modalTitle: { fontSize: 16, fontWeight: 700, color: "#111827", margin: 0 },
  closeBtn: { background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "#6B7280" },
  modalBody: { padding: "20px 24px", overflowY: "auto", flex: 1 },
  modalFooter: {
    padding: "16px 24px", borderTop: "1px solid #E5E7EB",
    display: "flex", justifyContent: "flex-end", gap: 10,
  },

  // Form
  row: { display: "flex", gap: 16, marginBottom: 14, flexWrap: "wrap" },
  field: { display: "flex", flexDirection: "column", gap: 5, flex: 1, minWidth: 200, marginBottom: 14 },
  label: { fontSize: 12, fontWeight: 600, color: "#374151" },
  input: {
    padding: "8px 10px", border: "1px solid #D1D5DB", borderRadius: 6,
    fontSize: 13, color: "#111827", background: "#fff", width: "100%", boxSizing: "border-box",
  },
  portsSection: { marginTop: 8, borderTop: "1px solid #E5E7EB", paddingTop: 14 },
  errorMsg: { color: "#DC2626", fontSize: 13, marginTop: 8 },
  cancelBtn: {
    padding: "8px 16px", border: "1px solid #D1D5DB", borderRadius: 6,
    background: "#fff", fontSize: 13, cursor: "pointer", color: "#374151",
  },
  saveBtn: {
    padding: "8px 20px", border: "none", borderRadius: 6,
    background: "#2563EB", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer",
  },
};

const portStyles = {
  addPortBtn: {
    fontSize: 12, padding: "3px 10px", border: "1px solid #D1D5DB",
    borderRadius: 4, background: "#F9FAFB", cursor: "pointer", color: "#374151",
  },
  portRow: {
    display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap",
  },
  labelInput: {
    flex: 2, minWidth: 140, padding: "6px 8px", border: "1px solid #D1D5DB",
    borderRadius: 5, fontSize: 12, color: "#111827",
  },
  select: {
    flex: 1, minWidth: 100, padding: "6px 8px", border: "1px solid #D1D5DB",
    borderRadius: 5, fontSize: 12, background: "#fff", cursor: "pointer",
  },
  removeBtn: {
    padding: "4px 8px", border: "none", background: "none",
    color: "#9CA3AF", cursor: "pointer", fontSize: 14, flexShrink: 0,
  },
};
