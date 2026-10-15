import React, { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";
import { productImage, normalizeProduct } from "../lib/productPresentation";
import { Link, categoryHref, productSubcategory, productSubSubcategory } from "./Header";
import { sellingPrice, availableQuantity, isPreorder, preorderRemaining, formatIST, productUrl } from "../lib/commerce";
import { rememberProduct } from "../lib/recentlyViewed";
import { deliveryPromise } from "../lib/deliveryPromise";
import { colourSwatchStyle } from "../lib/colours";
import { Icon } from "./Icon";
import { SpecialPrice } from "./SpecialPrice";
import { ProductGuarantees } from "./ProductGuarantees";
import { ProductReviews } from "./Reviews";
import { productMedia, productMediaSrcSet, recoverProductMedia } from '../lib/productMedia';
import { readProductBootstrap } from '../lib/productBootstrap';

function setMetaDescription(text) {
  const meta = document.querySelector('meta[name="description"]');
  if (meta) meta.setAttribute("content", String(text || "").slice(0, 300));
}

function productImages(product) {
  const images = Array.isArray(product?.images) ? product.images : [];
  return [...new Set((images.length ? images : [productImage(product)]).filter(Boolean))];
}

function colourwaySwatchClass(value) {
  const colour = String(value || "").trim().toLowerCase();
  if (/black|charcoal|graphite|midnight|navy/.test(colour)) return "colourway-swatch-ink";
  if (/white|ivory|cream|pearl|beige|sand/.test(colour)) return "colourway-swatch-light";
  if (/red|maroon|burgundy|wine|rose|pink/.test(colour)) return "colourway-swatch-rose";
  if (/orange|rust|terracotta|gold|yellow|mustard/.test(colour)) return "colourway-swatch-gold";
  if (/green|olive|mint|teal|emerald/.test(colour)) return "colourway-swatch-green";
  if (/blue|cyan|aqua|lilac|purple|violet|plum/.test(colour)) return "colourway-swatch-blue";
  return "colourway-swatch-accent";
}

function DeliveryEstimate() {
  const [pin, setPin] = useState("");
  const [result, setResult] = useState("");
  const [busy, setBusy] = useState(false);
  async function check(event) {
    event.preventDefault();
    setBusy(true); setResult("");
    try {
      const response = await apiFetch(`/api/postal-lookup?pin=${encodeURIComponent(pin)}`, { cacheTtl: 300000 });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Enter a valid Indian PIN code");
      setResult(`Postal area: ${data.city || data.district || "your area"}. ${data.delivery_estimate||deliveryPromise(data.state)} This lookup confirms a postal location, not courier serviceability.`);
    } catch (error) { setResult(error.message); } finally { setBusy(false); }
  }
  return <section className="product-care-card"><div><p className="eyebrow">Delivery estimate</p><strong>Check your PIN code</strong></div><form className="delivery-check" onSubmit={check}><input inputMode="numeric" pattern="[0-9]{6}" maxLength="6" value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))} placeholder="6-digit Indian PIN" aria-label="Indian PIN code" required /><button type="submit" className="secondary-action" disabled={busy}>{busy ? "Checking…" : "Check"}</button></form>{result && <p className="form-hint" role="status">{result}</p>}</section>;
}

