import React, { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/api";
import { money } from "../lib/commerce";

function date(value) { return value ? new Date(value).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "—"; }
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

export function CustomersView() {
  const resource = useAdminResource("/api/admin/customers", "customers");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("recent");
  const visible = useMemo(() => resource.items.filter((customer) => `${customer.name || ""} ${customer.email || ""} ${customer.phone || ""}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => sort === "spent" ? Number(b.total_spent) - Number(a.total_spent) : sort === "orders" ? Number(b.order_count) - Number(a.order_count) : sort === "name" ? String(a.name || a.email).localeCompare(String(b.name || b.email)) : new Date(b.created_at || 0) - new Date(a.created_at || 0)), [resource.items, query, sort]);
  return <section className="admin-panel admin-wide-panel"><div className="admin-panel-heading"><div><p className="eyebrow">Customer relationships</p><h2>Customers</h2></div><span>{visible.length} of {resource.items.length}</span></div><div className="admin-filters"><label className="sr-only" htmlFor="customerSearch">Search customers</label><input id="customerSearch" type="search" placeholder="Name, email, or phone" value={query} onChange={(event) => setQuery(event.target.value)} /><select aria-label="Sort customers" value={sort} onChange={(event) => setSort(event.target.value)}><option value="recent">Recently joined</option><option value="orders">Most orders</option><option value="spent">Highest spend</option><option value="name">Name</option></select></div>{resource.error && <p className="inline-note" role="alert">{resource.error}</p>}<div className="operations-list">{visible.map((customer) => <article className="operation-row customer-operation-row" key={customer.email}><span className="avatar-fallback">{String(customer.name || customer.email || "?").split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</span><div className="operation-main"><strong>{customer.name || customer.email}</strong><span>{customer.email}{customer.phone ? ` · ${customer.phone}` : ""}</span><small>Joined {date(customer.created_at)}{customer.dob ? ` · Birthday ${customer.dob}` : ""}</small></div><div className="operation-stat"><strong>{customer.order_count || 0}</strong><span>orders</span></div><div className="operation-stat"><strong>{money(customer.total_spent)}</strong><span>spent</span></div>{customer.role === "admin" && <span className="status-pill live">Admin</span>}</article>)}{!visible.length && <div className="empty-state">No customers match this search.</div>}</div></section>;
}

export function ReviewsView() {
  const resource = useAdminResource("/api/admin/reviews", "reviews");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [busyId, setBusyId] = useState("");
  const visible = resource.items.filter((review) => (status === "all" || review.status === status) && `${review.product_name || ""} ${review.user_name || ""} ${review.user_email || ""} ${review.comment || ""}`.toLowerCase().includes(query.toLowerCase()));
  async function moderate(review) {
    setBusyId(review.id);
    try { const response = await apiFetch(`/api/admin/reviews/${encodeURIComponent(review.id)}`, { method: "PATCH", body: JSON.stringify({ status: review.status === "visible" ? "hidden" : "visible" }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "Review could not be updated"); resource.setItems((items) => items.map((item) => item.id === review.id ? { ...item, status: data.status } : item)); } catch (error) { window.alert(error.message); } finally { setBusyId(""); }
  }
  async function remove(review) {
    if (!window.confirm("Delete this review permanently?")) return;
    setBusyId(review.id);
    try { const response = await apiFetch(`/api/admin/reviews/${encodeURIComponent(review.id)}`, { method: "DELETE" }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "Review could not be deleted"); resource.setItems((items) => items.filter((item) => item.id !== review.id)); } catch (error) { window.alert(error.message); } finally { setBusyId(""); }
  }
  return <section className="admin-panel admin-wide-panel"><div className="admin-panel-heading"><div><p className="eyebrow">Customer voice</p><h2>Reviews</h2></div><span>{visible.length} shown</span></div><div className="admin-filters"><label className="sr-only" htmlFor="reviewSearch">Search reviews</label><input id="reviewSearch" type="search" placeholder="Product, customer, or comment" value={query} onChange={(event) => setQuery(event.target.value)} /><select aria-label="Filter review status" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All reviews</option><option value="visible">Visible</option><option value="hidden">Hidden</option></select></div><div className="operations-list">{visible.map((review) => <article className="operation-row review-operation-row" key={review.id}>{review.product_image ? <img src={review.product_image} alt="" loading="lazy" /> : <div className="admin-product-placeholder" />}<div className="operation-main"><strong>{review.product_name || "Deleted product"} · <span className="stars">{"★".repeat(Number(review.rating || 0))}{"☆".repeat(Math.max(0, 5 - Number(review.rating || 0)))}</span></strong><span>{review.user_name || review.user_email} · {date(review.created_at)}</span><p>{review.comment || "No written comment."}</p>{review.media?.length > 0 && <small>{review.media.length} attachment{review.media.length === 1 ? "" : "s"}</small>}</div><div className="operation-actions"><span className={`status-pill ${review.status === "visible" ? "live" : "status-cancelled"}`}>{review.status}</span><button type="button" disabled={busyId === review.id} onClick={() => moderate(review)}>{review.status === "visible" ? "Hide" : "Unhide"}</button><button className="danger-action" type="button" disabled={busyId === review.id} onClick={() => remove(review)}>Delete</button></div></article>)}{!visible.length && <div className="empty-state">No reviews match these filters.</div>}</div></section>;
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
    } catch (error) { window.alert(error.message); } finally { setBusyId(""); }
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

const emptyCoupon = { code: "", type: "percent", value: "", starts_at: "", ends_at: "", usage_limit: "", per_user_limit: "1", max_discount: "", min_cart_value: "", targets: [], email_targets: [] };

export function CouponsView({ products, categories, subcategories }) {
  const resource = useAdminResource("/api/admin/coupons", "coupons");
  const [form, setForm] = useState(emptyCoupon);
  const [scope, setScope] = useState("all");
  const [emails, setEmails] = useState("");
  const [busy, setBusy] = useState(false);
  const [noticeError, setNoticeError] = useState("");
  const [noticeStatus, setNoticeStatus] = useState("");
  const targetTree = couponTargetTree(products, categories, subcategories);
  function change(event) { setForm((current) => ({ ...current, [event.target.name]: event.target.value })); }
  function toggleTarget(option) { setForm((current) => ({ ...current, targets: current.targets.some((target) => target.type === option.type && target.value === option.value) ? current.targets.filter((target) => !(target.type === option.type && target.value === option.value)) : [...current.targets, { type: option.type, value: option.value }] })); }
  async function create(event) {
    event.preventDefault();
    if (scope === "targeted" && !form.targets.length) return setNoticeError("Choose at least one category, subcategory, or product.");
    setBusy(true);
    try {
      const emailTargets = [...new Set(emails.split(/[\s,;]+/).map((email) => email.trim().toLowerCase()).filter(Boolean))];
      const payload = { ...form, scope, targets: scope === "targeted" ? form.targets : [], value: Number(form.value), usage_limit: form.usage_limit || null, per_user_limit: Number(form.per_user_limit || 1), max_discount: form.max_discount === "" ? null : Number(form.max_discount), min_cart_value: form.min_cart_value === "" ? null : Number(form.min_cart_value), starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null, ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null, email_targets: emailTargets };
      const response = await apiFetch("/api/admin/coupons", { method: "POST", body: JSON.stringify(payload) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Coupon could not be created");
      setForm(emptyCoupon); setScope("all"); setEmails(""); resource.refresh();
    } catch (error) { setNoticeError(error.message); } finally { setBusy(false); }
  }
  async function remove(code) {
    if (!window.confirm(`Delete coupon ${code}?`)) return;
    const response = await apiFetch(`/api/admin/coupons/${encodeURIComponent(code)}`, { method: "DELETE" });
    if (!response.ok) { const data = await response.json(); return setNoticeError(data.error || "Coupon could not be deleted"); }
    resource.setItems((items) => items.filter((coupon) => coupon.code !== code));
  }
  return <section className="admin-panel admin-wide-panel"><div className="admin-panel-heading"><div><p className="eyebrow">Promotion controls</p><h2>Coupons</h2></div><span>{resource.items.length} codes</span></div><form className="admin-listing-form coupon-react-form" onSubmit={create}><div className="admin-form-grid"><label>Coupon code<input name="code" value={form.code} onChange={change} pattern="[A-Za-z0-9_-]{3,24}" required placeholder="EDIT20" /></label><label>Discount type<select name="type" value={form.type} onChange={change}><option value="percent">Percentage</option><option value="flat">Flat amount</option></select></label><label>Value<input name="value" type="number" min="1" value={form.value} onChange={change} required /></label><label>Scope<select value={scope} onChange={(event) => setScope(event.target.value)}><option value="all">Entire store</option><option value="targeted">Selected categories, subcategories, or products</option></select></label><label>Starts at <span className="form-hint">optional</span><input name="starts_at" type="datetime-local" value={form.starts_at} onChange={change} /></label><label>Ends at <span className="form-hint">optional</span><input name="ends_at" type="datetime-local" value={form.ends_at} onChange={change} /></label><label>Total uses <span className="form-hint">blank means unlimited</span><input name="usage_limit" type="number" min="1" value={form.usage_limit} onChange={change} /></label><label>Uses per account<input name="per_user_limit" type="number" min="1" value={form.per_user_limit} onChange={change} /></label><label>Maximum discount (₹)<span className="form-hint">optional cap</span><input name="max_discount" type="number" min="0" value={form.max_discount} onChange={change} /></label><label>Minimum cart value (₹)<span className="form-hint">optional</span><input name="min_cart_value" type="number" min="0" value={form.min_cart_value} onChange={change} /></label></div>{scope === "targeted" && <div className="target-picker"><div className="listing-subheading"><div><strong>Eligible targets</strong><p className="form-hint">Select any combination of categories, nested subcategories, and individual products.</p></div><span>{form.targets.length} selected</span></div><div className="target-picker-layout"><section className="target-picker-section" aria-labelledby="coupon-category-targets"><p className="target-picker-title" id="coupon-category-targets">Categories & subcategories</p><div className="target-tree">{targetTree.categories.map((category) => <details className="target-tree-node" key={category.name}><summary><span>{category.name}</span><small>{category.subcategories.length ? `${category.subcategories.length} subcategor${category.subcategories.length === 1 ? "y" : "ies"}` : "Category only"}</small></summary><div className="target-tree-body"><TargetCheckbox option={{ type: "category", value: category.name, label: `All ${category.name} products` }} selected={form.targets.some((target) => target.type === "category" && target.value === category.name)} onToggle={toggleTarget} />{category.subcategories.map((subcategory) => <details className="target-tree-node target-tree-subnode" key={`${category.name}-${subcategory.name}`}><summary><span>{subcategory.name}</span><small>{subcategory.subcategories.length ? `${subcategory.subcategories.length} sub-subcategor${subcategory.subcategories.length === 1 ? "y" : "ies"}` : "Subcategory"}</small></summary><div className="target-tree-body"><TargetCheckbox option={{ type: "subcategory", value: subcategory.name, label: `All ${subcategory.name} products` }} selected={form.targets.some((target) => target.type === "subcategory" && target.value === subcategory.name)} onToggle={toggleTarget} />{subcategory.subcategories.map((child) => <TargetCheckbox key={`${category.name}-${subcategory.name}-${child.name}`} option={{ type: "subsubcategory", value: child.name, label: child.name }} selected={form.targets.some((target) => target.type === "subsubcategory" && target.value === child.name)} onToggle={toggleTarget} />)}</div></details>)}</div></details>)}</div></section><section className="target-picker-section" aria-labelledby="coupon-product-targets"><details className="target-products-dropdown" open><summary><span id="coupon-product-targets">All products</span><small>{targetTree.products.length} available</small></summary><div className="target-products-list">{targetTree.products.map((option) => <TargetCheckbox key={`${option.type}-${option.value}`} option={option} selected={form.targets.some((target) => target.type === option.type && target.value === option.value)} onToggle={toggleTarget} />)}</div></details></section></div></div>}{<label>Eligible email addresses <span className="form-hint">optional · separate with commas or new lines</span><textarea rows="3" value={emails} onChange={(event) => setEmails(event.target.value)} placeholder="customer@example.com" /></label>}{noticeError && <p className="inline-error" role="alert">{noticeError}</p>}{noticeStatus && <p className="inline-note" role="status">{noticeStatus}</p>}<button className="primary-action" disabled={busy}>{busy ? "Creating…" : "Create coupon"} <span aria-hidden="true">↗</span></button></form><div className="operations-list coupon-operation-list">{resource.items.map((coupon) => <article className="operation-row" key={coupon.code}><span className="coupon-chip">{coupon.code}</span><div className="operation-main"><strong>{coupon.type === "percent" ? `${coupon.value}% off` : `${money(coupon.value)} off`}</strong><span>{coupon.targets?.length ? `${coupon.targets.length} selected targets` : "Entire store"} · {coupon.email_targets?.length || 0} restricted emails</span><small>{coupon.starts_at ? date(coupon.starts_at) : "Now"} → {coupon.ends_at ? date(coupon.ends_at) : "No expiry"} · {coupon.usage_count || 0}{coupon.usage_limit ? `/${coupon.usage_limit}` : ""} used · {coupon.per_user_limit || 1} per account</small></div><div className="operation-actions"><span className={`status-pill ${coupon.active ? "live" : "status-cancelled"}`}>{coupon.active ? "Active" : "Inactive"}</span><button className="danger-action" type="button" onClick={() => remove(coupon.code)}>Delete</button></div></article>)}{!resource.items.length && <div className="empty-state">No coupons yet.</div>}</div></section>;
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
  return <section className="admin-panel admin-wide-panel"><div className="admin-panel-heading"><div><p className="eyebrow">Promotion controls</p><h2>Deals</h2></div><span>{deals.length} scheduled</span></div><form className="admin-listing-form deal-react-form" onSubmit={saveDeal}><div className="admin-form-grid"><label>Product<select value={productId} onChange={(event) => setProductId(event.target.value)} required><option value="">Choose product</option>{products.filter((product) => product.status !== "archived").map((product) => <option key={product.id} value={product.id}>{product.name} · {money(product.price)}</option>)}</select></label><label>Deal price (₹)<span className="form-hint">optional · current price if blank</span><input type="number" min="1" value={dealPrice} onChange={(event) => setDealPrice(event.target.value)} /></label><label>Starts at <span className="form-hint">optional · current time if blank</span><input type="datetime-local" value={starts} onChange={(event) => setStarts(event.target.value)} /></label><label>Ends at<input type="datetime-local" value={ends} onChange={(event) => setEnds(event.target.value)} required /></label></div>{noticeError && <p className="inline-error" role="alert">{noticeError}</p>}{noticeStatus && <p className="inline-note" role="status">{noticeStatus}</p>}<button className="primary-action" disabled={busy}>{busy ? "Saving…" : "Schedule deal"} <span aria-hidden="true">↗</span></button></form><div className="operations-list">{deals.map((product) => <article className="operation-row deal-operation-row" key={product.id}>{imageFor(product) ? <img src={imageFor(product)} alt="" loading="lazy" /> : <div className="admin-product-placeholder" />}<div className="operation-main"><strong>{product.name}</strong><span>{product.deal_price ? `Deal ${money(product.deal_price)} · Regular ${money(product.price)}` : `Regular ${money(product.price)}`}</span><small>{product.deal_starts_at ? `From ${date(product.deal_starts_at)}` : "Live now"} → {date(product.deal_ends_at)}</small></div><div className="operation-actions"><button type="button" onClick={() => updatePrice(product)}>Change price</button><button className="danger-action" type="button" onClick={() => removeDeal(product)}>Remove</button></div></article>)}{!deals.length && <div className="empty-state">No deals yet. Schedule a deal above.</div>}</div></section>;
}

export function CategoriesView({ categories, subcategories, onCatalogChanged }) {
  const [name, setName] = useState("");
  const [subNames, setSubNames] = useState({});
  const [noticeError, setNoticeError] = useState("");
  const [noticeStatus, setNoticeStatus] = useState("");
  async function addCategory(event) { event.preventDefault(); const response = await apiFetch("/api/admin/categories", { method: "POST", body: JSON.stringify({ name }) }); const data = await response.json(); if (!response.ok) return setNoticeError(data.error || "Category could not be created"); setName(""); setNoticeError(""); setNoticeStatus("Category added."); onCatalogChanged(); }
  async function addSubcategory(category) { const value = subNames[category]?.trim(); if (!value) return; const response = await apiFetch("/api/admin/subcategories", { method: "POST", body: JSON.stringify({ category, name: value }) }); const data = await response.json(); if (!response.ok) return setNoticeError(data.error || "Subcategory could not be created"); setSubNames((current) => ({ ...current, [category]: "" })); onCatalogChanged(); }
  async function removeCategory(category) { if (!window.confirm(`Delete category ${category}?`)) return; const response = await apiFetch(`/api/admin/categories/${encodeURIComponent(category)}`, { method: "DELETE" }); const data = await response.json(); if (!response.ok) return setNoticeError(data.error || "Category could not be deleted"); onCatalogChanged(); }
  async function removeSubcategory(category, subcategory) { if (!window.confirm(`Delete subcategory ${subcategory}?`)) return; const response = await apiFetch(`/api/admin/subcategories/${encodeURIComponent(category)}/${encodeURIComponent(subcategory)}`, { method: "DELETE" }); const data = await response.json(); if (!response.ok) return setNoticeError(data.error || "Subcategory could not be deleted"); onCatalogChanged(); }
  return <section className="admin-panel admin-wide-panel"><div className="admin-panel-heading"><div><p className="eyebrow">Catalog taxonomy</p><h2>Categories</h2></div><span>{categories.length} categories</span></div><form className="category-create-form" onSubmit={addCategory}><label className="sr-only" htmlFor="reactCategoryName">New category</label><input id="reactCategoryName" value={name} onChange={(event) => setName(event.target.value)} placeholder="New category" minLength="2" maxLength="30" required />{noticeError && <p className="inline-error" role="alert">{noticeError}</p>}{noticeStatus && <p className="inline-note" role="status">{noticeStatus}</p>}<button className="primary-action">Add category <span aria-hidden="true">↗</span></button></form><div className="operations-list category-operation-list">{categories.map((category) => { const subs = subcategories.filter((item) => item.category === category); return <article className="category-operation" key={category}><div className="category-operation-head"><div><strong>{category}</strong><span>{subs.length} subcategor{subs.length === 1 ? "y" : "ies"}</span></div><button className="danger-action" type="button" onClick={() => removeCategory(category)}>Delete category</button></div><div className="subcategory-chips">{subs.map((sub) => <span className="subcategory-chip" key={`${category}-${sub.name}`}>{sub.name}<button type="button" onClick={() => removeSubcategory(category, sub.name)} aria-label={`Delete ${sub.name}`}>×</button></span>)}<span className="subcategory-add"><input value={subNames[category] || ""} onChange={(event) => setSubNames((current) => ({ ...current, [category]: event.target.value }))} placeholder="New subcategory" maxLength="30" /><button className="secondary-action" type="button" onClick={() => addSubcategory(category)}>Add</button></span></div></article>; })}{!categories.length && <div className="empty-state">No categories yet.</div>}</div></section>;
}
