export default function EmptyState({ message, action, onAction }) {
  return (
    <div style={styles.wrap}>
      <p style={styles.msg}>{message}</p>
      {action && (
        <button style={styles.btn} onClick={onAction}>{action}</button>
      )}
    </div>
  );
}

const styles = {
  wrap: {
    border: "1px dashed #D1D5DB",
    borderRadius: 8,
    padding: "40px 24px",
    textAlign: "center",
  },
  msg: {
    margin: "0 0 16px",
    fontSize: 14,
    color: "#6B7280",
  },
  btn: {
    padding: "8px 20px",
    background: "#111827",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  },
};
