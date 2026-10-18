import { useEffect, useRef, useState } from "react";
import { apiFetch } from "../lib/api";
import { colourSwatchStyle } from "../lib/colours";
import { availableQuantity, formatIST, isPreorder, preorderRemaining, productUrl } from "../lib/commerce";
import { Icon } from "./Icon";
import { ProductGuarantees } from "./ProductGuarantees";
import { SpecialPrice } from "./SpecialPrice";

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

export function QuickView({ product, onClose, onNavigate, addToCart, eventLive = false, wibrawlMode = false }) {
  const dialog = useRef(null);
  const [size, setSize] = useState("");
  const [message, setMessage] = useState("");
  const [colourways, setColourways] = useState([]);
  const [detailProduct, setDetailProduct] = useState(product);
  const displayProduct = detailProduct || product;
  const preorder = isPreorder(displayProduct);
  const preorderCapacity = preorderRemaining(displayProduct);
  const preorderRelease = displayProduct.preorder_release_at ? formatIST(displayProduct.preorder_release_at, { dateStyle: "medium", timeStyle: "short" }) : "";
  useEffect(() => {
    const productId = product?.id || product?.slug;
    if (!productId) return undefined;
    let active = true;
    apiFetch(`/api/products/${encodeURIComponent(productId)}?cache=1`, { cacheTtl: 30000 })
      .then((response) => (response.ok ? response.json() : {}))
      .then((data) => { if (active) { if (data?.product) setDetailProduct({ ...product, ...data.product }); setColourways(Array.isArray(data?.colourways) ? data.colourways : []); } })
      .catch(() => { if (active) setColourways([]); });
    return () => { active = false; };
  }, [product, product?.id, product?.slug]);
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current.showModal();
    document.body.classList.add("quick-view-open");
    return () => { document.body.classList.remove("quick-view-open"); previous?.focus(); };
  }, []);
  return <dialog ref={dialog} className="product-modal quick-view-dialog" aria-labelledby="modal-title" onCancel={onClose} onClick={(event) => { if (event.target === dialog.current) { const rect = dialog.current.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose(); } }}>
    <button type="button" className="modal-close" onClick={onClose} aria-label="Close product details">×</button>
    <div className="modal-image">{displayProduct.image_url && <img src={displayProduct.image_url} alt={displayProduct.name} />}{preorder && <span className="detail-preorder-badge">Pre-order</span>}</div>
    <div className="modal-copy"><p className="eyebrow">{displayProduct.brand || displayProduct.category}</p><h2 id="modal-title">{displayProduct.name}</h2><SpecialPrice product={displayProduct} eventLive={eventLive} className="modal-price" /><ProductGuarantees compact returnable={displayProduct.returnable} />{preorder && <p className="preorder-detail-note"><strong>Pre-order available</strong>{preorderRelease && <span>Expected release: {preorderRelease}</span>}{preorderCapacity !== null && <span>{preorderCapacity > 0 ? `${preorderCapacity} reservation${preorderCapacity === 1 ? "" : "s"} remaining` : "Pre-order limit reached"}</span>}</p>}
      {!!displayProduct.sizes?.length && <div className="size-list"><strong>Select size</strong><div>{displayProduct.sizes.map((value) => <button type="button" key={value} disabled={!availableQuantity(displayProduct, value)} aria-pressed={size === value} className={size === value ? "selected" : ""} onClick={() => { setSize(value); setMessage(""); }}>{value}</button>)}</div></div>}
      {colourways.length > 1 && <div className="colourway-picker quick-view-colourways"><strong>Colour</strong><div>{colourways.map((colourway) => <button type="button" className={colourway.id === displayProduct.id ? "selected" : ""} key={colourway.id} onClick={() => { onClose(); onNavigate(productUrl(colourway)); }}><span className={`colourway-swatch ${colourwaySwatchClass(colourway.color)}`} style={colourSwatchStyle(colourway.color, colourway.color_hex)} aria-label={colourway.color || "Colourway"} role="img" />{colourway.color || "Colourway"}</button>)}</div></div>}
      <button className="primary-action" onClick={(event) => { if (displayProduct.sizes?.length && !size) return setMessage("Choose a size first."); if (!availableQuantity(displayProduct, size)) return setMessage(preorder ? "The pre-order limit has been reached." : "This selection is out of stock."); addToCart(displayProduct, size, { source: dialog.current?.querySelector(".modal-image"), trigger: event.currentTarget }); if (wibrawlMode) setMessage("Added to your cart."); else { onClose(); onNavigate("/cart"); } }}>{preorder ? "Pre-order now" : "Add to bag"} <Icon name="bag" size={18} /></button>
      {message && <p role={wibrawlMode ? "status" : "alert"}>{message}</p>}{wibrawlMode && message === "Added to your cart." && <button type="button" className="secondary-action" onClick={() => { onClose(); onNavigate("/cart"); }}>View bag</button>}
      <a href={productUrl(displayProduct)} onClick={(event) => { if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); onClose(); onNavigate(event.currentTarget.getAttribute("href")); }}>View full details</a>
    </div>
  </dialog>;
}
