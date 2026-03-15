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

// Connectors are filtered by signal type — users can also type a custom value.
const CONNECTOR_MAP = {
  "Video":          ["HDMI", "Mini HDMI", "DisplayPort", "Mini DisplayPort", "SDI", "HD-SDI", "DVI-D", "VGA", "HDBaseT", "BNC / Coax", "USB-C (DP Alt Mode)"],
  "Audio":          ["XLR", "TRS (1/4\")", "TS (1/4\")", "TRS (1/8\")", "TS (1/8\")", "RCA", "MIDI", "SpeakOn", "Speaker Terminal", "Dante / AES67", "TOSLINK / Optical", "AES/EBU", "HDMI (ARC/eARC)", "USB-C"],
  "Control":        ["RS232", "RS485", "RS422", "IR", "Relay", "USB-A", "USB-B", "USB-C", "3-Pin Phoenix", "Ethernet (RJ45)"],
  "Network":        ["Ethernet (RJ45)", "PoE (RJ45)", "SFP", "SFP+", "Fiber (LC)", "Fiber (SC)", "Wi-Fi"],
  "Power":          ["IEC C5", "IEC C7 (Non-Polar)", "IEC C7 (Polar)", "IEC C13", "IEC C15", "IEC C19", "NEMA 5-15", "NEMA 5-20", "DC Barrel", "Terminal Block"],
  "Data":           ["USB-A", "USB-B", "USB-C", "USB Micro-B", "Thunderbolt", "Ethernet (RJ45)", "SD Card"],
  "Security":       ["BNC / Coax", "Ethernet (RJ45)", "PoE (RJ45)", "Dry Contact", "Relay", "RS485"],
  "Access Control": ["Wiegand", "OSDP", "RS485 2-Wire", "Dry Contact", "RS232", "Ethernet (RJ45)", "PoE (RJ45)"],
  "Fire":           ["NAC Circuit", "SLC", "Dry Contact", "IDC", "Class A (Style D/E)", "Class B (Style B/C)"],
  "Other":          [],  // shows all connectors combined
};

// All unique connectors across every signal type (for "Other" fallback)
const ALL_CONNECTORS = [...new Set(Object.values(CONNECTOR_MAP).flat())].sort();

const EMPTY_FORM = {
  make: "", model: "", category: "other", notes: "",
  has_ip: false, has_web_gui: false, is_matrix: false,
  ports: [], matrix_ports: [],
};

function newMatrixGroup() {
  return { id: crypto.randomUUID(), signal_type: "Video", connector_type: "", input_count: 0, output_count: 0, io_count: 0 };
}

function newPort(direction) {
  return {
    id: crypto.randomUUID(),
    label: "",
    direction,      // "input" | "output" | "io"
    signal_type: "Video",
    connector_type: "",
    _custom: false, // UI-only: true when user typed a custom connector
  };
}

