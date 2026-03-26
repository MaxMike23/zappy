import { useState } from "react";
import { projectDevicesApi } from "@/api/projectDevices";

/**
 * RackLayout — visual drag-and-drop rack slot editor.
 *
 * Shows all rack devices (template.is_rack === true) added to the project.
 * Non-rack project devices can be dragged from the left panel into rack slots.
 * Racks with is_back_facing show both Front and Back panels side-by-side.
 */
export default function RackLayout({ projectId, projectDevices, onDeviceUpdate }) {
  const [draggingId, setDraggingId]   = useState(null);
  const [hoverTarget, setHoverTarget] = useState(null); // { rackId, slot, facing }

  const racks    = projectDevices.filter((d) => d.template?.is_rack);
  const nonRacks = projectDevices.filter((d) => !d.template?.is_rack);
  const unplaced = nonRacks.filter((d) => !d.rack_id);
  const placed   = nonRacks.filter((d) => !!d.rack_id);

  async function placeDevice(deviceId, rackId, slot, facing) {
    try {
      const res = await projectDevicesApi.updateRackPlacement(projectId, deviceId, {
        rack_id: rackId, rack_slot: slot, rack_facing: facing,
      });
      onDeviceUpdate(res.data.device);
    } catch {/* no-op */}
  }

  async function removeFromRack(deviceId) {
    try {
      const res = await projectDevicesApi.updateRackPlacement(projectId, deviceId, {
        rack_id: null, rack_slot: null, rack_facing: null,
      });
      onDeviceUpdate(res.data.device);
    } catch {/* no-op */}
  }

  function onDragStart(e, deviceId) {
    setDraggingId(deviceId);
    e.dataTransfer.effectAllowed = "move";
  }

  function onDragEnd() {
    setDraggingId(null);
    setHoverTarget(null);
  }

  function onDragOver(e, rackId, slot, facing) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const t = hoverTarget;
    if (!t || t.rackId !== rackId || t.slot !== slot || t.facing !== facing) {
      setHoverTarget({ rackId, slot, facing });
    }
  }

  function onDragLeave(e) {
    // Only clear if leaving the slot entirely
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setHoverTarget(null);
    }
  }

  function onDrop(e, rackId, slot, facing) {
    e.preventDefault();
    setHoverTarget(null);
    if (!draggingId) return;
    placeDevice(draggingId, rackId, slot, facing);
    setDraggingId(null);
  }

  if (racks.length === 0) {
    return (
      <div style={{ padding: "32px 0", color: "#6B7280", fontSize: 14, textAlign: "center" }}>
        <p style={{ margin: 0 }}>No rack devices have been added to this project.</p>
        <p style={{ margin: "6px 0 0", fontSize: 13 }}>
          Go to <strong>System Design</strong> and add a device whose template has the "Is Rack?" capability enabled.
        </p>
      </div>
    );
  }

  return (
    <div style={styles.layout}>
      {/* ── Left sidebar: unplaced & placed device lists ── */}
      <div style={styles.sidebar}>
        <div style={styles.sidebarSection}>
          <h3 style={styles.sidebarHeading}>Unplaced ({unplaced.length})</h3>
          {unplaced.length === 0 && (
            <p style={styles.emptyNote}>All devices are placed in a rack.</p>
          )}
          {unplaced.map((d) => (
            <DeviceCard
              key={d.id}
              device={d}
              isDragging={draggingId === d.id}
              onDragStart={(e) => onDragStart(e, d.id)}
              onDragEnd={onDragEnd}
            />
          ))}
        </div>

        {placed.length > 0 && (
          <div style={{ ...styles.sidebarSection, marginTop: 16 }}>
            <h3 style={styles.sidebarHeading}>Placed ({placed.length})</h3>
            {placed.map((d) => {
              const rack = racks.find((r) => r.id === d.rack_id);
              return (
                <DeviceCard
                  key={d.id}
                  device={d}
                  isDragging={draggingId === d.id}
                  onDragStart={(e) => onDragStart(e, d.id)}
                  onDragEnd={onDragEnd}
                  subtitle={`Slot ${d.rack_slot}${d.rack_facing === "back" ? " (back)" : ""} · ${rack?.label || rack?.template?.model || "rack"}`}
                  placed
                />
              );
            })}
          </div>
        )}
      </div>

      {/* ── Rack panels ── */}
      <div style={styles.racksArea}>
        {racks.map((rack) => {
          const rackUnits     = rack.template?.rack_units || 12;
          const isBackFacing  = rack.template?.is_back_facing;
          const panels        = isBackFacing ? ["front", "back"] : ["front"];

          return (
            <div key={rack.id} style={styles.rackWrapper}>
              <h3 style={styles.rackTitle}>
                {rack.label || rack.template?.model || "Rack"}
                <span style={styles.rackMeta}> — {rackUnits}U{rack.room ? ` · ${rack.room}` : ""}</span>
              </h3>

              <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
                {panels.map((facing) => {
                  const panelDevices = nonRacks.filter(
                    (d) => d.rack_id === rack.id && d.rack_facing === facing
                  );
                  const slotMap = {};
                  panelDevices.forEach((d) => { if (d.rack_slot) slotMap[d.rack_slot] = d; });

                  return (
                    <div key={facing}>
                      {isBackFacing && (
                        <div style={styles.panelLabel}>{facing === "front" ? "Front Panel" : "Back Panel"}</div>
                      )}
                      <div style={styles.rackFrame}>
                        {/* Rail labels */}
                        <div style={styles.rackHeader}>
                          <span style={styles.slotNum}>#</span>
                          <span style={{ flex: 1, fontSize: 10, color: "#9CA3AF", paddingLeft: 8 }}>Device</span>
                        </div>

                        {Array.from({ length: rackUnits }, (_, i) => {
                          const slot     = i + 1;
                          const occupant = slotMap[slot];
                          const isDraggingOccupant = occupant && draggingId === occupant.id;
                          const isHover  = !occupant &&
                            hoverTarget?.rackId === rack.id &&
                            hoverTarget?.slot   === slot &&
                            hoverTarget?.facing === facing;

                          return (
                            <div
                              key={slot}
                              onDragOver={(e) => !occupant && !isDraggingOccupant && onDragOver(e, rack.id, slot, facing)}
                              onDragLeave={(e) => isHover && onDragLeave(e)}
                              onDrop={(e) => onDrop(e, rack.id, slot, facing)}
                              style={{
                                ...styles.rackSlot,
                                background: isHover
                                  ? "#1D4ED8"
                                  : occupant && !isDraggingOccupant
                                    ? "#1E3A5F"
                                    : "transparent",
                                borderBottom: slot < rackUnits ? "1px solid #374151" : "none",
                              }}
                            >
                              <span style={styles.slotNum}>{slot}</span>

                              <div style={styles.slotContent}>
                                {occupant && !isDraggingOccupant ? (
                                  <div
                                    draggable
                                    onDragStart={(e) => onDragStart(e, occupant.id)}
                                    onDragEnd={onDragEnd}
                                    style={styles.occupantRow}
                                  >
                                    <span style={styles.occupantLabel} title={occupant.label || occupant.template?.model}>
                                      {occupant.label || occupant.template?.model || "Device"}
                                    </span>
                                    <span style={styles.occupantMeta}>
                                      {occupant.template?.make}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => removeFromRack(occupant.id)}
                                      style={styles.removeBtn}
                                      title="Remove from rack"
                                    >✕</button>
                                  </div>
                                ) : isHover ? (
                                  <span style={{ fontSize: 11, color: "#BFDBFE" }}>Drop here</span>
                                ) : (
                                  <span style={styles.emptySlot}>— empty —</span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DeviceCard({ device, isDragging, onDragStart, onDragEnd, subtitle, placed }) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      style={{
        ...styles.deviceCard,
        background: isDragging ? "#DBEAFE" : placed ? "#F0FDF4" : "#F9FAFB",
        borderColor: isDragging ? "#93C5FD" : placed ? "#BBF7D0" : "#E5E7EB",
        opacity: isDragging ? 0.5 : 1,
      }}
    >
      <div style={styles.deviceCardName}>
        {device.label || device.template?.model || "Unnamed"}
      </div>
      <div style={styles.deviceCardSub}>
        {subtitle || (device.template ? `${device.template.make} ${device.template.model}` : "Unknown")}
      </div>
    </div>
  );
}

const styles = {
  layout: {
    display: "flex",
    gap: 24,
    alignItems: "flex-start",
    padding: "0 0 32px",
  },
  sidebar: {
    width: 220,
    flexShrink: 0,
    position: "sticky",
    top: 16,
  },
  sidebarSection: {},
  sidebarHeading: {
    fontSize: 13,
    fontWeight: 600,
    color: "#374151",
    margin: "0 0 8px",
  },
  emptyNote: {
    fontSize: 12,
    color: "#9CA3AF",
    margin: 0,
  },
  deviceCard: {
    padding: "7px 10px",
    border: "1px solid #E5E7EB",
    borderRadius: 6,
    fontSize: 12,
    cursor: "grab",
    marginBottom: 6,
    transition: "background 0.1s, border-color 0.1s",
    userSelect: "none",
  },
  deviceCardName: {
    fontWeight: 600,
    color: "#111827",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  deviceCardSub: {
    color: "#6B7280",
    marginTop: 2,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  racksArea: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: 32,
  },
  rackWrapper: {},
  rackTitle: {
    fontSize: 15,
    fontWeight: 700,
    color: "#111827",
    margin: "0 0 8px",
  },
  rackMeta: {
    fontWeight: 400,
    color: "#6B7280",
    fontSize: 13,
  },
  panelLabel: {
    fontSize: 12,
    fontWeight: 600,
    color: "#6B7280",
    marginBottom: 4,
    textTransform: "capitalize",
  },
  rackFrame: {
    border: "2px solid #4B5563",
    borderRadius: 4,
    background: "#111827",
    overflow: "hidden",
    minWidth: 260,
  },
  rackHeader: {
    display: "flex",
    alignItems: "center",
    height: 22,
    borderBottom: "2px solid #4B5563",
    background: "#1F2937",
  },
  rackSlot: {
    display: "flex",
    alignItems: "center",
    height: 30,
    transition: "background 0.1s",
  },
  slotNum: {
    width: 28,
    textAlign: "right",
    paddingRight: 6,
    fontSize: 10,
    color: "#6B7280",
    flexShrink: 0,
    fontFamily: "monospace",
  },
  slotContent: {
    flex: 1,
    paddingLeft: 8,
    paddingRight: 4,
    overflow: "hidden",
  },
  occupantRow: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    cursor: "grab",
    userSelect: "none",
  },
  occupantLabel: {
    fontSize: 11,
    color: "#DBEAFE",
    fontWeight: 500,
    flex: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  occupantMeta: {
    fontSize: 10,
    color: "#93C5FD",
    flexShrink: 0,
    marginRight: 2,
  },
  removeBtn: {
    background: "none",
    border: "none",
    color: "#6B7280",
    cursor: "pointer",
    fontSize: 11,
    padding: "0 2px",
    lineHeight: 1,
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
  },
  emptySlot: {
    fontSize: 10,
    color: "#374151",
  },
};
