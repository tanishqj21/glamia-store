import React, { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/api";
import { formatIST } from "../lib/commerce";

function escapeSvg(value) {
  return String(value || "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[character]));
}

const CODE128_PATTERNS = ["212222", "222122", "222221", "121223", "121322", "131222", "122212", "122321", "132212", "221213", "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132", "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211", "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313", "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331", "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111", "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214", "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111", "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141", "214121", "412121", "111143", "111341", "131141", "114113", "114313", "411113", "411311", "113141", "114131", "311141", "411131", "211412", "211214", "211232", "2331112"];

/* Scannable Code 128-B barcode for the courier label (thermal printers scan it
   directly off the label). */
function code128(value) {
  const text = String(value || "").replace(/[^\x20-\x7e]/g, "").slice(0, 20) || "ORDER";
  const codes = [104, ...[...text].map((character) => character.charCodeAt(0) - 32)];
  let checksum = codes[0];
  for (let index = 1; index < codes.length; index++) checksum += codes[index] * index;
  codes.push(checksum % 103, 106);
  let x = 0;
  const bars = codes.map((code) => {
    const pattern = CODE128_PATTERNS[code];
    let markup = "";
    let position = 0;
    for (let partIndex = 0; partIndex < pattern.length; partIndex++) {
      const width = Number(pattern[partIndex]);
      if (partIndex % 2 === 0) markup += `<rect x="${x}" y="0" width="${width}" height="72"/>`;
      position += width;
      x += width;
    }
    return markup;
  }).join("");
  return { markup: `<g fill="#000">${bars}</g>`, width: x };
}

/* TSC TE244 thermal label: exact 100mm x 150mm stock, monochrome, layout top to
   bottom = order id, ship to, order summary, from address, tracking barcode. */
function labelSvg(order, fromAddress) {
  const shipping = order.shipping || {};
  const orderId = String(order.order_number || order.id || "").toUpperCase();
  const orderType = order.order_type === "replacement" ? "REPLACEMENT ORDER" : order.order_type === "preorder" ? "PRE-ORDER" : "ORDER";
  const destination = [shipping.line1, shipping.line2, [shipping.city, shipping.state, shipping.pin].filter(Boolean).join(", "), shipping.country || "India"].filter(Boolean).slice(0, 3);
  const allItems = order.items || [];
  const items = allItems.slice(0, 5).map((item) => `${item.name || item.product_name || "Item"}${item.size ? ` · ${item.size}` : ""} × ${item.quantity}`);
  const hiddenItems = allItems.length - items.length;
  const fromLines = String(fromAddress || "Warehouse address not configured").split(/\r?\n/).filter(Boolean).slice(0, 4);
  const tracking = String(order.tracking_number || "").trim();
  const payment = `${["cod", "demo"].includes(order.payment_method) ? "DEMO" : (order.payment_method || "demo").toUpperCase()} · ${(order.payment_status || "demo").toUpperCase()}`;
  const barcode = code128(tracking || orderId);
  const barcodeX = Math.round((400 - barcode.width * 1.15) / 2);
  return `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="150mm" viewBox="0 0 400 600"><rect width="400" height="600" fill="#fff"/><rect x="8" y="8" width="384" height="584" fill="none" stroke="#000" stroke-width="4"/><text x="24" y="36" class="section">ORDER ID${order.order_type !== "standard" ? ` · ${orderType}` : ""}</text><text x="24" y="64" class="heading">${escapeSvg(orderId)}</text><line x1="24" y1="78" x2="376" y2="78" stroke="#000" stroke-width="2"/><text x="24" y="100" class="section">SHIP TO</text><text x="24" y="124" class="heading">${escapeSvg(shipping.name || order.customer_name || "Recipient")}</text>${shipping.phone ? `<text x="24" y="144" class="body">${escapeSvg(shipping.phone)}</text>` : ""}${destination.map((line, index) => `<text x="24" y="${166 + index * 19}" class="body">${escapeSvg(line)}</text>`).join("")}<text x="24" y="240" class="section">ORDER SUMMARY</text>${items.map((item, index) => `<text x="24" y="${262 + index * 18}" class="body">${escapeSvg(item)}</text>`).join("")}${hiddenItems > 0 ? `<text x="24" y="${262 + items.length * 18}" class="body">+ ${hiddenItems} more item${hiddenItems === 1 ? "" : "s"}</text>` : ""}<text x="24" y="${262 + (items.length + (hiddenItems > 0 ? 1 : 0)) * 18 + 6}" class="total">${escapeSvg(payment)} — TOTAL ₹${Number(order.total || 0).toLocaleString("en-IN")}</text><text x="24" y="382" class="section">FROM</text>${fromLines.map((line, index) => `<text x="24" y="${404 + index * 17}" class="body">${escapeSvg(line)}</text>`).join("")}<text x="24" y="486" class="section">TRACKING</text>${tracking ? `<text x="24" y="508" class="heading">${escapeSvg(tracking)}</text>` : `<text x="24" y="508" class="body">No tracking assigned yet</text>`}<g transform="translate(${barcodeX} 518) scale(1.15 0.78)">${barcode.markup}</g><text x="200" y="583" class="barcode-text" text-anchor="middle">${escapeSvg(tracking || orderId)}</text><style>.section{font:700 12px Arial;letter-spacing:2px;fill:#000}.heading{font:700 22px Arial;fill:#000}.body{font:400 13px Arial;fill:#000}.total{font:700 13px Arial;fill:#000}.barcode-text{font:400 13px Arial;letter-spacing:1px;fill:#000}</style></svg>`;
}

function downloadText(filename, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type })); const link = document.createElement("a"); link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function LabelsView({ orders }) {
  const [query, setQuery] = useState("");
  const [fromAddress, setFromAddress] = useState("");
  useEffect(() => { apiFetch("/api/admin/storefront-settings").then((response) => response.json()).then((data) => setFromAddress(data.fulfillment?.warehouse_address || "")).catch(() => null); }, []);
  const visible = useMemo(() => { const needle = query.trim().toLowerCase(); if (!needle) return orders; return orders.filter((order) => `${order.order_number} ${order.id} ${order.customer_name} ${order.customer_email} ${(order.items || []).map((item) => item.name).join(" ")}`.toLowerCase().includes(needle)); }, [orders, query]);
  return <section className="admin-panel admin-wide-panel system-workspace"><div className="admin-panel-heading"><div><p className="eyebrow">Fulfilment tools</p><h2>Label generation</h2><p className="muted">Download a black-and-white courier label for every order.</p></div><span>{visible.length} orders</span></div><div className="system-toolbar"><label>Search orders<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Order ID, customer, product…" /></label><button type="button" className="secondary-action" onClick={() => downloadText("glamia-demo-label.svg", labelSvg({ order_number: "GM-DEMO-1234", customer_name: "Demo Customer", total: 1499, payment_method: "demo", shipping: { name: "Demo Customer", phone: "+91 90000 00000", line1: "12 Demo Lane", city: "Mumbai", state: "Maharashtra", pin: "400001", country: "India" }, items: [{ name: "Relaxed Cotton Night Suit", quantity: 1, size: "M" }] }, fromAddress), "image/svg+xml")}>Download sample label</button></div><div className="system-list">{visible.map((order) => <article className="system-row" key={order.id}><div className="system-row-mark">✦</div><div className="system-row-main"><strong>{order.order_number || order.id}{order.order_type === "replacement" && <span className="status-pill status-shipped">Replacement product order</span>}</strong><span>{order.customer_name || order.customer_email || "Customer"}</span><small>{(order.items || []).length} item{(order.items || []).length === 1 ? "" : "s"} · ₹{Number(order.total || 0).toLocaleString("en-IN")} · {order.tracking_number ? `Tracking ${order.tracking_number}` : "Tracking not assigned"}</small></div><button type="button" className="secondary-action" onClick={() => downloadText(`${order.order_number || order.id}-courier-label.svg`, labelSvg(order, fromAddress), "image/svg+xml")}>Download label</button></article>)}{!visible.length && <div className="empty-state">No matching orders.</div>}</div></section>;
}

