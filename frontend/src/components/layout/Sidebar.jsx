import { NavLink } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import logoMark from "@/assets/logo-mark.png";
import logoMarkAlt from "@/assets/logo-mark-alt.png";

// Returns true if a hex color (e.g. "#111827") is perceived as dark.
// Uses the W3C relative luminance formula so it works for any future sidebar color.
function isDark(hex) {
  const c = hex.replace("#", "");
  const r = parseInt(c.slice(0, 2), 16) / 255;
  const g = parseInt(c.slice(2, 4), 16) / 255;
  const b = parseInt(c.slice(4, 6), 16) / 255;
  const toLinear = (v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const L = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  return L < 0.179; // threshold: below this is perceptually dark
}

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
      <div style={styles.logoWrap}>
        <img src={isDark(SIDEBAR_BG) ? logoMarkAlt : logoMark} alt="Zappy" style={styles.logoImg} />
      </div>

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

const SIDEBAR_BG = "#111827";

const styles = {
  sidebar: {
    width: 220,
    minHeight: "100vh",
    background: SIDEBAR_BG,
    color: "#F9FAFB",
    flexDirection: "column",
  },
  logoWrap: {
    padding: "20px 20px 12px",
  },
  logoImg: {
    display: "block",
    maxWidth: "100%",
    height: "auto",
    maxHeight: 48,
    objectFit: "contain",
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
