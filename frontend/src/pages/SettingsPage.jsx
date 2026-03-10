import { useState } from "react";
import { useAuth } from "@/auth/AuthContext";
import client from "@/api/client";

export default function SettingsPage() {
  const { user, company, refreshUser } = useAuth();
  const isAdmin = ["company_admin", "superadmin"].includes(user?.role);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);
  const [error, setError]   = useState("");

  const attendanceEnabled = company?.settings?.attendance_tracking === true;

  const toggleAttendance = async () => {
    if (!isAdmin) return;
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      await client.put(`/companies/${company.id}`, {
        settings: { attendance_tracking: !attendanceEnabled },
      });
      await refreshUser();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      setError("Failed to update settings.");
    } finally {
      setSaving(false);
    }
  };

  if (!company) return null;

  return (
    <div>
      <h1 style={st.title}>Settings</h1>

      <div style={st.card}>
        <h2 style={st.sectionTitle}>Company</h2>
        <div style={st.row}>
          <span style={st.label}>Name</span>
          <span style={st.value}>{company.name}</span>
        </div>
        <div style={st.row}>
          <span style={st.label}>Plan</span>
          <span style={st.value} >{company.subscription_plan}</span>
        </div>
      </div>

      <div style={st.card}>
        <h2 style={st.sectionTitle}>Time Tracking</h2>
        <div style={st.toggleRow}>
          <div>
            <div style={st.toggleLabel}>Company-wide Attendance Clock-in/out</div>
            <div style={st.toggleDesc}>
              When enabled, technicians see a prominent Clock In / Clock Out button
              on their dashboard to track when they start and end their workday.
              This is separate from per-visit clock-in/out.
            </div>
          </div>
          <button
            style={{
              ...st.toggleBtn,
              background: attendanceEnabled ? "#111827" : "#E5E7EB",
              color: attendanceEnabled ? "#fff" : "#374151",
            }}
            onClick={toggleAttendance}
            disabled={saving || !isAdmin}
            title={isAdmin ? undefined : "Admin access required"}
          >
            {saving ? "Saving…" : attendanceEnabled ? "On" : "Off"}
          </button>
        </div>
        {saved  && <div style={st.successMsg}>Settings saved.</div>}
        {error  && <div style={st.errorMsg}>{error}</div>}
        {!isAdmin && <div style={st.mutedNote}>Only company admins can change settings.</div>}
      </div>
    </div>
  );
}

const st = {
  title:       { fontSize: 22, fontWeight: 700, color: "#111827", margin: "0 0 24px" },
  card:        { background: "#fff", border: "1px solid #E5E7EB", borderRadius: 10, padding: "24px", marginBottom: 20 },
  sectionTitle:{ fontSize: 15, fontWeight: 700, color: "#111827", margin: "0 0 16px" },
  row:         { display: "flex", gap: 16, alignItems: "center", marginBottom: 10 },
  label:       { fontSize: 13, fontWeight: 600, color: "#6B7280", width: 140, flexShrink: 0 },
  value:       { fontSize: 14, color: "#111827", textTransform: "capitalize" },
  toggleRow:   { display: "flex", gap: 16, alignItems: "flex-start", justifyContent: "space-between" },
  toggleLabel: { fontSize: 14, fontWeight: 600, color: "#111827", marginBottom: 4 },
  toggleDesc:  { fontSize: 13, color: "#6B7280", maxWidth: 480, lineHeight: 1.5 },
  toggleBtn:   { padding: "6px 18px", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer", flexShrink: 0, minWidth: 54 },
  successMsg:  { color: "#059669", fontSize: 13, marginTop: 12 },
  errorMsg:    { color: "#EF4444", fontSize: 13, marginTop: 8 },
  mutedNote:   { fontSize: 12, color: "#9CA3AF", marginTop: 12 },
};
