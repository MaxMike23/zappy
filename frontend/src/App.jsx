import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/auth/AuthContext";
import ProtectedRoute from "@/auth/ProtectedRoute";
import Layout from "@/components/layout/Layout";
import LoginPage from "@/pages/LoginPage";
import RegisterPage from "@/pages/RegisterPage";
import DashboardPage from "@/pages/DashboardPage";
import ProjectsPage from "@/pages/ProjectsPage";
import ProjectDetailPage from "@/pages/ProjectDetailPage";
import WorkOrdersPage from "@/pages/WorkOrdersPage";
import WorkOrderDetailPage from "@/pages/WorkOrderDetailPage";
import VisitsPage from "@/pages/VisitsPage";
import TimeLogsPage from "@/pages/TimeLogsPage";
import UsersPage from "@/pages/UsersPage";
import SettingsPage from "@/pages/SettingsPage";

/**
 * Route structure:
 * /login               — public
 * /register            — public
 * /                    — redirect to /dashboard
 * /dashboard           — protected, all roles
 * /projects            — protected, admin/manager/sales
 * /work-orders         — protected, all staff
 * /time-logs           — protected, all staff
 * /users               — protected, admin only
 * /settings            — protected, admin only
 * /unauthorized        — public (shown on role mismatch)
 */
export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/unauthorized" element={<div style={{ padding: 40 }}>You do not have permission to view this page.</div>} />

          {/* Protected routes — wrapped in Layout (sidebar + main) */}
          <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />

            <Route path="/projects"        element={<ProjectsPage />} />
            <Route path="/projects/:id"    element={<ProjectDetailPage />} />
            <Route path="/work-orders"     element={<WorkOrdersPage />} />
            <Route path="/work-orders/:id" element={<WorkOrderDetailPage />} />
            <Route path="/visits"          element={<VisitsPage />} />
            <Route path="/time-logs"   element={<TimeLogsPage />} />
            <Route path="/users"       element={<UsersPage />} />
            <Route path="/settings"    element={<SettingsPage />} />
          </Route>

          {/* 404 fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

function ComingSoon({ title }) {
  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 16 }}>{title}</h1>
      <div style={{
        border: "1px dashed #D1D5DB",
        borderRadius: 8,
        padding: 32,
        color: "#9CA3AF",
        fontSize: 14,
        textAlign: "center",
      }}>
        This module is scaffolded — build it out in Phase 2.
      </div>
    </div>
  );
}
