import { useState, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { visitsApi } from "@/api/visits";
import { workOrdersApi } from "@/api/workOrders";
import { projectsApi } from "@/api/projects";
import { attendanceApi } from "@/api/attendance";
import Badge from "@/components/ui/Badge";
import Spinner from "@/components/ui/Spinner";

const STATUS_COLORS   = { scheduled: "#3B82F6", in_progress: "#F59E0B", completed: "#10B981", cancelled: "#9CA3AF" };
const PRIORITY_COLORS = { low: "#10B981", medium: "#3B82F6", high: "#F59E0B", urgent: "#EF4444" };
const TECH_ROLES      = ["technician"];
const ADMIN_ROLES     = ["company_admin", "manager", "superadmin", "sales"];

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function todayStart() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function tomorrowStart() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 1);
  return d.toISOString();
}

function fmtDateTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

// ── Technician dashboard ────────────────────────────────────────────────────

function TechDashboard({ user, company }) {
  const [visits, setVisits]         = useState([]);
  const [workOrders, setWOs]        = useState([]);
  const [attendance, setAttendance] = useState(null);
  const [loading, setLoading]       = useState(true);
  const [clockingId, setClock]      = useState(null);
  const [attendClocking, setAttClock] = useState(false);

  const attendanceEnabled = company?.settings?.attendance_tracking === true;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const fetches = [
        visitsApi.list({ scheduled_after: todayStart(), per_page: 10 }),
        workOrdersApi.list({ per_page: 6 }),
      ];
      if (attendanceEnabled) fetches.push(attendanceApi.today());
      const results = await Promise.all(fetches);
      setVisits(results[0].data.items);
      setWOs(results[1].data.items);
      if (attendanceEnabled) setAttendance(results[2].data.attendance);
    } catch {
      // fail silently — data just won't show
    } finally {
      setLoading(false);
    }
  }, [attendanceEnabled]);

  useEffect(() => { load(); }, [load]);

  const handleClockIn = async (id) => {
    setClock(id);
    try { await visitsApi.clockIn(id); await load(); } catch { /* ignore */ }
    setClock(null);
  };

  const handleClockOut = async (id) => {
    setClock(id);
    try { await visitsApi.clockOut(id); await load(); } catch { /* ignore */ }
    setClock(null);
  };

  const handleAttendanceClockIn = async () => {
    setAttClock(true);
    try { const r = await attendanceApi.clockIn(); setAttendance(r.data.attendance); } catch { /* ignore */ }
    setAttClock(false);
  };

  const handleAttendanceClockOut = async () => {
    setAttClock(true);
    try { const r = await attendanceApi.clockOut(); setAttendance(r.data.attendance); } catch { /* ignore */ }
    setAttClock(false);
  };

  if (loading) return <div style={s.center}><Spinner size={28} /></div>;

  return (
    <div>
      <div style={s.greeting}>{greeting()}, {user.first_name}</div>
      <div style={s.role}>Technician</div>

      {/* Company-wide attendance clock-in/out */}
      {attendanceEnabled && (
        <div style={s.attendanceBar}>
          <div style={s.attendanceLabel}>
            {attendance?.is_clocked_in
              ? "You are clocked in for the day."
              : attendance
              ? "You have clocked out for the day."
              : "You have not clocked in yet today."}
          </div>
          {!attendance && (
            <button style={s.clockInBtn} disabled={attendClocking} onClick={handleAttendanceClockIn}>
              {attendClocking ? "…" : "Clock In"}
            </button>
          )}
          {attendance?.is_clocked_in && (
            <button style={s.clockOutBtn} disabled={attendClocking} onClick={handleAttendanceClockOut}>
              {attendClocking ? "…" : "Clock Out"}
            </button>
          )}
        </div>
      )}

      {/* Upcoming Visits */}
      <Section title="Upcoming Visits" linkTo="/visits" linkLabel="View all">
        {visits.length === 0 ? (
          <EmptyCard message="No upcoming visits scheduled." />
        ) : (
          <div style={s.cardGrid}>
            {visits.map((v) => (
              <VisitCard
                key={v.id}
                visit={v}
                clocking={clockingId === v.id}
                onClockIn={handleClockIn}
                onClockOut={handleClockOut}
              />
            ))}
          </div>
        )}
      </Section>

      {/* My Work Orders */}
      <Section title="My Work Orders" linkTo="/work-orders" linkLabel="View all">
        {workOrders.length === 0 ? (
          <EmptyCard message="No work orders assigned." />
        ) : (
          <div style={s.cardGrid}>
            {workOrders.map((wo) => <WoCard key={wo.id} wo={wo} />)}
          </div>
        )}
      </Section>
    </div>
  );
}

