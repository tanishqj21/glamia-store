import React, { useEffect, useRef, useState } from "react";
import { availableQuantity, formatIST, isPreorder, money, preorderRemaining, productUrl, sellingPrice } from "../lib/commerce";
import { Icon } from "./Icon";

export function QuickView({ product, onClose, onNavigate, addToCart }) {
  const dialog = useRef(null);
  const [size, setSize] = useState("");
  const [message, setMessage] = useState("");
  const preorder = isPreorder(product);
  const preorderCapacity = preorderRemaining(product);
  const preorderRelease = product.preorder_release_at ? formatIST(product.preorder_release_at, { dateStyle: "medium", timeStyle: "short" }) : "";
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current.showModal();
    document.body.classList.add("quick-view-open");
    return () => { document.body.classList.remove("quick-view-open"); previous?.focus(); };
  }, []);
  return <dialog ref={dialog} className="product-modal quick-view-dialog" aria-labelledby="modal-title" onCancel={onClose} onClick={(event) => { if (event.target === dialog.current) { const rect = dialog.current.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose(); } }}>
    <button type="button" className="modal-close" onClick={onClose} aria-label="Close product details">×</button>
    <div className="modal-image">{product.image_url && <img src={product.image_url} alt={product.name} />}{preorder && <span className="detail-preorder-badge">Pre-order</span>}</div>
    <div className="modal-copy"><p className="eyebrow">{product.brand || product.category}</p><h2 id="modal-title">{product.name}</h2><p className="modal-price">{money(sellingPrice(product))}</p>{preorder && <p className="preorder-detail-note"><strong>Pre-order available</strong>{preorderRelease && <span>Expected release: {preorderRelease}</span>}{preorderCapacity !== null && <span>{preorderCapacity > 0 ? `${preorderCapacity} reservation${preorderCapacity === 1 ? "" : "s"} remaining` : "Pre-order limit reached"}</span>}</p>}
      {!!product.sizes?.length && <div className="size-list"><strong>Select size</strong><div>{product.sizes.map((value) => <button type="button" key={value} disabled={!availableQuantity(product, value)} aria-pressed={size === value} className={size === value ? "selected" : ""} onClick={() => { setSize(value); setMessage(""); }}>{value}</button>)}</div></div>}
      <button className="primary-action" onClick={() => { if (product.sizes?.length && !size) return setMessage("Choose a size first."); if (!availableQuantity(product, size)) return setMessage(preorder ? "The pre-order limit has been reached." : "This selection is out of stock."); addToCart(product, size); onClose(); onNavigate("/cart"); }}>{preorder ? "Pre-order now" : "Add to bag"} <Icon name="bag" size={18} /></button>
      {message && <p role="alert">{message}</p>}
      <a href={productUrl(product)} onClick={(event) => { if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); onClose(); onNavigate(event.currentTarget.getAttribute("href")); }}>View full details</a>
    </div>
  </dialog>;
}
