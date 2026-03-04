import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";

/**
 * Wraps protected routes. Redirects to /login if unauthenticated.
 * Optionally accepts `allowedRoles` to enforce role-based access.
 *
 * Usage:
 *   <Route element={<ProtectedRoute />}>
 *     <Route path="/dashboard" element={<Dashboard />} />
 *   </Route>
 *
 *   <Route element={<ProtectedRoute allowedRoles={["company_admin"]} />}>
 *     <Route path="/settings" element={<Settings />} />
 *   </Route>
 */
export default function ProtectedRoute({ allowedRoles, children }) {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "4rem" }}>
        Loading...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return children ?? null;
}
