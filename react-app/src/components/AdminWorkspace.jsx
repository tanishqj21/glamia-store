import React, { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/api";
import { money, formatIST } from "../lib/commerce";
import { Icon } from "./Icon";
import { ImageManager } from "./ImageManager";
import { TaxCodePicker } from "./TaxCodePicker";

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
const TaxComplianceView = lazy(() => import("./TaxComplianceView").then((module) => ({ default: module.TaxComplianceView })));
const GoogleAnalyticsView = lazy(() => import("./GoogleAnalyticsView").then((module) => ({ default: module.GoogleAnalyticsView })));
const EmployeesView = lazy(() => import("./AdminEmployees").then((module) => ({ default: module.EmployeesView })));


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

async function uploadProductAsset(file, kind = "product") {
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

function assetKeyFromUrl(value) {
  const url = String(value || "");
  if (!url.startsWith("/api/assets/")) return "";
  try { return decodeURIComponent(url.replace("/api/assets/", "")); } catch { return ""; }
}

function productImageItems(product) {
  const images = Array.isArray(product.images) ? product.images : [product.image_url];
  const thumbnailUrl = product.thumbnail_url || product.thumbnail_images?.[0] || "";
  const thumbnailKey = product.thumbnail_key || product.thumbnail_keys?.[0] || "";
  const thumbnailSourceUrl = product.thumbnail_source_url || images.filter(Boolean)[0] || "";
  return images.filter(Boolean).map((url) => ({
    url,
    key: assetKeyFromUrl(url),
    thumbnailUrl: url === thumbnailSourceUrl ? thumbnailUrl : "",
    thumbnailKey: url === thumbnailSourceUrl ? thumbnailKey : ""
  }));
}

function variantImageItems(variant) {
  const urls = String(variant.images || "").split(/\r?\n|,/).map((image) => image.trim()).filter(Boolean);
  return urls.map((url) => ({
    ...(variant.assets || []).find((asset) => asset.url === url),
    url,
    key: (variant.assets || []).find((asset) => asset.url === url)?.key || assetKeyFromUrl(url)
  }));
}

const adminLinks = [
  ["/admin", "Dashboard"], ["/admin/storefront", "Storefront"], ["/admin/hero", "Hero studio"], ["/admin/tax", "GST & HSN"], ["/admin/labels", "Labels"], ["/admin/employees", "Employees"], ["/admin/manage-store", "Manage store"],
];

// Keep the admin shell light: each section asks the Worker only for the data
// it actually renders. Notifications remain available through a small unread
// count everywhere, while the full notification list is loaded only where it
// is visible or used by the dashboard.
const ADMIN_SECTION_DATA = {
  "/admin": { dashboard: true, notifications: true, orders: true },
  "/admin/notifications": { notifications: true },
  "/admin/orders": { orders: true },
  "/admin/labels": { orders: true },
  "/admin/hero": { products: true, categories: true },
  "/admin/add-product": { categories: true },
  "/admin/bulk-listing": { categories: true },
  "/admin/products": { products: true, categories: true },
  "/admin/inventory": { products: true },
  "/admin/coupons": { products: true, categories: true },
  "/admin/deals": { products: true },
  "/admin/categories": { categories: true },
};

const ADMIN_POLL_ROUTES = new Set([
  "/admin",
  "/admin/notifications",
  "/admin/orders",
  "/admin/labels",
  "/admin/products",
  "/admin/inventory",
]);

const ADMIN_CACHE_TTLS = {
  dashboard: 15000,
  notifications: 10000,
  notificationCount: 10000,
  orders: 15000,
  products: 30000,
  categories: 300000,
};

function AdminShell({ route, onNavigate, notifications = [], unreadCount = null, children }) {
  const unread = unreadCount === null || unreadCount === undefined
    ? notifications.filter((item) => !item.read_at && !item.dismissed_at).length
    : Number(unreadCount || 0);
  return <main className="page-main"><section className="admin-page admin-react-page"><div className="admin-heading"><div><p className="eyebrow">Glamia console</p><h1 className="page-title">Manage the marketplace.</h1></div><div className="admin-heading-actions"><button className="admin-notification-button" type="button" onClick={() => onNavigate("/admin/notifications")} aria-label={`Open notifications${unread ? `, ${unread} unread` : ""}`} title="Open notifications"><Icon name="bell" size={20} />{unread > 0 && <span>{unread > 99 ? "99+" : unread}</span>}</button><button className="text-link" type="button" onClick={() => onNavigate("/admin/manage-store")}>Open store map</button></div></div><nav className="admin-nav" aria-label="Admin workspace" tabIndex={0}>{adminLinks.map(([href, label]) => <button key={href} type="button" className={route === href ? "active" : ""} onClick={() => onNavigate(href)}>{label}</button>)}</nav>{children}</section></main>;
}

function Metric({ label, value, detail }) { return <article className="admin-metric"><span>{label}</span><strong>{value}</strong>{detail && <small>{detail}</small>}</article>; }

/* Charts use a fixed vivid palette on purpose — they stay readable and consistent
   no matter which storefront theme or palette is active. */
const CHART_COLORS = ["#6366f1", "#f59e0b", "#10b981", "#ef4444", "#3b82f6", "#ec4899", "#14b8a6", "#f97316", "#8b5cf6", "#84cc16", "#06b6d4", "#eab308"];
const chartColor = (index) => CHART_COLORS[index % CHART_COLORS.length];
const chartSeriesClass = (index) => `chart-series-${index % CHART_COLORS.length}`;

export function dayLabel(day) {
  const date = new Date(String(day || "") + "T00:00:00+05:30");
  return Number.isNaN(date.getTime()) ? String(day || "") : date.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" });
}

export function pageLabel(path) {
  return String(path || "") === "/" ? "Home" : String(path || "");
}

export function hourLabel(hour) {
  const value = ((Number(hour) % 24) + 24) % 24;
  return `${value % 12 === 0 ? 12 : value % 12} ${value < 12 ? "AM" : "PM"}`;
}

function pieSlicePath(cx, cy, radius, start, end) {
  if (end - start <= 0.0300001) return `M ${cx} ${cy} Z`;
  const x1 = (cx + radius * Math.cos(start)).toFixed(2);
  const y1 = (cy + radius * Math.sin(start)).toFixed(2);
  const x2 = (cx + radius * Math.cos(end)).toFixed(2);
  const y2 = (cy + radius * Math.sin(end)).toFixed(2);
  return `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${end - start > Math.PI ? 1 : 0} 1 ${x2} ${y2} Z`;
}

function Chart({ title, entries, labelKey, valueKey, formatter = (value) => value, labelFormatter = (label) => label, hint, onSelect, selectedKey }) {
  const [view, setView] = useState("bar");
  const [hover, setHover] = useState(-1);
  const values = entries.map((entry) => Math.max(0, Number(entry[valueKey] || 0)));
  const max = Math.max(1, ...values);
  const total = values.reduce((sum, value) => sum + value, 0);
  const peakIndex = values.reduce((best, value, index) => (value > values[best] ? index : best), 0);
  const hovered = hover >= 0 ? entries[hover] : null;
  const crowded = entries.length > 12;
  const selectable = typeof onSelect === "function";
  const isSelected = (entry) => selectedKey !== undefined && selectedKey !== null && String(selectedKey) === String(entry[labelKey]);
  const choose = (entry, index) => {
    setHover(index);
    onSelect?.(entry, index);
  };
  const selectOnKey = (event, entry, index) => {
    if (!selectable || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    choose(entry, index);
  };
  return <section className="admin-chart"><div className="admin-chart-heading"><p className="eyebrow">{title}</p><div className="chart-heading-tools">{hint && <span className="chart-hint">{hint}</span>}<span>{entries.length} points</span>{entries.length > 0 && <div className="chart-toggle" role="group" aria-label={`${title} chart type`}><button type="button" className={view === "bar" ? "active" : ""} onClick={() => { setView("bar"); setHover(-1); }}>Bars</button><button type="button" className={view === "pie" ? "active" : ""} onClick={() => { setView("pie"); setHover(-1); }}>Pie</button></div>}</div></div>{hovered && <div className={`chart-callout ${chartSeriesClass(hover)}`}><i /><strong>{labelFormatter(hovered[labelKey])}</strong><b>{formatter(hovered[valueKey])}</b>{total > 0 && <small>{Math.round((values[hover] / total) * 100)}% of total</small>}</div>}{entries.length ? view === "bar" ? <div className="bar-chart" role="region" aria-label={title} tabIndex={0}>{entries.map((entry, index) => { const barHeight = Math.max(5, (values[index] / max) * 100); return <div className={`bar-column ${chartSeriesClass(index)} ${hover === index ? "is-hovered" : ""} ${isSelected(entry) ? "is-selected" : ""} ${selectable ? "is-selectable" : ""} ${index === peakIndex && values[index] > 0 ? "is-peak" : ""}`} key={String(entry[labelKey])} role={selectable ? "button" : undefined} tabIndex={selectable ? 0 : undefined} aria-label={selectable ? `Show hourly visits for ${labelFormatter(entry[labelKey])}` : undefined} onMouseEnter={() => setHover(index)} onMouseLeave={() => setHover(-1)} onClick={selectable ? () => choose(entry, index) : undefined} onKeyDown={(event) => selectOnKey(event, entry, index)}><span className="bar-value">{formatter(entry[valueKey])}</span><svg className="bar-visual" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><rect x="0" y={100 - barHeight} width="100" height={barHeight} /></svg><small>{!crowded || index % 3 === 0 || index === entries.length - 1 ? labelFormatter(entry[labelKey]) : ""}</small></div>; })}</div> : total > 0 ? <div className="pie-chart-layout"><svg className="pie-chart" viewBox="0 0 200 200" role="img" aria-label={title}>{entries.length === 1 ? <circle className={`${chartSeriesClass(0)} ${isSelected(entries[0]) ? "is-selected" : ""}`} cx="100" cy="100" r="80" fill={chartColor(0)} role={selectable ? "button" : undefined} tabIndex={selectable ? 0 : undefined} aria-label={selectable ? `Show hourly visits for ${labelFormatter(entries[0][labelKey])}` : undefined} onMouseEnter={() => setHover(0)} onMouseLeave={() => setHover(-1)} onClick={selectable ? () => choose(entries[0], 0) : undefined} onKeyDown={(event) => selectOnKey(event, entries[0], 0)} /> : (() => { let cursor = 0; return entries.map((entry, index) => { const start = -Math.PI / 2 + cursor * 2 * Math.PI; cursor = Math.min(1, cursor + values[index] / total); const end = -Math.PI / 2 + cursor * 2 * Math.PI; return <path className={`${chartSeriesClass(index)} ${hover === -1 || hover === index ? "" : "is-dimmed"} ${isSelected(entry) ? "is-selected" : ""}`} key={String(entry[labelKey])} d={pieSlicePath(100, 100, hover === index ? 91 : 80, start, Math.max(end, start + 0.03))} fill={chartColor(index)} role={selectable ? "button" : undefined} tabIndex={selectable ? 0 : undefined} aria-label={selectable ? `Show hourly visits for ${labelFormatter(entry[labelKey])}` : undefined} onMouseEnter={() => setHover(index)} onMouseLeave={() => setHover(-1)} onClick={selectable ? () => choose(entry, index) : undefined} onKeyDown={(event) => selectOnKey(event, entry, index)} />; }); })()}</svg><div className="pie-legend" tabIndex={0}>{entries.map((entry, index) => <div className={`pie-legend-item ${hover === index ? "is-hovered" : ""} ${isSelected(entry) ? "is-selected" : ""}`} key={String(entry[labelKey])} role={selectable ? "button" : undefined} tabIndex={selectable ? 0 : undefined} aria-label={selectable ? `Show hourly visits for ${labelFormatter(entry[labelKey])}` : undefined} onMouseEnter={() => setHover(index)} onMouseLeave={() => setHover(-1)} onClick={selectable ? () => choose(entry, index) : undefined} onKeyDown={(event) => selectOnKey(event, entry, index)}><i className={`chart-swatch ${chartSeriesClass(index)}`} /><span>{labelFormatter(entry[labelKey])}</span><b>{formatter(entry[valueKey])}</b></div>)}</div></div> : <div className="empty-state">No data yet.</div> : <div className="empty-state">No data yet.</div>}</section>;
}

function PerformanceTable({ title, hint, items, metric, metricLabel, formatter = (value) => value }) {
  return <section className="admin-panel dashboard-performance-panel"><div className="admin-panel-heading"><div><p className="eyebrow">{title}</p><span className="muted">{hint}</span></div><span>{items.length} shown</span></div>{items.length ? <div className="dashboard-performance-list">{items.map((product) => <article className="dashboard-performance-row" key={product.id}><img src={product.thumbnail || product.image || ""} alt="" loading="lazy" decoding="async" width="42" height="42" /><div><strong>{product.name}</strong><span>{product.category || "Uncategorized"}{product.color ? ` · ${product.color}` : ""}</span></div><b>{formatter(product[metric])} <small>{metricLabel}</small></b></article>)}</div> : <div className="empty-state">No product activity yet.</div>}</section>;
}

function DashboardView({ dashboard, orders, notifications, onNavigate }) {
  const [mode, setMode] = useState("basic");
  const [category, setCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [productId, setProductId] = useState("");
  const [selectedVisitDay, setSelectedVisitDay] = useState("");

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
  const aggregateVisitHourEntries = visitors.by_hour || [];
  const dayHourEntries = visitors.by_day_hour || [];
  const pageEntries = visitors.top_pages || [];
  const peakHour = hourEntries.reduce((best, entry) => (Number(entry.orders || 0) > Number(best?.orders || 0) ? entry : best), null);
  useEffect(() => {
    if (!selectedVisitDay || !dayEntries.some((entry) => String(entry.day) === String(selectedVisitDay))) {
      setSelectedVisitDay(dayEntries[dayEntries.length - 1]?.day || "");
    }
  }, [dayEntries, selectedVisitDay]);
  const selectedDayRows = dayHourEntries.filter((entry) => String(entry.day) === String(selectedVisitDay));
  const selectedDayTotal = dayEntries.find((entry) => String(entry.day) === String(selectedVisitDay))?.views || 0;
  const hourlyVisitEntries = Array.from({ length: 24 }, (_, hour) => {
    const row = selectedDayRows.find((entry) => Number(entry.hour) === hour);
    const fallback = !selectedVisitDay ? aggregateVisitHourEntries.find((entry) => Number(entry.hour) === hour) : null;
    return { hour, views: Number(row?.views ?? fallback?.views ?? 0) };
  });
  const hourlyVisitTotal = hourlyVisitEntries.reduce((sum, entry) => sum + entry.views, 0);
  const visitorRangeLabel = selectedVisitDay ? dayLabel(selectedVisitDay) : "30-day pattern";
  const packingQueue = orders.filter((order) => order.status !== "cancelled" && order.packing_status !== "packed");
  const packedAlerts = notifications.filter((item) => item.type === "order_packed").slice(0, 4);
  return (
    <>
      <section
        className="dashboard-controls"
        aria-label="Dashboard view controls"
      >
        <div className="dashboard-control-copy">
          <p className="eyebrow">Workspace view</p>
          <h2>Store pulse</h2>
          <span>Start with the headline numbers, then drill into the signal that needs attention.</span>
        </div>
        <div className="dashboard-control-main">
          <div
            className="dashboard-mode-toggle"
            role="group"
            aria-label="Dashboard detail level"
          >
            <button
              type="button"
              className={mode === "basic" ? "active" : ""}
              onClick={() => setMode("basic")}
            >
              Basic
            </button>
            <button
              type="button"
              className={mode === "advanced" ? "active" : ""}
              onClick={() => setMode("advanced")}
            >
              Advanced
            </button>
          </div>
          {mode === "advanced" && (
            <div className="dashboard-filter-grid">
            <label>
              Category
              <select
                value={category}
                onChange={(event) => {
                  setCategory(event.target.value);
                  setSubcategory("");
                  setProductId("");
                }}
              >
                <option value="">All categories</option>
                {categories.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Subcategory
              <select
                value={subcategory}
                onChange={(event) => {
                  setSubcategory(event.target.value);
                  setProductId("");
                }}
              >
                <option value="">All subcategories</option>
                {subcategories.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Product
              <select
                value={productId}
                onChange={(event) => setProductId(event.target.value)}
              >
                <option value="">All products</option>
                {productOptions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                    {item.color ? ` · ${item.color}` : ""}
                  </option>
                ))}
              </select>
            </label>
            </div>
          )}
        </div>
      </section>
      <section className="dashboard-section dashboard-summary-section" aria-labelledby="dashboard-summary-heading">
        <div className="dashboard-section-heading">
          <div>
            <p className="eyebrow">At a glance</p>
            <h2 id="dashboard-summary-heading">Today’s business snapshot</h2>
          </div>
          <span className="dashboard-section-note">{mode === "advanced" ? "Filtered product view" : "All live catalog activity"}</span>
        </div>
      <div className="admin-metric-grid dashboard-kpi-grid">
        <Metric
          label="Revenue"
          value={money(viewTotals.revenue)}
          detail={`${viewTotals.units || 0} units sold`}
        />
        <Metric
          label="Orders"
          value={viewTotals.orders || 0}
          detail={
            mode === "advanced"
              ? "Filtered product view"
              : `${totals.repeat_customers || 0} repeat customers`
          }
        />
        <Metric
          label="Profit"
          value={money(viewTotals.profit)}
          detail={
            mode === "advanced"
              ? "Filtered product view"
              : `${totals.return_rate || 0}% return rate`
          }
        />
        <Metric
          label="Wishlist saves"
          value={viewTotals.wishlists || 0}
          detail={`${notifications.filter((item) => !item.read_at).length} unread alerts`}
        />
      </div>
      </section>
      <section className="dashboard-section dashboard-fulfilment-section" aria-labelledby="dashboard-fulfilment-heading">
        <div className="dashboard-section-heading">
          <div>
            <p className="eyebrow">Warehouse handoff</p>
            <h2 id="dashboard-fulfilment-heading">Packing activity</h2>
          </div>
          <button type="button" className="secondary-action" onClick={() => onNavigate("/admin/employees")}>Manage employees ↗</button>
        </div>
        <div className="admin-metric-grid dashboard-kpi-grid">
          <Metric label="Packing queue" value={packingQueue.length} detail="orders awaiting a pack confirmation" />
          <Metric label="Packed alerts" value={packedAlerts.length} detail="recent employee handoffs" />
        </div>
        {packedAlerts.length ? <div className="admin-notification-list dashboard-packed-alerts">{packedAlerts.map((item) => <button type="button" className="admin-notification-row" key={item.id} onClick={() => onNavigate("/admin/orders")}><strong>{item.title || "Order packed"}</strong><span>{item.message}</span></button>)}</div> : <div className="empty-state">No employee packing alerts yet. Create an employee ID to start the workflow.</div>}
      </section>
      <section className="dashboard-section dashboard-visitor-section" aria-labelledby="dashboard-traffic-heading">
        <div className="dashboard-section-heading">
          <div>
            <p className="eyebrow">Visitor analytics</p>
            <h2 id="dashboard-traffic-heading">Traffic, with a clear path to detail</h2>
          </div>
          <span className="dashboard-section-note">{visitors.total_30d || 0} page views · last 30 days</span>
        </div>
        <div className="dashboard-visitor-grid">
          <Chart
            title="Site visits · daily (IST)"
            entries={dayEntries}
            labelKey="day"
            valueKey="views"
            labelFormatter={dayLabel}
            onSelect={(entry) => setSelectedVisitDay(entry.day)}
            selectedKey={selectedVisitDay}
            hint="Click a day to drill down"
          />
          <div className="dashboard-hourly-detail">
            <Chart
              title={`Hourly visits · ${visitorRangeLabel}`}
              entries={hourlyVisitEntries}
              labelKey="hour"
              valueKey="views"
              labelFormatter={hourLabel}
              hint={selectedVisitDay ? `${selectedDayTotal} visits that day` : "Select a day above"}
            />
            <div className="dashboard-hourly-summary" aria-live="polite">
              <span>{selectedVisitDay ? "Selected day total" : "Hourly pattern total"}</span>
              <strong>{selectedVisitDay ? selectedDayTotal : hourlyVisitTotal}</strong>
              <small>{selectedVisitDay ? "The bars reconcile to the daily total." : "Showing the 30-day hourly distribution."}</small>
            </div>
          </div>
        </div>
        <p className="dashboard-interaction-note">Select any daily bar or pie slice to combine that day’s total with its 24-hour visit breakdown.</p>
      </section>
      <GoogleAnalyticsView />
      <section className="dashboard-section dashboard-commerce-section" aria-labelledby="dashboard-commerce-heading">
        <div className="dashboard-section-heading">
          <div>
            <p className="eyebrow">Commerce performance</p>
            <h2 id="dashboard-commerce-heading">What is moving the store</h2>
          </div>
          <span className="dashboard-section-note">Orders, geography, products, and pages</span>
        </div>
      <div className="admin-chart-grid">
        <Chart
          title="Orders by Indian state"
          entries={stateEntries}
          labelKey="state"
          valueKey="orders"
        />
        <Chart
          title="Orders by hour · IST"
          entries={hourEntries}
          labelKey="hour"
          valueKey="orders"
          labelFormatter={hourLabel}
          hint={
            peakHour && Number(peakHour.orders) > 0
              ? `Peak around ${hourLabel(peakHour.hour)} IST`
              : "No orders yet"
          }
        />
        <Chart
          title="Top products by units sold"
          entries={topProducts}
          labelKey="name"
          valueKey="units"
        />
        <Chart
          title="Top pages · 30 days"
          entries={pageEntries}
          labelKey="path"
          valueKey="views"
          labelFormatter={pageLabel}
        />
      </div>
      </section>
      <section className="admin-panel dashboard-audience-section traffic-snapshot-panel">
        <div className="admin-panel-heading">
          <div>
            <p className="eyebrow">Audience mix</p>
            <h2>Who is visiting the store</h2>
          </div>
          <span>{visitors.total_30d} page views</span>
        </div>
        <div className="traffic-snapshot-grid">
          <div>
            <p className="eyebrow">Top sources</p>
            {visitors.referrers.length ? (
              <div className="insight-list">
                {visitors.referrers.map((source) => (
                  <div key={source.source}>
                    <span>{source.source}</span>
                    <b>{source.views}</b>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted">
                No external referrers yet — visitors arrived directly.
              </p>
            )}
          </div>
          <div>
            <p className="eyebrow">Devices</p>
            {visitors.devices.length ? (
              <div className="insight-list">
                {visitors.devices.map((device) => (
                  <div key={device.device}>
                    <span className="capitalize">
                      {device.device}
                    </span>
                    <b>{device.views}</b>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted">No visits recorded yet.</p>
            )}
          </div>
          <div>
            <p className="eyebrow">Top countries</p>
            {visitors.countries.length ? (
              <div className="insight-list">
                {visitors.countries.map((country) => (
                  <div key={country.country}>
                    <span>{country.country}</span>
                    <b>{country.views}</b>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted">No visits recorded yet.</p>
            )}
          </div>
        </div>
      </section>
      <section className="dashboard-section dashboard-performance-section" aria-labelledby="dashboard-performance-heading">
        <div className="dashboard-section-heading">
          <div>
            <p className="eyebrow">Product signals</p>
            <h2 id="dashboard-performance-heading">Where attention is building</h2>
          </div>
          <span className="dashboard-section-note">Demand, friction, and saved intent</span>
        </div>
      <div className="dashboard-performance-grid">
        <PerformanceTable
          title="Best performers"
          hint="Highest units sold"
          items={topProducts.slice(0, 5)}
          metric="units"
          metricLabel="units"
        />
        <PerformanceTable
          title="Stuck in carts"
          hint="Added more often than purchased"
          items={stuckProducts}
          metric="adds"
          metricLabel="cart adds"
        />
        <PerformanceTable
          title="Most wishlisted"
          hint="Strongest saved-item interest"
          items={wishlistedProducts}
          metric="wishlists"
          metricLabel="saves"
        />
      </div>
      </section>
      {mode === "advanced" && (
        <section className="dashboard-section dashboard-advanced-section" aria-labelledby="dashboard-advanced-heading">
          <div className="dashboard-section-heading">
            <div>
              <p className="eyebrow">Advanced mode</p>
              <h2 id="dashboard-advanced-heading">Deeper decisions, when you need them</h2>
            </div>
            <span className="dashboard-section-note">Use the filters above to narrow product signals</span>
          </div>
          <div className="dashboard-insights-grid">
          <div className="admin-panel">
            <div className="admin-panel-heading">
              <div>
                <p className="eyebrow">Customer value</p>
                <h2>Lifetime value</h2>
              </div>
              <span>Completed orders</span>
            </div>
            <div className="insight-highlight">
              {money(analytics.average_customer_lifetime_value)}
              <small>average customer value</small>
            </div>
            <div className="insight-list">
              {(analytics.customer_lifetime_values || [])
                .slice(0, 5)
                .map((item) => (
                  <div key={item.email}>
                    <span>{item.email}</span>
                    <b>{money(item.value)}</b>
                  </div>
                ))}
            </div>
          </div>
          <div className="admin-panel">
            <div className="admin-panel-heading">
              <div>
                <p className="eyebrow">Conversion signals</p>
                <h2>Cart to order</h2>
              </div>
              <span>Tracked activity only</span>
            </div>
            <div className="insight-stat-row">
              <div>
                <strong>{analytics.tracked_cart_customers || 0}</strong>
                <span>cart customers</span>
              </div>
              <div>
                <strong>{analytics.purchasing_customers || 0}</strong>
                <span>purchasing customers</span>
              </div>
              <div>
                <strong>{analytics.tracked_cart_to_order_rate || 0}%</strong>
                <span>tracked rate</span>
              </div>
            </div>
            <p className="form-hint">
              This is not a site-wide conversion rate because anonymous page
              visits are not counted.
            </p>
            <div className="insight-stat-row">
              <div>
                <strong>{analytics.cod_cancellation_rate || 0}%</strong>
                <span>Demo cancellations</span>
              </div>
              <div>
                <strong>{analytics.cancelled_cod_orders || 0}</strong>
                <span>cancelled demo</span>
              </div>
              <div>
                <strong>{analytics.cod_orders || 0}</strong>
                <span>Demo orders</span>
              </div>
            </div>
          </div>
          <div className="admin-panel cart-recovery-panel">
            <div className="admin-panel-heading">
              <div>
                <p className="eyebrow">Recovery queue</p>
                <h2>Cart recovery signals</h2>
              </div>
              <span>{recovery.length} candidates</span>
            </div>
            {recovery.length ? (
              <div className="insight-list">
                {recovery.map((item) => (
                  <div className="recovery-row" key={item.customer_email}>
                    <span>
                      <strong>{item.customer_email}</strong>
                      <small>
                        {item.products.join(" · ") || "Product activity"} ·{" "}
                        {item.units_added} units
                      </small>
                    </span>
                    <b>{money(item.estimated_value)}</b>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                No signed-in cart activity is waiting for follow-up.
              </div>
            )}
            <p className="form-hint">
              Signals are based on signed-in cart additions with no completed
              order after the last activity; no automatic email is sent.
            </p>
          </div>
          </div>
        </section>
      )}
      <div className="admin-columns">
        <section className="admin-panel">
          <div className="admin-panel-heading">
            <p className="eyebrow">Latest activity</p>
            <span>{orders.length} orders</span>
          </div>
          {orders.slice(0, 6).map((order) => (
            <div
              className="admin-order-row"
              key={order.id}
              role="button"
              tabIndex={0}
              onClick={() => onNavigate("/admin/orders")}
              onKeyDown={(event) => {
                if (event.key === "Enter") onNavigate("/admin/orders");
              }}
            >
              <div>
                <strong>{order.order_number || order.id}</strong>
                <span>
                  {order.customer_name || order.customer_email || "Customer"}
                </span>
              </div>
              <div>
                <b>{money(order.total)}</b>
                <small className={`status-pill status-${order.status}`}>
                  {order.status || "pending"}
                </small>
              </div>
            </div>
          ))}
          {!orders.length && <div className="empty-state">No orders yet.</div>}
        </section>
        <section className="admin-panel">
          <div className="admin-panel-heading">
            <p className="eyebrow">Notifications</p>
            <span>{notifications.length} total</span>
          </div>
          {notifications.slice(0, 6).map((item) => (
            <div
              className={`admin-notification-row ${item.priority === "urgent" ? "urgent" : ""}`}
              key={item.id}
              role="button"
              tabIndex={0}
              onClick={() => onNavigate(notificationDestination(item))}
              onKeyDown={(event) => {
                if (event.key === "Enter")
                  onNavigate(notificationDestination(item));
              }}
            >
              <strong>{item.title || item.type}</strong>
              <span>{item.message || item.body || "New activity"}</span>
            </div>
          ))}
          {!notifications.length && (
            <div className="empty-state">No notifications yet.</div>
          )}
        </section>
      </div>
    </>
  );
}

function OrdersView({ orders, onOrderChanged }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [quickFilter, setQuickFilter] = useState("all");
  const [expanded, setExpanded] = useState("");
  const [drafts, setDrafts] = useState({});
  const [busyId, setBusyId] = useState("");
  const [message, setMessage] = useState("");
  const counts = useMemo(() => {
    const attention = orders.filter((order) => {
      const needsPaymentReview = ["pending", "failed"].includes(order.payment_status);
      const needsPacking = !["cancelled", "delivered"].includes(order.status) && order.packing_status !== "packed";
      return needsPaymentReview || needsPacking;
    }).length;
    return {
      all: orders.length,
      attention,
      transit: orders.filter((order) => order.status === "shipped").length,
      complete: orders.filter((order) => order.status === "delivered").length
    };
  }, [orders]);
  const filtered = useMemo(() => orders.filter((order) => {
    const haystack = `${order.order_number} ${order.customer_name} ${order.customer_email}`.toLowerCase();
    const matchesQuickFilter = quickFilter === "all"
      || (quickFilter === "attention" && (["pending", "failed"].includes(order.payment_status) || (!["cancelled", "delivered"].includes(order.status) && order.packing_status !== "packed")))
      || (quickFilter === "transit" && order.status === "shipped")
      || (quickFilter === "complete" && order.status === "delivered");
    return (!query || haystack.includes(query.toLowerCase())) && (status === "all" || order.status === status) && matchesQuickFilter;
  }), [orders, query, quickFilter, status]);
  const labels = { pending: "Pending", confirmed: "Confirmed", shipped: "Shipped", delivered: "Delivered", cancelled: "Cancelled", demo: "Demo recorded", paid: "Paid", failed: "Payment failed", refunded: "Refunded", not_required: "Not required" };
  const label = (value) => labels[value] || String(value || "Pending").replace(/_/g, " ");
  function draft(order) {
    return drafts[order.id] || {
      status: order.status || "pending",
      tracking_number: order.tracking_number || "",
      payment_status: order.payment_status || "demo",
      payment_reference: order.payment_reference || ""
    };
  }
  function changeDraft(order, field, value) { setDrafts((current) => ({ ...current, [order.id]: { ...draft(order), [field]: value } })); }
  async function save(order) {
    const values = draft(order);
    setBusyId(order.id); setMessage("");
    try {
      const response = await apiFetch(`/api/admin/orders/${encodeURIComponent(order.id)}`, { method: "PATCH", body: JSON.stringify(values) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Order could not be updated");
      onOrderChanged(data.order || { ...order, ...values });
      setDrafts((current) => ({ ...current, [order.id]: {
        status: data.order?.status || values.status,
        tracking_number: data.order?.tracking_number || values.tracking_number,
        payment_status: data.order?.payment_status || values.payment_status,
        payment_reference: data.order?.payment_reference || values.payment_reference
      } }));
      setMessage(`${data.order?.order_number || order.order_number || "Order"} updated.`);
    } catch (error) { setMessage(error.message); } finally { setBusyId(""); }
  }
  return <section className="admin-panel admin-wide-panel orders-workspace">
    <div className="admin-panel-heading orders-heading"><div><p className="eyebrow">Order workspace <span className="orders-live-dot" aria-hidden="true" /> Live queue</p><h2>Orders</h2><p className="muted">Follow every order from confirmation to delivery. Razorpay remains disabled until approval.</p></div><div className="orders-heading-meta"><span className="orders-auto-refresh"><i aria-hidden="true" /> Auto-refreshes every 30s</span><strong>{filtered.length}<small> showing</small></strong></div></div>
    <div className="orders-overview-grid" aria-label="Order overview">
      {[{ key: "all", label: "All orders", count: counts.all, tone: "blue", note: "Total queue" }, { key: "attention", label: "Needs attention", count: counts.attention, tone: "amber", note: "Packing or payment" }, { key: "transit", label: "In transit", count: counts.transit, tone: "violet", note: "Shipped orders" }, { key: "complete", label: "Completed", count: counts.complete, tone: "green", note: "Delivered orders" }].map((item) => <button type="button" key={item.key} className={`orders-overview-card tone-${item.tone} ${quickFilter === item.key ? "is-active" : ""}`} onClick={() => { setQuickFilter(item.key); setStatus("all"); }} aria-pressed={quickFilter === item.key}><span className="orders-overview-icon" aria-hidden="true"><i /></span><span><strong>{item.count}</strong><small>{item.label}</small><em>{item.note}</em></span><span className="orders-overview-arrow" aria-hidden="true">↗</span></button>)}
    </div>
    <div className="admin-filters orders-filter-bar"><label className="orders-search-field" htmlFor="adminOrderSearch"><span>Find an order</span><input id="adminOrderSearch" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Order number, customer, or email" /></label><label className="orders-status-field" htmlFor="adminOrderStatus"><span>Status</span><select id="adminOrderStatus" value={status} onChange={(event) => { setStatus(event.target.value); setQuickFilter("all"); }} aria-label="Filter orders by status"><option value="all">All statuses</option>{["pending", "confirmed", "shipped", "delivered", "cancelled"].map((value) => <option key={value} value={value}>{label(value)}</option>)}</select></label></div>
    {message && <p className="inline-note" role="status">{message}</p>}
    <div className="orders-results-heading"><span><strong>{filtered.length}</strong> {filtered.length === 1 ? "order" : "orders"} in view</span><small>Click an order to view details and edit its status</small></div>
    <div className="admin-order-list">{filtered.map((order, index) => {
      const values = draft(order); const isOpen = expanded === order.id; const orderStatus = order.status || "pending"; const paymentStatus = order.payment_status || "demo"; const isPacked = order.packing_status === "packed"; const itemCount = (order.items || []).reduce((total, item) => total + Number(item.quantity || 0), 0); const customer = order.customer_name || order.customer_email || "Customer"; const initials = customer.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "C"; const progressIndex = orderStatus === "cancelled" ? -1 : orderStatus === "delivered" ? 3 : orderStatus === "shipped" ? 2 : isPacked ? 1 : 0;
      return <article className={`admin-order-card order-status-${orderStatus} ${isOpen ? "is-expanded" : ""}`} key={order.id}>
         <button type="button" className="admin-order-card-summary" onClick={() => setExpanded(isOpen ? "" : order.id)} aria-expanded={isOpen}>
           <span className="admin-order-card-main"><span className="admin-order-index">{String(index + 1).padStart(2, "0")}</span><span className="admin-order-identity"><span className="admin-order-customer"><i>{initials}</i><strong>{customer}</strong></span><b>{order.order_number || order.id}</b><small>{order.created_at ? formatIST(order.created_at) : "Recent"} · {itemCount || (order.items || []).length || 0} item{itemCount === 1 ? "" : "s"}{order.order_type === "preorder" ? " · Pre-order" : ""}</small></span></span>
           <span className={`admin-order-progress ${orderStatus === "cancelled" ? "is-cancelled" : ""}`} aria-label={`Order progress: ${orderStatus === "cancelled" ? "cancelled" : label(orderStatus)}`}>{orderStatus === "cancelled" ? <span className="admin-order-progress-cancelled"><i>!</i><small>Order cancelled</small></span> : [{ key: "confirmed", text: orderStatus === "pending" ? "Pending" : "Confirmed" }, { key: "packed", text: "Packed" }, { key: "shipped", text: "Shipped" }, { key: "delivered", text: "Delivered" }].map((step, stepIndex) => <span className={`${stepIndex <= progressIndex ? "is-complete" : ""} ${stepIndex === progressIndex ? "is-current" : ""}`} key={step.key}><i>{stepIndex < progressIndex ? "✓" : stepIndex + 1}</i><small>{step.text}</small></span>)}</span>
           <span className="admin-order-card-side"><b>{money(order.total)}</b><span className="admin-order-status-stack"><small className={`status-pill status-${orderStatus}`}><i />{label(orderStatus)}</small><small className={`status-pill status-${paymentStatus}`}><i />Payment · {label(paymentStatus)}</small><small className={`status-pill ${isPacked ? "status-live" : "status-hold"}`}><i />{isPacked ? "Packed" : "Awaiting pack"}</small></span><span className="admin-order-open">{isOpen ? "Close details" : "View / edit"} <em aria-hidden="true">↗</em></span></span>
         </button>
         {isOpen && <div className="admin-order-card-details"><div className="admin-order-items">{(order.items || []).map((item, index) => <span key={`${order.id}-${index}`}>{item.name || item.product_name || item.id}{item.size ? ` · ${item.size}` : ""} × {item.quantity}</span>)}{order.shipping && <p className="muted">Ship to: {order.shipping.name || order.customer_name}, {order.shipping.city || ""}, {order.shipping.state || ""} {order.shipping.pin || ""}</p>}<p className="muted">Customer: {order.customer_email || "—"}{order.payment_updated_at ? ` · Payment updated ${formatIST(order.payment_updated_at)}` : ""}</p><p className="muted">Packing: {order.packing_status === "packed" ? `Packed ${order.packed_at ? formatIST(order.packed_at) : ""}${order.packed_by ? ` by ${order.packed_by}` : ""}` : "Awaiting employee confirmation"}</p><a className="text-link" href={`/api/orders/${encodeURIComponent(order.id)}/invoice`} target="_blank" rel="noreferrer">Open GST invoice preview ↗</a></div><div className="admin-order-edit"><label>Fulfilment status<select value={values.status} onChange={(event) => changeDraft(order, "status", event.target.value)} disabled={order.status === "cancelled"}><option value="pending">Pending</option><option value="confirmed">Confirmed</option><option value="shipped">Shipped</option><option value="delivered">Delivered</option><option value="cancelled">Cancelled</option></select></label><label>Payment state<select value={values.payment_status} onChange={(event) => changeDraft(order, "payment_status", event.target.value)}><option value="demo">Demo recorded</option><option value="pending">Pending provider</option><option value="paid">Marked paid</option><option value="failed">Failed</option><option value="refunded">Refunded</option><option value="not_required">Not required</option></select></label><label>Payment reference <span className="form-hint">optional · never enter a secret</span><input value={values.payment_reference} onChange={(event) => changeDraft(order, "payment_reference", event.target.value)} maxLength="160" placeholder="Future Razorpay payment/order ID" /></label><label>Tracking number <span className="form-hint">optional</span><input value={values.tracking_number} onChange={(event) => changeDraft(order, "tracking_number", event.target.value)} maxLength="80" placeholder="Assign courier tracking" /></label>{message && <p className={message.includes("updated") ? "inline-note" : "inline-error"} role="status">{message}</p>}<button className="primary-action" type="button" disabled={busyId === order.id} onClick={() => save(order)}>{busyId === order.id ? "Saving…" : "Save order"} <span aria-hidden="true">↗</span></button></div></div>}
      </article>;
    })}{!filtered.length && <div className="empty-state">No matching orders.</div>}</div>
  </section>;
}

function ProductsView({ products, onNavigate }) {
  return <section className="admin-panel admin-wide-panel"><div className="admin-panel-heading"><div><p className="eyebrow">Catalog visibility</p><h2>Products</h2></div><span>{products.length} listings</span></div><div className="admin-product-grid">{products.slice(0, 24).map((product) => <article className="admin-product-card" key={product.id}>{product.thumbnail_url || product.image_url ? <img src={product.thumbnail_url || product.image_url} alt="" loading="lazy" /> : <div className="admin-product-placeholder" />}<div><strong>{product.name}</strong><span>{product.category || "Uncategorized"} · {money(product.price)}</span><small className={`status-pill status-${product.status}`}>{product.status || "on hold"}</small></div></article>)}</div>{!products.length && <div className="empty-state">No listings found.</div>}<button className="primary-action admin-inline-action" type="button" onClick={() => onNavigate("/admin/products")}>Open product controls <span aria-hidden="true">↗</span></button></section>;
}

function ListingFormFields({ form, categories, availableSubcategories, onChange, onSizesChange, onTaxChange, sizes, sizeStock, setSizeStock, totalStock, hasSizeStock = true, legacyStock, setLegacyStock, imageItems, thumbnailSourceUrl, onImagesChange, onUploadImages, uploading, uploadSizeChart, variants, setVariants, setUploading, setStatus, copyBusy, busy, generateSpecifications, generateDescription, copyStatus }) {
  return <><div className="admin-form-grid"><label>Product name<input name="name" value={form.name} onChange={onChange} required /></label><label>Brand<input name="brand" value={form.brand} onChange={onChange} required /></label><label>Category<select name="category" value={form.category} onChange={onChange} required><option value="">Choose category</option>{categories.map((category) => <option key={category} value={category}>{category}</option>)}</select></label><label>Subcategory <span className="form-hint">optional</span><select name="subcategory" value={form.subcategory} onChange={onChange}><option value="">None</option>{availableSubcategories.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}</select></label><label>Colour<input name="color" value={form.color} onChange={onChange} required /></label><label>Material<input name="material" value={form.material} onChange={onChange} required /></label><label>Price (₹)<input name="price" type="number" min="1" value={form.price} onChange={onChange} required /></label><label>MRP (₹)<input name="mrp" type="number" min="1" value={form.mrp} onChange={onChange} required /></label><label>Cost price (₹)<input name="cost_price" type="number" min="0" value={form.cost_price} onChange={onChange} /></label></div><TaxCodePicker code={form.hsn_sac_code} type={form.hsn_sac_type} rate={form.gst_rate} price={form.price} mrp={form.mrp} taxInclusive={form.gst_tax_inclusive} context={[form.name, form.category, form.subcategory, form.material, form.description].join(" ")} onChange={onTaxChange} /><label>Sizes <span className="form-hint">comma separated</span><input name="sizes" value={form.sizes} onChange={onSizesChange} required /></label>{hasSizeStock ? <div className="size-stock-editor"><div className="listing-subheading"><strong>Stock by size</strong><span>{totalStock} total units</span></div>{sizes.map((size) => <label key={size}>{size}<input type="number" min="0" value={sizeStock[size] ?? 0} onChange={(event) => setSizeStock((current) => ({ ...current, [size]: event.target.value }))} /></label>)}</div> : <label>Total stock <span className="form-hint">This listing has no per-size stock map yet.</span><input type="number" min="0" value={legacyStock} onChange={(event) => setLegacyStock(event.target.value)} /></label>}<ImageManager value={imageItems} thumbnailUrl={thumbnailSourceUrl} onChange={onImagesChange} onUpload={onUploadImages} uploading={uploading} min={4} max={6} label="Product images" /><div className="admin-form-grid"><label>Reorder point<input name="reorder_point" type="number" min="0" value={form.reorder_point} onChange={onChange} /></label></div><div className="preorder-react-block"><label className="merch-checkbox"><input name="preorder_enabled" type="checkbox" checked={form.preorder_enabled} onChange={(event) => onChange({ target: { name: "preorder_enabled", value: event.target.checked } })} /> Enable pre-order</label>{form.preorder_enabled && <div className="admin-form-grid"><label>Release date <span className="form-hint">optional</span><input name="preorder_release_at" type="datetime-local" value={form.preorder_release_at} onChange={onChange} /></label><label>Pre-order limit <span className="form-hint">optional</span><input name="preorder_limit" type="number" min="1" value={form.preorder_limit} onChange={onChange} /></label></div>}</div><label>Size chart URL <span className="form-hint">optional</span><input name="size_chart_url" type="url" value={form.size_chart_url} onChange={onChange} placeholder="https://…" /></label><label className="upload-button secondary">Upload size chart from PC<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={uploadSizeChart} /></label><VariantEditor variants={variants} setVariants={setVariants} setUploading={setUploading} setStatus={setStatus} uploading={uploading} /><div className="listing-copy-assistant"><div><p className="eyebrow">Content assistant</p><strong>Generate product copy</strong><span>Builds an editable draft from the listing details you have entered.</span></div><div className="listing-copy-actions"><button className="secondary-action" type="button" onClick={generateSpecifications} disabled={copyBusy || busy || uploading}>{copyBusy === "specifications" ? "Generating…" : "Generate specifications"} <span aria-hidden="true">✦</span></button><button className="secondary-action" type="button" onClick={generateDescription} disabled={copyBusy || busy || uploading}>{copyBusy === "description" ? "Generating…" : "Generate description"} <span aria-hidden="true">✦</span></button></div></div>{copyStatus && <p className="form-hint" role="status">{copyStatus}</p>}<div className="admin-form-grid listing-copy-grid"><label>Product specifications <span className="form-hint">editable · one item per line</span><textarea name="specifications" rows="7" value={form.specifications} onChange={onChange} placeholder="Generate a draft or add specifications manually." /></label><label>Description<textarea name="description" rows="7" value={form.description} onChange={onChange} required placeholder="Generate a draft or write a product description." /></label></div></>;
}

function normalizeVariantDrafts(variants) {
  return variants.map((variant) => {
    const variantSizes = variant.sizes.split(",").map((size) => size.trim()).filter(Boolean);
    const variantItems = variantImageItems(variant);
    const variantImages = variantItems.map((image) => image.url).filter(Boolean);
    if (!variant.color.trim()) throw new Error("Each colourway needs a colour.");
    if (!variantSizes.length) throw new Error(`Add sizes for ${variant.color}.`);
    if (variantImages.length < 4 || variantImages.length > 8) throw new Error("Each colourway needs 4–8 images.");
    const size_stock = Object.fromEntries(variantSizes.map((size) => [size, Math.max(0, Number(variant.sizeStock?.[size] || 0))]));
    const thumbnail = variantItems.find((image) => image.url === variant.thumbnailSourceUrl) || variantItems[0];
    return { color: variant.color.trim(), sizes: variantSizes, stock: Object.values(size_stock).reduce((sum, value) => sum + value, 0), images: variantImages, size_stock, thumbnail_source_url: thumbnail?.url || variantImages[0], thumbnail_images: [thumbnail?.thumbnailUrl || thumbnail?.url || variantImages[0]], image_keys: variantItems.map((image) => image.key || assetKeyFromUrl(image.url)).filter(Boolean), thumbnail_keys: thumbnail?.thumbnailKey ? [thumbnail.thumbnailKey] : [] };
  });
}

function listingCopyDraft(form) {
  const name = String(form.name || "This piece").trim();
  const brand = String(form.brand || "Glamia").trim();
  const category = String(form.category || "fashion").trim();
  const type = String(form.subcategory || "wardrobe piece").trim();
  const color = String(form.color || "").trim();
  const material = String(form.material || "").trim();
  const sizes = String(form.sizes || "").split(",").map((size) => size.trim()).filter(Boolean);
  const availableSizes = sizes.join(", ");
  const subject = [color, name].filter(Boolean).join(" ");
  const specifications = [
    `Product: ${name}`,
    `Brand: ${brand}`,
    `Category: ${category}`,
    form.subcategory ? `Type: ${type}` : "",
    color ? `Colour: ${color}` : "",
    material ? `Material: ${material}` : "",
    availableSizes ? `Available sizes: ${availableSizes}` : ""
  ].filter(Boolean).join("\n");
  const categoryContext = category && category.toLowerCase() !== "fashion" ? ` from the ${category.toLowerCase()} edit` : "";
  const description = `${subject} from ${brand} is a ${type.toLowerCase()}${categoryContext}, designed for considered everyday styling. ${material ? `Crafted in ${material}${color ? ` in ${color}` : ""}, ` : color ? `Presented in ${color}, ` : ""}it brings a polished finish to your wardrobe${availableSizes ? ` and is available in ${availableSizes}` : ""}.`;
  return { specifications, description };
}

function EditProductForm({ product, categories, subcategories, onSave, onCancel }) {
  const [form, setForm] = useState({ name: product.name || "", brand: product.brand || "", category: product.category || "", subcategory: product.subcategory || "", color: product.color || "", material: product.material || "", price: product.price || "", mrp: product.mrp || "", cost_price: product.cost_price || "", hsn_sac_code: product.hsn_sac_code || "", hsn_sac_type: product.hsn_sac_type || "HSN", gst_rate: product.gst_rate ?? "", gst_tax_inclusive: product.gst_tax_inclusive !== false, reorder_point: product.reorder_point ?? 15, sizes: (product.sizes || []).join(", "), images: (product.images || [product.image_url]).filter(Boolean).join("\n"), specifications: product.specifications || "", description: product.description || "", preorder_enabled: Boolean(product.preorder_enabled), preorder_release_at: product.preorder_release_at ? new Date(product.preorder_release_at).toISOString().slice(0, 16) : "", preorder_limit: product.preorder_limit ?? "", size_chart_url: product.size_chart_url || "" });
  const [imageItems, setImageItems] = useState(() => productImageItems(product));
  const [thumbnailSourceUrl, setThumbnailSourceUrl] = useState(() => product.thumbnail_source_url || productImageItems(product)[0]?.url || "");
  const [variants, setVariants] = useState(() => (Array.isArray(product.variants) ? product.variants : []).map((variant) => ({ color: variant.color || "", sizes: Array.isArray(variant.sizes) ? variant.sizes.join(", ") : String(variant.sizes || "S, M, L"), sizeStock: { ...(variant.size_stock || variant.sizeStock || {}) }, images: Array.isArray(variant.images) ? variant.images.join("\n") : String(variant.images || ""), assets: variant.assets || [], thumbnailSourceUrl: variant.thumbnail_source_url || variant.thumbnailSourceUrl || "" })));
  const [sizeStock, setSizeStock] = useState({ ...(product.size_stock || {}) });
  const [legacyStock, setLegacyStock] = useState(Number(product.stock || 0));
  const hasSizeStock = Object.keys(product.size_stock || {}).length > 0;
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState("");
  const [copyBusy, setCopyBusy] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const availableSubcategories = subcategories.filter((item) => item.category === form.category);
  const sizes = form.sizes.split(",").map((size) => size.trim()).filter(Boolean);
  const totalStock = hasSizeStock ? Object.values(sizeStock).reduce((sum, value) => sum + Number(value || 0), 0) : legacyStock;
  function generateCopy(field) {
    setCopyBusy(field);
    setCopyStatus("");
    const draft = listingCopyDraft(form);
    setForm((current) => ({ ...current, [field]: draft[field] }));
    setCopyStatus(`${field === "specifications" ? "Specifications" : "Description"} draft generated — review and edit it before saving the listing.`);
    setCopyBusy("");
  }
  function change(event) { setForm((current) => ({ ...current, [event.target.name]: event.target.value })); }
  function changeSizes(event) {
    const value = event.target.value;
    const sizes = value.split(",").map((size) => size.trim()).filter(Boolean);
    setForm((current) => ({ ...current, sizes: value }));
    setSizeStock((current) => Object.fromEntries(sizes.map((size) => [size, current[size] ?? 0])));
  }
  async function uploadImages(files) {
    if (!files.length) return;
    setUploading(true);
    try {
      const assets = [];
      for (const file of files) assets.push(await uploadProductImage(file));
      return assets;
    } catch (error) { setStatus(error.message); return []; } finally { setUploading(false); }
  }
  function changeImages({ images, thumbnailUrl }) {
    setImageItems(images);
    setThumbnailSourceUrl(thumbnailUrl || images[0]?.url || "");
    setForm((current) => ({ ...current, images: images.map((image) => image.url).join("\n") }));
  }
  async function uploadSizeChart(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try { const asset = await uploadProductAsset(file, "product-size-chart"); setForm((current) => ({ ...current, size_chart_url: asset.imageUrl })); }
    catch (error) { setStatus(error.message); } finally { setUploading(false); event.target.value = ""; }
  }
  async function submit(event) {
    event.preventDefault(); setBusy(true); setStatus("");
    try {
      const sizes = form.sizes.split(",").map((size) => size.trim()).filter(Boolean);
      const images = imageItems.map((image) => image.url).filter(Boolean);
      const normalizedVariants = normalizeVariantDrafts(variants);
      const normalizedSizeStock = Object.fromEntries(sizes.map((size) => [size, Math.max(0, Number(sizeStock[size] || 0))]));
      const totalStock = hasSizeStock ? Object.values(normalizedSizeStock).reduce((sum, value) => sum + value, 0) : Math.max(0, Number(legacyStock || 0));
      if (!sizes.length) throw new Error("Add at least one size.");
      const originalImages = product.images || [product.image_url];
      const imagesChanged = JSON.stringify(images) !== JSON.stringify(originalImages);
      if (imagesChanged && (images.length < 4 || images.length > 6)) throw new Error("Keep between 4 and 6 product images.");
      const stockChanged = totalStock !== Number(product.stock || 0) || JSON.stringify(normalizedSizeStock) !== JSON.stringify(product.size_stock || {});
      const selectedThumbnail = imageItems.find((image) => image.url === thumbnailSourceUrl) || imageItems[0];
      const thumbnailChanged = thumbnailSourceUrl !== (product.thumbnail_source_url || (product.images || [product.image_url]).filter(Boolean)[0]);
      const imagePatchNeeded = imagesChanged || thumbnailChanged;
      const formPayload = { ...form };
      if (!imagePatchNeeded) delete formPayload.images;
       const response = await apiFetch(`/api/admin/products/${encodeURIComponent(product.id)}`, { method: "PATCH", body: JSON.stringify({ ...formPayload, sizes, price: Number(form.price), mrp: Number(form.mrp), cost_price: Number(form.cost_price || 0), variants: normalizedVariants, ...(stockChanged ? { stock: totalStock, ...(hasSizeStock ? { size_stock: normalizedSizeStock } : {}) } : {}), reorder_point: Number(form.reorder_point || 0), ...(imagePatchNeeded ? { ...(imagesChanged ? { images } : {}), image_keys: imageItems.map((image) => image.key || assetKeyFromUrl(image.url)).filter(Boolean), thumbnail_source_url: selectedThumbnail?.url || images[0], thumbnail_urls: [selectedThumbnail?.thumbnailUrl || selectedThumbnail?.url || images[0]], thumbnail_keys: selectedThumbnail?.thumbnailKey ? [selectedThumbnail.thumbnailKey] : [] } : {}), preorder_release_at: form.preorder_release_at ? new Date(form.preorder_release_at).toISOString() : null, preorder_limit: form.preorder_limit === "" ? null : Number(form.preorder_limit) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Product could not be saved");
       onSave(data.product || { ...product, ...form, sizes, images, variants: normalizedVariants, size_stock: normalizedSizeStock, stock: totalStock });
    } catch (error) { setStatus(error.message); } finally { setBusy(false); }
  }
  return <form className="admin-listing-form admin-edit-product-form" onSubmit={submit}><div className="admin-panel-heading"><div><p className="eyebrow">Catalog editor</p><h3>Edit listing</h3></div><button type="button" className="secondary-action" onClick={onCancel}>Close</button></div><ListingFormFields form={form} categories={categories} availableSubcategories={availableSubcategories} onChange={change} onSizesChange={changeSizes} onTaxChange={(next) => setForm((current) => ({ ...current, ...next }))} sizes={sizes} sizeStock={sizeStock} setSizeStock={setSizeStock} totalStock={totalStock} hasSizeStock={hasSizeStock} legacyStock={legacyStock} setLegacyStock={setLegacyStock} imageItems={imageItems} thumbnailSourceUrl={thumbnailSourceUrl} onImagesChange={changeImages} onUploadImages={uploadImages} uploading={uploading} uploadSizeChart={uploadSizeChart} variants={variants} setVariants={setVariants} setUploading={setUploading} setStatus={setStatus} copyBusy={copyBusy} busy={busy} generateSpecifications={() => generateCopy("specifications")} generateDescription={() => generateCopy("description")} copyStatus={copyStatus} /><div className="listing-form-actions"><button className="primary-action" type="submit" disabled={busy || uploading}>{busy ? "Saving…" : uploading ? "Uploading…" : "Save listing"} <span aria-hidden="true">↗</span></button><button className="secondary-action" type="button" onClick={onCancel}>Cancel</button></div></form>;
}

function VariantEditor({ variants, setVariants, setUploading, setStatus, uploading = false }) {
  function update(index, field, value) { setVariants((current) => current.map((variant, itemIndex) => itemIndex === index ? { ...variant, [field]: value } : variant)); }
  function updateSizes(index, value) {
    const sizes = value.split(",").map((size) => size.trim()).filter(Boolean);
    setVariants((current) => current.map((variant, itemIndex) => itemIndex === index ? { ...variant, sizes: value, sizeStock: Object.fromEntries(sizes.map((size) => [size, variant.sizeStock?.[size] ?? 0])) } : variant));
  }
  function updateImages(index, { images, thumbnailUrl }) {
    setVariants((current) => current.map((variant, itemIndex) => itemIndex === index ? {
      ...variant,
      images: images.map((image) => image.url).join("\n"),
      assets: images.filter((image) => image.key || image.thumbnailUrl).map((image) => image),
      thumbnailSourceUrl: thumbnailUrl || images[0]?.url || ""
    } : variant));
  }
  async function uploadImages(index, files) {
    if (!files.length) return;
    setUploading(true); setStatus("");
    try {
      const existing = variantImageItems(variants[index] || {}).length;
      const assets = [];
      for (const file of files) {
        if (existing + assets.length >= 8) break;
        assets.push(await uploadProductImage(file));
      }
      return assets;
    } catch (error) { setStatus(error.message); return []; } finally { setUploading(false); }
  }
  function add() { setVariants((current) => [...current, { color: "", sizes: "S, M, L", sizeStock: { S: 0, M: 0, L: 0 }, images: "", assets: [], thumbnailSourceUrl: "" }]); }
  function remove(index) { setVariants((current) => current.filter((_, itemIndex) => itemIndex !== index)); }
  return <fieldset className="variant-react-block"><legend>Colourways</legend><p className="form-hint">Each colourway becomes a linked listing with its own sizes, per-size stock, and 4–8 images.</p>{variants.map((variant, index) => { const sizes = variant.sizes.split(",").map((size) => size.trim()).filter(Boolean); const total = sizes.reduce((sum, size) => sum + Math.max(0, Number(variant.sizeStock?.[size] || 0)), 0); const images = variantImageItems(variant); return <article className="variant-react-card" key={`variant-${index}`}><div className="variant-react-heading"><strong>Colourway {index + 1}</strong><button type="button" className="danger-action" onClick={() => remove(index)}>Remove</button></div><div className="admin-form-grid"><label>Colour<input value={variant.color} onChange={(event) => update(index, "color", event.target.value)} required /></label><label>Sizes<input value={variant.sizes} onChange={(event) => updateSizes(index, event.target.value)} required /></label></div><div className="variant-size-stock"><div className="listing-subheading"><strong>Stock by size</strong><span>{total} total units</span></div>{sizes.map((size) => <label key={`${index}-${size}`}>{size}<input type="number" min="0" value={variant.sizeStock?.[size] ?? 0} onChange={(event) => setVariants((current) => current.map((entry, itemIndex) => itemIndex === index ? { ...entry, sizeStock: { ...(entry.sizeStock || {}), [size]: event.target.value } } : entry))} /></label>)}</div><ImageManager value={images} thumbnailUrl={variant.thumbnailSourceUrl || images[0]?.url || ""} onChange={(next) => updateImages(index, next)} onUpload={(files) => uploadImages(index, files)} uploading={uploading} min={4} max={8} label="Colourway images" /></article>; })}<button type="button" className="secondary-action" onClick={add}>Add colourway</button></fieldset>;
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
      if (!response.ok) throw new Error([data.error, ...(Array.isArray(data.issues) ? data.issues.map((issue) => `• ${issue}`) : [])].filter(Boolean).join("\n"));
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
  return <section className="admin-panel admin-wide-panel inventory-workspace"><div className="admin-panel-heading"><div><p className="eyebrow">Stock control</p><h2>Inventory by size</h2><p className="muted">Monitor live availability and adjust each size without losing the product-level view.</p></div><span>{activeProducts.length} active listings</span></div>{message && <p className="inline-note" role="status">{message}</p>}<div className="inventory-live-summary"><article><span className="inventory-summary-icon"><Icon name="check" size={18} /></span><div><small>Available units</small><strong>{totalUnits}</strong></div><em>Live total</em></article><article className={lowStockCount ? "has-alert" : ""}><span className="inventory-summary-icon"><Icon name="bell" size={18} /></span><div><small>Low stock</small><strong>{lowStockCount}</strong></div><em>Needs attention</em></article><article className={outOfStockCount ? "has-alert is-out" : ""}><span className="inventory-summary-icon"><Icon name="close" size={18} /></span><div><small>Out of stock</small><strong>{outOfStockCount}</strong></div><em>Unavailable now</em></article></div><div className="inventory-table inventory-live-feed">{activeProducts.map((product) => { const stock = Number(product.stock || 0); const threshold = Number(product.reorder_point || 15); const sizeStock = stockFor(product); const sizes = product.sizes?.length ? product.sizes : Object.keys(sizeStock); const meter = threshold > 0 ? Math.min(100, Math.round((stock / Math.max(threshold * 3, stock, 1)) * 100)) : stock > 0 ? 100 : 0; return (
    <article
      className={
        "inventory-row inventory-live-card" +
        (stock === 0 ? " is-out" : stock <= threshold ? " is-low" : "")
      }
      key={product.id}
    >
      <div className="inventory-live-card-main">
        <div className="inventory-live-card-heading">
          <div>
            <span className="inventory-live-kicker">
              <i />
              Live inventory
            </span>
            <strong>{product.name}</strong>
            <span>
              {product.category || "Uncategorized"}
              {product.color ? " · " + product.color : ""}
            </span>
          </div>
          <div className="inventory-live-total">
            <strong>{stock}</strong>
            <small>units</small>
          </div>
        </div>
        <progress
          className="inventory-stock-meter"
          aria-label={stock + " units available for " + product.name}
          value={meter}
          max="100"
        >
          {meter}%
        </progress>
        <div className="inventory-size-editor">
          {sizes.length ? (
            sizes.map((size) => (
              <label key={size}>
                <span>{size}</span>
                <input
                  aria-label={product.name + " size " + size + " stock"}
                  type="number"
                  min="0"
                  value={sizeStock[size] ?? 0}
                  disabled={busyId === product.id}
                  onChange={(event) =>
                    changeSize(product, size, event.target.value)
                  }
                />
              </label>
            ))
          ) : (
            <span className="muted">No sizes configured</span>
          )}
        </div>
      </div>
      <div className="inventory-row-actions">
        <span className="inventory-status">
          {stock === 0
            ? "Out of stock"
            : stock <= threshold
              ? "Low stock · threshold " + threshold
              : "Healthy stock"}
        </span>
        <button
          className="secondary-action"
          type="button"
          disabled={busyId === product.id || !sizes.length}
          onClick={() => saveStock(product)}
        >
          {busyId === product.id ? "Saving…" : "Save stock"}{" "}
          <Icon name="check" size={15} />
        </button>
      </div>
    </article>
  ); })}{!activeProducts.length && <div className="empty-state">No products found.</div>}</div></section>;
}

function AddListingView({ categories, subcategories, onNavigate }) {
  const [form, setForm] = useState({ name: "", category: "", subcategory: "", brand: "", color: "", price: "", mrp: "", cost_price: "", material: "", hsn_sac_code: "", hsn_sac_type: "HSN", gst_rate: "", gst_tax_inclusive: true, specifications: "", description: "", sizes: "S, M, L", images: "", reorder_point: "15", preorder_enabled: false, preorder_release_at: "", preorder_limit: "", size_chart_url: "" });
  const [imageItems, setImageItems] = useState([]);
  const [thumbnailSourceUrl, setThumbnailSourceUrl] = useState("");
  const [variants, setVariants] = useState([]);
  const [sizeStock, setSizeStock] = useState({ S: 0, M: 0, L: 0 });
  const [status, setStatus] = useState(""); const [busy, setBusy] = useState(false); const [uploading, setUploading] = useState(false); const [copyBusy, setCopyBusy] = useState(""); const [copyStatus, setCopyStatus] = useState("");
  const availableSubcategories = subcategories.filter((item) => item.category === form.category);
  const sizes = form.sizes.split(",").map((size) => size.trim()).filter(Boolean);
  const totalStock = sizes.reduce((sum, size) => sum + Math.max(0, Number(sizeStock[size] || 0)), 0);

  function generateCopy(field) {
    setCopyBusy(field);
    setCopyStatus("");
    const draft = listingCopyDraft(form);
    setForm((current) => ({ ...current, [field]: draft[field] }));
    setCopyStatus(`${field === "specifications" ? "Specifications" : "Description"} draft generated — review and edit it before creating the listing.`);
    setCopyBusy("");
  }

  function changeField(event) { setForm((current) => ({ ...current, [event.target.name]: event.target.value })); }
  function changeSizes(event) {
    const next = event.target.value;
    setForm((current) => ({ ...current, sizes: next, subcategory: current.subcategory }));
    setSizeStock((current) => Object.fromEntries(next.split(",").map((size) => size.trim()).filter(Boolean).map((size) => [size, current[size] ?? 0])));
  }
  async function uploadImages(files) {
    if (!files.length) return;
    setUploading(true); setStatus("");
    try {
      const assets = [];
      for (const file of files) {
        if (assets.length + imageItems.length >= 6) break;
        assets.push(await uploadProductImage(file));
      }
      return assets;
    } catch (error) { setStatus(error.message); return []; } finally { setUploading(false); }
  }
  function changeImages({ images, thumbnailUrl }) {
    setImageItems(images);
    setThumbnailSourceUrl(thumbnailUrl || images[0]?.url || "");
    setForm((current) => ({ ...current, images: images.map((image) => image.url).join("\n") }));
  }
  async function uploadSizeChart(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true); setStatus("");
    try { const asset = await uploadProductAsset(file, "product-size-chart"); setForm((current) => ({ ...current, size_chart_url: asset.imageUrl })); }
    catch (error) { setStatus(error.message); } finally { setUploading(false); event.target.value = ""; }
  }
  async function submit(event) {
    event.preventDefault(); setBusy(true); setStatus("");
    try {
      const images = imageItems.map((image) => image.url).filter(Boolean);
       if (images.length < 4 || images.length > 6) throw new Error("Add between 4 and 6 image URLs.");
       if (!sizes.length) throw new Error("Add at least one size.");
       const normalizedVariants = normalizeVariantDrafts(variants);
       const thumbnail = imageItems.find((image) => image.url === thumbnailSourceUrl) || imageItems[0];
       const response = await apiFetch("/api/products", { method: "POST", body: JSON.stringify({ ...form, price: Number(form.price), mrp: Number(form.mrp), cost_price: Number(form.cost_price || 0), stock: totalStock, reorder_point: Number(form.reorder_point || 15), sizes, size_stock: Object.fromEntries(sizes.map((size) => [size, Math.max(0, Number(sizeStock[size] || 0))])), images, image_keys: imageItems.map((image) => image.key || assetKeyFromUrl(image.url)).filter(Boolean), thumbnail_source_url: thumbnail?.url || images[0], thumbnail_urls: [thumbnail?.thumbnailUrl || thumbnail?.url || images[0]], thumbnail_keys: thumbnail?.thumbnailKey ? [thumbnail.thumbnailKey] : [], preorder_release_at: form.preorder_release_at ? new Date(form.preorder_release_at).toISOString() : null, preorder_limit: form.preorder_limit === "" ? null : Number(form.preorder_limit), variants: normalizedVariants }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Listing could not be created");
      setStatus("Listing created and placed on hold for review.");
       setForm({ name: "", category: categories[0] || "", subcategory: "", brand: "", color: "", price: "", mrp: "", cost_price: "", material: "", hsn_sac_code: "", hsn_sac_type: "HSN", gst_rate: "", gst_tax_inclusive: true, specifications: "", description: "", sizes: "S, M, L", images: "", reorder_point: "15", preorder_enabled: false, preorder_release_at: "", preorder_limit: "", size_chart_url: "" });
       setImageItems([]);
       setThumbnailSourceUrl("");
       setVariants([]);
       setSizeStock({ S: 0, M: 0, L: 0 });
       setCopyStatus("");
    } catch (error) { setStatus(error.message); } finally { setBusy(false); }
  }

  return <section className="admin-panel admin-wide-panel"><div className="admin-panel-heading"><div><p className="eyebrow">Catalog creation</p><h2>Add listing</h2></div><span>New listings start on hold</span></div><form className="admin-listing-form" onSubmit={submit}><ListingFormFields form={form} categories={categories} availableSubcategories={availableSubcategories} onChange={changeField} onSizesChange={changeSizes} onTaxChange={(next) => setForm((current) => ({ ...current, ...next }))} sizes={sizes} sizeStock={sizeStock} setSizeStock={setSizeStock} totalStock={totalStock} imageItems={imageItems} thumbnailSourceUrl={thumbnailSourceUrl} onImagesChange={changeImages} onUploadImages={uploadImages} uploading={uploading} uploadSizeChart={uploadSizeChart} variants={variants} setVariants={setVariants} setUploading={setUploading} setStatus={setStatus} copyBusy={copyBusy} busy={busy} generateSpecifications={() => generateCopy("specifications")} generateDescription={() => generateCopy("description")} copyStatus={copyStatus} /><div className="listing-form-actions"><button className="primary-action" type="submit" disabled={busy || uploading}>{busy ? "Creating…" : uploading ? "Uploading…" : "Create listing"} <span aria-hidden="true">↗</span></button><button className="secondary-action" type="button" onClick={() => onNavigate("/admin/products")}>Cancel</button></div></form></section>;
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
  const [dashboard, setDashboard] = useState(null); const [orders, setOrders] = useState([]); const [notifications, setNotifications] = useState([]); const [unreadCount, setUnreadCount] = useState(0); const [products, setProducts] = useState([]); const [categories, setCategories] = useState([]); const [subcategories, setSubcategories] = useState([]); const [error, setError] = useState(""); const [errorRoute, setErrorRoute] = useState(""); const [loadedRoute, setLoadedRoute] = useState("");
  useEffect(() => {
    let active = true;
    const needs = ADMIN_SECTION_DATA[route] || {};
    async function loadAdminData() {
      const requestEntries = [];
      const addRequest = (key, input) => requestEntries.push([key, apiFetch(input, { cacheTtl: ADMIN_CACHE_TTLS[key] || 0 })]);
      if (needs.dashboard) addRequest("dashboard", "/api/admin/dashboard");
      if (needs.notifications) addRequest("notifications", "/api/admin/notifications");
      else addRequest("notificationCount", "/api/admin/notifications/count");
      if (needs.orders) addRequest("orders", "/api/orders?scope=admin");
      if (needs.products) addRequest("products", "/api/products?scope=admin");
      if (needs.categories) addRequest("categories", "/api/categories");
      const responses = await Promise.all(requestEntries.map(([, request]) => request));
      const responseData = {};
      for (let index = 0; index < requestEntries.length; index += 1) {
        const [key] = requestEntries[index];
        const response = responses[index];
        responseData[key] = response.ok ? await response.json() : {};
      }
      const dashboardIndex = requestEntries.findIndex(([key]) => key === "dashboard");
      if (needs.dashboard && !responses[dashboardIndex]?.ok) {
        throw new Error(responseData.dashboard?.error || "Admin access required");
      }
      if (!active) return;
      if (needs.dashboard) setDashboard(responseData.dashboard || null);
      if (needs.notifications) {
        setNotifications(responseData.notifications?.notifications || []);
        setUnreadCount(Number(responseData.notifications?.unread_count || 0));
      } else {
        setUnreadCount(Number(responseData.notificationCount?.unread_count || 0));
      }
      if (needs.orders) setOrders(responseData.orders?.orders || []);
      if (needs.products) setProducts(responseData.products?.products || []);
      if (needs.categories) {
        setCategories(responseData.categories?.categories || []);
        setSubcategories(responseData.categories?.subcategories || []);
      }
      setError("");
    }
    const reportError = (requestError) => {
      if (!active) return;
      setError(requestError.message);
      setErrorRoute(route);
    };
    loadAdminData().catch(reportError).finally(() => active && setLoadedRoute(route));
    if (!ADMIN_POLL_ROUTES.has(route)) return () => { active = false; };
    const refreshTimer = window.setInterval(() => loadAdminData().catch(reportError), 30000);
    return () => { active = false; window.clearInterval(refreshTimer); };
  }, [route]);
  function changeProduct(next) { setProducts((current) => current.map((product) => product.id === next.id ? { ...product, ...next } : product)); }
  function changeOrder(next) { setOrders((current) => current.map((order) => order.id === next.id ? { ...order, ...next } : order)); }
  function changeNotifications(update) { setNotifications(update); }
  function removeProduct(id) { setProducts((current) => current.filter((product) => product.id !== id)); }
  async function refreshCatalog() { const response = await apiFetch("/api/categories", { cacheTtl: ADMIN_CACHE_TTLS.categories }); const data = await response.json(); if (response.ok) { setCategories(data.categories || []); setSubcategories(data.subcategories || []); } }
  const loading = loadedRoute !== route;
  return <AdminShell route={route} onNavigate={onNavigate} notifications={notifications} unreadCount={unreadCount}>{error && errorRoute === route ? <section className="admin-panel admin-wide-panel"><p className="eyebrow">Admin access</p><h2>{error}</h2><p className="muted">Use the sign-in page to continue.</p><button className="primary-action" type="button" onClick={() => onNavigate("/login")}>Open admin sign-in <span aria-hidden="true">↗</span></button></section> : loading ? <div className="loading-card">Preparing your console…</div> : route === "/admin" ? <DashboardView dashboard={dashboard} orders={orders} notifications={notifications} onNavigate={onNavigate} /> : route === "/admin/storefront" ? <StorefrontSettingsView /> : route === "/admin/labels" ? <LabelsView orders={orders} /> : route === "/admin/hero" ? <HeroStudioView products={products} categories={categories} /> : route === "/admin/tax" ? <TaxComplianceView /> : route === "/admin/add-product" ? <AddListingView categories={categories} subcategories={subcategories} onNavigate={onNavigate} /> : route === "/admin/bulk-listing" ? <BulkListingView categories={categories} subcategories={subcategories} /> : route === "/admin/orders" ? <OrdersView orders={orders} onOrderChanged={changeOrder} /> : route === "/admin/products" ? <ManageProductsView products={products} categories={categories} subcategories={subcategories} onProductChanged={changeProduct} onProductDeleted={removeProduct} onNavigate={onNavigate} /> : route === "/admin/inventory" ? <InventoryView products={products} onProductChanged={changeProduct} /> : route === "/admin/customers" ? <CustomersView /> : route === "/admin/employees" ? <EmployeesView /> : route === "/admin/reviews" ? <ReviewsView /> : route === "/admin/questions" ? <QuestionsView /> : route === "/admin/coupons" ? <CouponsView products={products} categories={categories} subcategories={subcategories} /> : route === "/admin/deals" ? <DealsView products={products} onProductChanged={changeProduct} /> : route === "/admin/categories" ? <CategoriesView categories={categories} subcategories={subcategories} onCatalogChanged={refreshCatalog} /> : route === "/admin/returns" ? <ReturnsView /> : route === "/admin/support" ? <SupportView /> : route === "/admin/system" ? <SystemView /> : route === "/admin/manage-store" ? <ManageStoreView onNavigate={onNavigate} /> : <NotificationsView notifications={notifications} onNotificationsChanged={changeNotifications} onNavigate={onNavigate} />}</AdminShell>;
}
