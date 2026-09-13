import React, { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/api";
import { money, formatIST } from "../lib/commerce";
import { Icon } from "./Icon";

const BulkListingView = lazy(() => import("./BulkListingView").then((module) => ({ default: module.BulkListingView })));
const CustomersView = lazy(() => import("./AdminOperations").then((module) => ({ default: module.CustomersView })));
const ReviewsView = lazy(() => import("./AdminOperations").then((module) => ({ default: module.ReviewsView })));
const QuestionsView = lazy(() => import("./AdminOperations").then((module) => ({ default: module.QuestionsView })));
const CouponsView = lazy(() => import("./AdminOperations").then((module) => ({ default: module.CouponsView })));
const DealsView = lazy(() => import("./AdminOperations").then((module) => ({ default: module.DealsView })));
const CategoriesView = lazy(() => import("./AdminOperations").then((module) => ({ default: module.CategoriesView })));
const ReturnsView = lazy(() => import("./AdminCare").then((module) => ({ default: module.ReturnsView })));
const SupportView = lazy(() => import("./AdminCare").then((module) => ({ default: module.SupportView })));
const HeroStudioView = lazy(() => import("./AdminMerchandising").then((module) => ({ default: module.HeroStudioView })));
const StorefrontSettingsView = lazy(() => import("./AdminMerchandising").then((module) => ({ default: module.StorefrontSettingsView })));
const LabelsView = lazy(() => import("./AdminSystemViews").then((module) => ({ default: module.LabelsView })));
const SystemView = lazy(() => import("./AdminSystemViews").then((module) => ({ default: module.SystemView })));
const ManageStoreView = lazy(() => import("./AdminSystemViews").then((module) => ({ default: module.ManageStoreView })));


async function compactThumbnailFile(file) {
  if (!file?.type?.startsWith("image/") || typeof createImageBitmap !== "function") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 480 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", 0.72));
    return blob ? new File([blob], `${file.name.replace(/\.[^.]+$/, "")}-thumb.webp`, { type: "image/webp" }) : file;
  } catch { return file; }
}

async function uploadProductAsset(file, kind = "") {
  const form = new FormData();
  form.append("file", file);
  if (kind) form.append("kind", kind);
  const response = await apiFetch("/api/uploads/image", { method: "POST", body: form });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Upload failed");
  return data;
}

async function uploadProductImage(file) {
  const original = await uploadProductAsset(file);
  const thumbnail = await uploadProductAsset(await compactThumbnailFile(file), "product-thumbnail");
  return { url: original.imageUrl, key: original.imageKey, thumbnailUrl: thumbnail.imageUrl, thumbnailKey: thumbnail.imageKey };
}

const adminLinks = [
  ["/admin", "Dashboard"], ["/admin/storefront", "Storefront"], ["/admin/hero", "Hero studio"], ["/admin/manage-store", "Manage store"],
];

function AdminShell({ route, onNavigate, notifications = [], children }) {
  const unread = notifications.filter((item) => !item.read_at && !item.dismissed_at).length;
  return <main className="page-main"><section className="admin-page admin-react-page"><div className="admin-heading"><div><p className="eyebrow">Glamia console</p><h1 className="page-title">Manage the marketplace.</h1></div><div className="admin-heading-actions"><button className="admin-notification-button" type="button" onClick={() => onNavigate("/admin/notifications")} aria-label={`Open notifications${unread ? `, ${unread} unread` : ""}`} title="Open notifications"><Icon name="bell" size={20} />{unread > 0 && <span>{unread > 99 ? "99+" : unread}</span>}</button><button className="text-link" type="button" onClick={() => onNavigate("/admin/manage-store")}>Open store map</button></div></div><nav className="admin-nav" aria-label="Admin workspace" tabIndex={0}>{adminLinks.map(([href, label]) => <button key={href} type="button" className={route === href ? "active" : ""} onClick={() => onNavigate(href)}>{label}</button>)}</nav>{children}</section></main>;
}

function Metric({ label, value, detail }) { return <article className="admin-metric"><span>{label}</span><strong>{value}</strong>{detail && <small>{detail}</small>}</article>; }

/* Charts use a fixed vivid palette on purpose — they stay readable and consistent
   no matter which storefront theme or palette is active. */
const CHART_COLORS = ["#6366f1", "#f59e0b", "#10b981", "#ef4444", "#3b82f6", "#ec4899", "#14b8a6", "#f97316", "#8b5cf6", "#84cc16", "#06b6d4", "#eab308"];
const chartColor = (index) => CHART_COLORS[index % CHART_COLORS.length];

export function dayLabel(day) {
  const date = new Date(String(day || "") + "T00:00:00+05:30");
  return Number.isNaN(date.getTime()) ? String(day || "") : date.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" });
}

export function hourLabel(hour) {
  const value = ((Number(hour) % 24) + 24) % 24;
  return `${value % 12 === 0 ? 12 : value % 12} ${value < 12 ? "AM" : "PM"}`;
}

function pieSlicePath(cx, cy, radius, start, end) {
  const x1 = (cx + radius * Math.cos(start)).toFixed(2);
  const y1 = (cy + radius * Math.sin(start)).toFixed(2);
  const x2 = (cx + radius * Math.cos(end)).toFixed(2);
  const y2 = (cy + radius * Math.sin(end)).toFixed(2);
  return `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${end - start > Math.PI ? 1 : 0} 1 ${x2} ${y2} Z`;
}

function Chart({ title, entries, labelKey, valueKey, formatter = (value) => value, labelFormatter = (label) => label, hint }) {
  const [view, setView] = useState("bar");
  const [hover, setHover] = useState(-1);
  const values = entries.map((entry) => Math.max(0, Number(entry[valueKey] || 0)));
  const max = Math.max(1, ...values);
  const total = values.reduce((sum, value) => sum + value, 0);
  const peakIndex = values.reduce((best, value, index) => (value > values[best] ? index : best), 0);
  const hovered = hover >= 0 ? entries[hover] : null;
  const crowded = entries.length > 12;
  return <section className="admin-chart"><div className="admin-chart-heading"><p className="eyebrow">{title}</p><div className="chart-heading-tools">{hint && <span className="chart-hint">{hint}</span>}<span>{entries.length} points</span>{entries.length > 0 && <div className="chart-toggle" role="group" aria-label={`${title} chart type`}><button type="button" className={view === "bar" ? "active" : ""} onClick={() => { setView("bar"); setHover(-1); }}>Bars</button><button type="button" className={view === "pie" ? "active" : ""} onClick={() => { setView("pie"); setHover(-1); }}>Pie</button></div>}</div></div>{hovered && <div className="chart-callout" style={{ borderLeftColor: chartColor(hover) }}><i style={{ background: chartColor(hover) }} /><strong>{labelFormatter(hovered[labelKey])}</strong><b>{formatter(hovered[valueKey])}</b>{total > 0 && <small>{Math.round((values[hover] / total) * 100)}% of total</small>}</div>}{entries.length ? view === "bar" ? <div className="bar-chart" role="region" aria-label={title} tabIndex={0}>{entries.map((entry, index) => <div className={`bar-column ${hover === index ? "is-hovered" : ""} ${index === peakIndex && values[index] > 0 ? "is-peak" : ""}`} key={String(entry[labelKey])} onMouseEnter={() => setHover(index)} onMouseLeave={() => setHover(-1)}><span className="bar-value">{formatter(entry[valueKey])}</span><i style={{ background: `linear-gradient(to top, ${chartColor(index)}, ${chartColor(index)}b3)`, height: `${Math.max(5, (values[index] / max) * 100)}%` }} /><small>{!crowded || index % 3 === 0 || index === entries.length - 1 ? labelFormatter(entry[labelKey]) : ""}</small></div>)}</div> : total > 0 ? <div className="pie-chart-layout"><svg className="pie-chart" viewBox="0 0 200 200" role="img" aria-label={title}>{entries.length === 1 ? <circle cx="100" cy="100" r="80" fill={chartColor(0)} onMouseEnter={() => setHover(0)} onMouseLeave={() => setHover(-1)} /> : (() => { let cursor = 0; return entries.map((entry, index) => { const start = -Math.PI / 2 + cursor * 2 * Math.PI; cursor = Math.min(1, cursor + values[index] / total); const end = -Math.PI / 2 + cursor * 2 * Math.PI; return <path key={String(entry[labelKey])} d={pieSlicePath(100, 100, hover === index ? 91 : 80, start, Math.max(end, start + 0.03))} fill={chartColor(index)} onMouseEnter={() => setHover(index)} onMouseLeave={() => setHover(-1)} style={{ cursor: "pointer", opacity: hover === -1 || hover === index ? 1 : 0.4, transition: "opacity .2s ease" }} />; }); })()}</svg><div className="pie-legend" tabIndex={0}>{entries.map((entry, index) => <div className={`pie-legend-item ${hover === index ? "is-hovered" : ""}`} key={String(entry[labelKey])} onMouseEnter={() => setHover(index)} onMouseLeave={() => setHover(-1)}><i className="chart-swatch" style={{ background: chartColor(index) }} /><span>{labelFormatter(entry[labelKey])}</span><b>{formatter(entry[valueKey])}</b></div>)}</div></div> : <div className="empty-state">No data yet.</div> : <div className="empty-state">No data yet.</div>}</section>;
}