// ── Manager / Admin dashboard ────────────────────────────────────────────────

function AdminDashboard({ user }) {
  const [counts, setCounts]     = useState({ projects: null, wos: null, visits: null });
  const [visits, setVisits]     = useState([]);
  const [workOrders, setWOs]    = useState([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    const today = todayStart();
    const tomorrow = tomorrowStart();
    Promise.all([
      projectsApi.list({ per_page: 1 }),
      workOrdersApi.list({ per_page: 1 }),
      visitsApi.list({ scheduled_after: today, scheduled_before: tomorrow, per_page: 1 }),
      visitsApi.list({ scheduled_after: today, per_page: 5 }),
      workOrdersApi.list({ per_page: 5 }),
    ]).then(([pRes, wRes, vCountRes, vRes, wosRes]) => {
      setCounts({
        projects: pRes.data.pagination.total,
        wos:      wRes.data.pagination.total,
        visits:   vCountRes.data.pagination.total,
      });
      setVisits(vRes.data.items);
      setWOs(wosRes.data.items);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={s.center}><Spinner size={28} /></div>;

  return (
    <div>
      <div style={s.greeting}>{greeting()}, {user.first_name}</div>
      <div style={s.role}>{user.role.replace("_", " ")}</div>

      {/* Stat cards */}
      <div style={{ ...s.cardGrid, marginBottom: 32 }}>
        <StatCard label="Active Projects"    value={counts.projects} to="/projects"    color="#3B82F6" />
        <StatCard label="Open Work Orders"   value={counts.wos}      to="/work-orders" color="#F59E0B" />
        <StatCard label="Visits Today"       value={counts.visits}   to="/visits"      color="#10B981" />
      </div>

      {/* Today's visits */}
      <Section title="Today's Visits" linkTo="/visits" linkLabel="View all">
        {visits.length === 0 ? (
          <EmptyCard message="No visits scheduled for today." />
        ) : (
          <div style={s.cardGrid}>
            {visits.map((v) => <VisitCard key={v.id} visit={v} readonly />)}
          </div>
        )}
      </Section>

      {/* Recent work orders */}
      <Section title="Recent Work Orders" linkTo="/work-orders" linkLabel="View all">
        {workOrders.length === 0 ? (
          <EmptyCard message="No work orders found." />
        ) : (
          <div style={s.cardGrid}>
            {workOrders.map((wo) => <WoCard key={wo.id} wo={wo} />)}
          </div>
        )}
      </Section>
    </div>
  );
}

// ── Shared sub-components ───────────────────────────────────────────────────

function Section({ title, linkTo, linkLabel, children }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <div style={s.sectionHeader}>
        <h2 style={s.sectionTitle}>{title}</h2>
        {linkTo && <Link to={linkTo} style={s.sectionLink}>{linkLabel} →</Link>}
      </div>
      {children}
    </div>
  );
}

function StatCard({ label, value, to, color }) {
  return (
    <Link to={to} style={{ textDecoration: "none", flex: "1 1 130px" }}>
      <div style={s.statCard}>
        <div style={{ ...s.statValue, color }}>{value ?? "—"}</div>
        <div style={s.statLabel}>{label}</div>
      </div>
    </Link>
  );
}

function VisitCard({ visit, onClockIn, onClockOut, clocking, readonly }) {
  const parent = visit.work_order_title
    ? { label: visit.work_order_title, to: `/work-orders/${visit.work_order_id}` }
    : visit.project_name
    ? { label: visit.project_name, to: `/projects/${visit.project_id}` }
    : null;

  return (
    <div style={s.card}>
      <div style={s.cardTopRow}>
        <span style={s.cardTitle}>{visit.title}</span>
        <Badge label={visit.status.replace("_", " ")} color={STATUS_COLORS[visit.status]} />
      </div>
      {parent && (
        <Link to={parent.to} style={s.parentLink}>{parent.label}</Link>
      )}
      <div style={s.cardMeta}>{fmtDateTime(visit.scheduled_start)}</div>
      {visit.assignees?.length > 0 && (
        <div style={s.cardMeta}>{visit.assignees.map((a) => a.full_name).join(", ")}</div>
      )}
      {!readonly && (
        <div style={{ marginTop: 10 }}>
          {visit.status === "scheduled" && (
            <button style={s.clockInBtn} disabled={clocking} onClick={() => onClockIn(visit.id)}>
              {clocking ? "…" : "Clock In"}
            </button>
          )}
          {visit.is_running && (
            <button style={s.clockOutBtn} disabled={clocking} onClick={() => onClockOut(visit.id)}>
              {clocking ? "…" : "Clock Out"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function WoCard({ wo }) {
  return (
    <Link to={`/work-orders/${wo.id}`} style={{ textDecoration: "none", flex: "1 1 200px" }}>
      <div style={s.card}>
        <div style={s.cardTopRow}>
          <span style={s.cardTitle}>{wo.title}</span>
          <Badge label={wo.priority} color={PRIORITY_COLORS[wo.priority] || "#6B7280"} />
        </div>
        {wo.project?.name && <div style={s.parentLink}>{wo.project.name}</div>}
        {wo.stage && <div style={s.cardMeta}>{wo.stage.name}</div>}
      </div>
    </Link>
  );
}

function EmptyCard({ message }) {
  return (
    <div style={s.emptyCard}>{message}</div>
  );
}

// ── Root ────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { user, company } = useAuth();
  if (!user) return null;

  if (TECH_ROLES.includes(user.role)) return <TechDashboard user={user} company={company} />;
  return <AdminDashboard user={user} />;
}

// ── Styles ──────────────────────────────────────────────────────────────────

const s = {
  center:        { display: "flex", justifyContent: "center", padding: 48 },
  greeting:      { fontSize: 24, fontWeight: 700, color: "#111827", margin: "0 0 4px" },
  role:          { fontSize: 13, color: "#6B7280", textTransform: "capitalize", marginBottom: 28 },
  sectionHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  sectionTitle:  { fontSize: 16, fontWeight: 700, color: "#111827", margin: 0 },
  sectionLink:   { fontSize: 13, color: "#3B82F6", textDecoration: "none" },
  cardGrid:      { display: "flex", flexWrap: "wrap", gap: 12 },
  card:          { flex: "1 1 220px", background: "#FFFFFF", border: "1px solid #E5E7EB", borderRadius: 10, padding: "14px 16px", minWidth: 0 },
  cardTopRow:    { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 6 },
  cardTitle:     { fontWeight: 700, fontSize: 14, color: "#111827", lineHeight: 1.3, flex: 1 },
  parentLink:    { fontSize: 12, color: "#3B82F6", marginBottom: 4, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  cardMeta:      { fontSize: 12, color: "#6B7280", marginTop: 2 },
  attendanceBar: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, background: "#fff", border: "1px solid #E5E7EB", borderRadius: 10, padding: "14px 18px", marginBottom: 24, flexWrap: "wrap" },
  attendanceLabel:{ fontSize: 14, color: "#374151", flex: 1 },
  clockInBtn:    { padding: "7px 16px", background: "#111827", color: "#fff", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer", marginRight: 6 },
  clockOutBtn:   { padding: "7px 16px", background: "#F59E0B", color: "#fff", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer" },
  statCard:      { background: "#FFFFFF", border: "1px solid #E5E7EB", borderRadius: 10, padding: "20px 16px", textAlign: "center" },
  statValue:     { fontSize: 36, fontWeight: 700, lineHeight: 1 },
  statLabel:     { fontSize: 12, color: "#6B7280", marginTop: 6 },
  emptyCard:     { background: "#F9FAFB", border: "1px dashed #D1D5DB", borderRadius: 8, padding: "20px 16px", color: "#9CA3AF", fontSize: 13, textAlign: "center", width: "100%" },
};
