import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/api";
import { formatIST, money } from "../lib/commerce";

const emptyData = { settings: {}, products: [], sales: [], summary: {} };

function taxMoney(value) {
  return `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function downloadSalesCsv(sales) {
  const rows = [["Order number", "Date", "State", "Tax status", "Order total", "Taxable value", "CGST", "SGST/UTGST", "IGST", "Lines"]];
  sales.forEach((sale) => rows.push([
    sale.order_number,
    sale.created_at,
    sale.state,
    sale.tax_status,
    sale.order_total,
    sale.taxable_value,
    sale.cgst,
    sale.sgst,
    sale.igst,
    sale.lines.map((line) => `${line.product_name} (${line.quantity})`).join("; ")
  ]));
  const blob = new Blob([rows.map((row) => row.map(csvCell).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `glamia-tax-sales-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function ProductTaxRow({ product, onSaved }) {
  const [form, setForm] = useState({
    hsn_sac_code: product.hsn_sac_code || "",
    hsn_sac_type: product.hsn_sac_type || "HSN",
    gst_rate: product.gst_rate ?? "",
    gst_tax_inclusive: product.gst_tax_inclusive !== false
  });
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  useEffect(() => setForm({
    hsn_sac_code: product.hsn_sac_code || "",
    hsn_sac_type: product.hsn_sac_type || "HSN",
    gst_rate: product.gst_rate ?? "",
    gst_tax_inclusive: product.gst_tax_inclusive !== false
  }), [product]);
  async function save() {
    setBusy(true); setStatus("");
    try {
      const response = await apiFetch(`/api/admin/products/${encodeURIComponent(product.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ ...form, gst_rate: form.gst_rate === "" ? null : Number(form.gst_rate) })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Tax mapping could not be saved");
      onSaved(data.product || { ...product, ...form });
      setStatus("Saved");
    } catch (error) { setStatus(error.message); } finally { setBusy(false); }
  }
  const ready = form.hsn_sac_code.trim() && form.gst_rate !== "";
  return <article className="tax-product-row">
    <div className="tax-product-copy"><strong>{product.name}</strong><span>{product.category || "Uncategorized"}{product.subcategory ? ` · ${product.subcategory}` : ""}{product.color ? ` · ${product.color}` : ""}</span><small>{product.status || "listing"} · {money(product.price)}</small></div>
    <div className="tax-product-fields">
      <label>Type<select value={form.hsn_sac_type} onChange={(event) => setForm((current) => ({ ...current, hsn_sac_type: event.target.value }))}><option value="HSN">HSN</option><option value="SAC">SAC</option></select></label>
      <label>Code<input value={form.hsn_sac_code} onChange={(event) => setForm((current) => ({ ...current, hsn_sac_code: event.target.value.toUpperCase() }))} placeholder="HSN / SAC code" maxLength="20" /></label>
      <label>GST rate (%)<input type="number" min="0" max="100" step="0.01" value={form.gst_rate} onChange={(event) => setForm((current) => ({ ...current, gst_rate: event.target.value }))} placeholder="Not set" /></label>
      <label className="tax-checkbox"><input type="checkbox" checked={form.gst_tax_inclusive} onChange={(event) => setForm((current) => ({ ...current, gst_tax_inclusive: event.target.checked }))} /> Price includes GST</label>
      <button type="button" className="secondary-action" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save"}</button>
    </div>
    <div className={`tax-product-status ${ready ? "ready" : "needs-setup"}`}>{status || (ready ? "Ready for report" : "Needs code and rate")}</div>
  </article>;
}

export function TaxComplianceView() {
  const [data, setData] = useState(emptyData);
  const [hsn, setHsn] = useState([]);
  const [sac, setSac] = useState([]);
  const [states, setStates] = useState([]);
  const [masterType, setMasterType] = useState("HSN");
  const [masterQuery, setMasterQuery] = useState("");
  const [productQuery, setProductQuery] = useState("");
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);
  const [openSale, setOpenSale] = useState("");

  async function load() {
    setLoading(true); setError("");
    try {
      const responses = await Promise.all([
        apiFetch("/api/admin/tax-compliance"),
        apiFetch("/data/tax/hsn.json", { cacheTtl: 86400000 }),
        apiFetch("/data/tax/sac.json", { cacheTtl: 86400000 }),
        apiFetch("/data/tax/states.json", { cacheTtl: 86400000 })
      ]);
      const [reportResponse, hsnResponse, sacResponse, statesResponse] = responses;
      const report = await reportResponse.json();
      if (!reportResponse.ok) throw new Error(report.error || "Tax workspace could not be loaded");
      const [hsnData, sacData, stateData] = await Promise.all([hsnResponse.json(), sacResponse.json(), statesResponse.json()]);
      setData(report); setSettings(report.settings || {}); setHsn(hsnData || []); setSac(sacData || []); setStates(stateData || []);
    } catch (requestError) { setError(requestError.message); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  const summary = data.summary || {};
  const filteredProducts = useMemo(() => data.products.filter((product) => {
    const haystack = `${product.name} ${product.category} ${product.subcategory} ${product.color} ${product.hsn_sac_code}`.toLowerCase();
    return !productQuery || haystack.includes(productQuery.toLowerCase());
  }), [data.products, productQuery]);
  const masterRows = useMemo(() => {
    const source = masterType === "SAC" ? sac : hsn;
    const query = masterQuery.trim().toLowerCase();
    return source.filter((row) => !query || `${row.code} ${row.description}`.toLowerCase().includes(query)).slice(0, 60);
  }, [hsn, sac, masterType, masterQuery]);

  function saveProduct(next) {
    setData((current) => ({ ...current, products: current.products.map((product) => product.id === next.id ? { ...product, ...next } : product) }));
  }
  function chooseState(event) {
    const selected = states.find((state) => state.code === event.target.value);
    setSettings((current) => ({ ...current, business_state_code: selected?.code || "", business_state: selected?.name || "" }));
  }
  async function saveTaxSettings(event) {
    event.preventDefault(); setSavingSettings(true); setStatus("");
    try {
      const response = await apiFetch("/api/admin/tax-settings", { method: "PATCH", body: JSON.stringify(settings) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Tax settings could not be saved");
      setSettings(result.settings || settings); setStatus("Tax settings saved");
      setData((current) => ({ ...current, settings: result.settings || settings }));
    } catch (saveError) { setStatus(saveError.message); } finally { setSavingSettings(false); }
  }

  if (loading) return <section className="admin-panel admin-wide-panel"><div className="loading-card">Loading GST and HSN workspace…</div></section>;
  if (error) return <section className="admin-panel admin-wide-panel"><p className="eyebrow">GST &amp; HSN</p><h2>Tax workspace unavailable</h2><p className="inline-error" role="alert">{error}</p><button type="button" className="primary-action" onClick={load}>Try again</button></section>;
  return <section className="admin-panel admin-wide-panel tax-workspace">
    <div className="admin-panel-heading"><div><p className="eyebrow">Sales and compliance</p><h2>GST &amp; HSN</h2><p className="muted">Map every listing to a tax code, review payment sales, and keep your state setup in one place.</p></div><div className="tax-heading-actions"><span>{data.products.length} listings</span><button type="button" className="secondary-action" onClick={load}>Refresh</button></div></div>
    <div className="tax-demo-notice"><strong>Tax workspace</strong><span>This report is for internal setup and review. Have a CA confirm classification, rates, place of supply, and invoice treatment before production.</span></div>

    <section className="tax-summary-grid" aria-label="Tax summary"><article><span>Gross sales</span><strong>{taxMoney(summary.gross_sales)}</strong><small>{summary.orders || 0} non-cancelled orders</small></article><article><span>Taxable value</span><strong>{taxMoney(summary.taxable_value)}</strong><small>Only mapped lines included</small></article><article><span>GST calculated</span><strong>{taxMoney(summary.tax_amount)}</strong><small>CGST {taxMoney(summary.cgst)} · IGST {taxMoney(summary.igst)}</small></article><article className={summary.missing_code_products || summary.missing_rate_products ? "is-alert" : ""}><span>Listing setup</span><strong>{summary.ready_products || 0}/{data.products.length}</strong><small>{summary.missing_code_products || 0} missing code · {summary.missing_rate_products || 0} missing rate</small></article></section>

    <section className="tax-settings-panel"><div className="tax-section-heading"><div><p className="eyebrow">Store setup</p><h3>Business tax details</h3><span>Used to classify an order as intra-state or inter-state.</span></div>{status && <span className={status.includes("saved") ? "inline-note" : "inline-error"} role="status">{status}</span>}</div><form className="tax-settings-form" onSubmit={saveTaxSettings}><label>Business state<select value={settings.business_state_code || ""} onChange={chooseState}><option value="">Choose a state or UT</option>{states.map((state) => <option key={state.code} value={state.code}>{state.name} ({state.code})</option>)}</select></label><label>GSTIN <span className="form-hint">optional</span><input value={settings.gstin || ""} onChange={(event) => setSettings((current) => ({ ...current, gstin: event.target.value.toUpperCase() }))} placeholder="15-character GSTIN" maxLength="15" /></label><button type="submit" className="primary-action" disabled={savingSettings}>{savingSettings ? "Saving…" : "Save business details"}</button></form>{!settings.business_state_code && <p className="form-hint">Set the business state to split configured tax into CGST/SGST or IGST. Until then, sales remain unclassified.</p>}</section>

    <section className="tax-products-panel"><div className="tax-section-heading"><div><p className="eyebrow">Listing setup</p><h3>Product tax mapping</h3><span>Rates are saved on the listing and snapshotted when a new order is created.</span></div><label className="tax-search">Search listings<input type="search" value={productQuery} onChange={(event) => setProductQuery(event.target.value)} placeholder="Name, category, or code" /></label></div><div className="tax-product-list">{filteredProducts.map((product) => <ProductTaxRow key={product.id} product={product} onSaved={saveProduct} />)}{!filteredProducts.length && <div className="empty-state">No listings match this search.</div>}</div></section>

    <div className="tax-reference-grid"><section className="tax-reference-panel"><div className="tax-section-heading"><div><p className="eyebrow">Source master</p><h3>HSN / SAC lookup</h3><span>Mapped from the supplied HSN_SAC workbook.</span></div><div className="tax-reference-controls"><select value={masterType} onChange={(event) => { setMasterType(event.target.value); setMasterQuery(""); }} aria-label="Choose tax code master"><option value="HSN">HSN ({hsn.length.toLocaleString("en-IN")})</option><option value="SAC">SAC ({sac.length.toLocaleString("en-IN")})</option></select><input type="search" value={masterQuery} onChange={(event) => setMasterQuery(event.target.value)} placeholder="Search code or description" /></div></div><div className="tax-lookup-list" tabIndex={0} role="region" aria-label="Tax code lookup">{masterRows.map((row) => <div key={`${masterType}-${row.code}`}><strong>{row.code}</strong><span>{row.description}</span></div>)}{!masterRows.length && <div className="empty-state">No master entries match this search.</div>}</div>{masterRows.length === 60 && <p className="form-hint">Showing the first 60 matches. Narrow the search to find an exact code.</p>}</section><section className="tax-reference-panel"><div className="tax-section-heading"><div><p className="eyebrow">Place of supply</p><h3>GST state and UT codes</h3><span>Mapped from the supplied GST master workbook.</span></div></div><div className="tax-state-list" tabIndex={0} role="region" aria-label="GST state codes">{states.map((state) => <div key={state.code}><strong>{state.code}</strong><span>{state.name}</span><small>{state.type}</small></div>)}</div></section></div>

    <section className="tax-sales-panel"><div className="tax-section-heading"><div><p className="eyebrow">Sales report</p><h3>GST view of payment orders</h3><span>{summary.unclassified_orders || 0} order{summary.unclassified_orders === 1 ? "" : "s"} need state classification.</span></div><button type="button" className="secondary-action" onClick={() => downloadSalesCsv(data.sales)}>Download CSV </button></div><div className="tax-sales-table" tabIndex={0} role="region" aria-label="Sales tax report"><div className="tax-sales-table-head"><span>Order</span><span>Date</span><span>State</span><span>Taxable</span><span>GST</span><span>Status</span></div>{data.sales.map((sale) => <article key={sale.id} className={`tax-sale-row ${openSale === sale.id ? "is-open" : ""}`}><button type="button" className="tax-sale-summary" onClick={() => setOpenSale(openSale === sale.id ? "" : sale.id)} aria-expanded={openSale === sale.id}><strong>{sale.order_number}</strong><span>{formatIST(sale.created_at)}</span><span>{sale.state}<small>{sale.state_classification.replace("_", " ")}</small></span><span>{taxMoney(sale.taxable_value)}</span><span>{taxMoney(sale.tax_amount)}</span><em className={sale.tax_status === "ready" ? "ready" : "needs-setup"}>{sale.tax_status === "ready" ? "Ready" : "Needs setup"}</em></button>{openSale === sale.id && <div className="tax-sale-lines">{sale.lines.map((line, index) => <div key={`${sale.id}-${index}`}><span>{line.product_name} × {line.quantity}</span><span>{line.code_type} {line.code || "No code"} · {line.gst_rate === null ? "Rate not set" : `${line.gst_rate}%`}</span><strong>{line.tax_status === "ready" ? taxMoney(line.tax_amount) : "—"}</strong></div>)}</div>}</article>)}{!data.sales.length && <div className="empty-state">No non-cancelled sales yet.</div>}</div></section>
  </section>;
}
