import { NavLink } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";

// ── Inline SVG icons ────────────────────────────────────────────────────────
const S = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" };

const IconHome       = () => <svg {...S}><path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z"/><path d="M9 21V12h6v9"/></svg>;
const IconClipboard  = () => <svg {...S}><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/></svg>;
const IconCalendar   = () => <svg {...S}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>;
const IconClock      = () => <svg {...S}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>;
const IconFolder     = () => <svg {...S}><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>;
const IconTeam       = () => <svg {...S}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>;

const ICONS = {
  home:       <IconHome />,
  workOrders: <IconClipboard />,
  visits:     <IconCalendar />,
  timeLogs:   <IconClock />,
  projects:   <IconFolder />,
  team:       <IconTeam />,
};

const NAV_TABS = [
  { to: "/dashboard",   label: "Home",    icon: "home",       roles: ["company_admin", "manager", "technician", "sales", "superadmin"] },
  { to: "/projects",    label: "Projects", icon: "projects",  roles: ["company_admin", "manager", "sales", "superadmin"] },
  { to: "/work-orders", label: "Work",    icon: "workOrders", roles: ["company_admin", "manager", "technician", "superadmin"] },
  { to: "/visits",      label: "Visits",  icon: "visits",     roles: ["company_admin", "manager", "technician", "superadmin"] },
  { to: "/time-logs",   label: "Time",    icon: "timeLogs",   roles: ["company_admin", "manager", "technician", "superadmin"] },
  { to: "/users",       label: "Team",    icon: "team",       roles: ["company_admin", "superadmin"] },
];

export default function BottomNav() {
  const { user } = useAuth();
  if (!user) return null;

  const tabs = NAV_TABS.filter((t) => t.roles.includes(user.role));

  return (
    <nav className="bottom-nav">
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          style={({ isActive }) => ({
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 3,
            color: isActive ? "#FFFFFF" : "#6B7280",
            textDecoration: "none",
            fontSize: 10,
            fontWeight: isActive ? 600 : 400,
            borderTop: isActive ? "2px solid #FFFFFF" : "2px solid transparent",
            transition: "color 0.15s",
            padding: "4px 2px",
          })}
        >
          {ICONS[tab.icon]}
          <span>{tab.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
