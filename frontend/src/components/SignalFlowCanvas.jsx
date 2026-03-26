/**
 * SignalFlowCanvas — Phase 3C
 *
 * Renders a react-flow diagram for one trade tab on the System Design page.
 * Devices appear as custom nodes with input/output port handles.
 * Dragging from an output handle to an input handle opens a confirmation modal
 * that lets the user confirm/change the connection type before saving.
 *
 * Props:
 *   projectId       string
 *   trade           string  — trade key e.g. "av"
 *   devices         ProjectDevice[]  — already filtered to this trade
 *   connections     DeviceConnection[]
 *   diagram         SignalDiagram | null
 *   canEdit         boolean
 *   company         Company object (for title block)
 *   onConnectionCreated(conn)  — parent refreshes connection list
 *   onConnectionDeleted(id)
 *   onDeviceEdit(device)       — opens instance edit modal in parent
 *   onDeviceDeleted(id)        — parent removes device from list
 */

import { useCallback, useEffect, useRef, useState } from "react";
import ReactFlow, {
  Background,
  Controls,
  Handle,
  Position,
  addEdge,
  useNodesState,
  useEdgesState,
} from "reactflow";
import "reactflow/dist/style.css";
import dagre from "@dagrejs/dagre";
import { connectionsApi } from "@/api/connections";
import { projectDevicesApi } from "@/api/projectDevices";
import { diagramsApi } from "@/api/diagrams";
import { TRADE_LABEL } from "@/constants/trades";

// ── Signal-type colour palette ────────────────────────────────────────────────
const DEFAULT_SIGNAL_COLORS = {
  Video:          "#3B82F6",
  Audio:          "#10B981",
  Control:        "#F59E0B",
  Network:        "#6B7280",
  Data:           "#EAB308",
  Power:          "#EF4444",
  Security:       "#64748B",
  "Access Control": "#6366F1",
  Fire:           "#F43F5E",
  Surveillance:   "#8B5CF6",
  Other:          "#9CA3AF",
};

const LS_COLOR_KEY = "zappy_signal_colors";
function loadSavedColors() {
  try { return { ...DEFAULT_SIGNAL_COLORS, ...JSON.parse(localStorage.getItem(LS_COLOR_KEY) || "{}") }; }
  catch { return { ...DEFAULT_SIGNAL_COLORS }; }
}
function persistColors(map) {
  try { localStorage.setItem(LS_COLOR_KEY, JSON.stringify(map)); } catch {/* no-op */}
}

const CONNECTION_TYPES = [
  "HDMI", "SDI", "DisplayPort", "VGA", "DVI",
  "RS232", "RS485", "RS422",
  "RCA", "XLR", "TRS", "TS",
  "Dante", "AES67",
  "Cat6", "Cat6A", "Fiber",
  "Relay", "IR", "USB", "Other",
];

// Accept an optional color map — falls back to defaults (used outside component scope)
const signalColor = (type, colors) => {
  const map = colors || DEFAULT_SIGNAL_COLORS;
  return map[type] || map.Other || "#9CA3AF";
};

const NODE_WIDTH  = 240;
const PORT_HEIGHT = 26;
const NODE_BASE_H = 64;

/** Expand matrix_ports groups into virtual individual port objects. */
function expandMatrixPorts(template) {
  const result = [];
  for (const g of template?.matrix_ports || []) {
    for (let i = 1; i <= (g.input_count || 0); i++) {
      result.push({ id: `m_${g.signal_type}_in_${i}`,  label: `${g.signal_type} In ${i}`,   direction: "input",  signal_type: g.signal_type, connector_type: g.connector_type });
    }
    for (let i = 1; i <= (g.output_count || 0); i++) {
      result.push({ id: `m_${g.signal_type}_out_${i}`, label: `${g.signal_type} Out ${i}`,  direction: "output", signal_type: g.signal_type, connector_type: g.connector_type });
    }
    for (let i = 1; i <= (g.io_count || 0); i++) {
      result.push({ id: `m_${g.signal_type}_io_${i}`,  label: `${g.signal_type} I/O ${i}`,  direction: "io",     signal_type: g.signal_type, connector_type: g.connector_type });
    }
  }
  return result;
}

