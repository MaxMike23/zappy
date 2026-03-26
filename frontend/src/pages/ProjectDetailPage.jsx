import { useState, useEffect, useRef, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { TRADES, TRADE_LABEL } from "@/constants/trades";
import client from "@/api/client";
import { projectsApi } from "@/api/projects";
import { workOrdersApi } from "@/api/workOrders";
import { workflowApi } from "@/api/workflow";
import { visitsApi } from "@/api/visits";
import { filesApi } from "@/api/files";
import { devicesApi } from "@/api/devices";
import { projectDevicesApi } from "@/api/projectDevices";
import { connectionsApi } from "@/api/connections";
import { diagramsApi } from "@/api/diagrams";
import SignalFlowCanvas from "@/components/SignalFlowCanvas";
import RackLayout from "@/components/RackLayout";
import Badge from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";
import Spinner from "@/components/ui/Spinner";
import EmptyState from "@/components/ui/EmptyState";
import CustomFieldRenderer from "@/components/CustomFieldRenderer";

const PRIORITY_COLORS = { low: "#10B981", medium: "#3B82F6", high: "#F59E0B", urgent: "#EF4444" };
const STATUS_COLORS   = { scheduled: "#3B82F6", in_progress: "#F59E0B", completed: "#10B981", cancelled: "#9CA3AF" };
const EDIT_ROLES = ["company_admin", "manager", "superadmin"];

const VISIT_TIME_STEP = 15;

const RS232_BAUD_RATES  = [1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200];
const RS232_DATA_BITS   = [7, 8];
const RS232_PARITIES    = ["None", "Even", "Odd", "Mark", "Space"];
const RS232_STOP_BITS   = [1, 1.5, 2];

const EMPTY_DEVICE_FORM = {
  trade: "",
  extra_trades: [],
  label: "", room: "", rack_position: "",
  ip_addresses: [], stream_urls: [],
  username: "", password: "",
  firmware_version: "",
  rs232_settings: { port: "", baud_rate: 9600, data_bits: 8, parity: "None", stop_bits: 1 },
  notes: "",
};

function snapMinutes(datetimeStr) {
  if (!datetimeStr) return datetimeStr;
  const d = new Date(datetimeStr);
  d.setMinutes(Math.round(d.getMinutes() / VISIT_TIME_STEP) * VISIT_TIME_STEP, 0, 0);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function hasRS232Ports(template) {
  return (template?.ports || []).some((p) =>
    p.connector_type?.toLowerCase().includes("rs232") ||
    p.connector_type?.toLowerCase().includes("rs-232")
  );
}

function deviceFormFromInstance(device) {
  return {
    trade: device.trade || "",
    extra_trades: device.extra_trades || [],
    label: device.label || "",
    room: device.room || "",
    rack_position: device.rack_position || "",
    ip_addresses: device.ip_addresses || [],
    stream_urls: device.stream_urls || [],
    username: device.username || "",
    password: device.password || "",
    firmware_version: device.firmware_version || "",
    rs232_settings: device.rs232_settings || { port: "", baud_rate: 9600, data_bits: 8, parity: "None", stop_bits: 1 },
    notes: device.notes || "",
  };
}

export default function ProjectDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  // ── project core state ──────────────────────────────────────────────────────
  const [project, setProject]         = useState(null);
  const [workOrders, setWorkOrders]   = useState([]);
  const [stages, setStages]           = useState([]);
  const [fieldDefs, setFieldDefs]     = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState("");
  const [editing, setEditing]         = useState(false);
  const [editForm, setEditForm]       = useState({});
  const [saving, setSaving]           = useState(false);
  const [saveError, setSaveError]     = useState("");
  const [showWoModal, setShowWoModal] = useState(false);
  const [woStages, setWoStages]       = useState([]);
  const [woForm, setWoForm]           = useState({ title: "", stage_id: "", priority: "medium", description: "" });
  const [woCreating, setWoCreating]   = useState(false);
  const [woError, setWoError]         = useState("");
  const [directVisits, setDirectVisits]       = useState([]);
  const [showVisitModal, setShowVisitModal]   = useState(false);
  const [visitForm, setVisitForm]             = useState({ title: "", scheduled_start: "", scheduled_end: "", notes: "" });
  const [visitAssigneeIds, setVisitAssigneeIds] = useState([]);
  const [visitCreating, setVisitCreating]     = useState(false);
  const [visitError, setVisitError]           = useState("");
  const [teamUsers, setTeamUsers]             = useState([]);
  const [editVisitAssignees, setEditVisitAssignees] = useState(null);
  const [editVAIds, setEditVAIds]             = useState([]);
  const [savingVA, setSavingVA]               = useState(false);
  const [files, setFiles]           = useState([]);
  const [fileUploading, setFileUploading] = useState(false);
  const fileInputRef = useRef(null);

  // ── tabs ────────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState("details"); // "details" | "system_design" | "rack_layout"

  // ── system design state ─────────────────────────────────────────────────────
  const [projectDevices, setProjectDevices]   = useState([]);
  const [library, setLibrary]                 = useState([]);
  const [libraryLoaded, setLibraryLoaded]     = useState(false);
  const [pickerOpen, setPickerOpen]           = useState(false);
  const [pickerSearch, setPickerSearch]       = useState("");
  const [deviceModal, setDeviceModal]         = useState(null);  // { mode: "add"|"edit", device?: obj }
  const [modalTemplate, setModalTemplate]     = useState(null);  // template in context for the open modal
  const [deviceForm, setDeviceForm]           = useState(EMPTY_DEVICE_FORM);
  const [deviceSaving, setDeviceSaving]       = useState(false);
  const [deviceError, setDeviceError]         = useState("");
  // Phase 3C — signal flow
  const [connections, setConnections]           = useState([]);
  const [connectionsLoaded, setConnectionsLoaded] = useState(false);
  const [activeTrade, setActiveTrade]           = useState(null);
  const [diagrams, setDiagrams]                 = useState({});  // trade -> diagram metadata
  const [diagramInfoOpen, setDiagramInfoOpen]   = useState(false);
  const [diagramInfoForm, setDiagramInfoForm]   = useState({});
  const [diagramInfoSaving, setDiagramInfoSaving] = useState(false);
  const [devicesCollapsed, setDevicesCollapsed] = useState(false);

  const tradesInUse = useMemo(() => {
    const all = [];
    projectDevices.forEach((d) => {
      if (d.trade) all.push(d.trade);
      (d.extra_trades || []).forEach((t) => all.push(t));
    });
    return [...new Set(all)];
  }, [projectDevices]);

  const { user, company } = useAuth();
  const canEdit = EDIT_ROLES.includes(user?.role);

  // ── initial load ─────────────────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true);
    Promise.all([
      projectsApi.get(id),
      workflowApi.listStages("project"),
      workflowApi.listFields("project"),
      workOrdersApi.list({ project_id: id, per_page: 50 }),
      workflowApi.listStages("work_order"),
      visitsApi.list({ project_id: id, per_page: 50 }),
      filesApi.list({ project_id: id }),
      projectDevicesApi.list(id),
      client.get("/users/").catch(() => ({ data: { items: [] } })),
    ]).then(([projRes, stagesRes, fieldsRes, wosRes, woStagesRes, visitsRes, filesRes, devRes, usersRes]) => {
      const p = projRes.data.project;
      setProject(p);
      setEditForm(toEditForm(p));
      setStages(stagesRes.data.stages);
      setFieldDefs(fieldsRes.data.fields);
      setWorkOrders(wosRes.data.items);
      setWoStages(woStagesRes.data.stages);
      setDirectVisits(visitsRes.data.items.filter((v) => !v.work_order_id));
      setFiles(filesRes.data.files);
      setProjectDevices(devRes.data.devices);
      setTeamUsers((usersRes.data.items || []).filter((u) => ["technician", "manager", "company_admin", "sales"].includes(u.role)));
    }).catch(() => setError("Failed to load project."))
      .finally(() => setLoading(false));
  }, [id]);

  // ── tab switching ─────────────────────────────────────────────────────────────
  const handleTabChange = async (tab) => {
    setActiveTab(tab);
    if (tab === "system_design") {
      if (!libraryLoaded) {
        try {
          const res = await devicesApi.list();
          setLibrary(res.data.devices || res.data.items || []);
          setLibraryLoaded(true);
        } catch {/* no-op */}
      }
      if (!connectionsLoaded) {
        try {
          const res = await connectionsApi.list(id);
          setConnections(res.data.connections || []);
          setConnectionsLoaded(true);
        } catch {/* no-op */}
      }
      // Auto-activate first trade that has devices
      const firstTrade = projectDevices.find((d) => d.trade)?.trade;
      if (firstTrade && !activeTrade) {
        setActiveTrade(firstTrade);
        diagramsApi.get(id, firstTrade)
          .then((r) => { if (r.data.diagram) setDiagrams((p) => ({ ...p, [firstTrade]: r.data.diagram })); })
          .catch(() => {});
      }
    }
  };

  const handleTradeTabClick = async (trade) => {
    setActiveTrade(trade);
    if (!diagrams[trade]) {
      diagramsApi.get(id, trade)
        .then((r) => { if (r.data.diagram) setDiagrams((p) => ({ ...p, [trade]: r.data.diagram })); })
        .catch(() => {});
    }
  };

  const openDiagramInfo = () => {
    const d = diagrams[activeTrade] || {};
    setDiagramInfoForm({
      drawing_title:        d.drawing_title || "",
      location:             d.location || "",
      company_name_override: d.company_name_override || "",
      revision:             d.revision || "",
      drawn_by:             d.drawn_by || "",
      drawing_date:         d.drawing_date || new Date().toISOString().split("T")[0],
    });
    setDiagramInfoOpen(true);
  };

  const handleDiagramInfoSave = async () => {
    setDiagramInfoSaving(true);
    try {
      const res = await diagramsApi.upsert(id, activeTrade, diagramInfoForm);
      setDiagrams((p) => ({ ...p, [activeTrade]: res.data.diagram }));
      setDiagramInfoOpen(false);
    } catch {/* no-op */} finally {
      setDiagramInfoSaving(false);
    }
  };

  // ── project save ─────────────────────────────────────────────────────────────
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

  // ── work orders ───────────────────────────────────────────────────────────────
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

  // ── visits ────────────────────────────────────────────────────────────────────
  const handleCreateVisit = async (e) => {
    e.preventDefault();
    setVisitError("");
    setVisitCreating(true);
    try {
      const payload = { project_id: id, ...visitForm };
      if (visitAssigneeIds.length) payload.assignee_ids = visitAssigneeIds;
      const res = await visitsApi.create(payload);
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

  const handleSaveVisitAssignees = async () => {
    setSavingVA(true);
    try {
      const res = await visitsApi.update(editVisitAssignees.id, { assignee_ids: editVAIds });
      setDirectVisits((prev) => prev.map((v) => v.id === editVisitAssignees.id ? res.data.visit : v));
      setEditVisitAssignees(null);
    } catch {/* no-op */} finally {
      setSavingVA(false);
    }
  };

  // ── files ─────────────────────────────────────────────────────────────────────
  const handleFileUpload = async (e) => {
    const uploadFiles = Array.from(e.target.files);
    if (!uploadFiles.length) return;
    setFileUploading(true);
    try {
      for (const file of uploadFiles) {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("project_id", id);
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

  const handleFileDelete = async (fileId) => {
    try {
      await filesApi.delete(fileId);
      setFiles((prev) => prev.filter((f) => f.id !== fileId));
    } catch {/* no-op */}
  };

  // ── system design: picker ─────────────────────────────────────────────────────
  const openPicker = () => {
    setPickerSearch("");
    setPickerOpen(true);
  };

  const handlePickerSelect = (template) => {
    setPickerOpen(false);
    setModalTemplate(template);
    setDeviceForm({ ...EMPTY_DEVICE_FORM, trade: activeTrade || "", stream_urls: [] });
    setDeviceError("");
    setDeviceModal({ mode: "add" });
  };

  const filteredLibrary = library.filter((t) => {
    const q = pickerSearch.toLowerCase();
    return !q || `${t.make} ${t.model}`.toLowerCase().includes(q) || t.category?.toLowerCase().includes(q);
  });

  // ── system design: instance edit ──────────────────────────────────────────────
  const openDeviceEdit = (device) => {
    setModalTemplate(device.template);
    setDeviceForm(deviceFormFromInstance(device));
    setDeviceError("");
    setDeviceModal({ mode: "edit", device });
  };

  const closeDeviceModal = () => {
    setDeviceModal(null);
    setModalTemplate(null);
  };

  const handleDeviceSave = async () => {
    setDeviceSaving(true);
    setDeviceError("");
    const payload = {
      trade: deviceForm.trade || null,
      extra_trades: deviceForm.extra_trades || [],
      label: deviceForm.label || null,
      room: deviceForm.room || null,
      rack_position: deviceForm.rack_position || null,
      ip_addresses: deviceForm.ip_addresses,
      stream_urls: deviceForm.stream_urls,
      username: deviceForm.username || null,
      password: deviceForm.password || null,
      firmware_version: deviceForm.firmware_version || null,
      rs232_settings: hasRS232Ports(modalTemplate) ? deviceForm.rs232_settings : null,
      notes: deviceForm.notes || null,
    };
    try {
      if (deviceModal.mode === "add") {
        const res = await projectDevicesApi.add(id, { template_id: modalTemplate.id, ...payload });
        setProjectDevices((prev) => [...prev, res.data.device]);
      } else {
        const res = await projectDevicesApi.update(id, deviceModal.device.id, payload);
        setProjectDevices((prev) => prev.map((d) => d.id === deviceModal.device.id ? res.data.device : d));
      }
      closeDeviceModal();
    } catch (err) {
      setDeviceError(err.response?.data?.error || "Save failed.");
    } finally {
      setDeviceSaving(false);
    }
  };

  const handleDeleteDevice = async (deviceId) => {
    if (!window.confirm("Remove this device from the project?")) return;
    try {
      await projectDevicesApi.remove(id, deviceId);
      setProjectDevices((prev) => prev.filter((d) => d.id !== deviceId));
    } catch {/* no-op */}
  };

  const addIpEntry = () => setDeviceForm((f) => ({
    ...f, ip_addresses: [...f.ip_addresses, { label: "", ip: "", mac: "" }],
  }));
  const removeIpEntry = (idx) => setDeviceForm((f) => ({
    ...f, ip_addresses: f.ip_addresses.filter((_, i) => i !== idx),
  }));
  const setIpEntry = (idx, field, val) => setDeviceForm((f) => {
    const updated = f.ip_addresses.map((e, i) => i === idx ? { ...e, [field]: val } : e);
    return { ...f, ip_addresses: updated };
  });

  const setUrl = (idx, val) => {
    setDeviceForm((f) => {
      const urls = [...f.stream_urls];
      urls[idx] = val;
      return { ...f, stream_urls: urls };
    });
  };

  const addUrl = () => setDeviceForm((f) => ({ ...f, stream_urls: [...f.stream_urls, ""] }));
  const removeUrl = (idx) => setDeviceForm((f) => ({ ...f, stream_urls: f.stream_urls.filter((_, i) => i !== idx) }));

  // ── render ────────────────────────────────────────────────────────────────────
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
        {canEdit && activeTab === "details" && (
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

      {/* Tab bar */}
      <div style={tabBarStyle}>
        {[
          { key: "details",       label: "Project Details" },
          { key: "system_design", label: `System Design${projectDevices.length ? ` (${projectDevices.length})` : ""}` },
          { key: "rack_layout",   label: `Rack Layout${projectDevices.filter((d) => d.template?.is_rack).length ? ` (${projectDevices.filter((d) => d.template?.is_rack).length})` : ""}` },
        ].map((tab) => (
          <button
            key={tab.key}
            style={{ ...tabBtnStyle, ...(activeTab === tab.key ? tabBtnActive : {}) }}
            onClick={() => handleTabChange(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Details tab ───────────────────────────────────────────────────────── */}
      {activeTab === "details" && (
        <>
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
                <button style={styles.secondaryBtn} onClick={() => { setShowVisitModal(true); setVisitForm({ title: "", scheduled_start: "", scheduled_end: "", notes: "" }); setVisitAssigneeIds([]); setVisitError(""); }}>
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
                            {canEdit && (
                              <button style={{ ...visitClockBtn, background: "#F3F4F6", color: "#374151", marginLeft: 4 }} onClick={() => { setEditVisitAssignees(v); setEditVAIds(v.assignees?.map((a) => a.id) || []); }}>Assignees</button>
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

          {/* Files */}
          <div style={styles.section}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <h2 style={styles.sectionTitle}>Files</h2>
              <button style={styles.secondaryBtn} onClick={() => fileInputRef.current?.click()} disabled={fileUploading}>
                {fileUploading ? "Uploading…" : "Upload File"}
              </button>
            </div>
            <input ref={fileInputRef} type="file" multiple style={{ display: "none" }} onChange={handleFileUpload} />
            {files.length === 0 ? (
              <p style={{ fontSize: 14, color: "#9CA3AF" }}>No files attached.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {files.map((f) => (
                  <div key={f.id} style={projectFileRow}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <button style={projectFileLink} onClick={() => handleFileDownload(f)}>{f.original_filename}</button>
                      <div style={{ fontSize: 11, color: "#9CA3AF" }}>
                        {formatFileBytes(f.file_size)} · {f.uploaded_by_name} · {formatFileTimeAgo(f.created_at)}
                      </div>
                    </div>
                    {(canEdit || f.uploaded_by_id === user?.id) && (
                      <button style={fileDeleteBtn} onClick={() => handleFileDelete(f.id)} title="Delete file">✕</button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* ── System Design tab ─────────────────────────────────────────────────── */}
      {activeTab === "system_design" && (
        <>
          {/* Devices table */}
          <div style={styles.section}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: devicesCollapsed ? 0 : 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <h2 style={{ ...styles.sectionTitle, margin: 0 }}>Devices</h2>
                <button
                  type="button"
                  style={{ ...styles.secondaryBtn, padding: "2px 8px", fontSize: 12 }}
                  onClick={() => setDevicesCollapsed((v) => !v)}
                >
                  {devicesCollapsed ? "▶ Show" : "▼ Hide"}
                </button>
              </div>
              {canEdit && !devicesCollapsed && (
                <button style={styles.secondaryBtn} onClick={openPicker}>+ Add Device</button>
              )}
            </div>
            {!devicesCollapsed && (projectDevices.length === 0 ? (
              <EmptyState
                message="No devices added yet."
                action={canEdit ? "+ Add Device" : undefined}
                onAction={openPicker}
              />
            ) : (
              <div style={styles.tableWrap}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      {["Device", "Trade", "Label / Nickname", "Room", "Rack", "Ports", "IP Address", ""].map((h) => (
                        <th key={h} style={styles.th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {projectDevices.map((d) => {
                      const { inputs, outputs, io } = d.port_summary || {};
                      const portStr = [
                        inputs  && `${inputs} in`,
                        outputs && `${outputs} out`,
                        io      && `${io} I/O`,
                      ].filter(Boolean).join(" / ") || "—";
                      return (
                        <tr key={d.id} style={{ ...styles.tr, cursor: "default" }}>
                          <td style={{ ...styles.td, fontWeight: 600 }}>
                            {d.template
                              ? `${d.template.make} ${d.template.model}`
                              : <span style={styles.muted}>Unknown</span>}
                          </td>
                          <td style={{ ...styles.td, fontSize: 12 }}>
                            {d.trade ? TRADE_LABEL[d.trade] || d.trade : <span style={styles.muted}>—</span>}
                          </td>
                          <td style={styles.td}>{d.label || <span style={styles.muted}>—</span>}</td>
                          <td style={styles.td}>{d.room || <span style={styles.muted}>—</span>}</td>
                          <td style={styles.td}>{d.rack_position || <span style={styles.muted}>—</span>}</td>
                          <td style={{ ...styles.td, fontSize: 12, color: "#6B7280" }}>{portStr}</td>
                          <td style={styles.td}>
                            {d.ip_addresses?.length
                              ? d.ip_addresses.length === 1
                                ? d.ip_addresses[0].ip || <span style={styles.muted}>—</span>
                                : `${d.ip_addresses[0].ip} +${d.ip_addresses.length - 1}`
                              : <span style={styles.muted}>—</span>}
                          </td>
                          <td style={{ ...styles.td, whiteSpace: "nowrap" }}>
                            {canEdit && (
                              <>
                                <button style={deviceActionBtn} onClick={() => openDeviceEdit(d)}>Edit</button>
                                <button style={{ ...deviceActionBtn, color: "#B91C1C", marginLeft: 4 }} onClick={() => handleDeleteDevice(d.id)}>Remove</button>
                              </>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ))}
          </div>

          {/* Signal Flow Diagram */}
          <div style={{ marginTop: 36 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <h2 style={styles.sectionTitle}>Signal Flow Diagram</h2>
              {activeTrade && canEdit && (
                <button style={styles.secondaryBtn} onClick={openDiagramInfo}>Diagram Info</button>
              )}
            </div>

            {tradesInUse.length === 0 ? (
              <p style={{ fontSize: 13, color: "#9CA3AF" }}>
                Add devices and assign them a trade to use the signal flow canvas.
              </p>
            ) : (
              <>
                {/* Trade tabs */}
                <div style={tradeTabBar}>
                  {tradesInUse.map((t) => (
                    <button
                      key={t}
                      style={{ ...tradeTabBtn, ...(activeTrade === t ? tradeTabActive : {}) }}
                      onClick={() => handleTradeTabClick(t)}
                    >
                      {TRADE_LABEL[t] || t}
                      <span style={tradeCount}>{projectDevices.filter((d) => d.trade === t || (d.extra_trades || []).includes(t)).length}</span>
                    </button>
                  ))}
                </div>

                {/* Canvas */}
                {activeTrade && (
                  <div style={{ height: 560, marginTop: 12 }}>
                    <SignalFlowCanvas
                      projectId={id}
                      trade={activeTrade}
                      devices={projectDevices.filter((d) => d.trade === activeTrade || (d.extra_trades || []).includes(activeTrade))}
                      connections={connections.filter((c) => c.trade === activeTrade)}
                      diagram={diagrams[activeTrade] || null}
                      canEdit={canEdit}
                      company={company}
                      onConnectionCreated={(conn) => setConnections((prev) => [...prev, conn])}
                      onConnectionDeleted={(connId) => setConnections((prev) => prev.filter((c) => c.id !== connId))}
                      onDeviceEdit={openDeviceEdit}
                      onDeviceDeleted={(deviceId) => setProjectDevices((prev) => prev.filter((d) => d.id !== deviceId))}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}

      {/* ── Rack Layout tab ──────────────────────────────────────────────────── */}
      {activeTab === "rack_layout" && (
        <RackLayout
          projectId={id}
          projectDevices={projectDevices}
          onDeviceUpdate={(updated) =>
            setProjectDevices((prev) => prev.map((d) => d.id === updated.id ? updated : d))
          }
        />
      )}

      {/* ── New Work Order Modal ──────────────────────────────────────────────── */}
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

      {/* ── New Visit Modal ───────────────────────────────────────────────────── */}
      {showVisitModal && (
        <Modal title="New Direct Visit" onClose={() => setShowVisitModal(false)}>
          <form onSubmit={handleCreateVisit} style={{ display: "flex", flexDirection: "column" }}>
            {visitError && <div style={styles.errorMsg}>{visitError}</div>}
            <FormField label="Title" required>
              <input style={styles.input} required value={visitForm.title} onChange={(e) => setVisitForm({ ...visitForm, title: e.target.value })} placeholder="e.g. Site Survey" />
            </FormField>
            <FormField label="Scheduled Start" required>
              <input type="datetime-local" step={VISIT_TIME_STEP * 60} style={styles.input} required value={visitForm.scheduled_start} onChange={(e) => setVisitForm({ ...visitForm, scheduled_start: snapMinutes(e.target.value) })} />
            </FormField>
            <FormField label="Scheduled End" required>
              <input type="datetime-local" step={VISIT_TIME_STEP * 60} style={styles.input} required value={visitForm.scheduled_end} onChange={(e) => setVisitForm({ ...visitForm, scheduled_end: snapMinutes(e.target.value) })} />
            </FormField>
            <FormField label="Notes">
              <textarea style={{ ...styles.input, resize: "vertical" }} rows={3} value={visitForm.notes} onChange={(e) => setVisitForm({ ...visitForm, notes: e.target.value })} />
            </FormField>
            {teamUsers.length > 0 && (
              <FormField label="Assign Technicians">
                <div style={styles.checkList}>
                  {teamUsers.map((u) => (
                    <label key={u.id} style={styles.checkRow}>
                      <input
                        type="checkbox"
                        checked={visitAssigneeIds.includes(u.id)}
                        onChange={(e) => setVisitAssigneeIds((prev) => e.target.checked ? [...prev, u.id] : prev.filter((x) => x !== u.id))}
                      />
                      <span>{u.full_name} <span style={{ color: "#9CA3AF", fontSize: 12 }}>({u.role})</span></span>
                    </label>
                  ))}
                </div>
              </FormField>
            )}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
              <button type="button" style={styles.cancelBtn} onClick={() => setShowVisitModal(false)}>Cancel</button>
              <button type="submit" style={styles.primaryBtn} disabled={visitCreating}>{visitCreating ? "Creating…" : "Create Visit"}</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Edit Visit Assignees Modal */}
      {editVisitAssignees && (
        <Modal title={`Assignees — ${editVisitAssignees.title}`} onClose={() => setEditVisitAssignees(null)}>
          <div style={styles.checkList}>
            {teamUsers.map((u) => (
              <label key={u.id} style={styles.checkRow}>
                <input
                  type="checkbox"
                  checked={editVAIds.includes(u.id)}
                  onChange={(e) => setEditVAIds((prev) => e.target.checked ? [...prev, u.id] : prev.filter((x) => x !== u.id))}
                />
                <span>{u.full_name} <span style={{ color: "#9CA3AF", fontSize: 12 }}>({u.role})</span></span>
              </label>
            ))}
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
            <button style={styles.cancelBtn} onClick={() => setEditVisitAssignees(null)}>Cancel</button>
            <button style={styles.primaryBtn} disabled={savingVA} onClick={handleSaveVisitAssignees}>{savingVA ? "Saving…" : "Save"}</button>
          </div>
        </Modal>
      )}

      {/* ── Diagram Info Modal ───────────────────────────────────────────────── */}
      {diagramInfoOpen && (
        <Modal title={`Diagram Info — ${TRADE_LABEL[activeTrade] || activeTrade}`} onClose={() => setDiagramInfoOpen(false)}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <FormField label="Drawing Title">
              <input style={styles.input} value={diagramInfoForm.drawing_title} onChange={(e) => setDiagramInfoForm({ ...diagramInfoForm, drawing_title: e.target.value })} placeholder="e.g. AV Signal Flow — Main Conference Room" />
            </FormField>
            <FormField label="Location">
              <input style={styles.input} value={diagramInfoForm.location} onChange={(e) => setDiagramInfoForm({ ...diagramInfoForm, location: e.target.value })} placeholder="e.g. 2nd Floor, Suite 200" />
            </FormField>
            <FormField label="Company Name Override">
              <input style={styles.input} value={diagramInfoForm.company_name_override} onChange={(e) => setDiagramInfoForm({ ...diagramInfoForm, company_name_override: e.target.value })} placeholder="Defaults to company name" />
            </FormField>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <FormField label="Revision">
                <input style={styles.input} value={diagramInfoForm.revision} onChange={(e) => setDiagramInfoForm({ ...diagramInfoForm, revision: e.target.value })} placeholder="e.g. Rev A" />
              </FormField>
              <FormField label="Drawing Date">
                <input type="date" style={styles.input} value={diagramInfoForm.drawing_date} onChange={(e) => setDiagramInfoForm({ ...diagramInfoForm, drawing_date: e.target.value })} />
              </FormField>
            </div>
            <FormField label="Drawn By">
              <input style={styles.input} value={diagramInfoForm.drawn_by} onChange={(e) => setDiagramInfoForm({ ...diagramInfoForm, drawn_by: e.target.value })} placeholder="Your name" />
            </FormField>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
              <button style={styles.cancelBtn} onClick={() => setDiagramInfoOpen(false)}>Cancel</button>
              <button style={styles.primaryBtn} disabled={diagramInfoSaving} onClick={handleDiagramInfoSave}>
                {diagramInfoSaving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Device Picker Modal ───────────────────────────────────────────────── */}
      {pickerOpen && (
        <Modal title="Add Device to Project" onClose={() => setPickerOpen(false)}>
          <div style={{ marginBottom: 12 }}>
            <input
              style={{ ...styles.input, marginBottom: 0 }}
              placeholder="Search by make, model, or category…"
              value={pickerSearch}
              onChange={(e) => setPickerSearch(e.target.value)}
              autoFocus
            />
          </div>
          {!libraryLoaded ? (
            <div style={{ display: "flex", justifyContent: "center", padding: 24 }}><Spinner size={20} /></div>
          ) : filteredLibrary.length === 0 ? (
            <p style={{ fontSize: 13, color: "#9CA3AF", textAlign: "center", padding: "16px 0" }}>No devices match your search.</p>
          ) : (
            <div style={{ maxHeight: 380, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
              {filteredLibrary.map((t) => {
                const { inputs, outputs, io } = {
                  inputs:  (t.ports || []).filter((p) => p.direction === "input").length,
                  outputs: (t.ports || []).filter((p) => p.direction === "output").length,
                  io:      (t.ports || []).filter((p) => p.direction === "io").length,
                };
                const portStr = [inputs && `${inputs} in`, outputs && `${outputs} out`, io && `${io} I/O`].filter(Boolean).join(" / ") || "no ports";
                return (
                  <button key={t.id} style={pickerRowBtn} onClick={() => handlePickerSelect(t)}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13, color: "#111827" }}>{t.make} {t.model}</div>
                        <div style={{ fontSize: 11, color: "#9CA3AF" }}>{t.category_label} · {portStr}</div>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                      <span style={{ ...badgeStyle, background: t.is_global ? "#EFF6FF" : "#F9FAFB", color: t.is_global ? "#1D4ED8" : "#6B7280", border: `1px solid ${t.is_global ? "#BFDBFE" : "#E5E7EB"}` }}>
                        {t.is_global ? "Global" : "Private"}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </Modal>
      )}

      {/* ── Device Instance Modal ─────────────────────────────────────────────── */}
      {deviceModal && (
        <Modal
          title={deviceModal.mode === "add" ? `Add ${modalTemplate?.make} ${modalTemplate?.model}` : `Edit ${modalTemplate?.make || ""} ${modalTemplate?.model || ""}`}
          onClose={closeDeviceModal}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {deviceError && <div style={{ ...styles.errorMsg, marginBottom: 12 }}>{deviceError}</div>}

            {/* Read-only: template info */}
            {modalTemplate && (
              <div style={templateInfoBar}>
                <span style={{ fontWeight: 600 }}>{modalTemplate.make} {modalTemplate.model}</span>
                <span style={{ color: "#9CA3AF" }}>·</span>
                <span style={{ color: "#6B7280" }}>{modalTemplate.category_label}</span>
                {modalTemplate.has_ip && <span style={capBadge}>IP Device</span>}
                {modalTemplate.has_web_gui && <span style={capBadge}>Web GUI</span>}
                {modalTemplate.is_matrix && <span style={capBadge}>Matrix</span>}
              </div>
            )}

            {/* Identity */}
            <ModalSection label="Identity">
              <FormField label="Primary Trade" required>
                <select style={styles.input} value={deviceForm.trade} onChange={(e) => setDeviceForm({ ...deviceForm, trade: e.target.value })}>
                  <option value="">— select trade —</option>
                  {TRADES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
              </FormField>
              <FormField label="Also Appears In (Additional Trades)">
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "6px 0" }}>
                  {TRADES.filter((t) => t.key !== deviceForm.trade).map((t) => {
                    const checked = (deviceForm.extra_trades || []).includes(t.key);
                    return (
                      <label key={t.key} style={{
                        display: "flex", alignItems: "center", gap: 4,
                        fontSize: 12, color: "#374151", cursor: "pointer",
                        background: checked ? "#EFF6FF" : "#F9FAFB",
                        border: `1px solid ${checked ? "#93C5FD" : "#E5E7EB"}`,
                        borderRadius: 4, padding: "3px 8px",
                      }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const next = e.target.checked
                              ? [...(deviceForm.extra_trades || []), t.key]
                              : (deviceForm.extra_trades || []).filter((k) => k !== t.key);
                            setDeviceForm({ ...deviceForm, extra_trades: next });
                          }}
                          style={{ marginRight: 2 }}
                        />
                        {t.label}
                      </label>
                    );
                  })}
                </div>
                {(deviceForm.extra_trades || []).length > 0 && (
                  <p style={{ fontSize: 11, color: "#6B7280", margin: "4px 0 0" }}>
                    This device will appear in {(deviceForm.extra_trades.length + 1)} signal flow diagram{deviceForm.extra_trades.length > 0 ? "s" : ""}.
                  </p>
                )}
              </FormField>
              <FormField label="Label / Nickname">
                <input style={styles.input} value={deviceForm.label} onChange={(e) => setDeviceForm({ ...deviceForm, label: e.target.value })} placeholder="e.g. Main Display, Rack AMP-1" />
              </FormField>
            </ModalSection>

            {/* Location */}
            <ModalSection label="Location">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <FormField label="Room">
                  <input style={styles.input} value={deviceForm.room} onChange={(e) => setDeviceForm({ ...deviceForm, room: e.target.value })} placeholder="e.g. Conference Room A" />
                </FormField>
                <FormField label="Rack Position">
                  <input style={styles.input} value={deviceForm.rack_position} onChange={(e) => setDeviceForm({ ...deviceForm, rack_position: e.target.value })} placeholder="e.g. U1–U2" />
                </FormField>
              </div>
            </ModalSection>

            {/* Network — only if has_ip */}
            {modalTemplate?.has_ip && (
              <ModalSection label="Network">
                <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 10 }}>
                  Add one entry per network interface (e.g. Control, Dante, AES67).
                </div>
                {deviceForm.ip_addresses.map((entry, i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 8, alignItems: "end", marginBottom: 10 }}>
                    <FormField label={i === 0 ? "Label" : ""}>
                      <input style={styles.input} value={entry.label} onChange={(e) => setIpEntry(i, "label", e.target.value)} placeholder="e.g. Control, Dante" />
                    </FormField>
                    <FormField label={i === 0 ? "IP Address" : ""}>
                      <input style={styles.input} value={entry.ip} onChange={(e) => setIpEntry(i, "ip", e.target.value)} placeholder="192.168.1.100" />
                    </FormField>
                    <FormField label={i === 0 ? "MAC Address" : ""}>
                      <input style={styles.input} value={entry.mac} onChange={(e) => setIpEntry(i, "mac", e.target.value)} placeholder="AA:BB:CC:DD:EE:FF" />
                    </FormField>
                    <button type="button" style={{ ...removeBtn, marginBottom: 2 }} onClick={() => removeIpEntry(i)}>✕</button>
                  </div>
                ))}
                <button type="button" style={addRowBtn} onClick={addIpEntry}>+ Add IP Address</button>
                <FormField label="Stream URLs" >
                  <div style={{ marginTop: 6 }}>
                    {deviceForm.stream_urls.map((url, i) => (
                      <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                        <input style={{ ...styles.input, flex: 1 }} value={url} onChange={(e) => setUrl(i, e.target.value)} placeholder="rtsp://..." />
                        <button type="button" style={removeBtn} onClick={() => removeUrl(i)}>✕</button>
                      </div>
                    ))}
                    <button type="button" style={addRowBtn} onClick={addUrl}>+ Add Stream URL</button>
                  </div>
                </FormField>
              </ModalSection>
            )}

            {/* Credentials — only if has_web_gui */}
            {modalTemplate?.has_web_gui && (
              <ModalSection label="Credentials">
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <FormField label="Username">
                    <input style={styles.input} value={deviceForm.username} onChange={(e) => setDeviceForm({ ...deviceForm, username: e.target.value })} />
                  </FormField>
                  <FormField label="Password">
                    <input style={styles.input} value={deviceForm.password} onChange={(e) => setDeviceForm({ ...deviceForm, password: e.target.value })} />
                  </FormField>
                </div>
              </ModalSection>
            )}

            {/* RS232 Control — only if template has RS232 ports */}
            {hasRS232Ports(modalTemplate) && (
              <ModalSection label="RS232 Control">
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <FormField label="COM Port">
                    <input style={styles.input} value={deviceForm.rs232_settings.port} onChange={(e) => setDeviceForm({ ...deviceForm, rs232_settings: { ...deviceForm.rs232_settings, port: e.target.value } })} placeholder="e.g. COM1" />
                  </FormField>
                  <FormField label="Baud Rate">
                    <select style={styles.input} value={deviceForm.rs232_settings.baud_rate} onChange={(e) => setDeviceForm({ ...deviceForm, rs232_settings: { ...deviceForm.rs232_settings, baud_rate: Number(e.target.value) } })}>
                      {RS232_BAUD_RATES.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </FormField>
                  <FormField label="Data Bits">
                    <select style={styles.input} value={deviceForm.rs232_settings.data_bits} onChange={(e) => setDeviceForm({ ...deviceForm, rs232_settings: { ...deviceForm.rs232_settings, data_bits: Number(e.target.value) } })}>
                      {RS232_DATA_BITS.map((b) => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </FormField>
                  <FormField label="Parity">
                    <select style={styles.input} value={deviceForm.rs232_settings.parity} onChange={(e) => setDeviceForm({ ...deviceForm, rs232_settings: { ...deviceForm.rs232_settings, parity: e.target.value } })}>
                      {RS232_PARITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </FormField>
                  <FormField label="Stop Bits">
                    <select style={styles.input} value={deviceForm.rs232_settings.stop_bits} onChange={(e) => setDeviceForm({ ...deviceForm, rs232_settings: { ...deviceForm.rs232_settings, stop_bits: Number(e.target.value) } })}>
                      {RS232_STOP_BITS.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </FormField>
                </div>
              </ModalSection>
            )}

            {/* Firmware + Notes */}
            <ModalSection label="General">
              <FormField label="Firmware Version">
                <input style={styles.input} value={deviceForm.firmware_version} onChange={(e) => setDeviceForm({ ...deviceForm, firmware_version: e.target.value })} placeholder="e.g. 3.4.1" />
              </FormField>
              <FormField label="Notes">
                <textarea style={{ ...styles.input, resize: "vertical" }} rows={3} value={deviceForm.notes} onChange={(e) => setDeviceForm({ ...deviceForm, notes: e.target.value })} />
              </FormField>
            </ModalSection>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
              <button type="button" style={styles.cancelBtn} onClick={closeDeviceModal}>Cancel</button>
              <button type="button" style={styles.primaryBtn} disabled={deviceSaving} onClick={handleDeviceSave}>
                {deviceSaving ? "Saving…" : deviceModal.mode === "add" ? "Add to Project" : "Save Changes"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

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
    <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
      <label style={{ fontSize: 13, fontWeight: 500, color: "#374151" }}>
        {label}{required && <span style={{ color: "#EF4444" }}> *</span>}
      </label>
      {children}
    </div>
  );
}

function ModalSection({ label, children }) {
  return (
    <div style={{ borderTop: "1px solid #F3F4F6", paddingTop: 14, marginTop: 4, marginBottom: 4 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>{label}</div>
      {children}
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

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
  if (f.name !== undefined)          p.name          = f.name;
  if (f.description !== undefined)   p.description   = f.description;
  if (f.stage_id !== undefined)      p.stage_id      = f.stage_id || null;
  if (f.client_name !== undefined)   p.client_name   = f.client_name;
  if (f.client_email !== undefined)  p.client_email  = f.client_email;
  if (f.client_phone !== undefined)  p.client_phone  = f.client_phone;
  if (f.trades !== undefined)        p.trades        = f.trades;
  if (f.start_date !== undefined)    p.start_date    = f.start_date || null;
  if (f.end_date !== undefined)      p.end_date      = f.end_date || null;
  if (f.site_address !== undefined)  p.site_address  = f.site_address;
  if (f.site_city !== undefined)     p.site_city     = f.site_city;
  if (f.site_state !== undefined)    p.site_state    = f.site_state;
  if (f.site_zip !== undefined)      p.site_zip      = f.site_zip;
  if (f.custom_fields !== undefined) p.custom_fields = f.custom_fields;
  return p;
}

function formatFileBytes(bytes) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatFileTimeAgo(iso) {
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

// ── Styles ─────────────────────────────────────────────────────────────────────

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

const projectFileRow  = { display: "flex", alignItems: "flex-start", gap: 8, padding: "8px 12px", background: "#fff", border: "1px solid #E5E7EB", borderRadius: 8 };
const projectFileLink = { background: "none", border: "none", cursor: "pointer", color: "#3B82F6", fontSize: 13, padding: 0, textAlign: "left", fontFamily: "inherit", textDecoration: "underline", wordBreak: "break-all" };
const fileDeleteBtn   = { background: "none", border: "none", cursor: "pointer", color: "#9CA3AF", fontSize: 12, padding: "0 4px", flexShrink: 0 };

const visitClockBtn = {
  padding: "4px 12px", background: "#111827", color: "#fff",
  border: "none", borderRadius: 5, fontSize: 12, fontWeight: 600, cursor: "pointer",
};

const tabBarStyle = {
  display: "flex", gap: 0, borderBottom: "2px solid #E5E7EB",
  marginBottom: 24, marginTop: 8,
};

const tabBtnStyle = {
  padding: "10px 20px", background: "none", border: "none",
  borderBottom: "2px solid transparent", marginBottom: -2,
  fontSize: 14, fontWeight: 500, color: "#6B7280", cursor: "pointer",
  transition: "color 0.15s, border-color 0.15s",
};

const tabBtnActive = {
  color: "#111827", borderBottomColor: "#111827", fontWeight: 600,
};

const deviceActionBtn = {
  padding: "3px 10px", background: "none", border: "1px solid #E5E7EB",
  borderRadius: 4, fontSize: 12, color: "#374151", cursor: "pointer",
};

const tradeTabBar = {
  display: "flex", gap: 4, flexWrap: "wrap", borderBottom: "2px solid #E5E7EB",
  marginBottom: 4,
};
const tradeTabBtn = {
  display: "flex", alignItems: "center", gap: 6,
  padding: "8px 16px", background: "none", border: "none",
  borderBottom: "2px solid transparent", marginBottom: -2,
  fontSize: 13, fontWeight: 500, color: "#6B7280", cursor: "pointer",
};
const tradeTabActive = { color: "#111827", borderBottomColor: "#111827", fontWeight: 600 };
const tradeCount = {
  fontSize: 11, fontWeight: 600, background: "#F3F4F6", color: "#6B7280",
  borderRadius: 10, padding: "1px 6px",
};

const pickerRowBtn = {
  display: "flex", alignItems: "center", justifyContent: "space-between",
  padding: "10px 12px", background: "#fff", border: "1px solid #E5E7EB",
  borderRadius: 8, cursor: "pointer", textAlign: "left", width: "100%",
  transition: "background 0.1s",
};

const badgeStyle = {
  fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 12,
};

const templateInfoBar = {
  display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
  background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 8,
  padding: "8px 12px", marginBottom: 4, fontSize: 13,
};

const capBadge = {
  fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 10,
  background: "#EFF6FF", color: "#1D4ED8", border: "1px solid #BFDBFE",
};

const removeBtn = {
  padding: "6px 10px", background: "none", border: "1px solid #E5E7EB",
  borderRadius: 4, cursor: "pointer", color: "#9CA3AF", fontSize: 12, flexShrink: 0,
};

const addRowBtn = {
  padding: "5px 12px", background: "none", border: "1px dashed #D1D5DB",
  borderRadius: 6, cursor: "pointer", color: "#6B7280", fontSize: 12, marginTop: 4,
};

const styles = {
  breadcrumb:        { display: "flex", alignItems: "center", gap: 6, marginBottom: 16, fontSize: 13 },
  breadcrumbLink:    { color: "#6B7280", cursor: "pointer" },
  breadcrumbSep:     { color: "#D1D5DB" },
  breadcrumbCurrent: { color: "#374151", fontWeight: 500 },
  titleRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12, flexWrap: "wrap" },
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
  primaryBtn:   { padding: "8px 18px", background: "#111827", color: "#fff", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer" },
  secondaryBtn: { padding: "8px 18px", background: "#fff", color: "#374151", border: "1px solid #D1D5DB", borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: "pointer" },
  cancelBtn:    { padding: "8px 18px", background: "#fff", color: "#374151", border: "1px solid #D1D5DB", borderRadius: 6, fontSize: 13, cursor: "pointer" },
  errorMsg:     { color: "#B91C1C", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 6, padding: "10px 14px", fontSize: 13, marginBottom: 12 },
  input:        { padding: "8px 10px", border: "1px solid #D1D5DB", borderRadius: 6, fontSize: 14, outline: "none", fontFamily: "inherit", width: "100%", boxSizing: "border-box" },
  checkList:    { display: "flex", flexDirection: "column", gap: 8, maxHeight: 200, overflowY: "auto", padding: "4px 0" },
  checkRow:     { display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" },
};