function PerformanceTable({ title, hint, items, metric, metricLabel, formatter = (value) => value }) {
  return <section className="admin-panel dashboard-performance-panel"><div className="admin-panel-heading"><div><p className="eyebrow">{title}</p><span className="muted">{hint}</span></div><span>{items.length} shown</span></div>{items.length ? <div className="dashboard-performance-list">{items.map((product) => <article className="dashboard-performance-row" key={product.id}><img src={product.thumbnail || product.image || ""} alt="" loading="lazy" decoding="async" width="42" height="42" /><div><strong>{product.name}</strong><span>{product.category || "Uncategorized"}{product.color ? ` · ${product.color}` : ""}</span></div><b>{formatter(product[metric])} <small>{metricLabel}</small></b></article>)}</div> : <div className="empty-state">No product activity yet.</div>}</section>;
}

function DashboardView({ dashboard, orders, notifications }) {
  const [mode, setMode] = useState("basic");
  const [category, setCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [productId, setProductId] = useState("");
  const totals = dashboard?.totals || {};
  const stateEntries = (dashboard?.orders_by_state || []).slice(0, 12);
  const hourEntries = dashboard?.orders_by_hour || [];
  const products = dashboard?.byProduct || [];
  const categories = [...new Set(products.map((product) => product.category).filter(Boolean))].sort();
  const subcategories = [...new Set(products.filter((product) => !category || product.category === category).map((product) => product.subcategory).filter(Boolean))].sort();
  const productOptions = products.filter((product) => (!category || product.category === category) && (!subcategory || product.subcategory === subcategory));
  const viewProducts = mode === "advanced" ? products.filter((product) => (!category || product.category === category) && (!subcategory || product.subcategory === subcategory) && (!productId || product.id === productId)) : products;
  const viewTotals = mode === "advanced" ? viewProducts.reduce((sum, product) => ({ revenue: sum.revenue + Number(product.revenue || 0), units: sum.units + Number(product.units || 0), orders: sum.orders + Number(product.orders || 0), profit: sum.profit + Number(product.profit || 0), wishlists: sum.wishlists + Number(product.wishlists || 0) }), { revenue: 0, units: 0, orders: 0, profit: 0, wishlists: 0 }) : totals;
  const topProducts = [...viewProducts].sort((a, b) => b.units - a.units || b.revenue - a.revenue).slice(0, 8);
  const stuckProducts = [...viewProducts].filter((product) => product.adds > product.orders && product.adds > 0).sort((a, b) => (b.adds - b.orders) - (a.adds - a.orders)).slice(0, 6);
  const wishlistedProducts = [...viewProducts].filter((product) => product.wishlists > 0).sort((a, b) => b.wishlists - a.wishlists).slice(0, 6);
  const analytics = dashboard?.analytics || {};
  const recovery = dashboard?.cart_recovery || [];
  const visitors = dashboard?.visitors || {};
  const dayEntries = visitors.by_day || [];
  const pageEntries = visitors.top_pages || [];
  const peakHour = hourEntries.reduce((best, entry) => (Number(entry.orders || 0) > Number(best?.orders || 0) ? entry : best), null);
  return <><section className="dashboard-controls" aria-label="Dashboard view controls"><div className="dashboard-mode-toggle" role="group" aria-label="Dashboard detail level"><button type="button" className={mode === "basic" ? "active" : ""} onClick={() => setMode("basic")}>Basic</button><button type="button" className={mode === "advanced" ? "active" : ""} onClick={() => setMode("advanced")}>Advanced</button></div>{mode === "advanced" && <div className="dashboard-filter-grid"><label>Category<select value={category} onChange={(event) => { setCategory(event.target.value); setSubcategory(""); setProductId(""); }}><option value="">All categories</option>{categories.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label>Subcategory<select value={subcategory} onChange={(event) => { setSubcategory(event.target.value); setProductId(""); }}><option value="">All subcategories</option>{subcategories.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label>Product<select value={productId} onChange={(event) => setProductId(event.target.value)}><option value="">All products</option>{productOptions.map((item) => <option key={item.id} value={item.id}>{item.name}{item.color ? ` · ${item.color}` : ""}</option>)}</select></label></div>}</section><div className="admin-metric-grid"><Metric label="Revenue" value={money(viewTotals.revenue)} detail={`${viewTotals.units || 0} units sold`} /><Metric label="Orders" value={viewTotals.orders || 0} detail={mode === "advanced" ? "Filtered product view" : `${totals.repeat_customers || 0} repeat customers`} /><Metric label="Profit" value={money(viewTotals.profit)} detail={mode === "advanced" ? "Filtered product view" : `${totals.return_rate || 0}% return rate`} /><Metric label="Wishlist saves" value={viewTotals.wishlists || 0} detail={`${notifications.filter((item) => !item.read_at).length} unread alerts`} /></div><div className="admin-chart-grid"><Chart title="Orders by Indian state" entries={stateEntries} labelKey="state" valueKey="orders" /><Chart title="Orders by hour · IST" entries={hourEntries} labelKey="hour" valueKey="orders" labelFormatter={hourLabel} hint={peakHour && Number(peakHour.orders) > 0 ? `Peak around ${hourLabel(peakHour.hour)} IST` : "No orders yet"} /><Chart title="Top products by units sold" entries={topProducts} labelKey="name" valueKey="units" /><Chart title="Site visits · daily (IST)" entries={dayEntries} labelKey="day" valueKey="views" labelFormatter={dayLabel} /><Chart title="Top pages · 30 days" entries={pageEntries} labelKey="path" valueKey="views" /></div><section className="admin-panel traffic-snapshot-panel"><div className="admin-panel-heading"><div><p className="eyebrow">Visitor analytics</p><h2>Traffic snapshot · 30 days</h2></div><span>{visitors.total_30d} page views</span></div><div className="traffic-snapshot-grid"><div><p className="eyebrow">Top sources</p>{visitors.referrers.length ? <div className="insight-list">{visitors.referrers.map((source) => <div key={source.source}><span>{source.source}</span><b>{source.views}</b></div>)}</div> : <p className="muted">No external referrers yet — visitors arrived directly.</p>}</div><div><p className="eyebrow">Devices</p>{visitors.devices.length ? <div className="insight-list">{visitors.devices.map((device) => <div key={device.device}><span style={{ textTransform: "capitalize" }}>{device.device}</span><b>{device.views}</b></div>)}</div> : <p className="muted">No visits recorded yet.</p>}</div><div><p className="eyebrow">Top countries</p>{visitors.countries.length ? <div className="insight-list">{visitors.countries.map((country) => <div key={country.country}><span>{country.country}</span><b>{country.views}</b></div>)}</div> : <p className="muted">No visits recorded yet.</p>}</div></div></section><div className="dashboard-performance-grid"><PerformanceTable title="Best performers" hint="Highest units sold" items={topProducts.slice(0, 5)} metric="units" metricLabel="units" /><PerformanceTable title="Stuck in carts" hint="Added more often than purchased" items={stuckProducts} metric="adds" metricLabel="cart adds" /><PerformanceTable title="Most wishlisted" hint="Strongest saved-item interest" items={wishlistedProducts} metric="wishlists" metricLabel="saves" /></div>{mode === "advanced" && <section className="dashboard-insights-grid" aria-label="Advanced commerce insights"><div className="admin-panel"><div className="admin-panel-heading"><div><p className="eyebrow">Customer value</p><h2>Lifetime value</h2></div><span>Completed orders</span></div><div className="insight-highlight">{money(analytics.average_customer_lifetime_value)}<small>average customer value</small></div><div className="insight-list">{(analytics.customer_lifetime_values || []).slice(0, 5).map((item) => <div key={item.email}><span>{item.email}</span><b>{money(item.value)}</b></div>)}</div></div><div className="admin-panel"><div className="admin-panel-heading"><div><p className="eyebrow">Conversion signals</p><h2>Cart to order</h2></div><span>Tracked activity only</span></div><div className="insight-stat-row"><div><strong>{analytics.tracked_cart_customers || 0}</strong><span>cart customers</span></div><div><strong>{analytics.purchasing_customers || 0}</strong><span>purchasing customers</span></div><div><strong>{analytics.tracked_cart_to_order_rate || 0}%</strong><span>tracked rate</span></div></div><p className="form-hint">This is not a site-wide conversion rate because anonymous page visits are not counted.</p><div className="insight-stat-row"><div><strong>{analytics.cod_cancellation_rate || 0}%</strong><span>COD cancellations</span></div><div><strong>{analytics.cancelled_cod_orders || 0}</strong><span>cancelled COD</span></div><div><strong>{analytics.cod_orders || 0}</strong><span>COD orders</span></div></div></div><div className="admin-panel cart-recovery-panel"><div className="admin-panel-heading"><div><p className="eyebrow">Recovery queue</p><h2>Cart recovery signals</h2></div><span>{recovery.length} candidates</span></div>{recovery.length ? <div className="insight-list">{recovery.map((item) => <div className="recovery-row" key={item.customer_email}><span><strong>{item.customer_email}</strong><small>{item.products.join(" · ") || "Product activity"} · {item.units_added} units</small></span><b>{money(item.estimated_value)}</b></div>)}</div> : <div className="empty-state">No signed-in cart activity is waiting for follow-up.</div>}<p className="form-hint">Signals are based on signed-in cart additions with no completed order after the last activity; no automatic email is sent.</p></div></section>}<div className="admin-columns"><section className="admin-panel"><div className="admin-panel-heading"><p className="eyebrow">Latest activity</p><span>{orders.length} orders</span></div>{orders.slice(0, 6).map((order) => <div className="admin-order-row" key={order.id}><div><strong>{order.order_number || order.id}</strong><span>{order.customer_name || order.customer_email || "Customer"}</span></div><div><b>{money(order.total)}</b><small className={`status-pill status-${order.status}`}>{order.status || "pending"}</small></div></div>)}{!orders.length && <div className="empty-state">No orders yet.</div>}</section><section className="admin-panel"><div className="admin-panel-heading"><p className="eyebrow">Notifications</p><span>{notifications.length} total</span></div>{notifications.slice(0, 6).map((item) => <div className={`admin-notification-row ${item.priority === "urgent" ? "urgent" : ""}`} key={item.id}><strong>{item.title || item.type}</strong><span>{item.message || item.body || "New activity"}</span></div>)}{!notifications.length && <div className="empty-state">No notifications yet.</div>}</section></div></>;
}

function OrdersView({ orders, onOrderChanged }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [expanded, setExpanded] = useState("");
  const [drafts, setDrafts] = useState({});
  const [busyId, setBusyId] = useState("");
  const [message, setMessage] = useState("");
  const filtered = useMemo(() => orders.filter((order) => { const haystack = `${order.order_number} ${order.customer_name} ${order.customer_email}`.toLowerCase(); return (!query || haystack.includes(query.toLowerCase())) && (status === "all" || order.status === status); }), [orders, query, status]);
  function draft(order) { return drafts[order.id] || { status: order.status || "pending", tracking_number: order.tracking_number || "" }; }
  function changeDraft(order, field, value) { setDrafts((current) => ({ ...current, [order.id]: { ...draft(order), [field]: value } })); }
  async function save(order) {
    const values = draft(order);
    setBusyId(order.id); setMessage("");
    try {
      const response = await apiFetch(`/api/admin/orders/${encodeURIComponent(order.id)}`, { method: "PATCH", body: JSON.stringify(values) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Order could not be updated");
      onOrderChanged(data.order || { ...order, ...values });
      setDrafts((current) => ({ ...current, [order.id]: { status: data.order?.status || values.status, tracking_number: data.order?.tracking_number || values.tracking_number } }));
      setMessage(`${data.order?.order_number || order.order_number || "Order"} updated.`);
    } catch (error) { setMessage(error.message); } finally { setBusyId(""); }
  }
  return <section className="admin-panel admin-wide-panel"><div className="admin-panel-heading"><div><p className="eyebrow">Order workspace</p><h2>Orders</h2></div><span>{filtered.length} shown</span></div><div className="admin-filters"><label className="sr-only" htmlFor="adminOrderSearch">Search orders</label><input id="adminOrderSearch" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search order number or customer" /><select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter orders by status"><option value="all">All statuses</option>{["pending", "confirmed", "shipped", "delivered", "cancelled"].map((value) => <option key={value} value={value}>{value}</option>)}</select></div>{message && <p className="inline-note" role="status">{message}</p>}<div className="admin-order-list">{filtered.map((order) => { const values = draft(order); const isOpen = expanded === order.id; return <article className={`admin-order-card ${isOpen ? "is-expanded" : ""}`} key={order.id}><button type="button" className="admin-order-card-summary" onClick={() => setExpanded(isOpen ? "" : order.id)} aria-expanded={isOpen}><span><strong>{order.order_number || order.id}</strong><small>{order.customer_name || order.customer_email || "Customer"} · {order.created_at ? formatIST(order.created_at) : "Recent"}</small></span><span><b>{money(order.total)}</b><small className={`status-pill status-${order.status}`}>{order.status || "pending"}</small></span></button>{isOpen && <div className="admin-order-card-details"><div className="admin-order-items">{(order.items || []).map((item, index) => <span key={`${order.id}-${index}`}>{item.name || item.product_name || item.id}{item.size ? ` · ${item.size}` : ""} × {item.quantity}</span>)}{order.shipping && <p className="muted">Ship to: {order.shipping.full_name || order.customer_name}, {order.shipping.city || ""}, {order.shipping.state || ""} {order.shipping.postal_code || ""}</p>}</div><div className="admin-order-edit"><label>Status<select value={values.status} onChange={(event) => changeDraft(order, "status", event.target.value)} disabled={order.status === "cancelled"}><option value="pending">Pending</option><option value="confirmed">Confirmed</option><option value="shipped">Shipped</option><option value="delivered">Delivered</option><option value="cancelled">Cancelled</option></select></label><label>Tracking number <span className="form-hint">optional</span><input value={values.tracking_number} onChange={(event) => changeDraft(order, "tracking_number", event.target.value)} maxLength="80" placeholder="Assign courier tracking" /></label><button className="primary-action" type="button" disabled={busyId === order.id} onClick={() => save(order)}>{busyId === order.id ? "Saving…" : "Save order"} <span aria-hidden="true">↗</span></button></div></div>}</article>; })}{!filtered.length && <div className="empty-state">No matching orders.</div>}</div></section>;
}

function ProductsView({ products, onNavigate }) {
  return <section className="admin-panel admin-wide-panel"><div className="admin-panel-heading"><div><p className="eyebrow">Catalog visibility</p><h2>Products</h2></div><span>{products.length} listings</span></div><div className="admin-product-grid">{products.slice(0, 24).map((product) => <article className="admin-product-card" key={product.id}>{product.thumbnail_url || product.image_url ? <img src={product.thumbnail_url || product.image_url} alt="" loading="lazy" /> : <div className="admin-product-placeholder" />}<div><strong>{product.name}</strong><span>{product.category || "Uncategorized"} · {money(product.price)}</span><small className={`status-pill status-${product.status}`}>{product.status || "on hold"}</small></div></article>)}</div>{!products.length && <div className="empty-state">No listings found.</div>}<button className="primary-action admin-inline-action" type="button" onClick={() => onNavigate("/admin/products")}>Open product controls <span aria-hidden="true">↗</span></button></section>;
}

function EditProductForm({ product, categories, subcategories, onSave, onCancel }) {
  const [form, setForm] = useState({ name: product.name || "", brand: product.brand || "", category: product.category || "", subcategory: product.subcategory || "", color: product.color || "", material: product.material || "", price: product.price || "", mrp: product.mrp || "", cost_price: product.cost_price || "", reorder_point: product.reorder_point ?? 15, sizes: (product.sizes || []).join(", "), images: (product.images || [product.image_url]).filter(Boolean).join("\n"), description: product.description || "", preorder_enabled: Boolean(product.preorder_enabled), preorder_release_at: product.preorder_release_at ? new Date(product.preorder_release_at).toISOString().slice(0, 16) : "", preorder_limit: product.preorder_limit ?? "", size_chart_url: product.size_chart_url || "" });
  const [uploadedAssets, setUploadedAssets] = useState([]);
  const [sizeStock, setSizeStock] = useState({ ...(product.size_stock || {}) });
  const [legacyStock, setLegacyStock] = useState(Number(product.stock || 0));
  const hasSizeStock = Object.keys(product.size_stock || {}).length > 0;
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState("");
  const availableSubcategories = subcategories.filter((item) => item.category === form.category);
  function change(event) { setForm((current) => ({ ...current, [event.target.name]: event.target.value })); }
  function changeSizes(event) {
    const value = event.target.value;
    const sizes = value.split(",").map((size) => size.trim()).filter(Boolean);
    setForm((current) => ({ ...current, sizes: value }));
    setSizeStock((current) => Object.fromEntries(sizes.map((size) => [size, current[size] ?? 0])));
  }
  async function uploadImages(event) {
    const files = [...event.target.files];
    if (!files.length) return;
    setUploading(true);
    try {
      const assets = [];
      for (const file of files) assets.push(await uploadProductImage(file));
      setUploadedAssets((current) => [...current, ...assets]);
      setForm((current) => ({ ...current, images: `${current.images}${current.images ? "\n" : ""}${assets.map((asset) => asset.url).join("\n")}` }));
    } catch (error) { setStatus(error.message); } finally { setUploading(false); event.target.value = ""; }
  }
  async function uploadSizeChart(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try { const asset = await uploadProductAsset(file); setForm((current) => ({ ...current, size_chart_url: asset.imageUrl })); }
    catch (error) { setStatus(error.message); } finally { setUploading(false); event.target.value = ""; }
  }
  async function submit(event) {
    event.preventDefault(); setBusy(true); setStatus("");
    try {
      const sizes = form.sizes.split(",").map((size) => size.trim()).filter(Boolean);
      const images = form.images.split(/\r?\n|,/).map((image) => image.trim()).filter(Boolean);
      const normalizedSizeStock = Object.fromEntries(sizes.map((size) => [size, Math.max(0, Number(sizeStock[size] || 0))]));
      const totalStock = hasSizeStock ? Object.values(normalizedSizeStock).reduce((sum, value) => sum + value, 0) : Math.max(0, Number(legacyStock || 0));
      if (!sizes.length) throw new Error("Add at least one size.");
      const originalImages = product.images || [product.image_url];
      const imagesChanged = JSON.stringify(images) !== JSON.stringify(originalImages);
      if (imagesChanged && (images.length < 4 || images.length > 6)) throw new Error("Keep between 4 and 6 product images.");
      const stockChanged = totalStock !== Number(product.stock || 0) || JSON.stringify(normalizedSizeStock) !== JSON.stringify(product.size_stock || {});
      const firstAsset = uploadedAssets.find((asset) => asset.url === images[0]);
       const response = await apiFetch(`/api/admin/products/${encodeURIComponent(product.id)}`, { method: "PATCH", body: JSON.stringify({ ...form, price: Number(form.price), mrp: Number(form.mrp), cost_price: Number(form.cost_price || 0), ...(stockChanged ? { stock: totalStock, ...(hasSizeStock ? { size_stock: normalizedSizeStock } : {}) } : {}), reorder_point: Number(form.reorder_point || 0), sizes, ...(imagesChanged ? { images, image_keys: images.map((image) => uploadedAssets.find((asset) => asset.url === image)?.key || "").filter(Boolean), thumbnail_urls: [firstAsset?.thumbnailUrl || images[0]], thumbnail_keys: firstAsset?.thumbnailKey ? [firstAsset.thumbnailKey] : [] } : {}), preorder_release_at: form.preorder_release_at ? new Date(form.preorder_release_at).toISOString() : null, preorder_limit: form.preorder_limit === "" ? null : Number(form.preorder_limit) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Product could not be saved");
       onSave(data.product || { ...product, ...form, sizes, images, size_stock: normalizedSizeStock, stock: totalStock });
    } catch (error) { setStatus(error.message); } finally { setBusy(false); }
  }
  return <form className="admin-listing-form admin-edit-product-form" onSubmit={submit}><div className="admin-panel-heading"><div><p className="eyebrow">Catalog editor</p><h3>Edit listing</h3></div><button type="button" className="secondary-action" onClick={onCancel}>Close</button></div><div className="admin-form-grid"><label>Product name<input name="name" value={form.name} onChange={change} required /></label><label>Brand<input name="brand" value={form.brand} onChange={change} required /></label><label>Category<select name="category" value={form.category} onChange={change} required>{categories.map((category) => <option key={category} value={category}>{category}</option>)}</select></label><label>Subcategory <span className="form-hint">optional</span><select name="subcategory" value={form.subcategory} onChange={change}><option value="">None</option>{availableSubcategories.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}</select></label><label>Colour<input name="color" value={form.color} onChange={change} required /></label><label>Material<input name="material" value={form.material} onChange={change} required /></label><label>Price (₹)<input name="price" type="number" min="1" value={form.price} onChange={change} required /></label><label>MRP (₹)<input name="mrp" type="number" min="1" value={form.mrp} onChange={change} required /></label><label>Cost price (₹)<input name="cost_price" type="number" min="0" value={form.cost_price} onChange={change} /></label><label>Reorder point<input name="reorder_point" type="number" min="0" value={form.reorder_point} onChange={change} /></label></div><label>Sizes <span className="form-hint">comma separated</span><input name="sizes" value={form.sizes} onChange={changeSizes} required /></label>{hasSizeStock ? <div className="size-stock-editor"><div className="listing-subheading"><strong>Stock by size</strong><span>{Object.values(sizeStock).reduce((sum, value) => sum + Number(value || 0), 0)} total units</span></div>{form.sizes.split(",").map((size) => size.trim()).filter(Boolean).map((size) => <label key={size}>{size}<input type="number" min="0" value={sizeStock[size] ?? 0} onChange={(event) => setSizeStock((current) => ({ ...current, [size]: event.target.value }))} /></label>)}</div> : <label>Total stock <span className="form-hint">This listing has no per-size stock map yet.</span><input type="number" min="0" value={legacyStock} onChange={(event) => setLegacyStock(event.target.value)} /></label>}<label>Product images <span className="form-hint">one URL per line · 4–8 required</span><textarea name="images" rows="5" value={form.images} onChange={change} required /></label><label className="upload-button secondary">Upload images<input type="file" accept="image/*" multiple hidden onChange={uploadImages} /></label>{uploadedAssets.length > 0 && <p className="form-hint">{uploadedAssets.length} new image{uploadedAssets.length === 1 ? "" : "s"} uploaded to R2.</p>}<div className="preorder-react-block"><label className="merch-checkbox"><input name="preorder_enabled" type="checkbox" checked={form.preorder_enabled} onChange={(event) => setForm((current) => ({ ...current, preorder_enabled: event.target.checked }))} /> Enable pre-order</label>{form.preorder_enabled && <div className="admin-form-grid"><label>Release date <span className="form-hint">optional</span><input name="preorder_release_at" type="datetime-local" value={form.preorder_release_at} onChange={change} /></label><label>Pre-order limit <span className="form-hint">optional</span><input name="preorder_limit" type="number" min="1" value={form.preorder_limit} onChange={change} /></label></div>}</div><label>Size chart URL <span className="form-hint">optional</span><input name="size_chart_url" type="url" value={form.size_chart_url} onChange={change} placeholder="https://…" /></label><label className="upload-button secondary">Upload size chart<input type="file" accept="image/*" hidden onChange={uploadSizeChart} /></label><label>Description<textarea name="description" rows="4" value={form.description} onChange={change} required /></label>{status && <p className="inline-error" role="alert">{status}</p>}<button className="primary-action" disabled={busy || uploading}>{busy ? "Saving…" : uploading ? "Uploading…" : "Save listing"} <span aria-hidden="true">↗</span></button></form>;
}

function VariantEditor({ variants, setVariants, setUploading, setStatus }) {
  function update(index, field, value) { setVariants((current) => current.map((variant, itemIndex) => itemIndex === index ? { ...variant, [field]: value } : variant)); }
  function updateSizes(index, value) {
    const sizes = value.split(",").map((size) => size.trim()).filter(Boolean);
    setVariants((current) => current.map((variant, itemIndex) => itemIndex === index ? { ...variant, sizes: value, sizeStock: Object.fromEntries(sizes.map((size) => [size, variant.sizeStock?.[size] ?? 0])) } : variant));
  }
  function updateImages(index, value) {
    const images = value.split(/\r?\n|,/).map((image) => image.trim()).filter(Boolean);
    setVariants((current) => current.map((variant, itemIndex) => itemIndex === index ? { ...variant, images: value, assets: (variant.assets || []).filter((asset) => images.includes(asset.url)) } : variant));
  }
  async function uploadImages(index, event) {
    const files = [...event.target.files];
    if (!files.length) return;
    setUploading(true); setStatus("");
    try {
      const existing = variants[index]?.assets?.length || 0;
      const assets = [];
      for (const file of files) {
        if (existing + assets.length >= 8) break;
        assets.push(await uploadProductImage(file));
      }
      setVariants((current) => current.map((variant, itemIndex) => itemIndex === index ? { ...variant, images: `${variant.images}${variant.images ? "\n" : ""}${assets.map((asset) => asset.url).join("\n")}`, assets: [...(variant.assets || []), ...assets] } : variant));
    } catch (error) { setStatus(error.message); } finally { setUploading(false); event.target.value = ""; }
  }
  function add() { setVariants((current) => [...current, { color: "", sizes: "S, M, L", sizeStock: { S: 0, M: 0, L: 0 }, images: "", assets: [] }]); }
  function remove(index) { setVariants((current) => current.filter((_, itemIndex) => itemIndex !== index)); }
  return <fieldset className="variant-react-block"><legend>Colourways</legend><p className="form-hint">Each colourway becomes a linked listing with its own sizes, per-size stock, and 4–8 images.</p>{variants.map((variant, index) => { const sizes = variant.sizes.split(",").map((size) => size.trim()).filter(Boolean); const total = sizes.reduce((sum, size) => sum + Math.max(0, Number(variant.sizeStock?.[size] || 0)), 0); return <article className="variant-react-card" key={`variant-${index}`}><div className="variant-react-heading"><strong>Colourway {index + 1}</strong><button type="button" className="danger-action" onClick={() => remove(index)}>Remove</button></div><div className="admin-form-grid"><label>Colour<input value={variant.color} onChange={(event) => update(index, "color", event.target.value)} required /></label><label>Sizes<input value={variant.sizes} onChange={(event) => updateSizes(index, event.target.value)} required /></label></div><div className="variant-size-stock"><div className="listing-subheading"><strong>Stock by size</strong><span>{total} total units</span></div>{sizes.map((size) => <label key={`${index}-${size}`}>{size}<input type="number" min="0" value={variant.sizeStock?.[size] ?? 0} onChange={(event) => setVariants((current) => current.map((entry, itemIndex) => itemIndex === index ? { ...entry, sizeStock: { ...(entry.sizeStock || {}), [size]: event.target.value } } : entry))} /></label>)}</div><label>Colourway image URLs <span className="form-hint">one per line · 4–8 required</span><textarea rows="4" value={variant.images} onChange={(event) => updateImages(index, event.target.value)} required /></label><label className="upload-button secondary">Upload colourway images<input type="file" accept="image/*" multiple hidden onChange={(event) => uploadImages(index, event)} /></label>{variant.assets?.length > 0 && <p className="form-hint">{variant.assets.length} image{variant.assets.length === 1 ? "" : "s"} uploaded to R2 with compact thumbnails.</p>}</article>; })}<button type="button" className="secondary-action" onClick={add}>Add colourway</button></fieldset>;
}

function ManageProductsView({ products, categories, subcategories, onProductChanged, onProductDeleted, onNavigate }) {
  const [filter, setFilter] = useState("all");
  const [busyId, setBusyId] = useState("");
  const [editing, setEditing] = useState(null);
  const visible = products.filter((product) => filter === "all" || product.status === filter);
  const imageFor = (product) => product.thumbnail || product.thumbnail_url || product.image || product.image_url || "";

  async function patchProduct(product, patch) {
    setBusyId(product.id);
    try {
      const response = await apiFetch(`/api/admin/products/${encodeURIComponent(product.id)}`, { method: "PATCH", body: JSON.stringify(patch) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Product could not be updated");
      onProductChanged(data.product || { ...product, ...patch });
    } catch (error) { window.alert(error.message); } finally { setBusyId(""); }
  }

  async function removeProduct(product) {
    if (!window.confirm(`Delete ${product.name}? This cannot be undone.`)) return;
    setBusyId(product.id);
    try {
      const response = await apiFetch(`/api/products/${encodeURIComponent(product.id)}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Product could not be deleted");
      onProductDeleted(product.id);
    } catch (error) { window.alert(error.message); } finally { setBusyId(""); }
  }

  return <section className="admin-panel admin-wide-panel"><div className="admin-panel-heading"><div><p className="eyebrow">Catalog controls</p><h2>All products</h2></div><button className="secondary-action" type="button" onClick={() => onNavigate("/admin/add-product")}>Add listing ↗</button></div>{editing && <EditProductForm key={editing.id} product={editing} categories={categories} subcategories={subcategories} onCancel={() => setEditing(null)} onSave={(next) => { onProductChanged(next); setEditing(null); }} />}<div className="admin-filters"><label className="sr-only" htmlFor="productStatusFilter">Filter products</label><select id="productStatusFilter" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">All statuses</option><option value="live">Live</option><option value="hold">On hold</option><option value="review">In review</option><option value="archived">Archived</option></select><span className="admin-filter-result">{visible.length} listings</span></div><div className="manage-product-list">{visible.map((product) => <article className="manage-product-row" key={product.id}>{imageFor(product) ? <img src={imageFor(product)} alt="" loading="lazy" /> : <div className="admin-product-placeholder" />}<div className="manage-product-main"><strong>{product.name}</strong><span>{product.category || "Uncategorized"}{product.color ? ` · ${product.color}` : ""}</span><span>{money(product.price)} · {Number(product.stock || 0)} total units</span></div><span className={`status-pill status-${product.status}`}>{product.status || "hold"}</span><div className="manage-product-actions"><button type="button" disabled={busyId === product.id} onClick={() => setEditing(product)}>Edit</button><button type="button" disabled={busyId === product.id} onClick={() => patchProduct(product, { status: product.status === "live" ? "hold" : "live" })}>{product.status === "live" ? "Put on hold" : "Go live"}</button><button type="button" disabled={busyId === product.id} onClick={() => patchProduct(product, { featured: !product.featured })}>{product.featured ? "Unfeature" : "Feature"}</button>{product.status === "archived" ? <button type="button" disabled={busyId === product.id} onClick={() => patchProduct(product, { status: "hold" })}>Restore</button> : <button type="button" disabled={busyId === product.id} onClick={() => patchProduct(product, { status: "archived" })}>Archive</button>}<button className="danger-action" type="button" disabled={busyId === product.id} onClick={() => removeProduct(product)}>Delete</button></div></article>)}{!visible.length && <div className="empty-state">No products match this status.</div>}</div></section>;
}

function InventoryView({ products, onProductChanged }) {
  const [busyId, setBusyId] = useState("");
  const [drafts, setDrafts] = useState({});
  const [message, setMessage] = useState("");
  function stockFor(product) { return drafts[product.id] || { ...(product.size_stock || {}) }; }
  function changeSize(product, size, value) { setDrafts((current) => ({ ...current, [product.id]: { ...stockFor(product), [size]: Math.max(0, Number(value) || 0) } })); }
  async function saveStock(product) {
    const sizeStock = stockFor(product);
    setBusyId(product.id); setMessage("");
    try {
      const response = await apiFetch("/api/admin/products/" + encodeURIComponent(product.id), { method: "PATCH", body: JSON.stringify({ size_stock: sizeStock }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Stock could not be updated");
      onProductChanged(data.product || { ...product, size_stock: sizeStock, stock: Object.values(sizeStock).reduce((sum, value) => sum + Number(value || 0), 0) });
      setDrafts((current) => { const next = { ...current }; delete next[product.id]; return next; });
      setMessage(product.name + " stock saved.");
    } catch (error) { setMessage(error.message); } finally { setBusyId(""); }
  }
  const activeProducts = products.filter((product) => product.status !== "archived");
  const totalUnits = activeProducts.reduce((sum, product) => sum + Number(product.stock || 0), 0);
  const lowStockCount = activeProducts.filter((product) => Number(product.stock || 0) > 0 && Number(product.stock || 0) <= Number(product.reorder_point || 15)).length;
  const outOfStockCount = activeProducts.filter((product) => Number(product.stock || 0) === 0).length;
  return <section className="admin-panel admin-wide-panel inventory-workspace"><div className="admin-panel-heading"><div><p className="eyebrow">Stock control</p><h2>Inventory by size</h2><p className="muted">Monitor live availability and adjust each size without losing the product-level view.</p></div><span>{activeProducts.length} active listings</span></div>{message && <p className="inline-note" role="status">{message}</p>}<div className="inventory-live-summary"><article><span className="inventory-summary-icon"><Icon name="check" size={18} /></span><div><small>Available units</small><strong>{totalUnits}</strong></div><em>Live total</em></article><article className={lowStockCount ? "has-alert" : ""}><span className="inventory-summary-icon"><Icon name="bell" size={18} /></span><div><small>Low stock</small><strong>{lowStockCount}</strong></div><em>Needs attention</em></article><article className={outOfStockCount ? "has-alert is-out" : ""}><span className="inventory-summary-icon"><Icon name="close" size={18} /></span><div><small>Out of stock</small><strong>{outOfStockCount}</strong></div><em>Unavailable now</em></article></div><div className="inventory-table inventory-live-feed">{activeProducts.map((product) => { const stock = Number(product.stock || 0); const threshold = Number(product.reorder_point || 15); const sizeStock = stockFor(product); const sizes = product.sizes?.length ? product.sizes : Object.keys(sizeStock); const meter = threshold > 0 ? Math.min(100, Math.round((stock / Math.max(threshold * 3, stock, 1)) * 100)) : stock > 0 ? 100 : 0; return <article className={"inventory-row inventory-live-card" + (stock === 0 ? " is-out" : stock <= threshold ? " is-low" : "")} key={product.id}><div className="inventory-live-card-main"><div className="inventory-live-card-heading"><div><span className="inventory-live-kicker"><i />Live inventory</span><strong>{product.name}</strong><span>{product.category || "Uncategorized"}{product.color ? " · " + product.color : ""}</span></div><div className="inventory-live-total"><strong>{stock}</strong><small>units</small></div></div><div className="inventory-stock-meter" role="progressbar" aria-label={stock + " units available for " + product.name} aria-valuemin="0" aria-valuemax={Math.max(threshold * 3, stock, 1)} aria-valuenow={stock}><span style={{ width: meter + "%" }} /></div><div className="inventory-size-editor">{sizes.length ? sizes.map((size) => <label key={size}><span>{size}</span><input aria-label={product.name + " size " + size + " stock"} type="number" min="0" value={sizeStock[size] ?? 0} disabled={busyId === product.id} onChange={(event) => changeSize(product, size, event.target.value)} /></label>) : <span className="muted">No sizes configured</span>}</div></div><div className="inventory-row-actions"><span className="inventory-status">{stock === 0 ? "Out of stock" : stock <= threshold ? "Low stock · threshold " + threshold : "Healthy stock"}</span><button className="secondary-action" type="button" disabled={busyId === product.id || !sizes.length} onClick={() => saveStock(product)}>{busyId === product.id ? "Saving…" : "Save stock"} <Icon name="check" size={15} /></button></div></article>; })}{!activeProducts.length && <div className="empty-state">No products found.</div>}</div></section>;
}

function AddListingView({ categories, subcategories, onNavigate }) {
  const [form, setForm] = useState({ name: "", category: "", subcategory: "", brand: "", color: "", price: "", mrp: "", cost_price: "", material: "", description: "", sizes: "S, M, L", images: "", reorder_point: "15", preorder_enabled: false, preorder_release_at: "", preorder_limit: "", size_chart_url: "" });
  const [uploadedAssets, setUploadedAssets] = useState([]);
  const [variants, setVariants] = useState([]);
  const [sizeStock, setSizeStock] = useState({ S: 0, M: 0, L: 0 });
  const [status, setStatus] = useState(""); const [busy, setBusy] = useState(false); const [uploading, setUploading] = useState(false);
  const availableSubcategories = subcategories.filter((item) => item.category === form.category);
  const sizes = form.sizes.split(",").map((size) => size.trim()).filter(Boolean);
  const totalStock = sizes.reduce((sum, size) => sum + Math.max(0, Number(sizeStock[size] || 0)), 0);

  function changeField(event) { setForm((current) => ({ ...current, [event.target.name]: event.target.value })); }
  function changeSizes(event) {
    const next = event.target.value;
    setForm((current) => ({ ...current, sizes: next, subcategory: current.subcategory }));
    setSizeStock((current) => Object.fromEntries(next.split(",").map((size) => size.trim()).filter(Boolean).map((size) => [size, current[size] ?? 0])));
  }
  async function uploadImages(event) {
    const files = [...event.target.files];
    if (!files.length) return;
    setUploading(true); setStatus("");
    try {
      const assets = [];
      for (const file of files) {
        if (assets.length + uploadedAssets.length >= 6) break;
        assets.push(await uploadProductImage(file));
      }
      setUploadedAssets((current) => [...current, ...assets]);
      setForm((current) => ({ ...current, images: `${current.images}${current.images ? "\n" : ""}${assets.map((asset) => asset.url).join("\n")}` }));
    } catch (error) { setStatus(error.message); } finally { setUploading(false); event.target.value = ""; }
  }
  async function uploadSizeChart(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true); setStatus("");
    try { const asset = await uploadProductAsset(file); setForm((current) => ({ ...current, size_chart_url: asset.imageUrl })); }
    catch (error) { setStatus(error.message); } finally { setUploading(false); event.target.value = ""; }
  }
  async function submit(event) {
    event.preventDefault(); setBusy(true); setStatus("");
    try {
      const images = form.images.split(/\r?\n|,/).map((image) => image.trim()).filter(Boolean);
       if (images.length < 4 || images.length > 6) throw new Error("Add between 4 and 6 image URLs.");
       if (!sizes.length) throw new Error("Add at least one size.");
       const normalizedVariants = variants.map((variant) => {
         const variantSizes = variant.sizes.split(",").map((size) => size.trim()).filter(Boolean);
         const variantImages = variant.images.split(/\r?\n|,/).map((image) => image.trim()).filter(Boolean);
         if (!variant.color.trim()) throw new Error("Each colourway needs a colour.");
         if (!variantSizes.length) throw new Error(`Add sizes for ${variant.color}.`);
         if (variantImages.length < 4 || variantImages.length > 8) throw new Error(`Each colourway needs 4–8 images.`);
         const size_stock = Object.fromEntries(variantSizes.map((size) => [size, Math.max(0, Number(variant.sizeStock?.[size] || 0))]));
         const assets = (variant.assets || []).filter((asset) => variantImages.includes(asset.url));
         return { color: variant.color.trim(), sizes: variantSizes, stock: Object.values(size_stock).reduce((sum, value) => sum + value, 0), images: variantImages, size_stock, thumbnail_images: [assets[0]?.thumbnailUrl || variantImages[0]], image_keys: assets.map((asset) => asset.key).filter(Boolean), thumbnail_keys: assets[0]?.thumbnailKey ? [assets[0].thumbnailKey] : [] };
       });
       const firstAsset = uploadedAssets.find((asset) => asset.url === images[0]);
       const response = await apiFetch("/api/products", { method: "POST", body: JSON.stringify({ ...form, price: Number(form.price), mrp: Number(form.mrp), cost_price: Number(form.cost_price || 0), stock: totalStock, reorder_point: Number(form.reorder_point || 15), sizes, size_stock: Object.fromEntries(sizes.map((size) => [size, Math.max(0, Number(sizeStock[size] || 0))])), images, image_keys: images.map((image) => uploadedAssets.find((asset) => asset.url === image)?.key || "").filter(Boolean), thumbnail_urls: [firstAsset?.thumbnailUrl || images[0]], thumbnail_keys: firstAsset?.thumbnailKey ? [firstAsset.thumbnailKey] : [], preorder_release_at: form.preorder_release_at ? new Date(form.preorder_release_at).toISOString() : null, preorder_limit: form.preorder_limit === "" ? null : Number(form.preorder_limit), variants: normalizedVariants }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Listing could not be created");
      setStatus("Listing created and placed on hold for review.");
       setForm({ name: "", category: categories[0] || "", subcategory: "", brand: "", color: "", price: "", mrp: "", cost_price: "", material: "", description: "", sizes: "S, M, L", images: "", reorder_point: "15", preorder_enabled: false, preorder_release_at: "", preorder_limit: "", size_chart_url: "" });
       setUploadedAssets([]);
       setVariants([]);
       setSizeStock({ S: 0, M: 0, L: 0 });
    } catch (error) { setStatus(error.message); } finally { setBusy(false); }
  }

  return <section className="admin-panel admin-wide-panel"><div className="admin-panel-heading"><div><p className="eyebrow">Catalog creation</p><h2>Add listing</h2></div><span>New listings start on hold</span></div><form className="admin-listing-form" onSubmit={submit}><div className="admin-form-grid"><label>Product name<input name="name" value={form.name} onChange={changeField} required /></label><label>Brand<input name="brand" value={form.brand} onChange={changeField} required /></label><label>Category<select name="category" value={form.category} onChange={changeField} required><option value="">Choose category</option>{categories.map((category) => <option key={category} value={category}>{category}</option>)}</select></label><label>Subcategory <span className="form-hint">optional</span><select name="subcategory" value={form.subcategory} onChange={changeField}><option value="">None</option>{availableSubcategories.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}</select></label><label>Colour<input name="color" value={form.color} onChange={changeField} required /></label><label>Material<input name="material" value={form.material} onChange={changeField} required /></label><label>Price (₹)<input name="price" type="number" min="1" value={form.price} onChange={changeField} required /></label><label>MRP (₹)<input name="mrp" type="number" min="1" value={form.mrp} onChange={changeField} required /></label><label>Cost price (₹)<input name="cost_price" type="number" min="0" value={form.cost_price} onChange={changeField} /></label></div><label>Sizes <span className="form-hint">comma separated</span><input name="sizes" value={form.sizes} onChange={changeSizes} required /></label><div className="size-stock-editor"><div className="listing-subheading"><strong>Stock by size</strong><span>{totalStock} total units</span></div>{sizes.map((size) => <label key={size}>{size}<input type="number" min="0" value={sizeStock[size] ?? 0} onChange={(event) => setSizeStock((current) => ({ ...current, [size]: event.target.value }))} /></label>)}</div><label>Image URLs <span className="form-hint">one per line · 4–6 required · first is the thumbnail</span><textarea name="images" rows="5" value={form.images} onChange={changeField} required /></label><label className="upload-button secondary">Upload images<input type="file" accept="image/*" multiple hidden onChange={uploadImages} /></label><div className="admin-form-grid"><label>Reorder point<input name="reorder_point" type="number" min="0" value={form.reorder_point} onChange={changeField} /></label></div><div className="preorder-react-block"><label className="merch-checkbox"><input name="preorder_enabled" type="checkbox" checked={form.preorder_enabled} onChange={(event) => setForm((current) => ({ ...current, preorder_enabled: event.target.checked }))} /> Enable pre-order</label>{form.preorder_enabled && <div className="admin-form-grid"><label>Release date <span className="form-hint">optional</span><input name="preorder_release_at" type="datetime-local" value={form.preorder_release_at} onChange={changeField} /></label><label>Pre-order limit <span className="form-hint">optional</span><input name="preorder_limit" type="number" min="1" value={form.preorder_limit} onChange={changeField} /></label></div>}</div><label>Size chart URL <span className="form-hint">optional</span><input name="size_chart_url" type="url" value={form.size_chart_url} onChange={changeField} placeholder="https://…" /></label><label className="upload-button secondary">Upload size chart<input type="file" accept="image/*" hidden onChange={uploadSizeChart} /></label><VariantEditor variants={variants} setVariants={setVariants} setUploading={setUploading} setStatus={setStatus} /><label>Description<textarea name="description" rows="5" value={form.description} onChange={changeField} required /></label>{status && <p className="inline-note" role="status">{status}</p>}<div className="listing-form-actions"><button className="primary-action" type="submit" disabled={busy || uploading}>{busy ? "Creating…" : uploading ? "Uploading…" : "Create listing"} <span aria-hidden="true">↗</span></button><button className="secondary-action" type="button" onClick={() => onNavigate("/admin/products")}>Cancel</button></div></form></section>;
}

function notificationDestination(item) {
  const type = String(item?.type || "").toLowerCase();
  if (type.includes("stock") || type.includes("inventory")) return "/admin/inventory";
  if (type.includes("return") || type.includes("exchange") || type.includes("refund")) return "/admin/returns";
  if (type.includes("review") || type.includes("rating")) return "/admin/reviews";
  if (type.includes("question")) return "/admin/questions";
  if (type.includes("support") || type.includes("ticket")) return "/admin/support";
  return "/admin/orders";
}

function NotificationsView({ notifications, onNotificationsChanged, onNavigate }) {
  const [filter, setFilter] = useState("all");
  const [busy, setBusy] = useState(false);
  const visible = notifications.filter((item) => filter === "all" || (filter === "unread" ? !item.read_at : filter === "urgent" ? item.priority === "urgent" : item.type === filter));
  const types = [...new Set(notifications.map((item) => item.type).filter(Boolean))];
  async function update(item, patch) {
    setBusy(true);
    try {
      const response = await apiFetch(`/api/admin/notifications/${encodeURIComponent(item.id)}`, { method: "PATCH", body: JSON.stringify(patch) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Notification could not be updated");
      onNotificationsChanged((items) => items.map((entry) => entry.id === item.id ? { ...entry, ...patch, read_at: patch.read ? (entry.read_at || new Date().toISOString()) : entry.read_at, dismissed_at: patch.dismissed ? new Date().toISOString() : entry.dismissed_at } : entry).filter((entry) => !entry.dismissed_at));
    } catch (error) { window.alert(error.message); } finally { setBusy(false); }
  }
  async function markAllRead() {
    setBusy(true);
    try { const response = await apiFetch("/api/admin/notifications/read-all", { method: "POST", body: "{}" }); if (!response.ok) throw new Error("Notifications could not be marked read"); onNotificationsChanged((items) => items.map((item) => ({ ...item, read_at: item.read_at || new Date().toISOString() }))); }
    catch (error) { window.alert(error.message); } finally { setBusy(false); }
  }
  async function clearProcessed() {
    setBusy(true);
    try { const response = await apiFetch("/api/admin/notifications/cleared", { method: "DELETE" }); if (!response.ok) throw new Error("Processed notifications could not be cleared"); onNotificationsChanged((items) => items.filter((item) => !item.read_at && !item.dismissed_at)); }
    catch (error) { window.alert(error.message); } finally { setBusy(false); }
  }
  return <section className="admin-panel admin-wide-panel"><div className="admin-panel-heading"><div><p className="eyebrow">Keep the store moving</p><h2>Notification center</h2></div><span>{notifications.filter((item) => !item.read_at).length} unread</span></div><div className="notification-toolbar"><label>Show<select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">All notifications</option><option value="unread">Unread</option><option value="urgent">Urgent</option>{types.map((type) => <option key={type} value={type}>{type.replace(/_/g, " ")}</option>)}</select></label><div><button className="secondary-action" type="button" disabled={busy} onClick={markAllRead}>Mark all read</button><button className="secondary-action" type="button" disabled={busy} onClick={clearProcessed}>Clear processed</button></div></div><div className="admin-notification-list">{visible.map((item) => <article className={`admin-notification-card ${item.priority === "urgent" ? "urgent" : ""} ${item.read_at ? "is-read" : ""}`} key={item.id}><span className="notification-dot" /><div className="notification-open-wrap"><button type="button" className="notification-open" onClick={() => onNavigate(notificationDestination(item))}><strong>{item.title || item.type}</strong><p>{item.message || item.body || "New activity"}</p><small>{item.created_at ? formatIST(item.created_at) : "Recent"}</small></button></div><div className="notification-actions">{!item.read_at && <button type="button" disabled={busy} onClick={(event) => { event.stopPropagation(); update(item, { read: true }); }}>Mark read</button>}<button type="button" disabled={busy} onClick={(event) => { event.stopPropagation(); update(item, { dismissed: true }); }}>Dismiss</button></div></article>)}{!visible.length && <div className="empty-state">No notifications match this filter.</div>}</div></section>;
}

export function AdminWorkspace({ route, onNavigate }) {
  const [dashboard, setDashboard] = useState(null); const [orders, setOrders] = useState([]); const [notifications, setNotifications] = useState([]); const [products, setProducts] = useState([]); const [categories, setCategories] = useState([]); const [subcategories, setSubcategories] = useState([]); const [error, setError] = useState("");
  useEffect(() => { let active = true; Promise.all([apiFetch("/api/admin/dashboard"), apiFetch("/api/admin/notifications"), apiFetch("/api/orders?scope=admin"), apiFetch("/api/products?scope=admin"), apiFetch("/api/categories")]).then(async ([dashboardResponse, notificationResponse, orderResponse, productResponse, categoryResponse]) => { const dashboardData = await dashboardResponse.json(); if (!dashboardResponse.ok) throw new Error(dashboardData.error || "Admin access required"); const notificationData = notificationResponse.ok ? await notificationResponse.json() : {}; const orderData = orderResponse.ok ? await orderResponse.json() : {}; const productData = productResponse.ok ? await productResponse.json() : {}; const categoryData = categoryResponse.ok ? await categoryResponse.json() : {}; if (active) { setDashboard(dashboardData); setNotifications(notificationData.notifications || []); setOrders(orderData.orders || []); setProducts(productData.products || []); setCategories(categoryData.categories || []); setSubcategories(categoryData.subcategories || []); } }).catch((requestError) => active && setError(requestError.message)); return () => { active = false; }; }, []);
  function changeProduct(next) { setProducts((current) => current.map((product) => product.id === next.id ? { ...product, ...next } : product)); }
  function changeOrder(next) { setOrders((current) => current.map((order) => order.id === next.id ? { ...order, ...next } : order)); }
  function changeNotifications(update) { setNotifications(update); }
  function removeProduct(id) { setProducts((current) => current.filter((product) => product.id !== id)); }
  async function refreshCatalog() { const response = await apiFetch("/api/categories"); const data = await response.json(); if (response.ok) { setCategories(data.categories || []); setSubcategories(data.subcategories || []); } }
  return <AdminShell route={route} onNavigate={onNavigate} notifications={notifications}>{error ? <section className="admin-panel admin-wide-panel"><p className="eyebrow">Admin access</p><h2>{error}</h2><p className="muted">Use the sign-in page to continue.</p><button className="primary-action" type="button" onClick={() => onNavigate("/login")}>Open admin sign-in <span aria-hidden="true">↗</span></button></section> : !dashboard ? <div className="loading-card">Preparing your console…</div> : route === "/admin" ? <DashboardView dashboard={dashboard} orders={orders} notifications={notifications} /> : route === "/admin/storefront" ? <StorefrontSettingsView /> : route === "/admin/labels" ? <LabelsView orders={orders} /> : route === "/admin/hero" ? <HeroStudioView products={products} categories={categories} /> : route === "/admin/add-product" ? <AddListingView categories={categories} subcategories={subcategories} onNavigate={onNavigate} /> : route === "/admin/bulk-listing" ? <BulkListingView categories={categories} subcategories={subcategories} /> : route === "/admin/orders" ? <OrdersView orders={orders} onOrderChanged={changeOrder} /> : route === "/admin/products" ? <ManageProductsView products={products} categories={categories} subcategories={subcategories} onProductChanged={changeProduct} onProductDeleted={removeProduct} onNavigate={onNavigate} /> : route === "/admin/inventory" ? <InventoryView products={products} onProductChanged={changeProduct} /> : route === "/admin/customers" ? <CustomersView /> : route === "/admin/reviews" ? <ReviewsView /> : route === "/admin/questions" ? <QuestionsView /> : route === "/admin/coupons" ? <CouponsView products={products} categories={categories} subcategories={subcategories} /> : route === "/admin/deals" ? <DealsView products={products} onProductChanged={changeProduct} /> : route === "/admin/categories" ? <CategoriesView categories={categories} subcategories={subcategories} onCatalogChanged={refreshCatalog} /> : route === "/admin/returns" ? <ReturnsView /> : route === "/admin/support" ? <SupportView /> : route === "/admin/system" ? <SystemView /> : route === "/admin/manage-store" ? <ManageStoreView onNavigate={onNavigate} /> : <NotificationsView notifications={notifications} onNotificationsChanged={changeNotifications} onNavigate={onNavigate} />}</AdminShell>;
}
