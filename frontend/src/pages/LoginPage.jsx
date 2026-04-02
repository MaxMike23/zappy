import { useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import client from "@/api/client";

const SHOW_ROADMAP = import.meta.env.VITE_SHOW_ROADMAP === "true";

// ── Minimal markdown renderer (no external dep) ──────────────────────────────
function renderMarkdown(text) {
  const lines = text.split("\n");
  const els = [];
  let key = 0;

  const inlineBold = (str) => {
    const parts = str.split(/\*\*(.+?)\*\*/g);
    return parts.map((p, i) => i % 2 === 1 ? <strong key={i}>{p}</strong> : p);
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trimEnd();

    if (/^#{4}\s/.test(line)) {
      els.push(<h4 key={key++} style={md.h4}>{inlineBold(line.replace(/^#{4}\s/, ""))}</h4>);
    } else if (/^#{3}\s/.test(line)) {
      els.push(<h3 key={key++} style={md.h3}>{inlineBold(line.replace(/^#{3}\s/, ""))}</h3>);
    } else if (/^#{2}\s/.test(line)) {
      els.push(<h2 key={key++} style={md.h2}>{inlineBold(line.replace(/^#{2}\s/, ""))}</h2>);
    } else if (/^#\s/.test(line)) {
      els.push(<h1 key={key++} style={md.h1}>{inlineBold(line.replace(/^#\s/, ""))}</h1>);
    } else if (/^- \[x\]/i.test(line)) {
      els.push(<div key={key++} style={md.item}><span style={md.checked}>✓</span>{inlineBold(line.replace(/^- \[x\]\s*/i, ""))}</div>);
    } else if (/^- \[ \]/.test(line)) {
      els.push(<div key={key++} style={md.item}><span style={md.unchecked}>○</span>{inlineBold(line.replace(/^- \[ \]\s*/, ""))}</div>);
    } else if (/^[-*]\s/.test(line)) {
      els.push(<div key={key++} style={md.item}><span style={md.bullet}>•</span>{inlineBold(line.replace(/^[-*]\s/, ""))}</div>);
    } else if (/^>\s/.test(line)) {
      els.push(<blockquote key={key++} style={md.blockquote}>{inlineBold(line.replace(/^>\s/, ""))}</blockquote>);
    } else if (/^---+$/.test(line.trim())) {
      els.push(<hr key={key++} style={md.hr} />);
    } else if (line.trim() === "") {
      els.push(<div key={key++} style={{ height: 8 }} />);
    } else {
      els.push(<p key={key++} style={md.p}>{inlineBold(line)}</p>);
    }
  }
  return els;
}

const md = {
  h1:         { fontSize: 20, fontWeight: 700, margin: "20px 0 6px", color: "#111827" },
  h2:         { fontSize: 16, fontWeight: 700, margin: "18px 0 4px", color: "#111827", borderBottom: "1px solid #E5E7EB", paddingBottom: 4 },
  h3:         { fontSize: 14, fontWeight: 700, margin: "14px 0 4px", color: "#374151" },
  h4:         { fontSize: 13, fontWeight: 600, margin: "10px 0 2px", color: "#6B7280" },
  p:          { fontSize: 13, margin: "2px 0", color: "#374151", lineHeight: 1.5 },
  item:       { display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, color: "#374151", margin: "2px 0", lineHeight: 1.5 },
  checked:    { color: "#16A34A", fontWeight: 700, flexShrink: 0, width: 16 },
  unchecked:  { color: "#9CA3AF", flexShrink: 0, width: 16 },
  bullet:     { color: "#6B7280", flexShrink: 0, width: 16 },
  blockquote: { borderLeft: "3px solid #D1D5DB", margin: "6px 0", paddingLeft: 12, color: "#6B7280", fontStyle: "italic", fontSize: 13 },
  hr:         { border: "none", borderTop: "1px solid #E5E7EB", margin: "12px 0" },
};
// ─────────────────────────────────────────────────────────────────────────────

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || "/dashboard";

  const [form, setForm]       = useState({ email: "", password: "" });
  const [error, setError]     = useState("");
  const [loading, setLoading] = useState(false);

  // Roadmap modal
  const [showRoadmap, setShowRoadmap]       = useState(false);
  const [roadmapText, setRoadmapText]       = useState("");
  const [roadmapLoading, setRoadmapLoading] = useState(false);

  // Suggestion modal
  const [showSuggest, setShowSuggest]     = useState(false);
  const [suggest, setSuggest]             = useState({ name: "", email: "", message: "" });
  const [suggestStatus, setSuggestStatus] = useState(""); // "ok" | "error" | ""
  const [suggestLoading, setSuggestLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(form.email, form.password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.response?.data?.error || "Login failed. Check your credentials.");
    } finally {
      setLoading(false);
    }
  };

  const openRoadmap = async () => {
    setShowRoadmap(true);
    if (roadmapText) return;
    setRoadmapLoading(true);
    try {
      const res = await client.get("/public/roadmap");
      setRoadmapText(res.data.content);
    } catch {
      setRoadmapText("# Roadmap unavailable\n\nCould not load the roadmap.");
    } finally {
      setRoadmapLoading(false);
    }
  };

  const submitSuggestion = async (e) => {
    e.preventDefault();
    setSuggestLoading(true);
    setSuggestStatus("");
    try {
      await client.post("/public/suggestion", suggest);
      setSuggestStatus("ok");
      setSuggest({ name: "", email: "", message: "" });
    } catch (err) {
      setSuggestStatus(err.response?.data?.error || "error");
    } finally {
      setSuggestLoading(false);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.title}>Zappy</h1>
        <p style={styles.subtitle}>Sign in to your workspace</p>

        {error && <div style={styles.error}>{error}</div>}

        <form onSubmit={handleSubmit} style={styles.form}>
          <label style={styles.label}>Email</label>
          <input
            type="email"
            required
            autoComplete="email"
            style={styles.input}
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />

          <label style={styles.label}>Password</label>
          <input
            type="password"
            required
            autoComplete="current-password"
            style={styles.input}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />

          <button type="submit" style={styles.button} disabled={loading}>
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <p style={styles.registerLink}>
          New company?{" "}
          <Link to="/register" style={styles.link}>
            Register here
          </Link>
        </p>
        <p style={{ ...styles.registerLink, marginTop: 6, color: "#9CA3AF" }}>
          Forgot your password? Contact your administrator.
        </p>

        {SHOW_ROADMAP && (
          <div style={styles.devLinks}>
            <button type="button" style={styles.devBtn} onClick={openRoadmap}>
              View Roadmap
            </button>
            <span style={{ color: "#D1D5DB" }}>·</span>
            <button type="button" style={styles.devBtn} onClick={() => { setShowSuggest(true); setSuggestStatus(""); }}>
              Leave a Suggestion
            </button>
          </div>
        )}
      </div>

      {/* ── Roadmap modal ── */}
      {showRoadmap && (
        <div style={styles.overlay} onClick={() => setShowRoadmap(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <span style={styles.modalTitle}>Product Roadmap</span>
              <button style={styles.closeBtn} onClick={() => setShowRoadmap(false)}>✕</button>
            </div>
            <div style={styles.modalBody}>
              {roadmapLoading
                ? <p style={{ color: "#6B7280", fontSize: 14 }}>Loading…</p>
                : renderMarkdown(roadmapText)}
            </div>
          </div>
        </div>
      )}

      {/* ── Suggestion modal ── */}
      {showSuggest && (
        <div style={styles.overlay} onClick={() => setShowSuggest(false)}>
          <div style={{ ...styles.modal, maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <span style={styles.modalTitle}>Leave a Suggestion</span>
              <button style={styles.closeBtn} onClick={() => setShowSuggest(false)}>✕</button>
            </div>
            <div style={styles.modalBody}>
              {suggestStatus === "ok" ? (
                <div style={styles.successBox}>
                  Thanks — your suggestion has been sent!
                </div>
              ) : (
                <form onSubmit={submitSuggestion} style={styles.form}>
                  {suggestStatus && suggestStatus !== "ok" && (
                    <div style={styles.error}>{suggestStatus}</div>
                  )}
                  <label style={styles.label}>Your name (optional)</label>
                  <input
                    type="text"
                    style={styles.input}
                    value={suggest.name}
                    onChange={(e) => setSuggest({ ...suggest, name: e.target.value })}
                    placeholder="Jane Smith"
                  />
                  <label style={styles.label}>Your email (optional)</label>
                  <input
                    type="email"
                    style={styles.input}
                    value={suggest.email}
                    onChange={(e) => setSuggest({ ...suggest, email: e.target.value })}
                    placeholder="jane@example.com"
                  />
                  <label style={styles.label}>Suggestion</label>
                  <textarea
                    required
                    rows={5}
                    style={{ ...styles.input, resize: "vertical", fontFamily: "inherit" }}
                    value={suggest.message}
                    onChange={(e) => setSuggest({ ...suggest, message: e.target.value })}
                    placeholder="Share your idea or feedback…"
                  />
                  <button type="submit" style={styles.button} disabled={suggestLoading}>
                    {suggestLoading ? "Sending…" : "Send Suggestion"}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
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
  },
  card: {
    background: "#FFFFFF",
    borderRadius: 12,
    padding: "40px 36px",
    width: "100%",
    maxWidth: 400,
    boxShadow: "0 4px 24px rgba(0,0,0,0.07)",
  },
  title: {
    fontSize: 28,
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
  successBox: {
    background: "#F0FDF4",
    color: "#15803D",
    border: "1px solid #BBF7D0",
    borderRadius: 6,
    padding: "12px 14px",
    fontSize: 14,
  },
  form: {
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
    transition: "border-color 0.15s",
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
    transition: "opacity 0.15s",
  },
  registerLink: {
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
  devLinks: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
    marginTop: 20,
    paddingTop: 16,
    borderTop: "1px solid #F3F4F6",
  },
  devBtn: {
    background: "none",
    border: "none",
    color: "#6B7280",
    fontSize: 12,
    cursor: "pointer",
    padding: 0,
    textDecoration: "underline",
  },
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.4)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
    padding: 20,
  },
  modal: {
    background: "#FFFFFF",
    borderRadius: 12,
    width: "100%",
    maxWidth: 720,
    maxHeight: "85vh",
    display: "flex",
    flexDirection: "column",
    boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
  },
  modalHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "16px 20px",
    borderBottom: "1px solid #E5E7EB",
    flexShrink: 0,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: 600,
    color: "#111827",
  },
  closeBtn: {
    background: "none",
    border: "none",
    fontSize: 16,
    color: "#9CA3AF",
    cursor: "pointer",
    lineHeight: 1,
    padding: 4,
  },
  modalBody: {
    padding: "20px 24px",
    overflowY: "auto",
    flex: 1,
  },
};
