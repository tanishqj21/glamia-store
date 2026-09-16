import React, { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";
import { formatIST } from "../lib/commerce";

function employeeLabel(employee) {
  return employee.active ? "Active" : "Disabled";
}

export function EmployeesView() {
  const [employees, setEmployees] = useState([]);
  const [form, setForm] = useState({ employee_code: "", name: "", password: "" });
  const [reset, setReset] = useState({});
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const response = await apiFetch("/api/admin/employees");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Employees could not be loaded");
    setEmployees(data.employees || []);
  }

  useEffect(() => {
    load().catch((requestError) => setError(requestError.message));
  }, []);

  function changeForm(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function create(event) {
    event.preventDefault();
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await apiFetch("/api/admin/employees", { method: "POST", body: JSON.stringify(form) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Employee could not be created");
      setEmployees((current) => [...current, data.employee].sort((a, b) => String(a.name).localeCompare(String(b.name))));
      setForm({ employee_code: "", name: "", password: "" });
      setMessage(`${data.employee.employee_code} is ready. Share the ID and password securely with the employee.`);
    } catch (requestError) { setError(requestError.message); } finally { setBusy(false); }
  }

  async function update(employee, patch) {
    setBusyId(employee.id); setError(""); setMessage("");
    try {
      const response = await apiFetch(`/api/admin/employees/${encodeURIComponent(employee.id)}`, { method: "PATCH", body: JSON.stringify(patch) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Employee could not be updated");
      setEmployees((current) => current.map((item) => item.id === employee.id ? { ...item, ...data.employee } : item));
      setReset((current) => ({ ...current, [employee.id]: "" }));
      setMessage(`${data.employee.employee_code} updated.`);
    } catch (requestError) { setError(requestError.message); } finally { setBusyId(""); }
  }

  return <section className="admin-panel admin-wide-panel">
    <div className="admin-panel-heading"><div><p className="eyebrow">Warehouse access</p><h2>Employees</h2><p className="muted">Create individual app IDs for packing staff. Employees cannot access catalog, payments, refunds, or admin settings.</p></div><span>{employees.filter((employee) => employee.active).length} active</span></div>
    {(error || message) && <p className={error ? "inline-error" : "inline-note"} role="status">{error || message}</p>}
    <form className="admin-form-grid" onSubmit={create}>
      <label>Employee ID <span className="form-hint">letters, numbers, - or _</span><input name="employee_code" value={form.employee_code} onChange={changeForm} placeholder="EMP-001" required autoCapitalize="characters" /></label>
      <label>Employee name<input name="name" value={form.name} onChange={changeForm} placeholder="Packing team member" required /></label>
      <label>Password <span className="form-hint">minimum 8 characters</span><input name="password" type="password" value={form.password} onChange={changeForm} placeholder="Temporary password" minLength={8} required autoComplete="new-password" /></label>
      <div className="form-actions"><button className="primary-action" type="submit" disabled={busy}>{busy ? "Creating…" : "Create employee"} <span aria-hidden="true">↗</span></button></div>
    </form>
    <div className="system-list">
      {employees.map((employee) => <article className="system-row" key={employee.id}>
        <div className="system-row-main"><strong>{employee.employee_code} · {employee.name}</strong><span><span className={`status-pill status-${employee.active ? "live" : "hold"}`}>{employeeLabel(employee)}</span>{employee.last_login_at ? ` · Last login ${formatIST(employee.last_login_at)}` : " · Never signed in"}</span><small>Created {employee.created_at ? formatIST(employee.created_at) : "recently"}{employee.locked_until ? " · Login temporarily locked" : ""}</small></div>
        <div className="manage-product-actions"><button type="button" disabled={busyId === employee.id} onClick={() => update(employee, { active: !employee.active })}>{employee.active ? "Disable" : "Enable"}</button><input type="password" value={reset[employee.id] || ""} onChange={(event) => setReset((current) => ({ ...current, [employee.id]: event.target.value }))} placeholder="New password" aria-label={`New password for ${employee.employee_code}`} minLength={8} autoComplete="new-password" /><button type="button" disabled={busyId === employee.id || String(reset[employee.id] || "").length < 8} onClick={() => update(employee, { password: reset[employee.id] })}>Reset password</button></div>
      </article>)}
      {!employees.length && <div className="empty-state">No employee accounts yet.</div>}
    </div>
  </section>;
}
