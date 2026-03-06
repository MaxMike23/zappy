import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { TRADES } from "@/constants/trades";

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    company_name: "",
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    password: "",
    confirm_password: "",
  });
  const [specializations, setSpecializations] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (form.password !== form.confirm_password) {
      setError("Passwords do not match.");
      return;
    }
    if (form.password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setLoading(true);
    try {
      await register({
        company_name: form.company_name.trim(),
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        password: form.password,
        specializations,
      });
      navigate("/dashboard", { replace: true });
    } catch (err) {
      const data = err.response?.data;
      // Show the API error + detail if available, otherwise show the network error
      if (data?.error) {
        setError(data.detail ? `${data.error}: ${data.detail}` : data.error);
      } else if (err.message) {
        setError(`Network error: ${err.message}`);
      } else {
        setError("Registration failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.title}>Create your workspace</h1>
        <p style={styles.subtitle}>Get your low-voltage company set up in minutes.</p>

        {error && <div style={styles.error}>{error}</div>}

        <form onSubmit={handleSubmit} style={styles.form}>
          <label style={styles.label}>Company Name</label>
          <input
            required
            style={styles.input}
            value={form.company_name}
            onChange={set("company_name")}
            placeholder="Apex AV Solutions"
          />

          <div style={styles.row}>
            <div style={styles.col}>
              <label style={styles.label}>First Name</label>
              <input
                required
                style={styles.input}
                value={form.first_name}
                onChange={set("first_name")}
              />
            </div>
            <div style={styles.col}>
              <label style={styles.label}>Last Name</label>
              <input
                required
                style={styles.input}
                value={form.last_name}
                onChange={set("last_name")}
              />
            </div>
          </div>

          <label style={styles.label}>Work Email</label>
          <input
            type="email"
            required
            autoComplete="email"
            style={styles.input}
            value={form.email}
            onChange={set("email")}
          />

          <label style={styles.label}>Phone (optional)</label>
          <input
            type="tel"
            style={styles.input}
            value={form.phone}
            onChange={set("phone")}
          />

          <label style={styles.label}>
            Trade Specializations <span style={{ fontWeight: 400, color: "#9CA3AF" }}>(select all that apply)</span>
          </label>
          <div style={styles.checkGrid}>
            {TRADES.map((t) => (
              <label key={t.key} style={styles.checkLabel}>
                <input
                  type="checkbox"
                  style={{ marginRight: 6 }}
                  checked={specializations.includes(t.key)}
                  onChange={(e) =>
                    setSpecializations((prev) =>
                      e.target.checked ? [...prev, t.key] : prev.filter((k) => k !== t.key)
                    )
                  }
                />
                {t.label}
              </label>
            ))}
          </div>

          <label style={styles.label}>Password</label>
          <input
            type="password"
            required
            autoComplete="new-password"
            style={styles.input}
            value={form.password}
            onChange={set("password")}
            placeholder="Min. 8 characters"
          />

          <label style={styles.label}>Confirm Password</label>
          <input
            type="password"
            required
            autoComplete="new-password"
            style={styles.input}
            value={form.confirm_password}
            onChange={set("confirm_password")}
          />

          <button type="submit" style={styles.button} disabled={loading}>
            {loading ? "Creating workspace..." : "Create workspace"}
          </button>
        </form>

        <p style={styles.loginLink}>
          Already have an account?{" "}
          <Link to="/login" style={styles.link}>
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#F3F4F6",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    padding: "32px 16px",
  },
  card: {
    background: "#FFFFFF",
    borderRadius: 12,
    padding: "40px 36px",
    width: "100%",
    maxWidth: 480,
    boxShadow: "0 4px 24px rgba(0,0,0,0.07)",
  },
  title: {
    fontSize: 24,
    fontWeight: 700,
    margin: "0 0 4px",
    color: "#111827",
  },
  subtitle: {
    fontSize: 14,
    color: "#6B7280",
    margin: "0 0 24px",
  },
  error: {
    background: "#FEF2F2",
    color: "#B91C1C",
    border: "1px solid #FECACA",
    borderRadius: 6,
    padding: "10px 14px",
    fontSize: 13,
    marginBottom: 16,
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  row: {
    display: "flex",
    gap: 12,
    marginTop: 12,
  },
  col: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  label: {
    fontSize: 13,
    fontWeight: 500,
    color: "#374151",
    marginTop: 12,
    marginBottom: 4,
  },
  input: {
    padding: "10px 12px",
    border: "1px solid #D1D5DB",
    borderRadius: 6,
    fontSize: 14,
    outline: "none",
    width: "100%",
  },
  button: {
    marginTop: 20,
    padding: "11px",
    background: "#111827",
    color: "#FFFFFF",
    border: "none",
    borderRadius: 6,
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
  },
  checkGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))",
    gap: "8px 4px",
    padding: "10px 12px",
    border: "1px solid #D1D5DB",
    borderRadius: 6,
    background: "#F9FAFB",
    marginBottom: 4,
  },
  checkLabel: {
    display: "flex",
    alignItems: "center",
    fontSize: 13,
    color: "#374151",
    cursor: "pointer",
    userSelect: "none",
  },
  loginLink: {
    textAlign: "center",
    fontSize: 13,
    color: "#6B7280",
    marginTop: 20,
  },
  link: {
    color: "#111827",
    fontWeight: 600,
    textDecoration: "none",
  },
};
