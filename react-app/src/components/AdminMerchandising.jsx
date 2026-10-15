import { ScheduledDateTimeField } from './ScheduledDateTimeField';
import { istDateTimeInput, parseISTInput } from '../../../src/time-zone.js';
import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "../lib/api";
import { Icon } from "./Icon";
import { PhoneField } from "./PhoneField";
import { WibrawlReelStudio } from "./WibrawlReelStudio";
import { CinematicReel } from "./CinematicReel";
import { WibrawlCarousel } from "./WibrawlHome";
import { HeroSlideQueue } from "./HeroSlideQueue";
import { WIBRAWL_HERO_LAYOUTS, storefrontForUrl } from '../../../src/storefront-identity.js';

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
  { id: "secure", visible: true, title: "Secure Payments", body: "Protected checkout with trusted providers" },
];

const SOCIAL_FIELDS = [
  { id: "instagram", label: "Instagram", placeholder: "https://instagram.com/glamia" },
  { id: "facebook", label: "Facebook", placeholder: "https://facebook.com/glamia" },
  { id: "youtube", label: "YouTube", placeholder: "https://youtube.com/@glamia" },
  { id: "tiktok", label: "TikTok", placeholder: "https://tiktok.com/@glamia" },
  { id: "pinterest", label: "Pinterest", placeholder: "https://pinterest.com/glamia" },
  { id: "x", label: "X", placeholder: "https://x.com/glamia" },
  { id: "linkedin", label: "LinkedIn", placeholder: "https://linkedin.com/company/glamia" },
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

function emptyHeroForm(storefront = "glamia") {
  return { variant: "editorial", layout: "poster", imagery: "products", eyebrow: storefront === "wibrawl" ? "The Wibrawl Edit" : "The Glamia Edit", title: "", tagline: "", cta_label: "Shop the edit", cta_category: "", words: "", active: true, position: "" };
}

export function HeroStudioView({ products, categories, user }) {
  const [storefront, setStorefront] = useState(() => storefrontForUrl(window.location.href));
  const [previewTheme, setPreviewTheme] = useState("gaming");
  const loadGeneration = useRef(0);
  const heroEndpoint = `/api/admin/hero?storefront=${storefront}`;
  const slideEndpoint = id => `/api/admin/hero/${encodeURIComponent(id)}?storefront=${storefront}`;
  const brand = storefront === "wibrawl" ? "Wibrawl" : "Glamia";
  const [slides, setSlides] = useState([]);
  const [insights, setInsights] = useState({ recommendations: {}, return_note: "" });
  const [form, setForm] = useState(() => emptyHeroForm(storefront));
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [editingId, setEditingId] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [previewIndex, setPreviewIndex] = useState(0);

  const liveProducts = useMemo(() => products.filter((product) => product.status === "live" && [storefront, "both"].includes(product.storefront_visibility || "glamia")), [products, storefront]);
  const liveProductIds = new Set(liveProducts.map((product) => product.id));

  async function load() {
    const generation = ++loadGeneration.current;
    setError("");
    try {
      const [slidesResponse, insightsResponse] = await Promise.all([apiFetch(heroEndpoint), apiFetch(`/api/admin/hero/insights?storefront=${storefront}`)]);
      const [slideData, insightData] = await Promise.all([readResponse(slidesResponse, "Hero slides could not be loaded"), readResponse(insightsResponse, "Hero insights could not be loaded")]);
      if (generation !== loadGeneration.current) return;
      setSlides(slideData.slides || []);
      setInsights(insightData);
    } catch (requestError) { if (generation === loadGeneration.current) setError(requestError.message); }
  }

  useEffect(() => { load(); return () => { loadGeneration.current++; }; }, [storefront]);
  useEffect(() => { if (previewIndex >= slides.length && slides.length) setPreviewIndex(0); }, [previewIndex, slides.length]);

  const previewSlide = slides[previewIndex] || null;
  const previewUsesForm = Boolean(editingId) || selectedProducts.length > 0;
  const previewProducts = (previewUsesForm ? selectedProducts.map((id) => liveProducts.find((product) => product.id === id)).filter(Boolean) : previewSlide?.frames || []).slice(0, 3);
  const previewEyebrow = previewUsesForm ? form.eyebrow : previewSlide?.eyebrow;
  const previewTitle = previewUsesForm ? form.title : previewSlide?.title;
  const previewTagline = previewUsesForm ? form.tagline : previewSlide?.tagline;
  const previewWords = (previewUsesForm ? form.words.split(",").map((word) => word.trim()).filter(Boolean) : previewSlide?.words || []).slice(0, 4);
  const previewVariant = "editorial";
  const previewLayout = previewUsesForm ? form.layout : previewSlide?.layout || "poster";
  const previewImagery = previewUsesForm ? form.imagery : previewSlide?.imagery || "products";

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
    setForm({ variant: slide.variant || "editorial", layout: slide.layout || "poster", imagery: slide.imagery || "products", eyebrow: slide.eyebrow || "The Glamia Edit", title: slide.title || "", tagline: slide.tagline || "", cta_label: slide.cta_label || "Shop the edit", cta_category: slide.cta_category || "", words: (slide.words || []).join(", "), active: Boolean(slide.active), position: String(slide.position ?? "") });
    setSelectedProducts((slide.product_ids || []).filter((id) => liveProductIds.has(id)).slice(0, 3));
    const slideIndex = slides.findIndex((item) => item.id === slide.id);
    if (slideIndex >= 0) setPreviewIndex(slideIndex);
    document.getElementById("hero-slide-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function resetForm() {
    setEditingId(""); setForm(emptyHeroForm(storefront)); setSelectedProducts([]); setStatus("");
  }

  async function submit(event) {
    event.preventDefault(); setBusy(true); setStatus(""); setError("");
    try {
      if (!selectedProducts.length) throw new Error("Select at least one live product frame.");
      const payload = { ...form, variant: "editorial", words: form.words.split(",").map((word) => word.trim()).filter(Boolean), product_ids: selectedProducts, position: editingId ? Number(form.position) : null };
      const response = await apiFetch(editingId ? slideEndpoint(editingId) : heroEndpoint, { method: editingId ? "PATCH" : "POST", body: JSON.stringify(payload) });
      await readResponse(response, "Hero slide could not be saved");
      const message = editingId ? "Hero slide updated." : "Hero slide published.";
      resetForm(); setStatus(message); await load();
    } catch (requestError) { setError(requestError.message); } finally { setBusy(false); }
  }

  async function deleteSlide(slide) {
    if (!window.confirm(`Delete “${slide.title}”?`)) return;
    setBusy(true); setError("");
    try { const response = await apiFetch(slideEndpoint(slide.id), { method: "DELETE" }); await readResponse(response, "Hero slide could not be deleted"); if (editingId === slide.id) resetForm(); setStatus("Hero slide deleted."); await load(); } catch (requestError) { setError(requestError.message); } finally { setBusy(false); }
  }

  async function reorderSlides(ordered) {
    const currentId = slides[previewIndex]?.id;
    const previous = slides;
    setBusy(true); setError(""); setStatus(""); setSlides(ordered);
    setPreviewIndex(Math.max(0, ordered.findIndex(slide => slide.id === currentId)));
    try {
      const response = await apiFetch(`/api/admin/hero/order?storefront=${storefront}`, {method:"PUT", body:JSON.stringify({ids:ordered.map(slide => slide.id)})});
      await readResponse(response, "Slide order could not be saved");
      if (editingId) setForm(current => ({...current, position:String(ordered.findIndex(slide => slide.id === editingId))}));
      setStatus("Slide order saved. Top plays first."); await load();
    } catch (reason) { setSlides(previous); setPreviewIndex(Math.max(0, previous.findIndex(slide => slide.id === currentId))); await load(); setError(reason.message); }
    finally { setBusy(false); }
  }
  async function setSlideVisibility(slide, active) {
    const previous = slides;
    setSlides(current => current.map(item => item.id === slide.id ? {...item, active} : item));
    setBusy(true); setError(""); setStatus("");
    try {
      const response = await apiFetch(slideEndpoint(slide.id), {method:"PATCH", body:JSON.stringify({active})});
      await readResponse(response, "Slide visibility could not be saved");
      if (editingId === slide.id) setForm(current => ({...current, active}));
      setStatus(active ? "Slide is now shown on home." : "Slide is hidden from home."); await load();
    } catch (reason) { setSlides(previous); setError(reason.message); }
    finally { setBusy(false); }
  }

  return <><section className="admin-panel admin-wide-panel merch-workspace">
    <div className="admin-panel-heading"><div><p className="eyebrow">Merchandising</p><h2>Hero Studio</h2><p className="muted">Build the {brand} home carousel using live products assigned to this storefront.</p><label className="wibrawl-admin-visibility">Storefront<select aria-label="Hero storefront" value={storefront} disabled={busy} onChange={event => { const next = event.target.value; loadGeneration.current++; setStorefront(next); setSlides([]); setInsights({ recommendations: {} }); setEditingId(""); setForm(emptyHeroForm(next)); setSelectedProducts([]); setPreviewIndex(0); setStatus(""); setError(""); }}><option value="glamia">Glamia</option><option value="wibrawl">Wibrawl</option></select></label></div><span>{slides.length} slides</span></div>
    

    <div className="merch-preview-dock">
      <div className="merch-preview-heading"><div><p className="eyebrow">Live preview</p><strong>Updates as you edit</strong></div><span>Responsive composition</span></div>
      {storefront === "wibrawl" ? <>
        <label className="wibrawl-admin-visibility">Preview theme<select aria-label="Wibrawl preview theme" value={previewTheme} onChange={event => setPreviewTheme(event.target.value)}><option value="gaming">Gaming</option><option value="sports">Sports</option></select></label>
        <div className={`wibrawl-admin-preview wibrawl-home-${previewTheme}`} data-preview-theme={previewTheme}>
          {previewProducts.length ? <WibrawlCarousel preview slides={[{ layout: previewLayout, imagery: previewImagery, id: editingId || previewSlide?.id || "preview", eyebrow: previewEyebrow || "The Wibrawl Edit", title: previewTitle || "Your vibe. Your rules.", tagline: previewTagline || "Graphic tees with a little more you.", cta_label: (previewUsesForm ? form.cta_label : previewSlide?.cta_label) || "Shop the edit", cta_category: (previewUsesForm ? form.cta_category : previewSlide?.cta_category) || "", words: previewWords, frames: previewProducts.map(product => ({id:product.id,name:product.name,image:imageFor(product)})) }]} onNavigate={() => {}} /> : <p className="wibrawl-preview-empty">Select 1–3 live Wibrawl products to preview your slide.</p>}
        </div>
        {slides.length > 0 && <div className="wibrawl-carousel-controls" role="group" aria-label="Preview a saved Wibrawl slide">{slides.map((item, position) => <button type="button" key={item.id} onClick={() => { resetForm(); setPreviewIndex(position); }} aria-current={position === previewIndex ? "true" : undefined}>Slide {position + 1}</button>)}</div>}
      </> : <section className={`merch-hero-preview merch-hero-preview-${previewVariant}`} aria-label="Hero Studio live preview">
      <div className="merch-preview-copy"><p className="eyebrow">{previewEyebrow || "The Glamia Edit"}</p><h3>{previewTitle || "Everyday pieces, beautifully composed."}</h3><p>{previewTagline || "Build a considered edit from the products already live in your store."}</p>{previewWords.length > 0 && <div className="merch-preview-words">{previewWords.map((word) => <span key={word}>{word}</span>)}</div>}</div>
       <div className={`merch-preview-stage merch-preview-frame-count-${previewProducts.length}`}>{previewProducts.length ? previewProducts.map((product, productIndex) => imageFor(product) ? <div className={`merch-preview-frame merch-preview-frame-${productIndex}`} key={product.id || productIndex}><img src={imageFor(product)} alt={product.name || "Selected hero product"} /></div> : null) : <div className="merch-preview-placeholder"><span>Select 1–3 live product frames below</span></div>}</div>
      <button type="button" className="merch-preview-arrow merch-preview-prev" aria-label="Previous hero slide" onClick={() => { setPreviewIndex((index) => slides.length ? (index - 1 + slides.length) % slides.length : 0); }}><Icon name="chevronLeft" /></button><button type="button" className="merch-preview-arrow merch-preview-next" aria-label="Next hero slide" onClick={() => { setPreviewIndex((index) => slides.length ? (index + 1) % slides.length : 0); }}><Icon name="chevronRight" /></button>
      {slides.length > 0 && <div className="merch-preview-progress" role="group" aria-label={`Hero preview slide ${previewIndex + 1} of ${slides.length}`}>{slides.map((slideItem, itemIndex) => <button type="button" key={slideItem.id || itemIndex} className={itemIndex === previewIndex ? "active" : ""} onClick={() => { setPreviewIndex(itemIndex); }} aria-label={`Show hero preview slide ${itemIndex + 1}`} />)}</div>}
      </section>}
      <HeroSlideQueue slides={slides} busy={busy} previewIndex={previewIndex} onPreview={index => { resetForm(); setPreviewIndex(index); }} onReorder={reorderSlides} onVisibility={setSlideVisibility} onEdit={editSlide} onDelete={deleteSlide} />
      {(status || error) && <p className={error ? "inline-error" : "inline-note"} role="status">{error || status}</p>}
    </div>
    <div className="merch-studio-grid">
      <form id="hero-slide-form" className="merch-form" onSubmit={submit}>
        <div className="merch-form-heading"><div><p className="eyebrow">{editingId ? "Edit slide" : "New slide"}</p><h3>{editingId ? "Refine this edit" : "Create a hero moment"}</h3></div><span>{selectedProducts.length}/3 frames</span></div>
        <div className="merch-form-grid"><Field label="Carousel treatment">{storefront === "wibrawl" ? <select name="layout" value={form.layout} onChange={changeField}>{WIBRAWL_HERO_LAYOUTS.map(layout => <option key={layout} value={layout}>{layout === "poster" ? "Poster · oversized type" : layout === "collage" ? "Collage · playful cut-outs" : "Split · image-led edit"}</option>)}</select> : <input value="Editorial · layered frames" readOnly />}</Field>{storefront === "wibrawl" && <Field label="Hero imagery" hint="The campaign concept is styling inspiration; product links always use your selected listings."><select aria-label="Hero imagery" name="imagery" value={form.imagery} onChange={changeField}><option value="products">Selected product images</option><option value="campaign">Wibrawl streetwear campaign</option></select></Field>}<Field label="Eyebrow"><input name="eyebrow" value={form.eyebrow} onChange={changeField} maxLength="60" /></Field><Field label="Headline"><input name="title" value={form.title} onChange={changeField} maxLength="100" required placeholder="The new evening edit" /></Field><Field wide label="Tagline"><textarea name="tagline" value={form.tagline} onChange={changeField} maxLength="240" rows="3" required placeholder="A short line that sets the mood for this collection." /></Field><Field label="CTA label"><input name="cta_label" value={form.cta_label} onChange={changeField} maxLength="40" /></Field><Field label="CTA destination"><select name="cta_category" value={form.cta_category} onChange={changeField}><option value="">No destination</option>{categories.map((category) => <option key={category} value={category}>{category}</option>)}</select></Field><Field wide label="Style words" hint="Optional words shown beside the images, separated by commas."><input name="words" value={form.words} onChange={changeField} maxLength="120" placeholder="SILK, EVENING, NEW SEASON" /></Field></div>
        <label className="merch-checkbox"><input name="active" type="checkbox" checked={form.active} onChange={changeField} /> Publish this slide on the home page</label>
        <div className="merch-product-picker"><div className="merch-section-heading"><div><p className="eyebrow">Product frames</p><h3>Select 1–3 live products</h3></div><span>{liveProducts.length} live</span></div><div className="merch-product-options">{liveProducts.map((product) => <label className={`merch-product-option ${selectedProducts.includes(product.id) ? "selected" : ""}`} key={product.id}><input type="checkbox" checked={selectedProducts.includes(product.id)} onChange={() => toggleProduct(product.id)} /><span>{imageFor(product) ? <img src={imageFor(product)} alt="" loading="lazy" /> : <span className="merch-image-placeholder" />}<strong>{product.name}</strong><small>{product.category || "Catalog"}</small></span></label>)}{!liveProducts.length && <p className="muted">Publish a live product before creating a hero slide.</p>}</div></div>
        <div className="form-actions"><button type="button" className="secondary-action" onClick={resetForm}>Reset</button><button className="primary-action" type="submit" disabled={busy || !liveProducts.length}>{busy ? "Saving…" : editingId ? "Save slide" : "Publish slide"} </button></div>
      </form>
      <aside className="merch-insights"><div className="merch-section-heading"><div><p className="eyebrow">Merchandising signals</p><h3>What should lead?</h3></div></div><p className="muted">{insights.return_note || "Rankings use current store activity and sales data."}</p>{Object.entries(INSIGHT_LABELS).map(([key, label]) => <InsightCard key={key} label={label} products={insights.recommendations?.[key] || []} onUse={() => applyInsight(key)} />)}</aside>
    </div>

  </section>{(!user?.employee_id || user.is_owner || user.employee_permissions?.cinematic_reel === true) && (storefront === "wibrawl" ? <WibrawlReelStudio key={storefront} products={products} /> : <CinematicReelStudio key={storefront} products={products} />)}</>;
}

const DEFAULT_CINEMATIC_REEL = {
  visible: true,
  eyebrow: "The current mood",
  title: "Pieces that move",
  emphasis: "with you.",
  description: "",
  product_ids: []
};

function CinematicReelStudio({ products }) {
  const [draft, setDraft] = useState(DEFAULT_CINEMATIC_REEL);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const liveProducts = useMemo(() => products.filter((product) => product.status === "live" && ["glamia", "both"].includes(product.storefront_visibility || "glamia")), [products]);
  const selectedIds = Array.isArray(draft.product_ids) ? draft.product_ids : [];

  useEffect(() => {
    let active = true;
    apiFetch("/api/admin/cinematic-reel?storefront=glamia")
      .then((response) => readResponse(response, "Cinematic Reel settings could not be loaded"))
      .then((data) => active && setDraft({ ...DEFAULT_CINEMATIC_REEL, ...(data.cinematic_reel || {}), product_ids: Array.isArray(data.cinematic_reel?.product_ids) ? data.cinematic_reel.product_ids : [] }))
      .catch((requestError) => active && setError(requestError.message));
    return () => { active = false; };
  }, []);

  function changeField(event) {
    const { name, value, type, checked } = event.target;
    setDraft((current) => ({ ...current, [name]: type === "checkbox" ? checked : value }));
  }

  function toggleProduct(id) {
    setDraft((current) => {
      const currentIds = Array.isArray(current.product_ids) ? current.product_ids : [];
      return { ...current, product_ids: currentIds.includes(id) ? currentIds.filter((item) => item !== id) : currentIds.length < 8 ? [...currentIds, id] : currentIds };
    });
  }

  async function save(event) {
    event.preventDefault(); setBusy(true); setStatus(""); setError("");
    try {
      const response = await apiFetch("/api/admin/cinematic-reel?storefront=glamia", { method: "PUT", body: JSON.stringify({ cinematic_reel: draft }) });
      const data = await readResponse(response, "Cinematic Reel settings could not be saved");
      setDraft({ ...DEFAULT_CINEMATIC_REEL, ...(data.cinematic_reel || {}) });
      setStatus("Cinematic Reel saved.");
    } catch (requestError) { setError(requestError.message); } finally { setBusy(false); }
  }

  return <section className="admin-panel admin-wide-panel merch-workspace cinematic-reel-studio">
    <div className="admin-panel-heading"><div><p className="eyebrow">Domain specific · Glamia</p><h2>Cinematic Reel Studio</h2><p className="muted">Customize the Glamia lower homepage reel and preview the exact storefront composition while you edit it.</p></div><span>{selectedIds.length ? `${selectedIds.length} chosen` : "Automatic selection"}</span></div>
    <div className="merch-preview-dock"><div className="merch-preview-heading"><div><p className="eyebrow">Cinematic Reel preview</p><strong>Matches the storefront reel</strong></div><span>Exact home composition</span></div><CinematicReel products={products} settings={draft} /></div>
    <div className="merch-studio-grid"><form className="merch-form" onSubmit={save}><div className="merch-form-heading"><div><p className="eyebrow">Reel settings</p><h3>Shape the current mood</h3></div><span>{selectedIds.length}/8 products</span></div><label className="merch-checkbox"><input name="visible" type="checkbox" checked={draft.visible !== false} onChange={changeField} /> Show Cinematic Reel on home page</label><div className="merch-form-grid"><Field label="Eyebrow"><input name="eyebrow" value={draft.eyebrow} onChange={changeField} maxLength="70" /></Field><Field label="Title"><input name="title" value={draft.title} onChange={changeField} maxLength="100" required /></Field><Field label="Emphasis"><input name="emphasis" value={draft.emphasis} onChange={changeField} maxLength="100" required /></Field><Field wide label="Description" hint="Optional supporting copy shown below the title."><textarea name="description" value={draft.description} onChange={changeField} maxLength="180" rows="3" /></Field></div><div className="merch-product-picker"><div className="merch-section-heading"><div><p className="eyebrow">Reel products</p><h3>Choose up to 8 live products</h3></div><button type="button" className="secondary-action" onClick={() => setDraft((current) => ({ ...current, product_ids: [] }))} disabled={!selectedIds.length}>Use automatic selection</button></div><p className="form-hint">Leave product selection empty to keep automatic variant-balanced products.</p><div className="merch-product-options">{liveProducts.map((product) => <label className={`merch-product-option ${selectedIds.includes(product.id) ? "selected" : ""}`} key={product.id}><input type="checkbox" checked={selectedIds.includes(product.id)} onChange={() => toggleProduct(product.id)} /><span>{imageFor(product) ? <img src={imageFor(product)} alt="" loading="lazy" /> : <span className="merch-image-placeholder" />}<strong>{product.name}</strong><small>{product.category || "Catalog"}</small></span></label>)}{!liveProducts.length && <p className="muted">Publish a live product before selecting reel products.</p>}</div></div>{(error || status) && <p className={error ? "inline-error" : "inline-note"} role="status">{error || status}</p>}<div className="form-actions"><button className="primary-action" type="submit" disabled={busy}>{busy ? "Saving…" : "Save Cinematic Reel"} </button></div></form><aside className="merch-insights"><div className="merch-section-heading"><div><p className="eyebrow">How it works</p><h3>A living product story</h3></div></div><p className="muted">Automatic selection balances variant groups so several colourways of one listing do not crowd out other products. Manual selection is useful for launches, campaigns, and seasonal edits.</p><div className="merch-insight-card"><strong>Preview behavior</strong><p className="muted">The preview above uses the same Cinematic Reel component as the home page, including its controls, hover treatment, product links, and rotation.</p></div></aside></div>
  </section>;
}

const announcementDateInput = istDateTimeInput;

function storedAnnouncementDate(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const date = parseISTInput(text);
  return Number.isFinite(date.getTime()) ? date.toISOString() : text;
}

function emptyAnnouncementItem() {
  return { id: `announcement-${Date.now()}`, text: "", starts_at: "", ends_at: "" };
}

function normalizeSettings(data) {
  const announcement = data.announcement || {};
  const payments = data.payments || {};
  return { customer_experience: data.customer_experience || {dispatch_min:1,dispatch_max:2,delhi_min:2,delhi_max:3,india_min:7,india_max:8,support_hours:48}, announcement: { visible: Boolean(announcement.visible) && Boolean(String(announcement.text || "").trim()), text: announcement.text || "", items: Array.isArray(announcement.items) ? announcement.items.map((item, index) => ({ id: item.id || `announcement-${index + 1}`, text: item.text || "", starts_at: announcementDateInput(item.starts_at), ends_at: announcementDateInput(item.ends_at) })) : [] }, trust_strip: { visible: data.trust_strip?.visible !== false, items: DEFAULT_TRUST_ITEMS.map((item) => data.trust_strip?.items?.find((entry) => entry.id === item.id) || item) }, fulfillment: data.fulfillment || { warehouse_address: "" }, payments: { razorpay_enabled: payments.razorpay_enabled !== false, phonepe_enabled: payments.phonepe_enabled !== false, gateway_status: payments.gateway_status || {} }, support_contact: data.support_contact || { visible: false, country_code: "+91", phone_number: "" }, socials: Object.fromEntries(SOCIAL_FIELDS.map(({ id }) => [id, data.socials?.[id] || ""])), seo: { title: data.seo?.title || "", description: data.seo?.description || "", image: data.seo?.image || "https://glamiastore.com/glamia-social-banner.png" } };
}

export function StorefrontSettingsView() {
  const [storefront, setStorefront] = useState(() => storefrontForUrl(window.location.href));
  const [settings, setSettings] = useState(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { let active = true; setSettings(null); setError(""); setStatus(""); apiFetch(`/api/admin/storefront-settings?storefront=${storefront}`).then((response) => readResponse(response, "Storefront settings could not be loaded")).then((data) => active && setSettings(normalizeSettings(data))).catch((requestError) => active && setError(requestError.message)); return () => { active = false; }; }, [storefront]);

  function update(path, value) {
    setSettings((current) => { const next = structuredClone(current); let target = next; path.slice(0, -1).forEach((key) => { target = target[key]; }); target[path[path.length - 1]] = value; if (path.join(".") === "announcement.text" && !String(value || "").trim()) next.announcement.visible = false; return next; });
  }

  function addAnnouncement() {
    update(["announcement", "items"], [...(settings.announcement.items || []), emptyAnnouncementItem()]);
  }

  function removeAnnouncement(index) {
    update(["announcement", "items"], (settings.announcement.items || []).filter((_, itemIndex) => itemIndex !== index));
  }

  async function save(event) {
    event.preventDefault(); setBusy(true); setStatus(""); setError("");
    try { const payload = structuredClone(settings); payload.announcement.items = (payload.announcement.items || []).map((item) => ({ ...item, starts_at: storedAnnouncementDate(item.starts_at), ends_at: storedAnnouncementDate(item.ends_at) })); const response = await apiFetch(`/api/admin/storefront-settings?storefront=${storefront}`, { method: "PUT", body: JSON.stringify(payload) }); const data = await readResponse(response, "Storefront settings could not be saved"); setSettings(normalizeSettings(data)); setStatus("Storefront settings saved."); } catch (requestError) { setError(requestError.message); } finally { setBusy(false); }
  }

  if (!settings) return <section className="admin-panel admin-wide-panel"><div className="loading-card">{error || "Loading storefront settings…"}</div></section>;
  return <section className="admin-panel admin-wide-panel storefront-settings-workspace"><div className="admin-panel-heading"><div><p className="eyebrow">Storefront controls</p><h2>Storefront settings</h2><p className="muted">Manage visible promises, fulfilment defaults, live payment gateways, and homepage metadata without changing the layout. Business settings are shared across both brands; socials belong to the selected storefront.</p></div><label className="field"><span>Socials storefront</span><select aria-label="Socials storefront" value={storefront} disabled={busy} onChange={event => setStorefront(event.target.value)}><option value="glamia">Glamia</option><option value="wibrawl">Wibrawl</option></select></label></div>{(error || status) && <p className={error ? "inline-error" : "inline-note"} role="status">{error || status}</p>}<form className="settings-react-form" onSubmit={save}>
    <fieldset className="settings-react-block"><legend>Announcement bar</legend><label className="merch-checkbox"><input type="checkbox" checked={settings.announcement.visible} disabled={!String(settings.announcement.text || "").trim()} onChange={(event) => update(["announcement", "visible"], event.target.checked)} /> Show announcement bar</label><Field label="Permanent announcement text"><input value={settings.announcement.text} maxLength="160" onChange={(event) => update(["announcement", "text"], event.target.value)} required /></Field><p className="form-hint">This is the permanent message shown when no scheduled announcement is active.</p><div className="announcement-scheduled-list"><div className="announcement-scheduled-heading"><strong>Optional scheduled announcements</strong><span className="form-hint">Scroll continuously during their time window, then disappear automatically</span></div>{(settings.announcement.items || []).map((item, index) => <article className="announcement-scheduled-item" key={item.id || index}><Field label="Scheduled text"><input value={item.text} maxLength="160" onChange={(event) => update(["announcement", "items", index, "text"], event.target.value)} placeholder="Limited-time drop, offer, or update" /></Field><div className="settings-react-grid"><ScheduledDateTimeField label="Starts (IST)" secondsLabel="Start seconds (IST)" className="merch-field" value={item.starts_at || ""} onChange={(event) => update(["announcement", "items", index, "starts_at"], event.target.value)} /><ScheduledDateTimeField label="Ends (IST)" secondsLabel="Start seconds (IST)" className="merch-field" value={item.ends_at || ""} required={Boolean(item.text || item.starts_at)} onChange={(event) => update(["announcement", "items", index, "ends_at"], event.target.value)} /></div><button type="button" className="text-link" onClick={() => removeAnnouncement(index)}>Remove scheduled announcement</button></article>)}<button type="button" className="secondary-action" onClick={addAnnouncement}>+ Add scheduled announcement</button></div></fieldset>
    <fieldset className="settings-react-block"><legend>Trust strip</legend><label className="merch-checkbox"><input type="checkbox" checked={settings.trust_strip.visible} onChange={(event) => update(["trust_strip", "visible"], event.target.checked)} /> Show trust strip</label><p className="form-hint">Hide individual promises while keeping the template intact; remaining items reflow automatically.</p><div className="trust-react-grid">{settings.trust_strip.items.map((item, index) => <article className="trust-react-item" key={item.id}><label className="merch-checkbox"><input type="checkbox" checked={item.visible} onChange={(event) => update(["trust_strip", "items", index, "visible"], event.target.checked)} /> Show {item.id} promise</label><Field label="Title"><input value={item.title} maxLength="70" onChange={(event) => update(["trust_strip", "items", index, "title"], event.target.value)} /></Field><Field label="Supporting text"><input value={item.body} maxLength="120" onChange={(event) => update(["trust_strip", "items", index, "body"], event.target.value)} /></Field></article>)}</div></fieldset>
     <div className="settings-react-grid"><fieldset className="settings-react-block"><legend>Payment gateways</legend><p className="form-hint">Live gateways appear at checkout only after their server credentials and webhook are configured.</p><div className="gateway-setting"><div><strong>Razorpay</strong><span>Cards, UPI, netbanking and wallets</span></div><label className="merch-checkbox"><input type="checkbox" checked={settings.payments.razorpay_enabled} disabled={!settings.payments.gateway_status?.razorpay?.ready} onChange={(event) => update(["payments", "razorpay_enabled"], event.target.checked)} /> {settings.payments.gateway_status?.razorpay?.ready ? "Enabled" : settings.payments.gateway_status?.razorpay?.configured ? "Webhook needed" : "Credentials needed"}</label></div><div className="gateway-setting"><div><strong>PhonePe</strong><span>UPI, cards and netbanking</span></div><label className="merch-checkbox"><input type="checkbox" checked={settings.payments.phonepe_enabled} disabled={!settings.payments.gateway_status?.phonepe?.ready} onChange={(event) => update(["payments", "phonepe_enabled"], event.target.checked)} /> {settings.payments.gateway_status?.phonepe?.ready ? "Enabled" : settings.payments.gateway_status?.phonepe?.configured ? "Webhook needed" : "Credentials needed"}</label></div><p className="form-hint">Only configured live gateways are shown to shoppers. Provider credentials are stored as Worker secrets, not in this page.</p></fieldset><fieldset className="settings-react-block"><legend>Fulfilment defaults</legend><Field label="Warehouse / seller address · Ship From"><textarea rows="5" maxLength="320" value={settings.fulfillment.warehouse_address} onChange={(event) => update(["fulfillment", "warehouse_address"], event.target.value)} placeholder="Glamia Fulfilment Hub&#10;12 Fashion Street&#10;Mumbai, Maharashtra 400001" /></Field><p className="form-hint">This address appears on newly generated shipping labels.</p></fieldset></div>
    <fieldset className="settings-react-block"><legend>Delivery estimates and care response</legend><p className="form-hint">Manual estimates, not courier-confirmed dates. Response hours are a care target, not a guaranteed resolution.</p><div className="settings-react-grid">{Object.entries({dispatch_min:"Dispatch minimum days",dispatch_max:"Dispatch maximum days",delhi_min:"Delhi delivery minimum days",delhi_max:"Delhi delivery maximum days",india_min:"Other India delivery minimum days",india_max:"Other India delivery maximum days",support_hours:"Care reply target (hours)"}).map(([key,label])=><Field key={key} label={label}><input type="number" min="1" max="240" value={settings.customer_experience[key]} onChange={event=>update(["customer_experience",key],Number(event.target.value))}/></Field>)}</div></fieldset>
     <fieldset className="settings-react-block"><legend>Customer contact</legend><label className="merch-checkbox"><input type="checkbox" checked={settings.support_contact.visible} onChange={(event) => update(["support_contact", "visible"], event.target.checked)} /> Show support mobile number on Contact us page</label><PhoneField label="Support mobile number" countryCode={settings.support_contact.country_code} number={settings.support_contact.phone_number} onCountryCodeChange={(value) => update(["support_contact", "country_code"], value)} onNumberChange={(value) => update(["support_contact", "phone_number"], value)} required={settings.support_contact.visible} /><p className="form-hint">The number stays hidden from shoppers until this switch is enabled. Email support remains support@glamiastore.com.</p></fieldset>
    <fieldset className="settings-react-block socials-settings"><legend>{storefront === "wibrawl" ? "Wibrawl" : "Glamia"} socials · Domain specific</legend><p className="form-hint">These links appear only on {storefront === "wibrawl" ? "Wibrawl" : "Glamia"}. Add the official profiles you want shoppers to discover. Empty links stay hidden from the website footer.</p><div className="settings-react-grid socials-react-grid">{SOCIAL_FIELDS.map((social) => <Field key={social.id} label={social.label}><input type="url" maxLength="500" value={settings.socials[social.id]} onChange={(event) => update(["socials", social.id], event.target.value)} placeholder={storefront === "wibrawl" ? social.placeholder.replaceAll("glamia", "wibrawl") : social.placeholder} /></Field>)}</div><p className="form-hint">Links must use HTTPS and belong to the matching social platform.</p></fieldset>
    <fieldset className="settings-react-block"><legend>SEO &amp; sharing · Domain specific · Glamia</legend><div className="settings-react-grid"><Field label="Homepage title"><input maxLength="120" value={settings.seo.title} onChange={(event) => update(["seo", "title"], event.target.value)} /></Field><Field label="Social sharing image URL"><input type="url" maxLength="500" value={settings.seo.image} onChange={(event) => update(["seo", "image"], event.target.value)} placeholder="https://…" /></Field><Field wide label="Homepage description"><textarea rows="3" maxLength="220" value={settings.seo.description} onChange={(event) => update(["seo", "description"], event.target.value)} /></Field></div></fieldset>
<div className="form-actions"><button className="primary-action" type="submit" disabled={busy}>{busy ? "Saving…" : "Save storefront settings"} </button></div>
  </form></section>;
}