export function SystemView() {
  const [health, setHealth] = useState(null); const [events, setEvents] = useState([]); const [error, setError] = useState(""); const [message, setMessage] = useState("");
  async function load() { setError(""); try { const [healthResponse, eventResponse] = await Promise.all([apiFetch("/api/health"), apiFetch("/api/admin/email-events")]); const healthData = await healthResponse.json(); const eventData = await eventResponse.json(); if (!healthResponse.ok) throw new Error(healthData.error || "Health check unavailable"); setHealth(healthData); setEvents(eventData.events || []); } catch (requestError) { setError(requestError.message); } }
  useEffect(() => { load(); }, []);
  async function retry(id) { const response = await apiFetch(`/api/admin/email-events/${encodeURIComponent(id)}/retry`, { method: "POST", body: "{}" }); const data = await response.json(); if (!response.ok) { setError(data.error || "Retry failed"); return; } setMessage("Email retry completed."); load(); }
  async function backup() { const response = await apiFetch("/api/admin/backup"); if (!response.ok) { setError("Backup could not be downloaded"); return; } const blob = await response.blob(); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `glamia-backup-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(url); setMessage("Data backup downloaded."); }
  return <section className="admin-panel admin-wide-panel system-workspace"><div className="admin-panel-heading"><div><p className="eyebrow">Operations</p><h2>System health</h2><p className="muted">A compact safety net for the store backend, email delivery, and data backup.</p></div><button type="button" className="secondary-action" onClick={load}>Refresh</button></div>{(error || message) && <p className={error ? "inline-error" : "inline-note"} role="status">{error || message}</p>}<div className="system-health-grid"><article className="system-health-tile"><span>Database</span><strong>{health?.ok ? "Healthy" : health ? "Unavailable" : "Checking…"}</strong><small>{health?.latency_ms !== undefined ? `${health.latency_ms}ms response` : "Live health check"}</small></article><article className="system-health-tile"><span>Email provider</span><strong>{health?.email_delivery === "configured" ? "Configured" : health ? "Action needed" : "Checking…"}</strong><small>Brevo transactional delivery</small></article><article className="system-health-tile"><span>Admin access</span><strong>Protected</strong><small>Whitelisted accounts</small></article><article className="system-health-tile"><span>Request protection</span><strong>Active</strong><small>Same-origin and rate limits</small></article><article className="system-health-tile"><span>Audit trail</span><strong>Enabled</strong><small>Admin actions recorded</small></article></div><div className="system-actions"><button type="button" className="primary-action" onClick={backup}>Download data backup <span aria-hidden="true">↗</span></button></div><div className="system-email-heading"><div><p className="eyebrow">Email delivery</p><h3>Recent events</h3></div><span>{events.length} shown</span></div><div className="system-list">{events.slice(0, 20).map((event) => <article className="system-row" key={event.id}><div className="system-row-main"><strong>{event.event_type} · {event.recipient}</strong><span>{event.status} · attempts {event.attempts} · {formatIST(event.created_at)}</span>{event.last_error && <small className="error-text">{event.last_error}</small>}</div>{event.status !== "sent" ? <button type="button" className="secondary-action" onClick={() => retry(event.id)}>Retry</button> : <span className="status-pill status-live">Sent</span>}</article>)}{!events.length && <div className="empty-state">No email delivery events yet.</div>}</div></section>;
}

export function ManageStoreView({ onNavigate }) {
  const groups = [["Catalog", [["/admin/add-product", "Add listing", "Create a listing with photos, sizes, and pricing."], ["/admin/products", "All products", "Browse, edit, and publish listings."], ["/admin/bulk-listing", "Bulk listing", "Import multiple listings from XLSX."], ["/admin/inventory", "Inventory", "Manage total and size-level stock."], ["/admin/categories", "Categories", "Organize categories and subcategories."]]], ["Operations", [["/admin/orders", "Orders", "Review purchases and update progress."], ["/admin/tax", "GST & HSN", "Map tax codes, review GST, and export sales."], ["/admin/returns", "Returns & refunds", "Move after-sales requests through clear statuses."], ["/admin/deals", "Deals", "Schedule promotions and deal prices."], ["/admin/labels", "Labels", "Generate courier labels for orders."]]], ["Customers & settings", [["/admin/customers", "Customers", "Explore customer details and purchase history."], ["/admin/reviews", "Reviews", "Read and moderate customer feedback."], ["/admin/questions", "Product questions", "Answer and publish product Q&A."], ["/admin/coupons", "Coupons", "Create discount codes and limits."], ["/admin/support", "Support", "Organize customer questions and replies."], ["/admin/system", "System health", "Check backend health and email delivery."]]]];
  return <section className="admin-panel admin-wide-panel system-workspace"><div className="admin-panel-heading"><div><p className="eyebrow">Store map</p><h2>Manage store</h2><p className="muted">Choose an area of the marketplace to manage.</p></div></div>{groups.map(([title, links]) => <section className="store-map-group" key={title}><p className="eyebrow">{title}</p><div className="store-map-grid">{links.map(([href, label, detail]) => <button type="button" className="store-map-card" key={href} onClick={() => onNavigate(href)}><strong>{label}</strong><span>{detail}</span><i aria-hidden="true">↗</i></button>)}</div></section>)}</section>;
}