function ProductQuestions({ productId, user, onNavigate }) {
  const [questions, setQuestions] = useState([]);
  const [question, setQuestion] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { let active = true; apiFetch(`/api/products/${encodeURIComponent(productId)}/questions?cache=1`, { cacheTtl: 30000 }).then((response) => response.ok ? response.json() : {}).then((data) => active && setQuestions(data.questions || [])).catch(() => {}); return () => { active = false; }; }, [productId]);
  async function ask(event) {
    event.preventDefault(); setBusy(true); setStatus("");
    try {
      const response = await apiFetch(`/api/products/${encodeURIComponent(productId)}/questions`, { method: "POST", body: JSON.stringify({ question }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Question could not be sent");
      setQuestion(""); setStatus("Question sent for review. We’ll publish the answer once it is ready.");
    } catch (error) { setStatus(error.message); } finally { setBusy(false); }
  }
  return <section className="product-questions"><div className="product-care-heading"><div><p className="eyebrow">Product care</p><h2>Questions & answers</h2></div><span>{questions.length} answered</span></div>{questions.length ? <div className="question-list">{questions.map((item) => <article key={item.id}><strong>Q: {item.question}</strong><p>A: {item.answer}</p></article>)}</div> : <p className="muted">Ask about fit, fabric, or care and our team will help.</p>}{user ? <form className="question-form" onSubmit={ask}><label className="sr-only" htmlFor="productQuestion">Ask a question</label><textarea id="productQuestion" rows="3" maxLength="600" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask about this piece…" required /><button className="secondary-action" disabled={busy}>{busy ? "Sending…" : "Ask a question"}</button></form> : <button type="button" className="text-link" onClick={() => onNavigate("/login")}>Sign in to ask a question</button>}{status && <p className="form-hint" role="status">{status}</p>}</section>;
}

function ProductDetailPage({ productRef, productPathContext = null, products = [], onNavigate, addToCart, wishlist, toggleWishlist, user, onProductLoaded, eventLive = false, initialProduct = null, wibrawlMode = false }) {
  const brandName = wibrawlMode ? "Wibrawl" : "Glamia";
  const [seed] = useState(() => initialProduct || readProductBootstrap(productRef));
  const [product, setProduct] = useState(() => seed ? normalizeProduct(seed) : null);
  const [loading, setLoading] = useState(!seed);
  const [size, setSize] = useState("");
  const [message, setMessage] = useState("");
  const [imageIndex, setImageIndex] = useState(0);
  const [showVideo, setShowVideo] = useState(false);
  const [zoomPoint, setZoomPoint] = useState(null);
  const [touchStart, setTouchStart] = useState(null);
  const [colourways, setColourways] = useState([]);
  useEffect(() => { let active = true; const seeded = seed?.id && (productRef === seed.id || String(productRef).endsWith(`-${seed.id}`)); if (!seeded) { setLoading(true); setProduct(null); setSize(""); } setColourways([]); setImageIndex(0); setShowVideo(false); setMessage(""); const contextParams = new URLSearchParams({ cache: "1" }); if (productPathContext) { contextParams.set("category", productPathContext.category || ""); contextParams.set("subcategory", productPathContext.subcategory || ""); } apiFetch(`/api/products/${encodeURIComponent(productRef)}?${contextParams.toString()}`, { cacheTtl: 30000 }).then(async (productResponse) => { if (!productResponse.ok) throw new Error("Product unavailable"); const data = await productResponse.json(); const resolved = data.product || data; const reviews = {}; apiFetch(`/api/products/${encodeURIComponent(resolved.id)}/reviews?cache=1`, { cacheTtl: 15000 }).then(response => response.ok ? response.json() : null).then(nextReviews => { if (active && nextReviews) setProduct(current => current?.id === resolved.id ? { ...current, reviews: nextReviews.reviews || [], review_average: nextReviews.average, review_count: nextReviews.count, my_review: nextReviews.my_review || null } : current); }).catch(() => {}); if (active) { const normalizedProduct = normalizeProduct({ ...resolved, reviews: reviews.reviews || [], review_average: reviews.average ?? resolved.rating, review_count: reviews.count ?? resolved.review_count, my_review: reviews.my_review || null }); setProduct(normalizedProduct); rememberProduct(normalizedProduct.id); const requestedSize = new URLSearchParams(window.location.search).get("size"); const selectedSize = (normalizedProduct.sizes || []).includes(requestedSize) ? requestedSize : ""; setSize(current => (normalizedProduct.sizes || []).includes(current) ? current : selectedSize); onProductLoaded?.(normalizedProduct); setColourways((data.colourways || []).map(normalizeProduct)); document.title = `${resolved.name || "Product"} | ${brandName}`; setMetaDescription(String(resolved.description || `${resolved.name} — ${resolved.brand || brandName} curated piece in ${resolved.color || "a timeless finish"}.`).slice(0, 300));
const preorder = Boolean(resolved.preorder_enabled) && Number(resolved.preorder_limit) > Number(resolved.preorder_sold || 0);
const inStock = !resolved.preorder_enabled && (selectedSize ? Number(resolved.size_stock?.[selectedSize] || 0) > 0 : (resolved.sizes || []).length ? Object.values(resolved.size_stock || {}).some((quantity) => Number(quantity) > 0) : Number(resolved.stock || 0) > 0);
const jsonLd = { "@context": "https://schema.org", "@type": "Product", name: resolved.name, description: resolved.description || undefined, image: productImages(resolved).slice(0, 4), sku: resolved.product_code || resolved.id, color: resolved.color || undefined, size: selectedSize || undefined, brand: { "@type": "Brand", name: resolved.brand || brandName }, offers: { "@type": "Offer", url: `${window.location.origin}${productUrl(resolved)}${selectedSize ? `?size=${encodeURIComponent(selectedSize)}` : ""}`, priceCurrency: "INR", price: Number(sellingPrice(resolved)) || Number(resolved.price) || 0, availability: preorder ? "https://schema.org/PreOrder" : inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock", itemCondition: "https://schema.org/NewCondition" }, ...(Number(resolved.rating) > 0 && Number(resolved.review_count) > 0 ? { aggregateRating: { "@type": "AggregateRating", ratingValue: Number(resolved.rating), reviewCount: Number(resolved.review_count) } } : {}) };
let jsonLdScript = document.getElementById("product-jsonld");
if (!jsonLdScript) { jsonLdScript = document.createElement("script"); jsonLdScript.type = "application/ld+json"; jsonLdScript.id = "product-jsonld"; document.head.appendChild(jsonLdScript); }
jsonLdScript.textContent = JSON.stringify(jsonLd); } }).catch(() => active && setMessage("This product is no longer available.")).finally(() => active && setLoading(false)); return () => { active = false; document.getElementById("product-jsonld")?.remove(); }; }, [productRef, productPathContext?.category, productPathContext?.subcategory]);
  useEffect(() => {
    if (!product) return;
    const canonical = productUrl(product);
    if (window.location.pathname !== canonical) window.history.replaceState(window.history.state, "", `${canonical}${window.location.search}`);
  }, [product, products]);
  if (loading) return <main className="page-main"><div className="loading-card">Loading product details…</div></main>;
  if (!product) return <main className="page-main"><div className="empty-state">{message || "Product not found."}<br /><button className="primary-action" onClick={() => onNavigate("/best-sellers")}>Browse best sellers</button></div></main>;
  const sizes = product.sizes || []; const images = productImages(product); const currentImage = images[imageIndex] || product.image_url; const previousImage = () => { setShowVideo(false); setImageIndex((current) => (current - 1 + images.length) % images.length); setZoomPoint(null); }; const nextImage = () => { setShowVideo(false); setImageIndex((current) => (current + 1) % images.length); setZoomPoint(null); }; const preorder = isPreorder(product); const preorderCapacity = preorderRemaining(product); const preorderRelease = product.preorder_release_at ? formatIST(product.preorder_release_at, { dateStyle: "medium", timeStyle: "short" }) : "";
  const authoredSpecificationLines = String(product.specifications || "").split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !/^colou?r(?:way)?\s*:/i.test(line));
  const specificationLines = [product.color ? `Colourway: ${product.color}` : "", ...authoredSpecificationLines].filter(Boolean);
  const productCategory = String(product.category || productPathContext?.category || "").trim();
  const productSubcategoryValue = productSubcategory(product) || String(productPathContext?.subcategory || "").trim();
  const productSubSubcategoryValue = productSubSubcategory(product);
  function moveZoom(event) {
    if (showVideo || !currentImage) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const halfLens = 92;
    const left = Math.min(Math.max(event.clientX - bounds.left, halfLens), Math.max(halfLens, bounds.width - halfLens));
    const top = Math.min(Math.max(event.clientY - bounds.top, halfLens), Math.max(halfLens, bounds.height - halfLens));
    const x = ((event.clientX - bounds.left) / bounds.width) * 100;
    const y = ((event.clientY - bounds.top) / bounds.height) * 100;
    setZoomPoint({ left, top, x, y, backgroundSize: `${bounds.width * 2.4}px ${bounds.height * 2.4}px` });
  }
  return <main className="page-main"><section className="detail-page"><nav className="product-breadcrumbs" aria-label="Breadcrumb"><Link href="/" onNavigate={onNavigate}>Home</Link>{productCategory && <><span aria-hidden="true">/</span><Link href={categoryHref(productCategory)} onNavigate={onNavigate}>{productCategory}</Link></>}{productSubcategoryValue && <><span aria-hidden="true">/</span><Link href={categoryHref(productCategory, productSubcategoryValue)} onNavigate={onNavigate}>{productSubcategoryValue}</Link></>}{productSubSubcategoryValue && <><span aria-hidden="true">/</span><Link href={categoryHref(productCategory, productSubcategoryValue, productSubSubcategoryValue)} onNavigate={onNavigate}>{productSubSubcategoryValue}</Link></>}<span aria-hidden="true">/</span><span className="product-breadcrumb-current" aria-current="page">{product.name}</span></nav><div className="detail-gallery-layout"><div className="detail-thumbnails" aria-label="Product media">{images.length ? images.map((image, index) => <button type="button" className={`detail-thumbnail ${!showVideo && index === imageIndex ? "active" : ""}`} key={image} onClick={() => { setImageIndex(index); setShowVideo(false); setZoomPoint(null); }} aria-label={`Show product image ${index + 1} of ${images.length}`} aria-current={!showVideo && index === imageIndex ? "true" : undefined}><img src={productMedia(image, 160)} alt="" width="160" height="200" loading="lazy" decoding="async" fetchPriority="low" onError={(event) => recoverProductMedia(event, image)} /></button>) : <div className="detail-thumbnail-placeholder">No image</div>}{product.video_url && <button type="button" className={`detail-thumbnail detail-video-thumbnail ${showVideo ? "active" : ""}`} onClick={() => { setShowVideo(true); setZoomPoint(null); }} aria-label="Show product video" aria-current={showVideo ? "true" : undefined}><Icon name="play" size={24} /><span>Video</span></button>}</div><div className={showVideo ? "detail-gallery is-video" : "detail-gallery"} onMouseMove={moveZoom} onMouseEnter={moveZoom} onMouseLeave={() => setZoomPoint(null)} onTouchStart={(event) => { if (!showVideo) setTouchStart(event.changedTouches[0].clientX); }} onTouchEnd={(event) => { if (showVideo || touchStart === null) return; const distance = event.changedTouches[0].clientX - touchStart; if (Math.abs(distance) > 40) distance < 0 ? nextImage() : previousImage(); setTouchStart(null); }}>{showVideo && product.video_url ? <video key={product.video_url} src={product.video_url} poster={productMedia(images[0])} controls playsInline preload="none" aria-label={`${product.name} product video`} /> : currentImage ? <img src={productMedia(currentImage)} srcSet={productMediaSrcSet(currentImage, product.id === seed?.id ? seed?.first_image_inline : null)} sizes="(max-width: 900px) calc(100vw - 36px), 50vw" width="960" height="1200" alt={product.name} loading="eager" decoding={product.id === seed?.id && seed?.first_image_inline?.source === currentImage ? "sync" : "async"} fetchPriority="high" onError={(event) => recoverProductMedia(event, currentImage)} /> : <div className="detail-image-placeholder">No image available</div>}{!showVideo && zoomPoint && currentImage && <div className="detail-zoom-preview" aria-hidden="true" style={{ backgroundImage: `url("${productMedia(currentImage)}")`, backgroundPosition: `${zoomPoint.x}% ${zoomPoint.y}%`, backgroundSize: zoomPoint.backgroundSize, left: `${zoomPoint.left}px`, top: `${zoomPoint.top}px` }} />}{!showVideo && <span className="detail-label">{product.category || `${brandName} edit`}</span>}{!showVideo && preorder && <span className="detail-preorder-badge">Pre-order</span>}{!showVideo && images.length > 1 && <><button type="button" className="gallery-control gallery-prev" onClick={previousImage} aria-label="Previous product image">{wibrawlMode ? "Prev" : <Icon name="chevronLeft" />}</button><button type="button" className="gallery-control gallery-next" onClick={nextImage} aria-label="Next product image">{wibrawlMode ? "Next" : <Icon name="chevronRight" />}</button></>}</div></div><div className="detail-copy"><button type="button" className={`detail-wishlist ${wishlist.has(product.id) ? "is-saved" : ""}`} onClick={() => toggleWishlist(product.id)}><Icon name="heart" size={18} />{wishlist.has(product.id) ? "Saved to wishlist" : "Save to wishlist"}</button><p className="eyebrow">{product.brand || brandName}</p><h1>{product.name}</h1><SpecialPrice product={product} eventLive={eventLive} className="detail-price" /><p className="muted">{product.color || "Curated colour"} · {product.review_count > 0 ? `${product.rating} / 5 · ${product.review_count} reviews` : "No reviews yet"}</p><ProductGuarantees returnable={product.returnable} />{product.what_in_box && <section className="product-in-box"><p className="eyebrow">What's in the box</p><p>{product.what_in_box}</p></section>}{preorder && <div className="preorder-detail-note" role="status"><strong>Pre-order available</strong>{preorderRelease && <span>Expected release: {preorderRelease}</span>}{preorderCapacity !== null && <span>{preorderCapacity > 0 ? `${preorderCapacity} reservation${preorderCapacity === 1 ? "" : "s"} remaining` : "Pre-order limit reached"}</span>}</div>}{sizes.length > 0 && <div className="size-list"><strong>Select size</strong>{product.size_chart_url&&<a className="secondary-action size-chart-link" href={product.size_chart_url} target="_blank" rel="noopener noreferrer">View size chart</a>}<div>{sizes.map((item) => <button key={item} aria-pressed={size === item} disabled={!availableQuantity(product, item)} className={size === item ? "selected" : ""} onClick={() => setSize(item)}>{item}</button>)}</div></div>}{colourways.length > 1 && <div className="colourway-picker"><strong>Colour</strong><div>{colourways.map((colourway) => <button type="button" className={colourway.id === product.id ? "selected" : ""} key={colourway.id} onClick={() => onNavigate(productUrl(colourway))}><span className={`colourway-swatch ${colourwaySwatchClass(colourway.color)}`} style={colourSwatchStyle(colourway.color, colourway.color_hex)} aria-label={colourway.color || "Colourway"} role="img" />{colourway.color || "Colourway"}</button>)}</div></div>}<button className="primary-action" onClick={() => { if (sizes.length && !size) return setMessage("Choose a size first."); if (!availableQuantity(product, size)) return setMessage(preorder ? "The pre-order limit has been reached." : "This selection is out of stock."); addToCart(product, size); setMessage(preorder ? "Added pre-order to your cart." : "Added to your cart."); }}><span>{preorder ? "Pre-order now" : "Add to bag"}</span><Icon name="bag" size={18} /></button>{message && <p className="inline-note" role="status">{message}</p>}<DeliveryEstimate /><button className="text-link" onClick={() => onNavigate("/support")}>Need help with this piece?</button><p className="detail-description">{product.description || "A considered piece made for everyday wear, with a finish that lasts beyond the season."}</p>{specificationLines.length > 0 && <section className="product-specifications" aria-labelledby="product-specifications-heading"><h2 id="product-specifications-heading">Product specifications</h2><ul>{specificationLines.map((line, index) => <li key={`${line}-${index}`}>{line}</li>)}</ul></section>}</div></section><ProductReviews product={product} user={user} onNavigate={onNavigate} onReviewsUpdated={(next) => setProduct((current) => current ? { ...current, reviews: next.reviews || [], rating: next.count ? next.average : 0, review_average: next.average, review_count: next.count, my_review: next.my_review || null } : current)} /><ProductQuestions productId={product.id} user={user} onNavigate={onNavigate} /></main>;
}


export default ProductDetailPage;
