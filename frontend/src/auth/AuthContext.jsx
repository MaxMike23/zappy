import { createContext, useContext, useState, useEffect, useCallback } from "react";
import client from "@/api/client";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [company, setCompany] = useState(null);
  // null = loading, false = unauthenticated, true = authenticated
  const [isLoading, setIsLoading] = useState(true);

  const logout = useCallback(() => {
    // Grab token before clearing so we can send it explicitly in the
    // blacklist call. Clearing first prevents re-entrant logout loops.
    const token = localStorage.getItem("access_token");
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    setUser(null);
    setCompany(null);
    // Blacklist the token on the server. Only fires if we actually had one.
    // Passes the token explicitly in the header since localStorage is already clear.
    if (token) {
      client
        .post("/auth/logout", {}, { headers: { Authorization: `Bearer ${token}` } })
        .catch(() => {});
    }
  }, []);

  // Listen for forced logout from the axios interceptor
  useEffect(() => {
    const handler = () => logout();
    window.addEventListener("auth:logout", handler);
    return () => window.removeEventListener("auth:logout", handler);
  }, [logout]);

  // Restore session on mount
  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) {
      setIsLoading(false);
      return;
    }
    client
      .get("/auth/me")
      .then((res) => {
        setUser(res.data.user);
        setCompany(res.data.company || null);
      })
      .catch(() => {
        // Token invalid/expired — interceptor handles refresh or clears storage
        setUser(null);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const login = async (email, password) => {
    const res = await client.post("/auth/login", { email, password });
    localStorage.setItem("access_token", res.data.access_token);
    localStorage.setItem("refresh_token", res.data.refresh_token);
    setUser(res.data.user);
    setCompany(res.data.company || null);
    return res.data;
  };

  const register = async (payload) => {
    const res = await client.post("/auth/register", payload);
    localStorage.setItem("access_token", res.data.access_token);
    localStorage.setItem("refresh_token", res.data.refresh_token);
    setUser(res.data.user);
    setCompany(res.data.company);
    return res.data;
  };

  const value = {
    user,
    company,
    isLoading,
    isAuthenticated: !!user,
    login,
    logout,
    register,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