function withCustomFlag(port) {
  const list = CONNECTOR_MAP[port.signal_type] ?? ALL_CONNECTORS;
  const isCustom = !!port.connector_type && !list.includes(port.connector_type);
  return { ...port, _custom: isCustom };
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
      has_ip: device.has_ip || false,
      has_web_gui: device.has_web_gui || false,
      is_matrix: device.is_matrix || false,
      ports: device.ports.map(withCustomFlag),
      matrix_ports: (device.matrix_ports || []).map((g) => ({ ...g, id: crypto.randomUUID() })),
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

  // ── Matrix port group helpers ─────────────────────────────────────────────

  function addMatrixGroup() {
    setForm((f) => ({ ...f, matrix_ports: [...f.matrix_ports, newMatrixGroup()] }));
  }

  function updateMatrixGroup(id, field, value) {
    setForm((f) => ({
      ...f,
      matrix_ports: f.matrix_ports.map((g) => g.id === id ? { ...g, [field]: value } : g),
    }));
  }

  function removeMatrixGroup(id) {
    setForm((f) => ({ ...f, matrix_ports: f.matrix_ports.filter((g) => g.id !== id) }));
  }

  // ── Save ─────────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!form.make.trim() || !form.model.trim()) {
      setError("Make and model are required.");
      return;
    }
    setSaving(true);
    setError("");
    // Strip UI-only flags before sending to API
    const payload = {
      ...form,
      ports: form.ports.map(({ _custom, ...p }) => p),
      matrix_ports: form.matrix_ports.map(({ id, ...g }) => g),
    };
    try {
      if (editing) {
        await devicesApi.update(editing.id, payload);
      } else {
        await devicesApi.create(payload);
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
    const ios  = ports.filter((p) => p.direction === "io").length;
    if (!ins && !outs && !ios) return <span style={{ color: "#9CA3AF" }}>—</span>;
    const parts = [];
    if (ins)  parts.push(`${ins} in`);
    if (outs) parts.push(`${outs} out`);
    if (ios)  parts.push(`${ios} I/O`);
    return parts.join(" / ");
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
  const ioPorts     = form.ports.filter((p) => p.direction === "io");

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

              {/* Device Capabilities */}
              <div style={styles.field}>
                <label style={styles.label}>Device Capabilities</label>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <label style={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      checked={form.has_ip}
                      onChange={(e) => setForm((f) => ({
                        ...f,
                        has_ip: e.target.checked,
                        has_web_gui: e.target.checked ? f.has_web_gui : false,
                      }))}
                      disabled={isReadOnlyModal}
                      style={{ marginRight: 8 }}
                    />
                    Has IP Address
                    <span style={styles.checkboxHint}> — IP &amp; MAC address required during documentation</span>
                  </label>

                  {form.has_ip && (
                    <label style={{ ...styles.checkboxLabel, marginLeft: 24 }}>
                      <input
                        type="checkbox"
                        checked={form.has_web_gui}
                        onChange={(e) => setForm((f) => ({ ...f, has_web_gui: e.target.checked }))}
                        disabled={isReadOnlyModal}
                        style={{ marginRight: 8 }}
                      />
                      Has Web GUI
                      <span style={styles.checkboxHint}> — username &amp; password required during documentation</span>
                    </label>
                  )}

                  <label style={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      checked={form.is_matrix}
                      onChange={(e) => setForm((f) => ({ ...f, is_matrix: e.target.checked }))}
                      disabled={isReadOnlyModal}
                      style={{ marginRight: 8 }}
                    />
                    Is Matrix / Switch
                    <span style={styles.checkboxHint}> — define port counts by signal type below</span>
                  </label>
                </div>
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
                <PortList
                  title="I/O Ports (Bidirectional)"
                  ports={ioPorts}
                  direction="io"
                  readOnly={isReadOnlyModal}
                  onAdd={() => addPort("io")}
                  onUpdate={updatePort}
                  onRemove={removePort}
                />
              </div>

              {/* Matrix Port Counts */}
              {form.is_matrix && (
                <div style={styles.portsSection}>
                  <MatrixPortList
                    groups={form.matrix_ports}
                    readOnly={isReadOnlyModal}
                    onAdd={addMatrixGroup}
                    onUpdate={updateMatrixGroup}
                    onRemove={removeMatrixGroup}
                  />
                </div>
              )}

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
  const dirLabel = direction === "io" ? "I/O" : direction;

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>{title}</span>
        {!readOnly && (
          <button style={portStyles.addPortBtn} onClick={onAdd}>+ Add</button>
        )}
      </div>

      {ports.length === 0 && (
        <p style={{ fontSize: 12, color: "#9CA3AF", margin: "4px 0 0" }}>
          {readOnly ? "None defined." : `No ${dirLabel} ports yet.`}
        </p>
      )}

      {ports.map((port) => {
        const filteredConnectors = port.signal_type === "Other"
          ? ALL_CONNECTORS
          : (CONNECTOR_MAP[port.signal_type] ?? []);

        return (
          <div key={port.id} style={portStyles.portRow}>
            {/* Port label */}
            <input
              style={portStyles.labelInput}
              placeholder="Label (e.g. HDMI In 1)"
              value={port.label}
              onChange={(e) => onUpdate(port.id, "label", e.target.value)}
              disabled={readOnly}
            />

            {/* Signal type */}
            <select
              style={portStyles.select}
              value={port.signal_type}
              onChange={(e) => {
                // When signal type changes, reset connector unless it's in new list
                const newList = CONNECTOR_MAP[e.target.value] ?? ALL_CONNECTORS;
                const keepConn = newList.includes(port.connector_type);
                onUpdate(port.id, "signal_type", e.target.value);
                if (!keepConn) {
                  onUpdate(port.id, "connector_type", "");
                  onUpdate(port.id, "_custom", false);
                }
              }}
              disabled={readOnly}
            >
              {SIGNAL_TYPES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>

            {/* Connector — dropdown or custom text input */}
            {port._custom ? (
              <div style={{ display: "flex", gap: 4, flex: 1, minWidth: 120 }}>
                <input
                  style={{ ...portStyles.labelInput, flex: 1 }}
                  placeholder="Custom connector..."
                  value={port.connector_type}
                  onChange={(e) => onUpdate(port.id, "connector_type", e.target.value)}
                  disabled={readOnly}
                  autoFocus
                />
                {!readOnly && (
                  <button
                    style={portStyles.backToListBtn}
                    title="Back to predefined list"
                    onClick={() => {
                      onUpdate(port.id, "connector_type", "");
                      onUpdate(port.id, "_custom", false);
                    }}
                  >←</button>
                )}
              </div>
            ) : (
              <select
                style={portStyles.select}
                value={port.connector_type || ""}
                onChange={(e) => {
                  if (e.target.value === "__custom__") {
                    onUpdate(port.id, "connector_type", "");
                    onUpdate(port.id, "_custom", true);
                  } else {
                    onUpdate(port.id, "connector_type", e.target.value);
                  }
                }}
                disabled={readOnly}
              >
                <option value="">Connector (optional)</option>
                {filteredConnectors.map((c) => <option key={c} value={c}>{c}</option>)}
                {!readOnly && <option value="__custom__">— Enter custom —</option>}
              </select>
            )}

            {!readOnly && (
              <button style={portStyles.removeBtn} onClick={() => onRemove(port.id)}>✕</button>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── MatrixPortList sub-component ─────────────────────────────────────────────

function MatrixPortList({ groups, readOnly, onAdd, onUpdate, onRemove }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>Matrix Port Counts</span>
        {!readOnly && (
          <button style={portStyles.addPortBtn} onClick={onAdd}>+ Add Row</button>
        )}
      </div>

      {groups.length > 0 && (
        <div style={{ display: "flex", gap: 6, marginBottom: 4 }}>
          <span style={{ flex: 2, fontSize: 11, color: "#9CA3AF" }}>Signal Type</span>
          <span style={{ flex: 2, fontSize: 11, color: "#9CA3AF" }}>Connector</span>
          <span style={{ width: 56, fontSize: 11, color: "#9CA3AF", textAlign: "center" }}>Inputs</span>
          <span style={{ width: 56, fontSize: 11, color: "#9CA3AF", textAlign: "center" }}>Outputs</span>
          <span style={{ width: 56, fontSize: 11, color: "#9CA3AF", textAlign: "center" }}>I/O</span>
          {!readOnly && <span style={{ width: 28 }} />}
        </div>
      )}

      {groups.length === 0 && (
        <p style={{ fontSize: 12, color: "#9CA3AF", margin: "4px 0 0" }}>
          {readOnly ? "No port groups defined." : "Add rows to specify port counts by signal type."}
        </p>
      )}

      {groups.map((g) => {
        const filteredConnectors = g.signal_type === "Other" ? ALL_CONNECTORS : (CONNECTOR_MAP[g.signal_type] ?? []);
        return (
          <div key={g.id} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
            <select
              style={{ ...portStyles.select, flex: 2 }}
              value={g.signal_type}
              onChange={(e) => {
                const newList = CONNECTOR_MAP[e.target.value] ?? ALL_CONNECTORS;
                onUpdate(g.id, "signal_type", e.target.value);
                if (!newList.includes(g.connector_type)) onUpdate(g.id, "connector_type", "");
              }}
              disabled={readOnly}
            >
              {SIGNAL_TYPES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>

            <select
              style={{ ...portStyles.select, flex: 2 }}
              value={g.connector_type || ""}
              onChange={(e) => onUpdate(g.id, "connector_type", e.target.value)}
              disabled={readOnly}
            >
              <option value="">Any / Mixed</option>
              {filteredConnectors.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>

            {["input_count", "output_count", "io_count"].map((key) => (
              <input
                key={key}
                type="number"
                min={0}
                style={portStyles.countInput}
                value={g[key]}
                onChange={(e) => onUpdate(g.id, key, Math.max(0, parseInt(e.target.value) || 0))}
                disabled={readOnly}
              />
            ))}

            {!readOnly && (
              <button style={portStyles.removeBtn} onClick={() => onRemove(g.id)}>✕</button>
            )}
          </div>
        );
      })}
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
  checkboxLabel: { display: "flex", alignItems: "center", fontSize: 13, color: "#111827", cursor: "pointer" },
  checkboxHint: { fontSize: 12, color: "#6B7280" },
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
  backToListBtn: {
    padding: "4px 8px", border: "1px solid #D1D5DB", borderRadius: 4,
    background: "#F9FAFB", color: "#6B7280", cursor: "pointer", fontSize: 13, flexShrink: 0,
  },
  countInput: {
    width: 56, padding: "6px 6px", border: "1px solid #D1D5DB", borderRadius: 5,
    fontSize: 12, color: "#111827", textAlign: "center", flexShrink: 0,
  },
};