/** All effective ports for a device (named ports + expanded matrix ports). */
function effectivePorts(device) {
  const named = device.template?.ports || [];
  if (named.length > 0) return named;
  if (device.template?.is_matrix) return expandMatrixPorts(device.template);
  return named;
}

function nodeHeight(device, visiblePorts) {
  const ports = visiblePorts ?? effectivePorts(device);
  const ins  = ports.filter((p) => p.direction === "input").length;
  const outs = ports.filter((p) => p.direction === "output").length;
  const ios  = ports.filter((p) => p.direction === "io").length;
  const maxSide = Math.max(ins + ios, outs + ios);
  return NODE_BASE_H + maxSide * PORT_HEIGHT;
}

// ── Dagre auto-layout ─────────────────────────────────────────────────────────
function getAutoLayout(nodes, edges) {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "LR", nodesep: 60, ranksep: 120 });

  nodes.forEach((n) => g.setNode(n.id, { width: NODE_WIDTH, height: n.data.estHeight }));
  edges.forEach((e) => g.setEdge(e.source, e.target));
  dagre.layout(g);

  return nodes.map((n) => {
    const pos = g.node(n.id);
    return { ...n, position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - n.data.estHeight / 2 } };
  });
}

// ── Custom Device Node ────────────────────────────────────────────────────────
function DeviceNode({ data }) {
  const { device, canEdit, onEdit, hideUnused, connectedPortIds, signalColors: sc } = data;
  const t = device.template;
  let ports = effectivePorts(device);

  // Feature 7: hide ports that have no connections when toggle is on
  if (hideUnused && connectedPortIds) {
    const used = new Set(connectedPortIds);
    const filtered = ports.filter((p) => {
      // IO ports use _in / _out suffix IDs
      if (p.direction === "io") return used.has(`${p.id}_in`) || used.has(`${p.id}_out`);
      return used.has(p.id);
    });
    // Only apply filter if it wouldn't hide everything (always show at least default handles)
    if (filtered.length > 0) ports = filtered;
  }

  const inputs  = ports.filter((p) => p.direction === "input");
  const outputs = ports.filter((p) => p.direction === "output");
  const ios     = ports.filter((p) => p.direction === "io");

  return (
    <div
      style={nodeStyle}
      onDoubleClick={() => canEdit && onEdit(device)}
      title={canEdit ? "Double-click to edit" : undefined}
    >
      {/* Header */}
      <div style={nodeHeader}>
        <div style={nodeLabel}>{device.label || `${t?.make} ${t?.model}` || "Unknown"}</div>
        {(device.label && t) && (
          <div style={nodeMakeModel}>{t.make} {t.model}</div>
        )}
      </div>

      {/* Port columns */}
      <div style={nodePortsRow}>
        {/* Inputs (left) */}
        <div style={nodePortCol}>
          {inputs.map((p) => (
            <div key={p.id} style={portRowLeft}>
              <Handle
                type="target"
                position={Position.Left}
                id={p.id}
                style={{ ...handleStyle, background: signalColor(p.signal_type, sc), left: -8 }}
              />
              <span style={portLabelStyle}>{p.label}</span>
            </div>
          ))}
          {ios.map((p) => (
            <div key={`io-l-${p.id}`} style={portRowLeft}>
              <Handle
                type="target"
                position={Position.Left}
                id={`${p.id}_in`}
                style={{ ...handleStyle, background: signalColor(p.signal_type, sc), left: -8 }}
              />
              <span style={portLabelStyle}>{p.label}</span>
            </div>
          ))}
          {inputs.length === 0 && ios.length === 0 && effectivePorts(device).length === 0 && (
            <Handle type="target" position={Position.Left} id="default_in" style={{ ...handleStyle, left: -8 }} />
          )}
        </div>

        {/* Outputs (right) */}
        <div style={nodePortColRight}>
          {outputs.map((p) => (
            <div key={p.id} style={portRowRight}>
              <span style={portLabelStyleRight}>{p.label}</span>
              <Handle
                type="source"
                position={Position.Right}
                id={p.id}
                style={{ ...handleStyle, background: signalColor(p.signal_type, sc), right: -8 }}
              />
            </div>
          ))}
          {ios.map((p) => (
            <div key={`io-r-${p.id}`} style={portRowRight}>
              <span style={portLabelStyleRight}>{p.label}</span>
              <Handle
                type="source"
                position={Position.Right}
                id={`${p.id}_out`}
                style={{ ...handleStyle, background: signalColor(p.signal_type, sc), right: -8 }}
              />
            </div>
          ))}
          {outputs.length === 0 && ios.length === 0 && effectivePorts(device).length === 0 && (
            <Handle type="source" position={Position.Right} id="default_out" style={{ ...handleStyle, right: -8 }} />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Stub / Floating Endpoint Node ─────────────────────────────────────────────
function StubNode({ data }) {
  const { label, note, canEdit, onLabelChange, onNoteChange } = data;
  return (
    <div style={stubNodeStyle}>
      <Handle type="target" position={Position.Left}  id="in"  style={{ ...handleStyle, left: -8,  background: "#9CA3AF" }} />
      <div style={stubNodeInner}>
        {canEdit ? (
          <input
            style={stubLabelInput}
            value={label}
            onChange={(e) => onLabelChange(e.target.value)}
            placeholder="External device / endpoint…"
          />
        ) : (
          <div style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>{label || "External"}</div>
        )}
        {canEdit ? (
          <input
            style={{ ...stubLabelInput, fontSize: 10, color: "#9CA3AF", marginTop: 2 }}
            value={note || ""}
            onChange={(e) => onNoteChange(e.target.value)}
            placeholder="Port / note (optional)"
          />
        ) : (
          note && <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 2 }}>{note}</div>
        )}
      </div>
      <Handle type="source" position={Position.Right} id="out" style={{ ...handleStyle, right: -8, background: "#9CA3AF" }} />
    </div>
  );
}

const nodeTypes = { device: DeviceNode, stub: StubNode };

// ── Main canvas component ─────────────────────────────────────────────────────
export default function SignalFlowCanvas({
  projectId,
  trade,
  devices,
  connections,
  diagram,
  canEdit,
  company,
  onConnectionCreated,
  onConnectionDeleted,
  onDeviceEdit,
  onDeviceDeleted,
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [connModal, setConnModal] = useState(null); // { source, sourceHandle, target, targetHandle }
  const [connType, setConnType]   = useState("HDMI");
  const [connNotes, setConnNotes] = useState("");
  const [connSaving, setConnSaving] = useState("");
  const [hideUnusedPorts, setHideUnusedPorts] = useState(false);
  const [isFullscreen, setIsFullscreen]       = useState(false);
  const [signalColors, setSignalColors]       = useState(loadSavedColors);
  const [showLegend, setShowLegend]           = useState(false);
  const [stubNodes, setStubNodes]             = useState(() => diagram?.stub_nodes || []);
  const posTimers   = useRef({});
  const stubTimer   = useRef(null);
  const initialised = useRef(false);

  // Sync stub nodes when diagram prop changes (trade switch)
  useEffect(() => {
    setStubNodes(diagram?.stub_nodes || []);
  }, [diagram, trade]);

  const saveStubs = useCallback((list) => {
    clearTimeout(stubTimer.current);
    stubTimer.current = setTimeout(() => {
      diagramsApi.upsert(projectId, trade, { stub_nodes: list }).catch(() => {});
    }, 600);
  }, [projectId, trade]);

  function addStubNode() {
    const id = `stub-${Date.now().toString(36)}`;
    const node = { id, label: "", note: "", position: { x: 80, y: 80 } };
    const next = [...stubNodes, node];
    setStubNodes(next);
    saveStubs(next);
  }

  function updateStubField(id, field, value) {
    setStubNodes((prev) => {
      const next = prev.map((s) => s.id === id ? { ...s, [field]: value } : s);
      saveStubs(next);
      return next;
    });
  }

  // Set of all port IDs that have at least one connection (for Feature 7)
  const connectedPortIds = new Set(
    connections.flatMap((c) => [c.source_port, c.destination_port].filter(Boolean))
  );

  // ── Build nodes & edges from props ──────────────────────────────────────────
  const buildNodes = useCallback(() => {
    const deviceNodes = devices.map((d) => {
      const savedPos = d.node_position?.[trade];
      return {
        id: d.id,
        type: "device",
        position: savedPos ? { x: savedPos.x, y: savedPos.y } : { x: 0, y: 0 },
        data: {
          device: d,
          canEdit,
          onEdit: onDeviceEdit,
          estHeight: nodeHeight(d),
          hideUnused: hideUnusedPorts,
          connectedPortIds,
          signalColors,
        },
      };
    });
    const sNodes = stubNodes.map((s) => ({
      id: s.id,
      type: "stub",
      position: s.position || { x: 80, y: 80 },
      data: {
        label: s.label || "",
        note: s.note || "",
        canEdit,
        onLabelChange: (v) => updateStubField(s.id, "label", v),
        onNoteChange:  (v) => updateStubField(s.id, "note",  v),
      },
    }));
    return [...deviceNodes, ...sNodes];
  },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [devices, trade, canEdit, onDeviceEdit, hideUnusedPorts, connectedPortIds, signalColors, stubNodes]);

  const buildEdges = useCallback(() =>
    connections
      .filter((c) => c.source_device_id && c.destination_device_id)
      .map((c) => {
        const rawSrcPortId = (c.source_port || "").replace(/_out$/, "");
        const srcDevice    = devices.find((d) => d.id === c.source_device_id);
        const allPorts     = effectivePorts(srcDevice || {});
        const srcPort      = allPorts.find((p) => p.id === rawSrcPortId);
        const color        = signalColor(srcPort?.signal_type, signalColors);
        return {
          id: c.id,
          source: c.source_device_id,
          sourceHandle: c.source_port || "default_out",
          target: c.destination_device_id,
          targetHandle: c.destination_port || "default_in",
          label: c.connection_type || "",
          style: { stroke: color, strokeWidth: 2 },
          labelStyle: { fontSize: 11, fill: "#374151" },
          labelBgStyle: { fill: "#F9FAFB", fillOpacity: 0.85 },
          data: { connectionId: c.id },
        };
      }),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [connections, devices, signalColors]);

  // Sync from props; auto-layout if no positions saved yet
  useEffect(() => {
    const newNodes = buildNodes();
    const newEdges = buildEdges();
    const needsLayout = newNodes.some((n) => !devices.find((d) => d.id === n.id)?.node_position?.[trade]);

    if (needsLayout && newNodes.length > 0 && !initialised.current) {
      const laid = getAutoLayout(newNodes, newEdges);
      setNodes(laid);
      // Persist auto-generated positions (fire-and-forget)
      laid.forEach((n) => {
        projectDevicesApi.updatePosition(projectId, n.id, trade, n.position).catch(() => {});
      });
    } else {
      setNodes(newNodes);
    }
    setEdges(newEdges);
    initialised.current = true;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devices, connections, trade]);

  // ── Drag-stop: save position (debounced 500ms) ───────────────────────────────
  const onNodeDragStop = useCallback((_, node) => {
    if (node.type === "stub") {
      setStubNodes((prev) => {
        const next = prev.map((s) => s.id === node.id ? { ...s, position: node.position } : s);
        saveStubs(next);
        return next;
      });
      return;
    }
    clearTimeout(posTimers.current[node.id]);
    posTimers.current[node.id] = setTimeout(() => {
      projectDevicesApi.updatePosition(projectId, node.id, trade, node.position).catch(() => {});
    }, 500);
  }, [projectId, trade, saveStubs]);

  // ── Connect: open confirmation modal ─────────────────────────────────────────
  const onConnect = useCallback((params) => {
    if (!canEdit) return;
    // Pre-fill connection_type from source port's connector_type
    const srcDevice = devices.find((d) => d.id === params.source);
    const srcPort   = (srcDevice?.template?.ports || []).find((p) => p.id === params.sourceHandle);
    const guess     = srcPort?.connector_type && CONNECTION_TYPES.includes(srcPort.connector_type)
      ? srcPort.connector_type : "Other";
    setConnType(guess);
    setConnNotes("");
    setConnModal(params);
  }, [canEdit, devices]);

  const handleSaveConnection = async () => {
    if (!connModal) return;
    setConnSaving(true);
    try {
      // Store full handle IDs as-is — buildEdges uses them directly
      const srcPortId = connModal.sourceHandle === "default_out" ? null : connModal.sourceHandle;
      const dstPortId = connModal.targetHandle === "default_in"  ? null : connModal.targetHandle;

      const res = await connectionsApi.create(projectId, {
        trade,
        source_device_id:      connModal.source,
        source_port:           srcPortId,
        destination_device_id: connModal.target,
        destination_port:      dstPortId,
        connection_type:       connType,
        notes:                 connNotes || null,
      });
      const conn = res.data.connection;
      onConnectionCreated(conn);

      // Optimistically add edge
      const srcDevice = devices.find((d) => d.id === conn.source_device_id);
      const rawSrc    = (conn.source_port || "").replace(/_out$/, "");
      const srcPort   = effectivePorts(srcDevice || {}).find((p) => p.id === rawSrc);
      const color = signalColor(srcPort?.signal_type, signalColors);
      setEdges((es) => addEdge({
        id: conn.id,
        source: conn.source_device_id,
        sourceHandle: conn.source_port || "default_out",
        target: conn.destination_device_id,
        targetHandle: conn.destination_port || "default_in",
        label: conn.connection_type || "",
        style: { stroke: color, strokeWidth: 2 },
        labelStyle: { fontSize: 11, fill: "#374151" },
        labelBgStyle: { fill: "#F9FAFB", fillOpacity: 0.85 },
        data: { connectionId: conn.id },
      }, es));
      setConnModal(null);
    } catch {/* no-op */} finally {
      setConnSaving(false);
    }
  };

  // ── Delete edges via keyboard ─────────────────────────────────────────────────
  const onEdgesDelete = useCallback(async (deletedEdges) => {
    for (const edge of deletedEdges) {
      try {
        await connectionsApi.remove(projectId, edge.id);
        onConnectionDeleted(edge.id);
      } catch {/* no-op */}
    }
  }, [projectId, onConnectionDeleted]);

  // ── Delete nodes via keyboard ─────────────────────────────────────────────────
  const onNodesDelete = useCallback(async (deletedNodes) => {
    for (const node of deletedNodes) {
      if (node.type === "stub") {
        setStubNodes((prev) => {
          const next = prev.filter((s) => s.id !== node.id);
          saveStubs(next);
          return next;
        });
        continue;
      }
      if (window.confirm(`Remove "${node.data.device.label || node.data.device.template?.model || "device"}" from this project?`)) {
        try {
          await projectDevicesApi.remove(projectId, node.id);
          onDeviceDeleted(node.id);
        } catch {/* no-op */}
      }
    }
  }, [projectId, onDeviceDeleted, saveStubs]);

  // ── Title block data ──────────────────────────────────────────────────────────
  const tradeLabel = TRADE_LABEL[trade] || trade;
  const companyName = diagram?.company_name_override || company?.name || "";

  const canvasContent = (
    <div style={{ display: "flex", gap: 12, height: "100%", minHeight: 0 }}>
      {/* Canvas */}
      <div style={canvasWrap}>
        {/* Toolbar */}
        <div style={canvasToolbar}>
          <button
            type="button"
            style={{ ...toolbarBtn, background: hideUnusedPorts ? "#EFF6FF" : "transparent", borderColor: hideUnusedPorts ? "#93C5FD" : "#E5E7EB" }}
            onClick={() => setHideUnusedPorts((v) => !v)}
          >
            {hideUnusedPorts ? "Show All Ports" : "Hide Unused Ports"}
          </button>
          <button
            type="button"
            style={{ ...toolbarBtn, background: showLegend ? "#EFF6FF" : "transparent", borderColor: showLegend ? "#93C5FD" : "#E5E7EB" }}
            onClick={() => setShowLegend((v) => !v)}
          >
            Legend
          </button>
          {canEdit && (
            <button
              type="button"
              style={toolbarBtn}
              onClick={addStubNode}
              title="Add a floating endpoint node (e.g. external device, BYOD connection)"
            >
              + Add Endpoint
            </button>
          )}
          <button
            type="button"
            style={toolbarBtn}
            onClick={() => setIsFullscreen((v) => !v)}
          >
            {isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
          </button>
        </div>

        {/* Legend panel */}
        {showLegend && (
          <div style={legendPanel}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 8 }}>
              Signal Colors
              <button
                type="button"
                style={{ float: "right", background: "none", border: "none", cursor: "pointer", fontSize: 11, color: "#6B7280" }}
                onClick={() => { setSignalColors({ ...DEFAULT_SIGNAL_COLORS }); persistColors({}); }}
                title="Reset to defaults"
              >
                Reset
              </button>
            </div>
            {Object.entries(signalColors).map(([type, color]) => (
              <div key={type} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                <input
                  type="color"
                  value={color}
                  onChange={(e) => {
                    const next = { ...signalColors, [type]: e.target.value };
                    setSignalColors(next);
                    persistColors(next);
                  }}
                  style={{ width: 24, height: 20, padding: 0, border: "1px solid #E5E7EB", borderRadius: 3, cursor: "pointer" }}
                  title={`Change ${type} color`}
                />
                <span style={{ fontSize: 12, color: "#374151" }}>{type}</span>
                <div style={{ flex: 1, height: 2, background: color, borderRadius: 1 }} />
              </div>
            ))}
          </div>
        )}

        {/* ReactFlow needs an explicit-height parent — this wrapper provides it */}
        <div style={{ flex: 1, minHeight: 0 }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeDragStop={onNodeDragStop}
            onEdgesDelete={onEdgesDelete}
            onNodesDelete={onNodesDelete}
            nodeTypes={nodeTypes}
            fitView={nodes.length > 0}
            fitViewOptions={{ padding: 0.2 }}
            deleteKeyCode={["Delete", "Backspace"]}
            nodesDraggable={canEdit}
            nodesConnectable={canEdit}
            elementsSelectable={canEdit}
          >
            <Background gap={16} color="#E5E7EB" />
            <Controls />
          </ReactFlow>
        </div>

        {/* Title block */}
        <div style={titleBlock}>
          <div style={tbLeft}>
            {companyName && <div style={tbCompany}>{companyName}</div>}
          </div>
          <div style={tbCenter}>
            <div style={tbTitle}>{diagram?.drawing_title || `${tradeLabel} Signal Flow`}</div>
            {diagram?.location && <div style={tbSub}>{diagram.location}</div>}
          </div>
          <div style={tbRight}>
            {diagram?.revision  && <div style={tbMeta}>Rev: {diagram.revision}</div>}
            {diagram?.drawn_by  && <div style={tbMeta}>By: {diagram.drawn_by}</div>}
            {diagram?.drawing_date && <div style={tbMeta}>{diagram.drawing_date}</div>}
          </div>
        </div>
      </div>

      {/* Connection sidebar */}
      <ConnectionSidebar connections={connections} devices={devices} stubNodes={stubNodes} />

      {/* Connection confirmation modal */}
      {connModal && (
        <div style={modalOverlay}>
          <div style={modalBox}>
            <h3 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 600 }}>Confirm Connection</h3>
            <ConnEndpoint label="From" deviceId={connModal.source} handleId={connModal.sourceHandle} devices={devices} />
            <ConnEndpoint label="To"   deviceId={connModal.target} handleId={connModal.targetHandle} devices={devices} />
            <div style={{ marginTop: 12 }}>
              <label style={mLabel}>Connection Type</label>
              <select style={mInput} value={connType} onChange={(e) => setConnType(e.target.value)}>
                {CONNECTION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div style={{ marginTop: 8 }}>
              <label style={mLabel}>Notes (optional)</label>
              <input style={mInput} value={connNotes} onChange={(e) => setConnNotes(e.target.value)} placeholder="e.g. 25ft run" />
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
              <button style={cancelBtn} onClick={() => setConnModal(null)}>Cancel</button>
              <button style={saveBtn} onClick={handleSaveConnection} disabled={connSaving}>
                {connSaving ? "Saving…" : "Add Connection"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  if (isFullscreen) {
    return (
      <div style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "#fff", display: "flex", flexDirection: "column",
      }}>
        {canvasContent}
      </div>
    );
  }

  return canvasContent;
}

// ── Connection endpoint helper (modal) ───────────────────────────────────────
function ConnEndpoint({ label, deviceId, handleId, devices }) {
  const device   = devices.find((d) => d.id === deviceId);
  const deviceName = device ? (device.label || `${device.template?.make} ${device.template?.model}`) : deviceId;
  const rawPortId  = handleId?.replace(/_in$|_out$/, "");
  const port       = device && (device.template?.ports || []).find((p) => p.id === rawPortId);
  return (
    <div style={{ marginBottom: 4, fontSize: 13 }}>
      <span style={{ color: "#6B7280", minWidth: 36, display: "inline-block" }}>{label}:</span>{" "}
      <strong>{deviceName}</strong>
      {port && <span style={{ color: "#6B7280" }}> — {port.label}</span>}
    </div>
  );
}

// ── Sidebar connection table ─────────────────────────────────────────────────
function ConnectionSidebar({ connections, devices, stubNodes = [] }) {
  const deviceName = (id) => {
    const d = devices.find((x) => x.id === id);
    if (d) return d.label || `${d.template?.make} ${d.template?.model}`;
    const s = stubNodes.find((x) => x.id === id);
    if (s) return s.label || "External";
    return "—";
  };
  const portLabel = (deviceId, portId) => {
    if (!portId) return null;
    const rawId = portId.replace(/_in$|_out$/, "");
    const d = devices.find((x) => x.id === deviceId);
    return (d?.template?.ports || []).find((p) => p.id === rawId)?.label || rawId;
  };

  if (!connections.length) return (
    <div style={sidebarWrap}>
      <div style={sidebarTitle}>Connections</div>
      <p style={{ fontSize: 12, color: "#9CA3AF", marginTop: 8 }}>None yet. Drag from an output port to an input port to add one.</p>
    </div>
  );

  return (
    <div style={sidebarWrap}>
      <div style={sidebarTitle}>Connections ({connections.length})</div>
      {connections.map((c) => {
        const srcPort = portLabel(c.source_device_id, c.source_port);
        const dstPort = portLabel(c.destination_device_id, c.destination_port);
        return (
          <div key={c.id} style={connRow}>
            <div style={{ fontSize: 12, fontWeight: 500 }}>{deviceName(c.source_device_id)}</div>
            {srcPort && <div style={connSub}>{srcPort}</div>}
            <div style={connArrow}>↓</div>
            <div style={{ fontSize: 12, fontWeight: 500 }}>{deviceName(c.destination_device_id)}</div>
            {dstPort && <div style={connSub}>{dstPort}</div>}
            {c.connection_type && <div style={connType}>{c.connection_type}</div>}
          </div>
        );
      })}
    </div>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────
const canvasWrap = {
  flex: 1,
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  border: "1px solid #E5E7EB",
  borderRadius: 8,
  overflow: "hidden",
  position: "relative",
};

const canvasToolbar = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "6px 10px",
  borderBottom: "1px solid #E5E7EB",
  background: "#F9FAFB",
  flexShrink: 0,
};

const toolbarBtn = {
  fontSize: 12,
  padding: "4px 10px",
  borderRadius: 4,
  border: "1px solid #E5E7EB",
  background: "transparent",
  cursor: "pointer",
  color: "#374151",
  whiteSpace: "nowrap",
};

const stubNodeStyle = {
  background: "#FEF9EE",
  border: "1.5px dashed #D97706",
  borderRadius: 8,
  minWidth: 180,
  boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
  fontSize: 12,
  padding: "6px 12px",
};

const stubNodeInner = { display: "flex", flexDirection: "column" };

const stubLabelInput = {
  border: "none",
  background: "transparent",
  fontSize: 12,
  fontWeight: 600,
  color: "#374151",
  outline: "none",
  width: "100%",
  padding: 0,
};

const legendPanel = {
  position: "absolute",
  top: 44,
  left: 10,
  zIndex: 10,
  background: "#fff",
  border: "1px solid #E5E7EB",
  borderRadius: 8,
  padding: "10px 12px",
  minWidth: 200,
  boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
};

const nodeStyle = {
  background: "#FFFFFF",
  border: "1px solid #D1D5DB",
  borderRadius: 8,
  minWidth: NODE_WIDTH,
  boxShadow: "0 1px 6px rgba(0,0,0,0.08)",
  cursor: "default",
  fontSize: 12,
};

const nodeHeader = {
  padding: "8px 12px 6px",
  borderBottom: "1px solid #F3F4F6",
  background: "#F9FAFB",
  borderRadius: "8px 8px 0 0",
};

const nodeLabel = {
  fontWeight: 600,
  fontSize: 13,
  color: "#111827",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const nodeMakeModel = { fontSize: 11, color: "#9CA3AF", marginTop: 1 };

const nodePortsRow = {
  display: "flex",
  justifyContent: "space-between",
  padding: "6px 0",
  minHeight: 32,
};

const nodePortCol      = { display: "flex", flexDirection: "column", gap: 0, flex: 1, position: "relative" };
const nodePortColRight = { display: "flex", flexDirection: "column", gap: 0, flex: 1, position: "relative", alignItems: "flex-end" };

const portRowLeft  = { display: "flex", alignItems: "center", position: "relative", height: PORT_HEIGHT, paddingLeft: 14 };
const portRowRight = { display: "flex", alignItems: "center", position: "relative", height: PORT_HEIGHT, paddingRight: 14, justifyContent: "flex-end" };

const portLabelStyle      = { fontSize: 11, color: "#4B5563", whiteSpace: "nowrap" };
const portLabelStyleRight = { fontSize: 11, color: "#4B5563", whiteSpace: "nowrap", textAlign: "right" };

const handleStyle = {
  width: 10,
  height: 10,
  background: "#9CA3AF",
  border: "2px solid #FFFFFF",
  borderRadius: "50%",
};

const titleBlock = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "8px 14px",
  borderTop: "2px solid #374151",
  background: "#F9FAFB",
  gap: 12,
};

const tbLeft    = { minWidth: 120 };
const tbCenter  = { flex: 1, textAlign: "center" };
const tbRight   = { minWidth: 120, textAlign: "right" };
const tbCompany = { fontSize: 12, fontWeight: 600, color: "#111827" };
const tbTitle   = { fontSize: 13, fontWeight: 700, color: "#111827" };
const tbSub     = { fontSize: 11, color: "#6B7280", marginTop: 2 };
const tbMeta    = { fontSize: 11, color: "#6B7280" };

const sidebarWrap  = { width: 240, flexShrink: 0, display: "flex", flexDirection: "column", gap: 0 };
const sidebarTitle = { fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 8, paddingBottom: 6, borderBottom: "1px solid #E5E7EB" };
const connRow = {
  padding: "8px 0",
  borderBottom: "1px solid #F3F4F6",
  fontSize: 12,
};
const connSub   = { fontSize: 11, color: "#6B7280" };
const connArrow = { color: "#9CA3AF", fontSize: 11, margin: "2px 0" };
const connType  = { display: "inline-block", marginTop: 4, fontSize: 11, background: "#F3F4F6", color: "#374151", borderRadius: 4, padding: "1px 6px" };

// Modal
const modalOverlay = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
  display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999,
};
const modalBox = {
  background: "#FFFFFF", borderRadius: 10, padding: 20,
  width: 360, boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
};
const mLabel = { fontSize: 12, fontWeight: 500, color: "#374151", display: "block", marginBottom: 4 };
const mInput = {
  width: "100%", padding: "8px 10px", border: "1px solid #D1D5DB",
  borderRadius: 6, fontSize: 13, boxSizing: "border-box",
};
const cancelBtn = {
  padding: "8px 16px", background: "#F3F4F6", color: "#374151",
  border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 500,
};
const saveBtn = {
  padding: "8px 16px", background: "#111827", color: "#FFFFFF",
  border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 500,
};
