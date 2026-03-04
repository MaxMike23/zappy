import { useAuth } from "@/auth/AuthContext";

export default function DashboardPage() {
  const { user } = useAuth();

  return (
    <div>
      <h1 style={styles.heading}>Welcome back, {user?.first_name}</h1>
      <p style={styles.sub}>
        Role: <strong>{user?.role?.replace("_", " ")}</strong>
      </p>

      {/* Dashboard widgets go here — Phase 2 */}
      <div style={styles.placeholder}>
        Dashboard widgets coming in Phase 2 — projects summary, open work orders, recent activity.
      </div>
    </div>
  );
}

const styles = {
  heading: {
    fontSize: 24,
    fontWeight: 700,
    color: "#111827",
    margin: "0 0 8px",
  },
  sub: {
    fontSize: 14,
    color: "#6B7280",
    margin: "0 0 32px",
  },
  placeholder: {
    background: "#F9FAFB",
    border: "1px dashed #D1D5DB",
    borderRadius: 8,
    padding: 32,
    color: "#9CA3AF",
    fontSize: 14,
    textAlign: "center",
  },
};
