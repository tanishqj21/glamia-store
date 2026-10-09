import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../lib/api";
import { formatIST } from "../lib/commerce";

const POSITION_OPTIONS = [
  { id: "admin", label: "Admin", description: "Full access; only owners can assign this position" },
  { id: "manager", label: "Manager", description: "Full workspace access" },
  { id: "customer_relationship", label: "Customer relationship", description: "Customers, support, reviews, and orders" },
  { id: "inventory_manager", label: "Store manager", description: "Hero Studio, listings, inventory, categories, tax, and catalogue" },
  { id: "packing_staff", label: "Packing staff", description: "Packing queue only" }
];

const PERMISSION_OPTIONS = [
  ["dashboard", "Dashboard"], ["storefront", "Storefront"], ["hero", "Hero Studio"], ["events", "Events"], ["cinematic_reel", "Cinematic reel"], ["tax", "GST & HSN"],
  ["coupons", "Coupons"], ["labels", "Labels"], ["employees", "Employees"], ["manage_store", "Manage store"],
  ["notifications", "Notifications"], ["packing", "Packing"], ["orders", "Orders"], ["products", "All products"], ["add_product", "Add listing"],
  ["bulk_listing", "Bulk listing"], ["inventory", "Inventory"], ["customers", "Customers"], ["reviews", "Reviews"],
  ["questions", "Product questions"], ["deals", "Deals"], ["categories", "Categories"], ["returns", "Returns"],
  ["support", "Customer support"], ["system", "System"], ["google_analytics", "Google Analytics"]
];

const DEFAULT_ACCESS = {
  admin: PERMISSION_OPTIONS.map(([id]) => id),
  manager: PERMISSION_OPTIONS.map(([id]) => id),
  customer_relationship: ["dashboard", "orders", "customers", "reviews", "questions", "support", "notifications"],
  inventory_manager: ["dashboard", "hero", "products", "add_product", "bulk_listing", "inventory", "categories", "tax", "labels", "deals", "notifications"],
  packing_staff: ["packing"]
};

function permissionsFor(position, existing) {
  const selected = existing && typeof existing === "object" ? existing : null;
  const defaults = new Set(DEFAULT_ACCESS[position] || DEFAULT_ACCESS.packing_staff);
  return Object.fromEntries(PERMISSION_OPTIONS.map(([id]) => [id, selected
    ? Object.prototype.hasOwnProperty.call(selected, id) ? selected[id] === true : defaults.has(id)
    : defaults.has(id)]));
}

function emptyForm() {
  return { employee_code: "", name: "", employee_email: "", password: "", position: "packing_staff", permissions: permissionsFor("packing_staff") };
}

function employeeLabel(employee) {
  return employee.active ? "Active" : "Disabled";
}

function positionLabel(position) {
  return POSITION_OPTIONS.find((item) => item.id === position)?.label || "Packing staff";
}

function permissionCount(employee) {
  return Object.values(employee.permissions || {}).filter(Boolean).length;
}

function employeeDraft(employee) {
  return {
    employee_email: employee.employee_email || "",
    position: employee.position || "packing_staff",
    permissions: permissionsFor(employee.position || "packing_staff", employee.permissions)
  };
}

