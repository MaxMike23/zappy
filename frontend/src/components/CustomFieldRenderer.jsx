/**
 * Renders custom fields defined by workflow_field_definitions for a given entity.
 *
 * Props:
 *   fieldDefs  — array of WorkflowFieldDefinition objects
 *   values     — custom_fields dict from the entity (e.g. project.custom_fields)
 *   editing    — boolean; when true renders inputs instead of read-only values
 *   onChange   — fn(key, value) called when a field value changes in edit mode
 */
export default function CustomFieldRenderer({ fieldDefs = [], values = {}, editing = false, onChange }) {
  if (fieldDefs.length === 0) return null;

  return (
    <div style={styles.section}>
      <h3 style={styles.sectionTitle}>Custom Fields</h3>
      <div style={styles.grid}>
        {fieldDefs.map((field) => (
          <FieldRow
            key={field.id}
            field={field}
            value={values[field.field_key] ?? ""}
            editing={editing}
            onChange={onChange}
          />
        ))}
      </div>
    </div>
  );
}

function FieldRow({ field, value, editing, onChange }) {
  const inputProps = {
    style: styles.input,
    value: value ?? "",
    onChange: (e) => onChange?.(field.field_key, e.target.value),
  };

  if (!editing) {
    return (
      <div style={styles.row}>
        <span style={styles.label}>{field.field_label}</span>
        <span style={styles.value}>{formatReadValue(field, value)}</span>
      </div>
    );
  }

  let control;
  switch (field.field_type) {
    case "textarea":
      control = <textarea {...inputProps} rows={3} style={{ ...styles.input, resize: "vertical" }} />;
      break;
    case "number":
      control = <input type="number" {...inputProps} />;
      break;
    case "date":
      control = <input type="date" {...inputProps} />;
      break;
    case "checkbox":
      control = (
        <input
          type="checkbox"
          checked={!!value}
          onChange={(e) => onChange?.(field.field_key, e.target.checked)}
          style={{ width: 16, height: 16, cursor: "pointer" }}
        />
      );
      break;
    case "select": {
      const options = field.field_config?.options ?? [];
      control = (
        <select {...inputProps} style={styles.input}>
          <option value="">— select —</option>
          {options.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      );
      break;
    }
    case "url":
      control = <input type="url" {...inputProps} placeholder="https://" />;
      break;
    case "checklist": {
      const items = field.field_config?.items ?? [];
      const checked = (typeof value === "object" && value !== null && !Array.isArray(value)) ? value : {};
      control = (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "4px 0" }}>
          {items.map((item) => (
            <label key={item} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#374151", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={!!checked[item]}
                onChange={(e) => onChange?.(field.field_key, { ...checked, [item]: e.target.checked })}
                style={{ width: 15, height: 15, cursor: "pointer" }}
              />
              {item}
            </label>
          ))}
          {items.length === 0 && <span style={{ color: "#9CA3AF", fontSize: 13 }}>No items defined.</span>}
        </div>
      );
      break;
    }
    default:
      control = <input type="text" {...inputProps} />;
  }

  return (
    <div style={styles.row}>
      <label style={styles.label}>
        {field.field_label}
        {field.is_required && <span style={{ color: "#EF4444" }}> *</span>}
      </label>
      {control}
    </div>
  );
}

function formatReadValue(field, value) {
  if (value === null || value === undefined || value === "") return <span style={{ color: "#9CA3AF" }}>—</span>;
  if (field.field_type === "checkbox") return value ? "Yes" : "No";
  if (field.field_type === "url") {
    return <a href={value} target="_blank" rel="noreferrer" style={{ color: "#3B82F6" }}>{value}</a>;
  }
  if (field.field_type === "checklist") {
    const items = field.field_config?.items ?? [];
    const checked = (typeof value === "object" && value !== null && !Array.isArray(value)) ? value : {};
    if (items.length === 0) return <span style={{ color: "#9CA3AF" }}>—</span>;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {items.map((item) => (
          <span key={item} style={{ fontSize: 13, color: checked[item] ? "#111827" : "#9CA3AF", display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 12 }}>{checked[item] ? "✓" : "○"}</span> {item}
          </span>
        ))}
      </div>
    );
  }
  return String(value);
}

const styles = {
  section: { marginTop: 24 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    margin: "0 0 12px",
  },
  grid: { display: "flex", flexDirection: "column", gap: 10 },
  row: { display: "flex", flexDirection: "column", gap: 4 },
  label: { fontSize: 13, fontWeight: 500, color: "#374151" },
  value: { fontSize: 14, color: "#111827" },
  input: {
    padding: "8px 10px",
    border: "1px solid #D1D5DB",
    borderRadius: 6,
    fontSize: 14,
    outline: "none",
    fontFamily: "inherit",
    width: "100%",
  },
};
