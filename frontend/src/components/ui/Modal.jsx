import { useEffect } from "react";

export default function Modal({ title, onClose, children, maxWidth = 520 }) {
  // Close on Escape key
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div
        style={{ ...styles.card, maxWidth }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={styles.header}>
          <h2 style={styles.title}>{title}</h2>
          <button style={styles.closeBtn} onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div style={styles.body}>{children}</div>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 500,
    padding: "16px",
  },
  card: {
    background: "#FFFFFF",
    borderRadius: 12,
    width: "100%",
    maxHeight: "90vh",
    display: "flex",
    flexDirection: "column",
    boxShadow: "0 8px 40px rgba(0,0,0,0.18)",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "20px 24px 16px",
    borderBottom: "1px solid #E5E7EB",
  },
  title: {
    margin: 0,
    fontSize: 16,
    fontWeight: 700,
    color: "#111827",
  },
  closeBtn: {
    background: "none",
    border: "none",
    fontSize: 16,
    cursor: "pointer",
    color: "#6B7280",
    padding: "4px 8px",
    borderRadius: 4,
  },
  body: {
    padding: "20px 24px 24px",
    overflowY: "auto",
  },
};