export function EmployeesView({ user }) {
  const [employees, setEmployees] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [drafts, setDrafts] = useState({});
  const [reset, setReset] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const [showReset, setShowReset] = useState({});
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [management, setManagement] = useState(null);
  const positions = POSITION_OPTIONS.filter((option) => management?.positions?.some(({ id }) => id === option.id));
  function scopedPermissions(position, existing) {
    return Object.fromEntries(Object.entries(permissionsFor(position, existing)).map(([id, enabled]) => [id, enabled && management?.permissions?.[id] === true]));
  }

  const load = useCallback(async () => {
    const response = await apiFetch("/api/admin/employees");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Employees could not be loaded");
    const nextEmployees = data.employees || [];
    setManagement(data.management);
    setForm((current) => ({ ...current, permissions: Object.fromEntries(Object.entries(current.permissions).map(([id, enabled]) => [id, enabled && data.management?.permissions?.[id] === true])) }));
    setEmployees(nextEmployees);
    setDrafts(Object.fromEntries(nextEmployees.map((employee) => [employee.id, employeeDraft(employee)])));
  }, []);

  useEffect(() => { load().catch((requestError) => setError(requestError.message)); }, [load, user]);

  function changeForm(event) {
    const { name, value } = event.target;
    setForm((current) => name === "position" ? { ...current, position: value, permissions: scopedPermissions(value) } : { ...current, [name]: value });
  }

  function togglePermission(target, permission) {
    if (management?.permissions?.[permission] !== true) return;
    if (target === "new") {
      setForm((current) => ({ ...current, permissions: { ...current.permissions, [permission]: !current.permissions[permission] } }));
      return;
    }
    setDrafts((current) => ({ ...current, [target]: { ...current[target], permissions: { ...current[target].permissions, [permission]: !current[target].permissions[permission] } } }));
  }

  function changeDraft(id, name, value) {
    setDrafts((current) => name === "position" ? { ...current, [id]: { ...current[id], position: value, permissions: scopedPermissions(value) } } : { ...current, [id]: { ...current[id], [name]: value } });
  }

  async function create(event) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      const response = await apiFetch("/api/admin/employees", { method: "POST", body: JSON.stringify(form) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Employee could not be created");
      setEmployees((current) => [...current, data.employee].sort((a, b) => String(a.name).localeCompare(String(b.name))));
      setDrafts((current) => ({ ...current, [data.employee.id]: employeeDraft(data.employee) }));
      setForm({ ...emptyForm(), permissions: scopedPermissions("packing_staff") });
      setShowPassword(false);
      setMessage(`${data.employee.employee_code} is ready. Share the ID and password securely with the employee.`);
    } catch (requestError) { setError(requestError.message); } finally { setBusy(false); }
  }

  async function update(employee, patch, messageText = `${employee.employee_code} updated.`) {
    setBusyId(employee.id); setError(""); setMessage("");
    try {
      const response = await apiFetch(`/api/admin/employees/${encodeURIComponent(employee.id)}`, { method: "PATCH", body: JSON.stringify(patch) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Employee could not be updated");
      setEmployees((current) => current.map((item) => item.id === employee.id ? { ...item, ...data.employee } : item));
      setDrafts((current) => ({ ...current, [employee.id]: employeeDraft(data.employee) }));
      setReset((current) => ({ ...current, [employee.id]: "" }));
      setShowReset((current) => ({ ...current, [employee.id]: false }));
      setMessage(messageText);
    } catch (requestError) { setError(requestError.message); } finally { setBusyId(""); }
  }

  async function deleteEmployee(employee) {
    if (!window.confirm(`Permanently delete ${employee.employee_code} · ${employee.name}? This revokes sessions and removes the employee account.`)) return;
    setBusyId(employee.id); setError(""); setMessage("");
    try {
      const response = await apiFetch(`/api/admin/employees/${encodeURIComponent(employee.id)}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Employee could not be deleted");
      setEmployees((current) => current.filter((item) => item.id !== employee.id));
      setDrafts((current) => { const next = { ...current }; delete next[employee.id]; return next; });
      setReset((current) => { const next = { ...current }; delete next[employee.id]; return next; });
      setShowReset((current) => { const next = { ...current }; delete next[employee.id]; return next; });
      setMessage(`${employee.employee_code} was permanently deleted.`);
    } catch (requestError) { setError(requestError.message); } finally { setBusyId(""); }
  }

  function permissionEditor(id, draft) {
    return <div className="employee-access-editor"><div className="employee-access-fields"><label>Staff email <span className="form-hint">optional</span><input type="email" value={draft.employee_email} onChange={(event) => changeDraft(id, "employee_email", event.target.value)} placeholder="employee@example.com" /></label><label>Position<select value={draft.position} onChange={(event) => changeDraft(id, "position", event.target.value)}>{positions.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label></div><div className="employee-permission-grid">{PERMISSION_OPTIONS.map(([permission, label]) => <label key={permission}><input type="checkbox" disabled={management?.permissions?.[permission] !== true} checked={draft.permissions[permission] === true} onChange={() => togglePermission(id, permission)} />{label}</label>)}</div><button type="button" className="primary-action" disabled={busyId === id} onClick={() => update(employeeById(id), { employee_email: draft.employee_email, position: draft.position, permissions: draft.permissions }, "Employee access saved.")}>{busyId === id ? "Saving…" : "Save access"} </button></div>;
  }

  function employeeById(id) { return employees.find((employee) => employee.id === id); }

  return <section className="admin-panel admin-wide-panel employee-workspace">
    <div className="admin-panel-heading"><div><p className="eyebrow">Workspace access</p><h2>Employees</h2><p className="muted">Create staff accounts for the packing app, assign a position, and choose exactly which admin workspace areas they may use. Disabling is reversible; deletion is permanent.</p></div><span>{employees.filter((employee) => employee.active).length} active · {employees.length} total</span></div>
    {(error || message) && <p className={error ? "inline-error" : "inline-note"} role="status">{error || message}</p>}
    <form className="admin-form-grid employee-create-form" onSubmit={create}>
      <label>Employee ID <span className="form-hint">letters, numbers, - or _</span><input name="employee_code" value={form.employee_code} onChange={changeForm} placeholder="EMP-001" required autoCapitalize="characters" /></label>
      <label>Employee name<input name="name" value={form.name} onChange={changeForm} placeholder="Packing team member" required /></label>
      <label>Employee email <span className="form-hint">optional · Admin portal sign-in uses this verified Google email; it does not whitelist it</span><input name="employee_email" type="email" value={form.employee_email} onChange={changeForm} placeholder="employee@example.com" autoComplete="email" /></label>
      <label>Position<select name="position" value={form.position} onChange={changeForm}>{positions.map((item) => <option key={item.id} value={item.id}>{item.label} · {item.description}</option>)}</select></label>
      <div className="employee-password-field"><label htmlFor="employee-create-password">Password <span className="form-hint">minimum 8 characters</span></label><div className="employee-password-control"><input id="employee-create-password" name="password" type={showPassword ? "text" : "password"} value={form.password} onChange={changeForm} placeholder="Temporary password" minLength={8} required autoComplete="new-password" autoCapitalize="none" spellCheck={false} disabled={busy} /><button type="button" aria-controls="employee-create-password" aria-pressed={showPassword} onClick={() => setShowPassword((current) => !current)} disabled={busy}>{showPassword ? "Hide password" : "Show password"}</button></div><span className="form-hint">Only the password you enter here can be shown. Saved passwords cannot be viewed.</span></div>
      <div className="employee-permission-box"><div className="listing-subheading"><strong>Initial access</strong><span>{management?.can_create_admin ? "Owner: you can assign Admin" : "You can grant only your own access or less"}</span></div><div className="employee-permission-grid">{PERMISSION_OPTIONS.map(([permission, label]) => <label key={permission}><input type="checkbox" disabled={management?.permissions?.[permission] !== true} checked={form.permissions[permission] === true} onChange={() => togglePermission("new", permission)} />{label}</label>)}</div></div>
      <div className="form-actions"><button className="primary-action" type="submit" disabled={busy || !management}>{busy ? "Creating…" : "Create employee"} </button></div>
    </form>
    <div className="system-list">{employees.map((employee) => {
      const draft = drafts[employee.id] || employeeDraft(employee);
      const locked = employee.can_manage !== true;
      return <article className={`system-row employee-row ${employee.active ? "" : "is-disabled"}`} key={employee.id}>
        <div className="system-row-main"><strong>{employee.employee_code} · {employee.name}</strong><span>{employee.is_owner ? "Owner" : employee.position === "admin" ? "Admin · top employee" : positionLabel(employee.position)} · {employee.employee_email || "No staff email"} · <span className={`status-pill status-${employee.active ? "live" : "hold"}`}>{employeeLabel(employee)}</span></span><small>{permissionCount(employee)} workspace permissions · {employee.last_login_at ? `Last login ${formatIST(employee.last_login_at)}` : "Never signed in"}{employee.locked_until ? " · Login temporarily locked" : ""}</small>
          <span className={`employee-origin employee-origin-${employee.creation_origin}`}>{employee.creation_origin === "employee" ? `◇ Created by employee · ${employee.created_by_email}` : employee.creation_origin === "owner" ? "Created by owner" : "Legacy account · creator unknown"}</span>
        </div>
        {locked ? <p className="muted">Protected account · outside your management scope</p> : <>
          <div className="manage-product-actions"><button type="button" disabled={busyId === employee.id} onClick={() => update(employee, { active: !employee.active }, employee.active ? `${employee.employee_code} disabled. Active sessions were revoked.` : `${employee.employee_code} enabled.`)}>{employee.active ? "Disable" : "Enable"}</button><div className="employee-password-control"><input id={`employee-reset-password-${employee.id}`} type={showReset[employee.id] ? "text" : "password"} value={reset[employee.id] || ""} onChange={(event) => setReset((current) => ({ ...current, [employee.id]: event.target.value }))} placeholder="New password" aria-label={`New password for ${employee.employee_code}`} minLength={8} autoComplete="new-password" autoCapitalize="none" spellCheck={false} disabled={busyId === employee.id} /><button type="button" aria-label={`${showReset[employee.id] ? "Hide" : "Show"} new password for ${employee.employee_code}`} aria-controls={`employee-reset-password-${employee.id}`} aria-pressed={Boolean(showReset[employee.id])} disabled={busyId === employee.id} onClick={() => setShowReset((current) => ({ ...current, [employee.id]: !current[employee.id] }))}>{showReset[employee.id] ? "Hide password" : "Show password"}</button></div><button type="button" disabled={busyId === employee.id || String(reset[employee.id] || "").length < 8} onClick={() => update(employee, { password: reset[employee.id] }, "Password reset and sessions revoked.")}>Reset password</button><button type="button" className="danger-action" disabled={busyId === employee.id} onClick={() => deleteEmployee(employee)}>Delete</button></div>
          <details className="employee-access-details"><summary>Manage email, position, and access</summary>{permissionEditor(employee.id, draft)}</details>
        </>}
      </article>;
    })}{!employees.length && <div className="empty-state">No employee accounts yet.</div>}</div>
  </section>;
}
