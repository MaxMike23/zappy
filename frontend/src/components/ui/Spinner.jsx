export default function Spinner({ size = 20 }) {
  return (
    <span style={{
      display: "inline-block",
      width: size,
      height: size,
      border: `2px solid #E5E7EB`,
      borderTopColor: "#111827",
      borderRadius: "50%",
      animation: "spin 0.7s linear infinite",
    }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </span>
  );
}
