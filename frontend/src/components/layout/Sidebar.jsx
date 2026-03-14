import { NavLink } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";

const NAV_ITEMS = [
  { to: "/dashboard",   label: "Dashboard",   roles: ["company_admin", "manager", "technician", "sales", "superadmin"] },
  { to: "/projects",    label: "Projects",    roles: ["company_admin", "manager", "sales", "superadmin"] },
  { to: "/work-orders", label: "Work Orders", roles: ["company_admin", "manager", "technician", "superadmin"] },
  { to: "/visits",      label: "Visits",      roles: ["company_admin", "manager", "technician", "superadmin"] },
  { to: "/time-logs",   label: "Time Logs",   roles: ["company_admin", "manager", "technician", "superadmin"] },
  { to: "/users",       label: "Team",        roles: ["company_admin", "superadmin"] },
  { to: "/workflow",        label: "Workflow",       roles: ["company_admin", "superadmin"] },
  { to: "/device-library", label: "Device Library", roles: ["company_admin", "manager", "technician", "superadmin"] },
  { to: "/settings",        label: "Settings",       roles: ["company_admin", "superadmin"] },
];

export default function Sidebar() {
  const { user, logout } = useAuth();
  if (!user) return null;

  const visibleItems = NAV_ITEMS.filter((item) => item.roles.includes(user.role));

  return (
    <aside className="app-sidebar" style={styles.sidebar}>
      <div style={styles.logo}>Zappy</div>

      <nav style={styles.nav}>
        {visibleItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            style={({ isActive }) => ({
              ...styles.navLink,
              ...(isActive ? styles.navLinkActive : {}),
            })}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div style={styles.userSection}>
        <div style={styles.userName}>{user.full_name}</div>
        <div style={styles.userRole}>{user.role.replace("_", " ")}</div>
        <button style={styles.logoutBtn} onClick={logout}>Sign out</button>
      </div>
    </aside>
  );
}

const styles = {
  sidebar: {
    width: 220,
    minHeight: "100vh",
    background: "#111827",
    color: "#F9FAFB",
    flexDirection: "column",
  },
  logo: {
    fontSize: 22,
    fontWeight: 700,
    padding: "24px 20px 16px",
    letterSpacing: "-0.5px",
    color: "#FFFFFF",
  },
  nav: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: 2,
    padding: "8px 12px",
  },
  navLink: {
    display: "block",
    padding: "8px 12px",
    borderRadius: 6,
    color: "#9CA3AF",
    textDecoration: "none",
    fontSize: 14,
    fontWeight: 500,
    transition: "background 0.15s, color 0.15s",
  },
  navLinkActive: {
    background: "#1F2937",
    color: "#FFFFFF",
  },
  userSection: {
    padding: "16px 20px",
    borderTop: "1px solid #1F2937",
  },
  userName: {
    fontSize: 14,
    fontWeight: 600,
    color: "#F3F4F6",
  },
  userRole: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 2,
    textTransform: "capitalize",
  },
  logoutBtn: {
    marginTop: 12,
    width: "100%",
    padding: "6px 0",
    background: "transparent",
    border: "1px solid #374151",
    borderRadius: 6,
    color: "#9CA3AF",
    cursor: "pointer",
    fontSize: 13,
  },
};
