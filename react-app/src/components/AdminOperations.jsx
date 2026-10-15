import { ScheduledDateTimeField } from './ScheduledDateTimeField';
import { useEffect, useMemo, useState } from "react";
import { istDateTimeInput, parseISTInput } from '../../../src/time-zone.js';
import { apiFetch } from "../lib/api";
import { money, formatIST } from "../lib/commerce";
import { canUseAdminArea } from "../lib/workspaceAccess";
import { CustomerOrderHistory } from "./CustomerOrderHistory";
import { reportAdminError } from "../lib/adminFeedback";

function date(value) { return value ? formatIST(value) : "—"; }
function imageFor(product) { return product.thumbnail || product.thumbnail_url || product.image || product.image_url || ""; }

function useAdminResource(path, key) {
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    apiFetch(path).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `Could not load ${key}`);
      if (active) setItems(data[key] || []);
    }).catch((requestError) => active && setError(requestError.message)).finally(() => active && setReload((value) => value));
    return () => { active = false; };
  }, [path, key, reload]);
  return { items, setItems, error, refresh: () => setReload((value) => value + 1) };
}

export function CustomersView({ user }) {
  const resource = useAdminResource("/api/admin/customers", "customers");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("recent");
  const [selected, setSelected] = useState(null);
  const canViewOrders = canUseAdminArea(user, "/admin/orders");
  const visible = useMemo(() => resource.items.filter((customer) => `${customer.name || ""} ${customer.email || ""} ${customer.phone || ""}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => sort === "spent" ? Number(b.total_spent) - Number(a.total_spent) : sort === "orders" ? Number(b.order_count) - Number(a.order_count) : sort === "name" ? String(a.name || a.email).localeCompare(String(b.name || b.email)) : new Date(b.created_at || 0) - new Date(a.created_at || 0)), [resource.items, query, sort]);
  if (selected && canViewOrders) return <CustomerOrderHistory key={selected.email} customer={selected} onBack={() => setSelected(null)} />;
  return <section className="admin-panel admin-wide-panel customer-workspace"><div className="admin-panel-heading"><div><p className="eyebrow">Customer relationships</p><h2>Customers</h2></div><span>{visible.length} of {resource.items.length}</span></div><div className="admin-filters"><label className="sr-only" htmlFor="customerSearch">Search customers</label><input id="customerSearch" type="search" placeholder="Name, email, or phone" value={query} onChange={(event) => setQuery(event.target.value)} /><select aria-label="Sort customers" value={sort} onChange={(event) => setSort(event.target.value)}><option value="recent">Recently joined</option><option value="orders">Most orders</option><option value="spent">Highest spend</option><option value="name">Name</option></select></div>{resource.error && <p className="inline-note" role="alert">{resource.error}</p>}<div className="operations-list">{visible.map((customer) => <article className="operation-row customer-operation-row" key={customer.email}>{canViewOrders && <button type="button" className="customer-history-open" onClick={() => setSelected(customer)} aria-label={`View orders for ${customer.name || customer.email}`} />}<span className="avatar-fallback">{String(customer.name || customer.email || "?").split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</span><div className="operation-main"><strong>{customer.name || customer.email}</strong><span>{customer.email}{customer.phone ? ` · ${customer.phone}` : ""}</span><small>{canViewOrders && <span className="customer-history-hint">View order history · </span>}Joined {date(customer.created_at)}{customer.dob ? ` · Birthday ${customer.dob}` : ""}</small></div><div className="operation-stat"><strong>{customer.order_count || 0}</strong><span>orders</span></div><div className="operation-stat"><strong>{money(customer.total_spent)}</strong><span>spent</span></div>{customer.role === "admin" && <span className="status-pill live">Admin</span>}</article>)}{!visible.length && <div className="empty-state">No customers match this search.</div>}</div></section>;
}

export function ReviewsView() {
  const resource = useAdminResource("/api/admin/reviews", "reviews");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [busyId, setBusyId] = useState("");
  const visible = resource.items.filter((review) => (status === "all" || review.status === status) && `${review.product_name || ""} ${review.user_name || ""} ${review.user_email || ""} ${review.comment || ""}`.toLowerCase().includes(query.toLowerCase()));
  async function moderate(review) {
    setBusyId(review.id);
    try { const response = await apiFetch(`/api/admin/reviews/${encodeURIComponent(review.id)}`, { method: "PATCH", body: JSON.stringify({ status: review.status === "visible" ? "hidden" : "visible" }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "Review could not be updated"); resource.setItems((items) => items.map((item) => item.id === review.id ? { ...item, status: data.status } : item)); } catch (error) { reportAdminError(error); } finally { setBusyId(""); }
  }
  async function remove(review) {
    if (!window.confirm("Delete this review permanently?")) return;
    setBusyId(review.id);
    try { const response = await apiFetch(`/api/admin/reviews/${encodeURIComponent(review.id)}`, { method: "DELETE" }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "Review could not be deleted"); resource.setItems((items) => items.filter((item) => item.id !== review.id)); } catch (error) { reportAdminError(error); } finally { setBusyId(""); }
  }
  return <section className="admin-panel admin-wide-panel"><div className="admin-panel-heading"><div><p className="eyebrow">Customer voice</p><h2>Reviews</h2></div><span>{visible.length} shown</span></div><div className="admin-filters"><label className="sr-only" htmlFor="reviewSearch">Search reviews</label><input id="reviewSearch" type="search" placeholder="Product, customer, or comment" value={query} onChange={(event) => setQuery(event.target.value)} /><select aria-label="Filter review status" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All reviews</option><option value="visible">Visible</option><option value="hidden">Hidden</option></select></div><div className="operations-list">{visible.map((review) => <article className="operation-row review-operation-row" key={review.id}>{review.product_image ? <img src={review.product_image} alt="" loading="lazy" /> : <div className="admin-product-placeholder" />}<div className="operation-main"><strong>{review.product_name || "Deleted product"} · <span className="stars">{"★".repeat(Number(review.rating || 0))}{"☆".repeat(Math.max(0, 5 - Number(review.rating || 0)))}</span></strong><span>{review.user_name || review.user_email} · {date(review.created_at)}</span><p>{review.comment || "No written comment."}</p></div><div className="operation-actions"><span className={`status-pill ${review.status === "visible" ? "live" : "status-cancelled"}`}>{review.status}</span><button type="button" disabled={busyId === review.id} onClick={() => moderate(review)}>{review.status === "visible" ? "Hide" : "Unhide"}</button><button className="danger-action" type="button" disabled={busyId === review.id} onClick={() => remove(review)}>Delete</button></div></article>)}{!visible.length && <div className="empty-state">No reviews match these filters.</div>}</div></section>;
}

export function QuestionsView() {
  const resource = useAdminResource("/api/admin/questions", "questions");
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState("");
  const visible = resource.items.filter((item) => `${item.product_name} ${item.customer_name} ${item.customer_email} ${item.question} ${item.answer}`.toLowerCase().includes(query.toLowerCase()));
  async function save(item, patch) {
    setBusyId(item.id);
    try {
      const response = await apiFetch(`/api/admin/questions/${encodeURIComponent(item.id)}`, { method: "PATCH", body: JSON.stringify(patch) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Question could not be updated");
      resource.setItems((items) => items.map((entry) => entry.id === item.id ? data.question : entry));
    } catch (error) { reportAdminError(error); } finally { setBusyId(""); }
  }
  return <section className="admin-panel admin-wide-panel"><div className="admin-panel-heading"><div><p className="eyebrow">Customer voice</p><h2>Product questions</h2><p className="muted">Answer once, then publish helpful information for every shopper.</p></div><span>{visible.length} shown</span></div><div className="admin-filters"><label className="sr-only" htmlFor="questionSearch">Search questions</label><input id="questionSearch" type="search" placeholder="Product, customer, or question" value={query} onChange={(event) => setQuery(event.target.value)} /></div>{resource.error && <p className="inline-note" role="alert">{resource.error}</p>}<div className="operations-list">{visible.map((item) => <article className="operation-row question-operation-row" key={item.id}>{item.product_image ? <img src={item.product_image} alt="" loading="lazy" decoding="async" /> : <div className="admin-product-placeholder" />}<div className="operation-main"><strong>{item.product_name || "Deleted product"}</strong><span>{item.customer_name || item.customer_email} · {date(item.created_at)}</span><p><b>Q:</b> {item.question}</p><label>Answer<textarea rows="3" value={item.answer || ""} onChange={(event) => resource.setItems((items) => items.map((entry) => entry.id === item.id ? { ...entry, answer: event.target.value } : entry))} placeholder="Write a clear answer for shoppers" /></label></div><div className="operation-actions"><span className={`status-pill ${item.status === "published" ? "live" : item.status === "hidden" ? "status-cancelled" : "status-pending"}`}>{item.status}</span><button type="button" disabled={busyId === item.id} onClick={() => save(item, { answer: item.answer || "", status: item.status === "published" ? "hidden" : "published" })}>{item.status === "published" ? "Hide" : "Publish"}</button><button type="button" disabled={busyId === item.id || !item.answer?.trim()} onClick={() => save(item, { answer: item.answer || "", status: item.status })}>Save answer</button></div></article>)}{!visible.length && <div className="empty-state">No product questions yet.</div>}</div></section>;
}

function couponTargetTree(products, categories, subcategories) {
  const names = [...new Set([
    ...categories,
    ...subcategories.map((item) => item.category),
    ...products.map((product) => product.category),
  ].map((value) => String(value || "").trim()).filter(Boolean))];
  const groups = names.map((name) => ({ name, subcategories: [] }));
  const byCategory = new Map(groups.map((group) => [group.name.toLowerCase(), group]));
  function addSubcategory(categoryName, subcategoryName, subSubcategoryNames = []) {
    const group = byCategory.get(String(categoryName || "").toLowerCase());
    const name = String(subcategoryName || "").trim();
    if (!group || !name) return;
    let subcategory = group.subcategories.find((item) => item.name.toLowerCase() === name.toLowerCase());
    if (!subcategory) { subcategory = { name, subcategories: [] }; group.subcategories.push(subcategory); }
    for (const child of subSubcategoryNames) {
      const childName = String(child || "").trim();
      if (childName && !subcategory.subcategories.some((item) => item.name.toLowerCase() === childName.toLowerCase())) subcategory.subcategories.push({ name: childName, subcategories: [] });
    }
  }
  for (const row of subcategories) {
    const children = Array.isArray(row.children) ? row.children : Array.isArray(row.sub_subcategories) ? row.sub_subcategories : [];
    addSubcategory(row.category, row.name, children.map((child) => typeof child === "string" ? child : child.name || child.label));
  }
  for (const product of products) {
    const subcategory = product.subcategory || "";
    const subSubcategory = product.sub_subcategory || product.subsubcategory || product.subSubcategory || "";
    if (subcategory) addSubcategory(product.category, subcategory, subSubcategory ? [subSubcategory] : []);
  }
  return { categories: groups, products: products.filter((product) => product.id).map((product) => ({ type: "product", value: product.id, label: `${product.name} · ${money(product.price)}` })) };
}

function TargetCheckbox({ option, selected, onToggle }) {
  return <label className="target-option"><input type="checkbox" checked={selected} onChange={() => onToggle(option)} /><span>{option.label}</span></label>;
}

const emptyCoupon = { code: "", type: "percent", value: "", active: true, allow_store_credits: false, starts_at: "", ends_at: "", usage_limit: "", per_user_limit: "1", max_discount: "", min_cart_value: "", scope_value: "", targets: [], email_targets: [] };

const couponDateInput = istDateTimeInput;

function couponForm(coupon) {
  return { ...emptyCoupon, ...Object.fromEntries(Object.keys(emptyCoupon).map((key) => [key, coupon[key] ?? emptyCoupon[key]])),
    value: String(coupon.value ?? ""), usage_limit: String(coupon.usage_limit ?? ""), per_user_limit: String(coupon.per_user_limit ?? ""),
    max_discount: String(coupon.max_discount ?? ""), min_cart_value: String(coupon.min_cart_value ?? ""),
    starts_at: couponDateInput(coupon.starts_at), ends_at: couponDateInput(coupon.ends_at),
    targets: (coupon.targets || []).map(target => ({ ...target })), email_targets: [...(coupon.email_targets || [])]
  };
}

function EmailTargetPicker({ emails, setEmails, customers = [] }) {
  const [draft, setDraft] = useState("");
  const clean = (value) => String(value || "").trim().toLowerCase();
  const employeeEmails = new Set(customers.filter((customer) => customer.is_employee).map((customer) => clean(customer.email)));
  const add = (value) => {
    const email = clean(value);
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || emails.includes(email)) return false;
    setEmails((current) => [...current, email]); setDraft(""); return true;
  };
  const suggestions = customers.filter((customer) => customer.email && !emails.includes(clean(customer.email)) && `${customer.name || ""} ${customer.email}`.toLowerCase().includes(draft.trim().toLowerCase())).slice(0, 8);
  function keyDown(event) {
    if (["Enter", "Tab", ","].includes(event.key)) { if (draft.trim()) { event.preventDefault(); add(draft); } }
    if (event.key === "Backspace" && !draft && emails.length) setEmails((current) => current.slice(0, -1));
  }
  return <div className="email-target-picker"><div className="email-token-list">{emails.map((email) => <span className="email-token" key={email}>{email}{employeeEmails.has(email) && <small className="email-token-employee">Employee</small>}<button type="button" onClick={() => setEmails((current) => current.filter((item) => item !== email))} aria-label={`Remove ${email}`}>×</button></span>)}<input value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={keyDown} onBlur={() => { if (draft.trim()) add(draft); }} placeholder={emails.length ? "Add another email" : "Type an email and press Enter"} /></div>{draft.trim() && suggestions.length > 0 && <div className="email-suggestion-list" role="listbox">{suggestions.map((customer) => <button type="button" key={customer.email} onMouseDown={(event) => event.preventDefault()} onClick={() => add(customer.email)}><span className="avatar-fallback">{String(customer.name || customer.email).slice(0, 1).toUpperCase()}</span><span><strong>{customer.name || "Customer"}</strong><small>{customer.email}</small></span>{customer.is_employee && <em className="email-suggestion-badge">Employee</em>}</button>)}</div>}<small className="form-hint">Choose a suggestion or add addresses one at a time. Employee emails are marked clearly. No comma list needed.</small></div>;
}



export function CouponsView({ products, categories, subcategories, customers = [] }) {
  const resource = useAdminResource("/api/admin/coupons", "coupons");
  const [form, setForm] = useState(emptyCoupon);
  const [editingCoupon, setEditingCoupon] = useState(null);
  const [message, setMessage] = useState("");
  const [scope, setScope] = useState("all");
  const [audience, setAudience] = useState("all");
  const [emails, setEmails] = useState([]);
  const [busy, setBusy] = useState(false);
  const [noticeError, setNoticeError] = useState("");
  const targetTree = couponTargetTree(products, categories, subcategories);
  const activeCount = resource.items.filter((coupon) => coupon.active).length;
  const restrictedCount = resource.items.filter((coupon) => coupon.employee_only || coupon.email_targets?.length).length;
  const totalUses = resource.items.reduce((sum, coupon) => sum + Number(coupon.usage_count || 0), 0);
  function change(event) { setForm((current) => ({ ...current, [event.target.name]: event.target.type === "checkbox" ? event.target.checked : event.target.value })); setNoticeError(""); }
  function toggleTarget(option) { setForm((current) => ({ ...current, targets: current.targets.some((target) => target.type === option.type && target.value === option.value) ? current.targets.filter((target) => !(target.type === option.type && target.value === option.value)) : [...current.targets, { type: option.type, value: option.value }] })); }
  function resetEditor() {
    setForm(emptyCoupon); setScope("all"); setAudience("all"); setEmails([]); setEditingCoupon(null); setNoticeError("");
  }
  function edit(coupon) {
    setEditingCoupon(coupon); setForm(couponForm(coupon)); setScope(coupon.scope || "all");
    setAudience(coupon.employee_only ? "employees" : coupon.email_targets?.length ? "selected" : "all");
    setEmails([...(coupon.email_targets || [])]); setNoticeError(""); setMessage("");
    document.querySelector(".coupon-builder")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  async function save(event) {
    event.preventDefault();
    if (scope === "targeted" && !form.targets.length) return setNoticeError("Choose at least one category, subcategory, or product.");
    if (audience === "selected" && !emails.length) return setNoticeError("Add at least one eligible email address or choose Everyone.");
    setBusy(true); setNoticeError(""); setMessage("");
    try {
      const storedDate = (value, original) => editingCoupon && value === couponDateInput(original) ? original || null : value ? parseISTInput(value).toISOString() : null;
      const response = await apiFetch(editingCoupon ? `/api/admin/coupons/${encodeURIComponent(editingCoupon.code)}` : "/api/admin/coupons", { method: editingCoupon ? "PATCH" : "POST", body: JSON.stringify({ ...form, scope, targets: scope === "targeted" ? form.targets : [], value: Number(form.value), usage_limit: form.usage_limit || null, per_user_limit: form.per_user_limit === "" && editingCoupon ? null : Number(form.per_user_limit || 1), max_discount: form.max_discount === "" ? null : Number(form.max_discount), min_cart_value: form.min_cart_value === "" ? null : Number(form.min_cart_value), starts_at: storedDate(form.starts_at, editingCoupon?.starts_at), ends_at: storedDate(form.ends_at, editingCoupon?.ends_at), employee_only: audience === "employees", email_targets: audience === "selected" ? emails : [] }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Coupon could not be saved");
      resource.setItems((items) => editingCoupon ? items.map(item => item.code === editingCoupon.code ? { ...item, ...data.coupon } : item) : [data.coupon, ...items]);
      setMessage(`Coupon ${data.coupon.code} ${editingCoupon ? "updated" : "created"} successfully.`);
      resetEditor();
    } catch (error) { setNoticeError(error.message); } finally { setBusy(false); }
  }
  async function remove(code) {
    if (busy) return;
    if (!window.confirm(`Delete coupon ${code}?`)) return;
    setBusy(true); setNoticeError("");
    try {
      const response = await apiFetch(`/api/admin/coupons/${encodeURIComponent(code)}`, { method: "DELETE" });
      if (!response.ok) { const data = await response.json(); throw new Error(data.error || "Coupon could not be deleted"); }
      resource.setItems((items) => items.filter((coupon) => coupon.code !== code));
      if (editingCoupon?.code === code) resetEditor();
      setMessage(`Coupon ${code} deleted.`);
    } catch (error) { setNoticeError(error.message); } finally { setBusy(false); }
  }
  const previewValue = form.value ? `${form.type === "percent" ? `${form.value}%` : money(form.value)} off` : "Your offer";
  return <section className="admin-panel admin-wide-panel coupon-studio"><div className="coupon-studio-heading"><div><p className="eyebrow">Promotion command centre</p><h2>Coupons</h2><p className="muted">Build a promotion in a few clear moves, preview the customer-facing offer, and keep eligibility precise.</p></div><span className="coupon-studio-live-dot"><i /> {activeCount} active</span></div><div className="coupon-metric-grid"><article><span>Active codes</span><strong>{activeCount}</strong><small>Ready to apply</small></article><article><span>Redemptions</span><strong>{totalUses}</strong><small>Across all coupons</small></article><article><span>Restricted offers</span><strong>{restrictedCount}</strong><small>Email or employee only</small></article><article><span>Products in scope</span><strong>{products.length}</strong><small>Available to target</small></article></div><div className="coupon-studio-grid"><form className="coupon-builder" onSubmit={save} aria-busy={busy}><div className="coupon-section-heading"><div><p className="eyebrow">{editingCoupon ? "Edit existing coupon" : "New promotion"}</p><h3>{editingCoupon ? `Editing ${editingCoupon.code}` : "Create a coupon"}</h3></div>{editingCoupon && <button type="button" className="secondary-action" disabled={busy} onClick={resetEditor}>Cancel editing</button>}</div>{editingCoupon && <p className="form-hint">Changes apply to future checkouts. The code, past orders, and redemption history are preserved.</p>}<div className="coupon-preview-card"><div><p className="eyebrow">Customer preview</p><strong>{form.code || "YOURCODE"}</strong><span>{previewValue}</span></div><small>{form.min_cart_value ? `On orders above ${money(form.min_cart_value)}` : "No minimum cart value"}</small></div><section className="coupon-builder-section"><div className="coupon-section-heading"><div><p className="eyebrow">01 · Offer basics</p><h3>Give it a name people remember</h3></div><span>Required</span></div><div className="admin-form-grid"><label>Coupon code<input name="code" value={form.code} onChange={change} pattern="[A-Za-z0-9_-]{3,24}" required readOnly={Boolean(editingCoupon)} placeholder="EDIT20" />{editingCoupon && <small className="form-hint">Code stays fixed to preserve its history.</small>}</label><label>Discount type<select name="type" value={form.type} onChange={change}><option value="percent">Percentage off</option><option value="flat">Flat amount off</option></select></label><label>Value<input name="value" type="number" min="1" max={form.type === "percent" ? "90" : undefined} value={form.value} onChange={change} required /></label><label>Minimum cart value (₹)<span className="form-hint">optional</span><input name="min_cart_value" type="number" min="0" value={form.min_cart_value} onChange={change} /></label></div></section><section className="coupon-builder-section"><div className="coupon-section-heading"><div><p className="eyebrow">02 · Audience</p><h3>Decide who gets the edit</h3></div><span>{audience === "all" ? "Everyone" : audience === "employees" ? "Employees only" : "Selected emails"}</span></div><label>Eligible audience<select value={audience} onChange={(event) => { setAudience(event.target.value); if (event.target.value !== "selected") setEmails([]); }}><option value="all">Everyone in the store</option><option value="employees">Employees only · all employee emails</option><option value="selected">Selected customer or employee emails</option></select></label>{audience === "employees" && <p className="inline-note" role="status">Every employee email saved in Admin → Employees is eligible, even before that person creates a customer account.</p>}<label>Product scope<select value={scope} onChange={(event) => setScope(event.target.value)}><option value="all">Entire store</option><option value="targeted">Selected categories, subcategories, or products</option>{["category", "product"].includes(scope) && <option value={scope}>Existing {scope} selection</option>}</select></label>{["category", "product"].includes(scope) && <label>Existing scope targets<input name="scope_value" value={form.scope_value} onChange={change} required /><small className="form-hint">Existing comma-separated targets are preserved. Choose Selected categories, subcategories, or products to use the picker instead.</small></label>}{scope === "targeted" && <div className="target-picker coupon-target-picker"><div className="listing-subheading"><div><strong>Eligible targets</strong><p className="form-hint">Mix categories, subcategories, and individual products.</p></div><span>{form.targets.length} selected</span></div><div className="target-picker-layout"><section className="target-picker-section"><p className="target-picker-title">Categories &amp; subcategories</p><div className="target-tree">{targetTree.categories.map((category) => <details className="target-tree-node" key={category.name}><summary><span>{category.name}</span><small>{category.subcategories.length || "No"} subcategories</small></summary><div className="target-tree-body"><TargetCheckbox option={{ type: "category", value: category.name, label: `All ${category.name} products` }} selected={form.targets.some((target) => target.type === "category" && target.value === category.name)} onToggle={toggleTarget} />{category.subcategories.map((subcategory) => <TargetCheckbox key={`${category.name}-${subcategory.name}`} option={{ type: "subcategory", value: subcategory.name, label: `All ${subcategory.name} products` }} selected={form.targets.some((target) => target.type === "subcategory" && target.value === subcategory.name)} onToggle={toggleTarget} />)}</div></details>)}</div></section><section className="target-picker-section"><details className="target-products-dropdown" open><summary><span>Individual products</span><small>{targetTree.products.length} available</small></summary><div className="target-products-list">{targetTree.products.map((option) => <TargetCheckbox key={`${option.type}-${option.value}`} option={option} selected={form.targets.some((target) => target.type === option.type && target.value === option.value)} onToggle={toggleTarget} />)}</div></details></section></div></div>}{audience === "selected" && <label className="coupon-email-field">Eligible email addresses <span className="form-hint">optional · customer or employee emails</span><EmailTargetPicker emails={emails} setEmails={setEmails} customers={customers} /></label>}</section><section className="coupon-builder-section"><div className="coupon-section-heading"><div><p className="eyebrow">03 · Timing &amp; limits</p><h3>Keep urgency under control</h3></div><span>Optional</span></div><div className="admin-form-grid"><ScheduledDateTimeField label={<>Starts at (IST)</>} secondsLabel="Start seconds (IST)" name="starts_at" value={form.starts_at} onChange={change} /><ScheduledDateTimeField label={<>Ends at (IST)</>} secondsLabel="End seconds (IST)" name="ends_at" value={form.ends_at} onChange={change} /><label>Total uses<input name="usage_limit" type="number" min="1" value={form.usage_limit} onChange={change} placeholder="Unlimited" /></label><label>Uses per account<input name="per_user_limit" type="number" min="1" value={form.per_user_limit} onChange={change} placeholder={editingCoupon ? "Unlimited" : "1"} /></label><label>Maximum discount (₹)<span className="form-hint">optional cap</span><input name="max_discount" type="number" min="0" value={form.max_discount} onChange={change} /></label></div><label className="merch-checkbox"><input name="allow_store_credits" type="checkbox" checked={Boolean(form.allow_store_credits)} onChange={change} /> Allow this coupon with store credits</label><p className="form-hint">If off, shoppers must choose the coupon or their credits. Existing coupons stay separate until enabled.</p><label className="merch-checkbox"><input name="active" type="checkbox" checked={form.active} onChange={change} /> Coupon active</label><p className="form-hint">Turn off to stop new redemptions without deleting the coupon.</p></section>{(noticeError || resource.error) && <p className="inline-error" role="alert">{noticeError || resource.error}</p>}{message && <p className="inline-note" role="status">{message}</p>}<div className="form-actions"><span className="form-hint">Coupons are validated again at checkout.</span><button className="primary-action" disabled={busy}>{busy ? editingCoupon ? "Saving…" : "Creating…" : editingCoupon ? "Save coupon changes" : "Create coupon"} </button></div></form><aside className="coupon-studio-side"><div className="coupon-side-card"><p className="eyebrow">Promotion rhythm</p><h3>Make the offer feel intentional.</h3><p>Use the homepage campaign controls for the story, then use coupons for the precise checkout rule.</p><div className="coupon-side-steps"><span><b>01</b> Create the code</span><span><b>02</b> Set the audience</span><span><b>03</b> Launch with confidence</span></div></div><div className="coupon-side-card coupon-tip-card"><span>Good to know</span><strong>Employee emails are always marked in suggestions.</strong><small>Employee-only coupons check the Employees table at checkout, so future customer accounts will qualify automatically.</small></div></aside></div><div className="coupon-list-heading"><div><p className="eyebrow">Your promotion shelf</p><h3>Created coupons</h3></div><span>{resource.items.length} total</span></div><div className="operations-list coupon-operation-list coupon-card-list">{resource.items.map((coupon) => <article className="operation-row coupon-card" key={coupon.code}><span className="coupon-chip">{coupon.code}</span><div className="operation-main"><strong>{coupon.type === "percent" ? `${coupon.value}% off` : `${money(coupon.value)} off`}</strong><span>{coupon.targets?.length ? `${coupon.targets.length} selected targets` : "Entire store"} · {coupon.employee_only ? "All employee emails" : coupon.email_targets?.length ? `${coupon.email_targets.length} restricted emails` : "Everyone"}</span><small>{coupon.starts_at ? date(coupon.starts_at) : "Now"} → {coupon.ends_at ? date(coupon.ends_at) : "No expiry"} · {coupon.usage_count || 0}{coupon.usage_limit ? `/${coupon.usage_limit}` : ""} used · {coupon.per_user_limit || 1} per account · {coupon.allow_store_credits ? "Credits allowed" : "No credit stacking"}</small></div><div className="operation-actions"><span className={`status-pill ${coupon.active ? "live" : "status-cancelled"}`}>{coupon.active ? "Active" : "Inactive"}</span><button type="button" disabled={busy} onClick={() => edit(coupon)} aria-label={`Edit coupon ${coupon.code}`}>Edit</button><button className="danger-action" type="button" disabled={busy} onClick={() => remove(coupon.code)}>Delete</button></div></article>)}{!resource.items.length && <div className="empty-state">No coupons yet.</div>}</div></section>;
}

export function DealsView({ products, onProductChanged }) {
  const [productId, setProductId] = useState("");
  const [starts, setStarts] = useState("");
  const [ends, setEnds] = useState("");
  const [dealPrice, setDealPrice] = useState("");
  const [busy, setBusy] = useState("");
  const [noticeError, setNoticeError] = useState("");
  const [noticeStatus, setNoticeStatus] = useState("");
  const deals = products.filter((product) => product.deal_ends_at);
  async function saveDeal(event) {
    event.preventDefault();
    if (!productId || !ends) return setNoticeError("Choose a product and end time.");
    setBusy(productId);
    try { const response = await apiFetch(`/api/admin/products/${encodeURIComponent(productId)}`, { method: "PATCH", body: JSON.stringify({ deal_starts_at: starts ? new Date(starts).toISOString() : new Date().toISOString(), deal_ends_at: new Date(ends).toISOString(), deal_price: dealPrice ? Number(dealPrice) : null }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "Deal could not be scheduled"); onProductChanged(data.product || { id: productId, deal_starts_at: starts, deal_ends_at: ends, deal_price: dealPrice }); setNoticeError(""); setNoticeStatus("Deal saved."); setStarts(""); setEnds(""); setDealPrice(""); } catch (error) { setNoticeError(error.message); } finally { setBusy(""); }
  }
  async function updatePrice(product) { const value = window.prompt("Enter the deal price in rupees", String(product.deal_price || product.price)); if (value === null) return; const response = await apiFetch(`/api/admin/products/${encodeURIComponent(product.id)}`, { method: "PATCH", body: JSON.stringify({ deal_price: Number(value) }) }); const data = await response.json(); if (!response.ok) return setNoticeError(data.error || "Deal price could not be updated"); onProductChanged(data.product || { ...product, deal_price: Number(value) }); }
  async function removeDeal(product) { if (!window.confirm("Remove this deal and restore the regular price?")) return; const response = await apiFetch(`/api/admin/products/${encodeURIComponent(product.id)}`, { method: "PATCH", body: JSON.stringify({ deal_starts_at: null, deal_ends_at: null, deal_price: null }) }); const data = await response.json(); if (!response.ok) return setNoticeError(data.error || "Deal could not be removed"); onProductChanged(data.product || { ...product, deal_starts_at: null, deal_ends_at: null, deal_price: null }); }
  return <section className="admin-panel admin-wide-panel"><div className="admin-panel-heading"><div><p className="eyebrow">Promotion controls</p><h2>Deals</h2></div><span>{deals.length} scheduled</span></div><form className="admin-listing-form deal-react-form" onSubmit={saveDeal}><div className="admin-form-grid"><label>Product<select value={productId} onChange={(event) => setProductId(event.target.value)} required><option value="">Choose product</option>{products.filter((product) => product.status !== "archived").map((product) => <option key={product.id} value={product.id}>{product.name} · {money(product.price)}</option>)}</select></label><label>Deal price (₹)<span className="form-hint">optional · current price if blank</span><input type="number" min="1" value={dealPrice} onChange={(event) => setDealPrice(event.target.value)} /></label><ScheduledDateTimeField label={<>Starts at (IST) <span className="form-hint">optional · current time if blank</span></>} secondsLabel="Start seconds (IST)" value={starts} onChange={(event) => setStarts(event.target.value)} /><ScheduledDateTimeField label={<>Ends at (IST)</>} secondsLabel="End seconds (IST)" value={ends} onChange={(event) => setEnds(event.target.value)} required /></div>{noticeError && <p className="inline-error" role="alert">{noticeError}</p>}{noticeStatus && <p className="inline-note" role="status">{noticeStatus}</p>}<button className="primary-action" disabled={busy}>{busy ? "Saving…" : "Schedule deal"} </button></form><div className="operations-list">{deals.map((product) => <article className="operation-row deal-operation-row" key={product.id}>{imageFor(product) ? <img src={imageFor(product)} alt="" loading="lazy" /> : <div className="admin-product-placeholder" />}<div className="operation-main"><strong>{product.name}</strong><span>{product.deal_price ? `Deal ${money(product.deal_price)} · Regular ${money(product.price)}` : `Regular ${money(product.price)}`}</span><small>{product.deal_starts_at ? `From ${date(product.deal_starts_at)}` : "Live now"} → {date(product.deal_ends_at)}</small></div><div className="operation-actions"><button type="button" onClick={() => updatePrice(product)}>Change price</button><button className="danger-action" type="button" onClick={() => removeDeal(product)}>Remove</button></div></article>)}{!deals.length && <div className="empty-state">No deals yet. Schedule a deal above.</div>}</div></section>;
}

export function CategoriesView({ categories, subcategories, onCatalogChanged }) {
  const [name, setName] = useState("");
  const [subNames, setSubNames] = useState({});
  const [noticeError, setNoticeError] = useState("");
  const [noticeStatus, setNoticeStatus] = useState("");
  async function mutateCatalog(path, method, body, fallback, onSaved, status) {
    setNoticeError(""); setNoticeStatus("");
    try {
      const response = await apiFetch(path, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || fallback);
      onSaved?.();
      setNoticeStatus(status);
      await onCatalogChanged();
    } catch (error) { setNoticeError(error.message); }
  }
  async function addCategory(event) { event.preventDefault(); await mutateCatalog("/api/admin/categories", "POST", { name }, "Category could not be created", () => setName(""), "Category added."); }
  async function addSubcategory(category) { const value = subNames[category]?.trim(); if (!value) return; await mutateCatalog("/api/admin/subcategories", "POST", { category, name: value }, "Subcategory could not be created", () => setSubNames((current) => ({ ...current, [category]: "" })), "Subcategory added."); }
  async function removeCategory(category) { if (!window.confirm(`Delete category ${category}?`)) return; await mutateCatalog(`/api/admin/categories/${encodeURIComponent(category)}`, "DELETE", undefined, "Category could not be deleted", undefined, "Category deleted."); }
  async function removeSubcategory(category, subcategory) { if (!window.confirm(`Delete subcategory ${subcategory}?`)) return; await mutateCatalog(`/api/admin/subcategories/${encodeURIComponent(category)}/${encodeURIComponent(subcategory)}`, "DELETE", undefined, "Subcategory could not be deleted", undefined, "Subcategory deleted."); }
  return <section className="admin-panel admin-wide-panel"><div className="admin-panel-heading"><div><p className="eyebrow">Catalog taxonomy</p><h2>Categories</h2></div><span>{categories.length} categories</span></div><form className="category-create-form" onSubmit={addCategory}><label className="sr-only" htmlFor="reactCategoryName">New category</label><input id="reactCategoryName" value={name} onChange={(event) => setName(event.target.value)} placeholder="New category" minLength="2" maxLength="30" required />{noticeError && <p className="inline-error" role="alert">{noticeError}</p>}{noticeStatus && <p className="inline-note" role="status">{noticeStatus}</p>}<button className="primary-action">Add category </button></form><div className="operations-list category-operation-list">{categories.map((category) => { const subs = subcategories.filter((item) => item.category === category); return <article className="category-operation" key={category}><div className="category-operation-head"><div><strong>{category}</strong><span>{subs.length} subcategor{subs.length === 1 ? "y" : "ies"}</span></div><button className="danger-action" type="button" onClick={() => removeCategory(category)}>Delete category</button></div><div className="subcategory-chips">{subs.map((sub) => <span className="subcategory-chip" key={`${category}-${sub.name}`}>{sub.name}<button type="button" onClick={() => removeSubcategory(category, sub.name)} aria-label={`Delete ${sub.name}`}>×</button></span>)}<span className="subcategory-add"><input value={subNames[category] || ""} onChange={(event) => setSubNames((current) => ({ ...current, [category]: event.target.value }))} placeholder="New subcategory" maxLength="30" /><button className="secondary-action" type="button" onClick={() => addSubcategory(category)}>Add</button></span></div></article>; })}{!categories.length && <div className="empty-state">No categories yet.</div>}</div></section>;
}
