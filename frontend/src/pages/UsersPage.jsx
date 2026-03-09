import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/auth/AuthContext";
import { usersApi } from "@/api/users";
import Badge from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";
import Spinner from "@/components/ui/Spinner";
import EmptyState from "@/components/ui/EmptyState";

const ROLE_COLORS = {
  superadmin:    "#7C3AED",
  company_admin: "#059669",
  manager:       "#3B82F6",
  technician:    "#6B7280",
  sales:         "#F59E0B",
};

const ROLE_LABELS = {
  superadmin:    "Superadmin",
  company_admin: "Admin",
  manager:       "Manager",
  technician:    "Technician",
  sales:         "Sales",
};

const ROLES_FOR_FORM = ["company_admin", "manager", "technician", "sales"];
const ADMIN_ROLES    = ["company_admin", "superadmin"];

const EMPTY_CREATE = {
  first_name: "", last_name: "", email: "", password: "", role: "technician", phone: "",
};

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const isAdmin = ADMIN_ROLES.includes(currentUser?.role);

  const [users, setUsers]         = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState("");

  const [roleFilter, setRoleFilter]     = useState("");
  const [activeFilter, setActiveFilter] = useState("true");
  const [page, setPage]                 = useState(1);

  const [showCreate, setShowCreate]   = useState(false);
  const [createForm, setCreateForm]   = useState(EMPTY_CREATE);
  const [creating, setCreating]       = useState(false);
  const [createError, setCreateError] = useState("");

  const [editUser, setEditUser]   = useState(null);
  const [editForm, setEditForm]   = useState({});
  const [saving, setSaving]       = useState(false);
  const [editError, setEditError] = useState("");

  const fetchUsers = useCallback(async (role, active, pg) => {
    setLoading(true);
    setError("");
    try {
      const params = { page: pg, per_page: 25 };
      if (role)   params.role      = role;
      if (active) params.is_active = active;
      const res = await usersApi.list(params);
      setUsers(res.data.items);
      setPagination(res.data.pagination);
    } catch {
      setError("Failed to load users.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsers(roleFilter, activeFilter, 1); }, [fetchUsers]);

  const handleCreate = async (e) => {
    e.preventDefault();
    setCreateError("");
    setCreating(true);
    try {
      const payload = {
        first_name: createForm.first_name.trim(),
        last_name:  createForm.last_name.trim(),
        email:      createForm.email.trim(),
        password:   createForm.password,
        role:       createForm.role,
      };
      if (createForm.phone.trim()) payload.phone = createForm.phone.trim();
      await usersApi.create(payload);
      setShowCreate(false);
      setCreateForm(EMPTY_CREATE);
      fetchUsers(roleFilter, activeFilter, page);
    } catch (err) {
      setCreateError(err.response?.data?.error || "Failed to create user.");
    } finally {
      setCreating(false);
    }
  };

  const openEdit = (u) => {
    setEditUser(u);
    setEditForm({
      first_name: u.first_name,
      last_name:  u.last_name,
      email:      u.email,
      phone:      u.phone || "",
      role:       u.role,
      is_active:  u.is_active,
    });
    setEditError("");
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    setEditError("");
    setSaving(true);
    try {
      const payload = {
        first_name: editForm.first_name.trim(),
        last_name:  editForm.last_name.trim(),
        phone:      editForm.phone.trim() || null,
      };
      if (isAdmin) {
        payload.email     = editForm.email.trim();
        payload.role      = editForm.role;
        payload.is_active = editForm.is_active;
      }
      await usersApi.update(editUser.id, payload);
      setEditUser(null);
      fetchUsers(roleFilter, activeFilter, page);
    } catch (err) {
      setEditError(err.response?.data?.error || "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (u) => {
    if (!window.confirm(`Deactivate ${u.full_name}? They will lose access immediately.`)) return;
    try {
      await usersApi.deactivate(u.id);
      fetchUsers(roleFilter, activeFilter, page);
    } catch (err) {
      alert(err.response?.data?.error || "Failed to deactivate.");
    }
  };

  const handleReactivate = async (u) => {
    try {
      await usersApi.update(u.id, { is_active: true });
      fetchUsers(roleFilter, activeFilter, page);
    } catch {
      alert("Failed to reactivate user.");
    }
  };

  return (
    <div>
      {/* Header */}
      <div style={styles.header}>
        <h1 style={styles.title}>Team</h1>
        {isAdmin && (
          <button style={styles.primaryBtn} onClick={() => { setShowCreate(true); setCreateForm(EMPTY_CREATE); setCreateError(""); }}>
            + Add User
          </button>
        )}
      </div>

      {/* Filters */}
      <div style={styles.filterBar}>
        <select style={styles.select} value={roleFilter} onChange={(e) => { setRoleFilter(e.target.value); setPage(1); fetchUsers(e.target.value, activeFilter, 1); }}>
          <option value="">All roles</option>
          {ROLES_FOR_FORM.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
        </select>
        <select style={styles.select} value={activeFilter} onChange={(e) => { setActiveFilter(e.target.value); setPage(1); fetchUsers(roleFilter, e.target.value, 1); }}>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
          <option value="">All</option>
        </select>
      </div>

      {error && <div style={styles.errorMsg}>{error}</div>}

      {loading ? (
        <div style={styles.loadingWrap}><Spinner size={24} /></div>
      ) : users.length === 0 ? (
        <EmptyState
          message="No users found."
          action={isAdmin ? "+ Add User" : undefined}
          onAction={() => setShowCreate(true)}
        />
      ) : (
        <>
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  {["Name", "Email", "Role", "Status", "Phone", "Last Login", ...(isAdmin ? ["Actions"] : [])].map((h) => (
                    <th key={h} style={styles.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const isSelf = u.id === currentUser?.id;
                  return (
                    <tr key={u.id} style={styles.tr}>
                      <td style={styles.td}>
                        <div style={styles.nameCell}>
                          <div style={{ ...styles.avatar, background: ROLE_COLORS[u.role] || "#6B7280" }}>
                            {u.first_name[0]}{u.last_name[0]}
                          </div>
                          <span style={styles.fullName}>
                            {u.full_name}
                            {isSelf && <span style={styles.selfTag}> (you)</span>}
                          </span>
                        </div>
                      </td>
                      <td style={styles.td}>{u.email}</td>
                      <td style={styles.td}>
                        <Badge label={ROLE_LABELS[u.role] || u.role} color={ROLE_COLORS[u.role] || "#6B7280"} />
                      </td>
                      <td style={styles.td}>
                        <Badge label={u.is_active ? "Active" : "Inactive"} color={u.is_active ? "#10B981" : "#9CA3AF"} />
                      </td>
                      <td style={styles.td}>{u.phone || <span style={styles.muted}>—</span>}</td>
                      <td style={styles.td}>
                        {u.last_login_at
                          ? new Date(u.last_login_at).toLocaleDateString()
                          : <span style={styles.muted}>Never</span>}
                      </td>
                      {isAdmin && (
                        <td style={styles.td}>
                          <div style={styles.actionRow}>
                            <button style={styles.editBtn} onClick={() => openEdit(u)}>Edit</button>
                            {!isSelf && (
                              u.is_active
                                ? <button style={styles.deactivateBtn} onClick={() => handleDeactivate(u)}>Deactivate</button>
                                : <button style={styles.reactivateBtn} onClick={() => handleReactivate(u)}>Reactivate</button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {pagination && (pagination.has_prev || pagination.has_next) && (
            <div style={styles.pagination}>
              <button style={{ ...styles.pageBtn, opacity: pagination.has_prev ? 1 : 0.4 }} disabled={!pagination.has_prev} onClick={() => { setPage(page - 1); fetchUsers(roleFilter, activeFilter, page - 1); }}>← Prev</button>
              <span style={styles.pageInfo}>Page {pagination.page} of {pagination.pages}</span>
              <button style={{ ...styles.pageBtn, opacity: pagination.has_next ? 1 : 0.4 }} disabled={!pagination.has_next} onClick={() => { setPage(page + 1); fetchUsers(roleFilter, activeFilter, page + 1); }}>Next →</button>
            </div>
          )}
        </>
      )}

      {/* Create Modal */}
      {showCreate && (
        <Modal title="Add User" onClose={() => setShowCreate(false)}>
          <form onSubmit={handleCreate} style={styles.form}>
            {createError && <div style={styles.errorMsg}>{createError}</div>}
            <div style={styles.row2}>
              <FormField label="First Name" required>
                <input style={styles.input} required value={createForm.first_name} onChange={(e) => setCreateForm({ ...createForm, first_name: e.target.value })} />
              </FormField>
              <FormField label="Last Name" required>
                <input style={styles.input} required value={createForm.last_name} onChange={(e) => setCreateForm({ ...createForm, last_name: e.target.value })} />
              </FormField>
            </div>
            <FormField label="Email" required>
              <input type="email" style={styles.input} required value={createForm.email} onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })} />
            </FormField>
            <FormField label="Temporary Password" required>
              <input
                type="password"
                style={styles.input}
                required
                minLength={8}
                value={createForm.password}
                onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                placeholder="Min 8 characters"
              />
            </FormField>
            <div style={styles.row2}>
              <FormField label="Role" required>
                <select style={styles.input} value={createForm.role} onChange={(e) => setCreateForm({ ...createForm, role: e.target.value })}>
                  {ROLES_FOR_FORM.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                </select>
              </FormField>
              <FormField label="Phone">
                <input style={styles.input} value={createForm.phone} onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })} placeholder="Optional" />
              </FormField>
            </div>
            <div style={styles.modalFooter}>
              <button type="button" style={styles.cancelBtn} onClick={() => setShowCreate(false)}>Cancel</button>
              <button type="submit" style={styles.primaryBtn} disabled={creating}>{creating ? "Adding…" : "Add User"}</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Edit Modal */}
      {editUser && (
        <Modal title={`Edit — ${editUser.full_name}`} onClose={() => setEditUser(null)}>
          <form onSubmit={handleSaveEdit} style={styles.form}>
            {editError && <div style={styles.errorMsg}>{editError}</div>}
            <div style={styles.row2}>
              <FormField label="First Name" required>
                <input style={styles.input} required value={editForm.first_name} onChange={(e) => setEditForm({ ...editForm, first_name: e.target.value })} />
              </FormField>
              <FormField label="Last Name" required>
                <input style={styles.input} required value={editForm.last_name} onChange={(e) => setEditForm({ ...editForm, last_name: e.target.value })} />
              </FormField>
            </div>
            {isAdmin && (
              <FormField label="Email" required>
                <input type="email" style={styles.input} required value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
              </FormField>
            )}
            <FormField label="Phone">
              <input style={styles.input} value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} placeholder="Optional" />
            </FormField>
            {isAdmin && (
              <div style={styles.row2}>
                <FormField label="Role">
                  <select style={styles.input} value={editForm.role} onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}>
                    {ROLES_FOR_FORM.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                  </select>
                </FormField>
                <FormField label="Status">
                  <select style={styles.input} value={String(editForm.is_active)} onChange={(e) => setEditForm({ ...editForm, is_active: e.target.value === "true" })}>
                    <option value="true">Active</option>
                    <option value="false">Inactive</option>
                  </select>
                </FormField>
              </div>
            )}
            <div style={styles.modalFooter}>
              <button type="button" style={styles.cancelBtn} onClick={() => setEditUser(null)}>Cancel</button>
              <button type="submit" style={styles.primaryBtn} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function FormField({ label, required, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 12, flex: 1 }}>
      <label style={{ fontSize: 13, fontWeight: 500, color: "#374151" }}>
        {label}{required && <span style={{ color: "#EF4444" }}> *</span>}
      </label>
      {children}
    </div>
  );
}

const styles = {
  header:        { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 },
  title:         { fontSize: 22, fontWeight: 700, color: "#111827", margin: 0 },
  primaryBtn:    { padding: "8px 18px", background: "#111827", color: "#fff", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer" },
  cancelBtn:     { padding: "8px 18px", background: "#fff", color: "#374151", border: "1px solid #D1D5DB", borderRadius: 6, fontSize: 13, cursor: "pointer" },
  filterBar:     { display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" },
  select:        { padding: "8px 12px", border: "1px solid #D1D5DB", borderRadius: 6, fontSize: 13, outline: "none", background: "#fff" },
  loadingWrap:   { display: "flex", justifyContent: "center", padding: 48 },
  errorMsg:      { color: "#B91C1C", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 6, padding: "10px 14px", marginBottom: 16, fontSize: 13 },
  tableWrap:     { overflowX: "auto" },
  table:         { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th:            { textAlign: "left", padding: "10px 14px", background: "#F9FAFB", borderBottom: "1px solid #E5E7EB", fontSize: 12, fontWeight: 600, color: "#6B7280", whiteSpace: "nowrap" },
  tr:            { borderBottom: "1px solid #F3F4F6" },
  td:            { padding: "12px 14px", color: "#374151", verticalAlign: "middle" },
  nameCell:      { display: "flex", alignItems: "center", gap: 10 },
  avatar:        { width: 32, height: 32, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12, fontWeight: 700, flexShrink: 0, textTransform: "uppercase" },
  fullName:      { fontWeight: 600, color: "#111827" },
  selfTag:       { fontWeight: 400, color: "#9CA3AF", fontSize: 12 },
  muted:         { color: "#9CA3AF" },
  actionRow:     { display: "flex", gap: 6, flexWrap: "wrap" },
  editBtn:       { padding: "4px 12px", background: "#F3F4F6", color: "#374151", border: "1px solid #E5E7EB", borderRadius: 5, fontSize: 12, cursor: "pointer" },
  deactivateBtn: { padding: "4px 12px", background: "#FEF2F2", color: "#DC2626", border: "1px solid #FECACA", borderRadius: 5, fontSize: 12, cursor: "pointer" },
  reactivateBtn: { padding: "4px 12px", background: "#ECFDF5", color: "#059669", border: "1px solid #A7F3D0", borderRadius: 5, fontSize: 12, cursor: "pointer" },
  pagination:    { display: "flex", alignItems: "center", gap: 12, justifyContent: "center", marginTop: 20 },
  pageBtn:       { padding: "6px 16px", border: "1px solid #D1D5DB", borderRadius: 6, fontSize: 13, cursor: "pointer", background: "#fff" },
  pageInfo:      { fontSize: 13, color: "#6B7280" },
  form:          { display: "flex", flexDirection: "column" },
  row2:          { display: "flex", gap: 12 },
  input:         { padding: "8px 10px", border: "1px solid #D1D5DB", borderRadius: 6, fontSize: 14, outline: "none", fontFamily: "inherit", width: "100%", boxSizing: "border-box" },
  modalFooter:   { display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 },
};
