export default function Badge({ label, color = "#6B7280" }) {
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 5,
      padding: "2px 10px",
      borderRadius: 12,
      fontSize: 12,
      fontWeight: 500,
      background: color + "22",
      color: color,
      whiteSpace: "nowrap",
    }}>
      <span style={{
        width: 6,
        height: 6,
        borderRadius: "50%",
        background: color,
        flexShrink: 0,
      }} />
      {label}
    </span>
  );
}
