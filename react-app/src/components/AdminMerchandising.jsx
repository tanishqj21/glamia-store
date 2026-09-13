import React, { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/api";
import { Icon } from "./Icon";
import { PhoneField } from "./PhoneField";

const INSIGHT_LABELS = {
  best_selling: "Best selling",
  new_arrivals: "New arrivals",
  top_rated: "Top rated",
  top_reviewed: "Top reviewed",
  low_return_rate: "Lowest cancellation proxy",
};

const DEFAULT_TRUST_ITEMS = [
  { id: "shipping", visible: true, title: "Free & Fast Shipping", body: "Complimentary on every order" },
  { id: "returns", visible: true, title: "7-Day Easy Returns", body: "Simple exchanges, no questions" },
  { id: "cod", visible: true, title: "Cash on Delivery", body: "Or secure UPI & card checkout" },
];

function imageFor(product) {
  return product?.image || product?.thumbnail || product?.image_url || product?.thumbnail_url || "";
}

async function readResponse(response, fallback) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || fallback);
  return data;
}

function Field({ label, hint, children, wide = false }) {
  return <label className={wide ? "merch-field merch-field-wide" : "merch-field"}><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

function InsightCard({ label, products, onUse }) {
  return <section className="merch-insight-card">
    <div className="merch-insight-heading"><div><p className="eyebrow">Recommendation</p><h3>{label}</h3></div><button type="button" className="secondary-action" onClick={onUse} disabled={!products.length}>Use top 3</button></div>
    {products.length ? <div className="merch-insight-products">{products.slice(0, 3).map((product, index) => <div className="merch-insight-product" key={product.id}>
      <span className="merch-rank">{index + 1}</span>{imageFor(product) ? <img src={imageFor(product)} alt="" loading="lazy" /> : <span className="merch-image-placeholder" />}<div><strong>{product.name}</strong><small>{product.category || "Catalog"}{product.units !== undefined ? ` · ${product.units} units sold` : product.rating ? ` · ${Number(product.rating).toFixed(1)}★` : ""}</small></div>
    </div>)}</div> : <p className="muted">Not enough activity yet.</p>}
  </section>;
}

function emptyHeroForm() {
  return { eyebrow: "The Glamia Edit", title: "", tagline: "", cta_label: "Shop the edit", cta_category: "", words: "", active: true, position: "" };
}

export function HeroStudioView({ products, categories }) {
  const [slides, setSlides] = useState([]);
  const [insights, setInsights] = useState({ recommendations: {}, return_note: "" });
  const [form, setForm] = useState(emptyHeroForm);
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [editingId, setEditingId] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [previewIndex, setPreviewIndex] = useState(0);
  const [previewPaused, setPreviewPaused] = useState(false);

  const liveProducts = useMemo(() => products.filter((product) => product.status === "live"), [products]);
  const liveProductIds = new Set(liveProducts.map((product) => product.id));

  async function load() {
    setError("");
    try {
      const [slidesResponse, insightsResponse] = await Promise.all([apiFetch("/api/admin/hero"), apiFetch("/api/admin/hero/insights")]);
      const [slideData, insightData] = await Promise.all([readResponse(slidesResponse, "Hero slides could not be loaded"), readResponse(insightsResponse, "Hero insights could not be loaded")]);
      setSlides(slideData.slides || []);
      setInsights(insightData);
    } catch (requestError) { setError(requestError.message); }
  }

  useEffect(() => { load(); }, []);
  useEffect(() => { if (previewIndex >= slides.length && slides.length) setPreviewIndex(0); }, [previewIndex, slides.length]);
  useEffect(() => { if (previewPaused || slides.length < 2) return undefined; const timer = window.setInterval(() => setPreviewIndex((index) => (index + 1) % slides.length), 6000); return () => window.clearInterval(timer); }, [previewPaused, slides.length]);

  const previewSlide = slides[previewIndex] || null;
  const previewProducts = previewSlide?.frames?.length ? previewSlide.frames : selectedProducts.map((id) => liveProducts.find((product) => product.id === id)).filter(Boolean);
  const previewFrame = previewProducts[0];
  const previewWords = (previewSlide?.words?.length ? previewSlide.words : form.words.split(",").map((word) => word.trim()).filter(Boolean)).slice(0, 4);

  function changeField(event) {
    const { name, value, type, checked } = event.target;
    setForm((current) => ({ ...current, [name]: type === "checkbox" ? checked : value }));
  }

  function toggleProduct(id) {
    setSelectedProducts((current) => current.includes(id) ? current.filter((item) => item !== id) : current.length < 3 ? [...current, id] : current);
  }

  function applyInsight(key) {
    const ids = (insights.recommendations?.[key] || []).map((product) => product.id).filter((id) => liveProductIds.has(id)).slice(0, 3);
    setSelectedProducts(ids);
    document.getElementById("hero-slide-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function editSlide(slide) {
    setEditingId(slide.id);
    setForm({ eyebrow: slide.eyebrow || "The Glamia Edit", title: slide.title || "", tagline: slide.tagline || "", cta_label: slide.cta_label || "Shop the edit", cta_category: slide.cta_category || "", words: (slide.words || []).join(", "), active: Boolean(slide.active), position: String(slide.position ?? "") });
    setSelectedProducts((slide.product_ids || []).filter((id) => liveProductIds.has(id)).slice(0, 3));
    document.getElementById("hero-slide-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function resetForm() {
    setEditingId(""); setForm(emptyHeroForm()); setSelectedProducts([]); setStatus("");
  }

  async function submit(event) {
    event.preventDefault(); setBusy(true); setStatus(""); setError("");
    try {
      if (!selectedProducts.length) throw new Error("Select at least one live product frame.");
      const payload = { ...form, words: form.words.split(",").map((word) => word.trim()).filter(Boolean), product_ids: selectedProducts, position: form.position === "" ? null : Number(form.position) };
      const response = await apiFetch(editingId ? `/api/admin/hero/${encodeURIComponent(editingId)}` : "/api/admin/hero", { method: editingId ? "PATCH" : "POST", body: JSON.stringify(payload) });
      await readResponse(response, "Hero slide could not be saved");
      setStatus(editingId ? "Hero slide updated." : "Hero slide published."); resetForm(); await load();
    } catch (requestError) { setError(requestError.message); } finally { setBusy(false); }
  }

  async function deleteSlide(slide) {
    if (!window.confirm(`Delete “${slide.title}”?`)) return;
    setBusy(true); setError("");
    try { const response = await apiFetch(`/api/admin/hero/${encodeURIComponent(slide.id)}`, { method: "DELETE" }); await readResponse(response, "Hero slide could not be deleted"); setStatus("Hero slide deleted."); if (editingId === slide.id) resetForm(); await load(); } catch (requestError) { setError(requestError.message); } finally { setBusy(false); }
  }

  return <section className="admin-panel admin-wide-panel merch-workspace">
    <div className="admin-panel-heading"><div><p className="eyebrow">Merchandising</p><h2>Hero Studio</h2><p className="muted">Build the exact carousel shown on the home page using live catalog frames and store signals.</p></div><span>{slides.length} slides</span></div>
    
    <section className="merch-hero-preview" aria-label="Hero Studio live preview">
      <div className="merch-preview-copy"><p className="eyebrow">{previewSlide?.eyebrow || form.eyebrow || "The Glamia Edit"}</p><h3>{previewSlide?.title || form.title || "Everyday pieces, beautifully composed."}</h3><p>{previewSlide?.tagline || form.tagline || "Build a considered edit from the products already live in your store."}</p>{previewWords.length > 0 && <div className="merch-preview-words">{previewWords.map((word) => <span key={word}>{word}</span>)}</div>}</div>
      <div className="merch-preview-stage">{previewFrame && imageFor(previewFrame) ? <img src={imageFor(previewFrame)} alt={previewFrame.name || "Selected hero product"} /> : <div className="merch-preview-placeholder"><span>Select a live product frame below</span></div>}</div>
      <button type="button" className="merch-preview-arrow merch-preview-prev" aria-label="Previous hero slide" onClick={() => { setPreviewPaused(true); setPreviewIndex((index) => slides.length ? (index - 1 + slides.length) % slides.length : 0); }}><Icon name="chevronLeft" /></button><button type="button" className="merch-preview-arrow merch-preview-next" aria-label="Next hero slide" onClick={() => { setPreviewPaused(true); setPreviewIndex((index) => slides.length ? (index + 1) % slides.length : 0); }}><Icon name="chevronRight" /></button>
    </section>
    <div className="merch-studio-grid">
      <form id="hero-slide-form" className="merch-form" onSubmit={submit}>
        <div className="merch-form-heading"><div><p className="eyebrow">{editingId ? "Edit slide" : "New slide"}</p><h3>{editingId ? "Refine this edit" : "Create a hero moment"}</h3></div><span>{selectedProducts.length}/3 frames</span></div>
        <div className="merch-form-grid"><Field label="Eyebrow"><input name="eyebrow" value={form.eyebrow} onChange={changeField} maxLength="60" /></Field><Field label="Headline"><input name="title" value={form.title} onChange={changeField} maxLength="100" required placeholder="The new evening edit" /></Field><Field wide label="Tagline"><textarea name="tagline" value={form.tagline} onChange={changeField} maxLength="240" rows="3" required placeholder="A short line that sets the mood for this collection." /></Field><Field label="CTA label"><input name="cta_label" value={form.cta_label} onChange={changeField} maxLength="40" /></Field><Field label="CTA destination"><select name="cta_category" value={form.cta_category} onChange={changeField}><option value="">No destination</option>{categories.map((category) => <option key={category} value={category}>{category}</option>)}</select></Field><Field wide label="Style words" hint="Optional words shown beside the images, separated by commas."><input name="words" value={form.words} onChange={changeField} maxLength="120" placeholder="SILK, EVENING, NEW SEASON" /></Field><Field label="Position" hint="Leave blank to add at the end."><input name="position" type="number" min="0" value={form.position} onChange={changeField} /></Field></div>
        <label className="merch-checkbox"><input name="active" type="checkbox" checked={form.active} onChange={changeField} /> Publish this slide on the home page</label>
        <div className="merch-product-picker"><div className="merch-section-heading"><div><p className="eyebrow">Product frames</p><h3>Select 1–3 live products</h3></div><span>{liveProducts.length} live</span></div><div className="merch-product-options">{liveProducts.map((product) => <label className={`merch-product-option ${selectedProducts.includes(product.id) ? "selected" : ""}`} key={product.id}><input type="checkbox" checked={selectedProducts.includes(product.id)} onChange={() => toggleProduct(product.id)} /><span>{imageFor(product) ? <img src={imageFor(product)} alt="" loading="lazy" /> : <span className="merch-image-placeholder" />}<strong>{product.name}</strong><small>{product.category || "Catalog"}</small></span></label>)}{!liveProducts.length && <p className="muted">Publish a live product before creating a hero slide.</p>}</div></div>
        {(error || status) && <p className={error ? "inline-error" : "inline-note"} role="status">{error || status}</p>}<div className="form-actions"><button type="button" className="secondary-action" onClick={resetForm}>Reset</button><button className="primary-action" type="submit" disabled={busy || !liveProducts.length}>{busy ? "Saving…" : editingId ? "Save slide" : "Publish slide"} <span aria-hidden="true">↗</span></button></div>
      </form>
      <aside className="merch-insights"><div className="merch-section-heading"><div><p className="eyebrow">Merchandising signals</p><h3>What should lead?</h3></div></div><p className="muted">{insights.return_note || "Rankings use current store activity and sales data."}</p>{Object.entries(INSIGHT_LABELS).map(([key, label]) => <InsightCard key={key} label={label} products={insights.recommendations?.[key] || []} onUse={() => applyInsight(key)} />)}</aside>
    </div>
    <div className="merch-published"><div className="merch-section-heading"><div><p className="eyebrow">Published order</p><h3>Home carousel slides</h3></div><span>Drag-free ordering via position</span></div>{slides.length ? <div className="merch-slide-list">{slides.map((slide, index) => <article className={`merch-slide-row ${slide.active ? "" : "is-draft"} ${previewIndex === index ? "is-previewing" : ""}`} key={slide.id} onClick={() => setPreviewIndex(index)}><div className="merch-slide-frames">{(slide.frames || []).map((frame) => imageFor(frame) ? <img key={frame.id} src={imageFor(frame)} alt={frame.name || slide.title} loading="lazy" /> : null)}</div><div className="merch-slide-copy"><strong>{slide.title}</strong><span>{slide.tagline}</span><small>{slide.active ? "Published" : "Draft"} · position {slide.position} · {(slide.frames || []).length} frame{(slide.frames || []).length === 1 ? "" : "s"}</small></div><div className="merch-slide-actions"><button type="button" className="secondary-action" onClick={(event) => { event.stopPropagation(); editSlide(slide); }}>Edit</button><button type="button" className="danger-action" onClick={(event) => { event.stopPropagation(); deleteSlide(slide); }} disabled={busy}>Delete</button></div></article>)}</div> : <div className="empty-state">No hero slides yet. Create the first one above.</div>}</div>
  </section>;
}

function normalizeSettings(data) {
  return { announcement: data.announcement || { visible: true, text: "" }, trust_strip: { visible: data.trust_strip?.visible !== false, items: DEFAULT_TRUST_ITEMS.map((item) => data.trust_strip?.items?.find((entry) => entry.id === item.id) || item) }, fulfillment: data.fulfillment || { warehouse_address: "" }, payments: data.payments || { cod_enabled: true }, support_contact: data.support_contact || { visible: false, country_code: "+91", phone_number: "" }, seo: data.seo || { title: "", description: "", image: "" } };
}

export function StorefrontSettingsView() {
  const [settings, setSettings] = useState(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { let active = true; apiFetch("/api/admin/storefront-settings").then((response) => readResponse(response, "Storefront settings could not be loaded")).then((data) => active && setSettings(normalizeSettings(data))).catch((requestError) => active && setError(requestError.message)); return () => { active = false; }; }, []);

  function update(path, value) {
    setSettings((current) => { const next = structuredClone(current); let target = next; path.slice(0, -1).forEach((key) => { target = target[key]; }); target[path[path.length - 1]] = value; return next; });
  }

  async function save(event) {
    event.preventDefault(); setBusy(true); setStatus(""); setError("");
    try { const response = await apiFetch("/api/admin/storefront-settings", { method: "PUT", body: JSON.stringify(settings) }); const data = await readResponse(response, "Storefront settings could not be saved"); setSettings(normalizeSettings(data)); setStatus("Storefront settings saved."); } catch (requestError) { setError(requestError.message); } finally { setBusy(false); }
  }

  if (!settings) return <section className="admin-panel admin-wide-panel"><div className="loading-card">Loading storefront settings…</div></section>;
  return <section className="admin-panel admin-wide-panel merch-workspace"><div className="admin-panel-heading"><div><p className="eyebrow">Storefront controls</p><h2>Storefront settings</h2><p className="muted">Manage visible promises, fulfilment defaults, COD availability, and homepage metadata without changing the layout.</p></div></div>{(error || status) && <p className={error ? "inline-error" : "inline-note"} role="status">{error || status}</p>}<form className="settings-react-form" onSubmit={save}>
    <fieldset className="settings-react-block"><legend>Announcement bar</legend><label className="merch-checkbox"><input type="checkbox" checked={settings.announcement.visible} onChange={(event) => update(["announcement", "visible"], event.target.checked)} /> Show announcement bar</label><Field label="Announcement text"><input value={settings.announcement.text} maxLength="160" onChange={(event) => update(["announcement", "text"], event.target.value)} required /></Field></fieldset>
    <fieldset className="settings-react-block"><legend>Trust strip</legend><label className="merch-checkbox"><input type="checkbox" checked={settings.trust_strip.visible} onChange={(event) => update(["trust_strip", "visible"], event.target.checked)} /> Show trust strip</label><p className="form-hint">Hide individual promises while keeping the template intact; remaining items reflow automatically.</p><div className="trust-react-grid">{settings.trust_strip.items.map((item, index) => <article className="trust-react-item" key={item.id}><label className="merch-checkbox"><input type="checkbox" checked={item.visible} onChange={(event) => update(["trust_strip", "items", index, "visible"], event.target.checked)} /> Show {item.id} promise</label><Field label="Title"><input value={item.title} maxLength="70" onChange={(event) => update(["trust_strip", "items", index, "title"], event.target.value)} /></Field><Field label="Supporting text"><input value={item.body} maxLength="120" onChange={(event) => update(["trust_strip", "items", index, "body"], event.target.value)} /></Field></article>)}</div></fieldset>
     <div className="settings-react-grid"><fieldset className="settings-react-block"><legend>Payment availability</legend><label className="merch-checkbox"><input type="checkbox" checked={settings.payments.cod_enabled} onChange={(event) => update(["payments", "cod_enabled"], event.target.checked)} /> Allow Cash on Delivery</label><p className="form-hint">When disabled, new COD orders are blocked. Existing orders stay unchanged.</p></fieldset><fieldset className="settings-react-block"><legend>Fulfilment defaults</legend><Field label="Warehouse / seller address · Ship From"><textarea rows="5" maxLength="320" value={settings.fulfillment.warehouse_address} onChange={(event) => update(["fulfillment", "warehouse_address"], event.target.value)} placeholder="Glamia Fulfilment Hub&#10;12 Fashion Street&#10;Mumbai, Maharashtra 400001" /></Field><p className="form-hint">This address appears on newly generated shipping labels.</p></fieldset></div>
     <fieldset className="settings-react-block"><legend>Customer contact</legend><label className="merch-checkbox"><input type="checkbox" checked={settings.support_contact.visible} onChange={(event) => update(["support_contact", "visible"], event.target.checked)} /> Show support mobile number on Contact us page</label><PhoneField label="Support mobile number" countryCode={settings.support_contact.country_code} number={settings.support_contact.phone_number} onCountryCodeChange={(value) => update(["support_contact", "country_code"], value)} onNumberChange={(value) => update(["support_contact", "phone_number"], value)} required={settings.support_contact.visible} /><p className="form-hint">The number stays hidden from shoppers until this switch is enabled. Email support remains support@glamiastore.com.</p></fieldset>
    <fieldset className="settings-react-block"><legend>SEO &amp; sharing</legend><div className="settings-react-grid"><Field label="Homepage title"><input maxLength="120" value={settings.seo.title} onChange={(event) => update(["seo", "title"], event.target.value)} /></Field><Field label="Social sharing image URL"><input type="url" maxLength="500" value={settings.seo.image} onChange={(event) => update(["seo", "image"], event.target.value)} placeholder="https://…" /></Field><Field wide label="Homepage description"><textarea rows="3" maxLength="220" value={settings.seo.description} onChange={(event) => update(["seo", "description"], event.target.value)} /></Field></div></fieldset>
    {(error || status) && <p className={error ? "inline-error" : "inline-note"} role="status">{error || status}</p>}<div className="form-actions"><button className="primary-action" type="submit" disabled={busy}>{busy ? "Saving…" : "Save storefront settings"} <span aria-hidden="true">↗</span></button></div>
  </form></section>;
}
