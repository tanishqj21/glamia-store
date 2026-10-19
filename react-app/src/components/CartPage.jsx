import { useEffect, useMemo, useRef, useState } from "react";
import { availableQuantity, isPreorder, money, sellingPrice, productStoreUrl } from "../lib/commerce";
import { loadCartProducts } from '../lib/cartProducts';
import { Link } from './Header';
import { savedCartKey } from "../lib/savedItems";
import { removeCartSelection, restoreCartSelection, savedSelectionAvailability } from "../lib/savedForLater";
import { CouponBox } from "./CouponBox";
import { CartFrame, CartLoadingContent } from './CartFrame';
import '../cart-ui.css';

function SelectionDetails({ item, product, onNavigate }) {
  return <>
    <h2>{product ? <Link href={productStoreUrl(product)} onNavigate={onNavigate}>{product.name}</Link> : 'Unavailable item'}</h2>
    <p className="muted">{[item.size && `Size ${item.size}`, item.variant].filter(Boolean).join(" · ")}{isPreorder(product) && <span className="preorder-line-label"> Pre-order</span>}</p>
    <p>{product ? money(sellingPrice(product)) : "Currently unavailable"} · Quantity {item.quantity}</p>
  </>;
}

function RemovalDialog({ item, product, onClose, onRemove, onSave, canSave, error }) {
  const dialog = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current.showModal();
    document.body.classList.add("cart-removal-open");
    return () => {
      document.body.classList.remove("cart-removal-open");
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return <dialog ref={dialog} className="cart-removal-dialog" aria-labelledby="cart-removal-title" aria-describedby="cart-removal-description"
    onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => {
      if (event.target !== dialog.current) return;
      const bounds = dialog.current.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
    }}>
    <button type="button" className="cart-removal-close" onClick={onClose} aria-label="Cancel removal">×</button>
    <p className="eyebrow">Your shopping bag</p>
    <h2 id="cart-removal-title">Keep it for another day?</h2>
    <p id="cart-removal-description" className="muted">Remove this item, or save it for later with your chosen size and quantity.</p>
    <div className="cart-removal-selection">
      {product?.image_url && <img src={product.image_url} alt="" />}
      <div><strong>{product?.name || "Unavailable item"}</strong><p className="muted">{[item.size && `Size ${item.size}`, item.variant, `Quantity ${item.quantity}`].filter(Boolean).join(" · ")}</p></div>
    </div>
    {error && <p className="inline-error" role="alert">{error}</p>}
    <div className="cart-removal-options">
      <button type="button" className="primary-action" disabled={!canSave} onClick={onSave}>Save for later</button>
      <button type="button" className="secondary-action" onClick={onRemove}>Remove item</button>
      <button type="button" className="text-link" autoFocus onClick={onClose}>Keep in bag</button>
    </div>
  </dialog>;
}

function CartContent({ cart, products, setCart, onNavigate, appliedCoupon, onCouponApplied, onCouponRemoved, user, sessionReady, loading, saved, syncError, render }) {
  const [removing, setRemoving] = useState(null);
  const [notice, setNotice] = useState("");
  const [extraProducts, setExtraProducts] = useState([]);
  const [lookup, setLookup] = useState(null);
  const [retry, setRetry] = useState(0);
  const savedHeading = useRef(null);
  const byId = useMemo(() => new Map([...products, ...extraProducts].map(product => [product.id, product])), [products, extraProducts]);
  const missingIds = [...new Set([...cart, ...saved.items].map(item => item.id).filter(id => {
    const product = byId.get(id);
    return !product || (product.sizes?.length && !isPreorder(product) && !Object.hasOwn(product, "size_stock"));
  }))].sort().join(",");
  const needsLookup = Boolean(missingIds && (lookup?.retry !== retry || missingIds.split(",").some(id => !lookup?.ids.split(",").includes(id))));
  useEffect(() => {
    if (!needsLookup || loading) return undefined;
    let active = true;
    // Batch only missing saved products or size-stock details omitted by catalogue cards.
    loadCartProducts(missingIds.split(','), { cacheTtl: 30000 })
      .then(rows => {
        if (active) {
          setExtraProducts(current => [...new Map([...current, ...rows].map(product => [product.id, product])).values()]);
          setLookup({ ids: missingIds, retry, error: "" });
        }
      }).catch(error => { if (active) setLookup({ ids: missingIds, retry, error: error.message || "Saved items could not be checked. Please try again." }); });
    return () => { active = false; };
  }, [missingIds, loading, retry, needsLookup]);
  const checkingSaved = loading || needsLookup;
  const lines = cart.map(item => ({ ...item, product: byId.get(item.id) }));
  const total = lines.reduce((sum, item) => sum + sellingPrice(item.product) * item.quantity, 0);
  const discount = Math.min(total, Math.max(0, Number(appliedCoupon?.discount || 0)));

  function changeQuantity(item, delta) {
    if (delta < 0 && item.quantity <= 1) { setRemoving(item); return; }
    setCart(current => current.map(line => savedCartKey(line) === savedCartKey(item) ? { ...line, quantity: line.quantity + delta } : line));
    onCouponRemoved();
  }
  function removeFromBag(item) {
    setCart(current => removeCartSelection(current, item));
    onCouponRemoved();
    setRemoving(null);
    setNotice("Item removed from your bag.");
  }
  function saveForLater(item) {
    if (!saved.saveItem(item)) return;
    setCart(current => removeCartSelection(current, item));
    onCouponRemoved();
    setRemoving(null);
    setNotice("Saved for later. This item is no longer included in your bag total.");
    requestAnimationFrame(() => savedHeading.current?.focus());
  }
  function moveToBag(item) {
    const reason = savedSelectionAvailability(item, byId.get(item.id), cart);
    if (reason) { setNotice(`${reason}. This item is still saved for later.`); return; }
    try {
      const nextCart = restoreCartSelection(cart, item);
      // Persist the restored bag first so a storage failure cannot discard a saved selection.
      localStorage.setItem("glamia-react-cart", JSON.stringify(nextCart));
      if (!saved.removeItem(item)) {
        try { localStorage.setItem("glamia-react-cart", JSON.stringify(cart)); }
        catch { setCart(nextCart); } // Keep the restored item visible if rollback storage is blocked.
        return;
      }
      setCart(nextCart);
      onCouponRemoved();
      setNotice("Moved to your bag with the same size and quantity.");
      requestAnimationFrame(() => savedHeading.current?.focus());
    } catch {
      setNotice("This item could not be moved to your bag. It is still saved for later. Please check browser storage and try again.");
    }
  }

  if (cart.length && (loading || (needsLookup && cart.some(item => !byId.has(item.id))))) return <CartLoadingContent />;
  if (render) return render({ cart, products, setCart, onNavigate, appliedCoupon, onCouponApplied, onCouponRemoved, user, sessionReady, saved, syncError, lines, total, discount, notice, setNotice, changeQuantity, setRemoving, saveForLater, moveToBag, byId, checkingSaved, missingIds, lookup, setRetry,
    removalDialog: removing && <RemovalDialog item={removing} product={byId.get(removing.id)} onClose={() => setRemoving(null)} onRemove={() => removeFromBag(removing)} onSave={() => saveForLater(removing)} canSave={saved.ready} error={saved.error} /> });
  return <>
    <p className="cart-notice" role="status" aria-live="polite">{notice}</p>
    {saved.error && !removing && <p className="inline-error" role="alert">{saved.error}</p>}
    {lines.length ? <>
      <div className="cart-list" aria-label="Items in your bag">{lines.map(item => <article className="cart-line" key={savedCartKey(item)}>
        {item.product?.image_url ? <Link href={productStoreUrl(item.product)} onNavigate={onNavigate} aria-label={`View ${item.product.name}`}><img src={item.product.image_url} alt="" loading="lazy" /></Link> : <span aria-hidden="true">—</span>}
        <div><SelectionDetails item={item} product={item.product} onNavigate={onNavigate} /></div>
        <div className="cart-actions">
          <button type="button" aria-label={`Increase quantity of ${item.product?.name || "item"}`} disabled={item.quantity >= Math.min(10, availableQuantity(item.product, item.size))} onClick={() => changeQuantity(item, 1)}>+</button>
          <button type="button" aria-label={`Decrease quantity of ${item.product?.name || "item"}`} onClick={() => changeQuantity(item, -1)}>−</button>
          <button type="button" onClick={() => setRemoving(item)}>Remove</button>
          <button type="button" disabled={!saved.ready} onClick={() => saveForLater(item)}>Save for later</button>
        </div>
      </article>)}</div>
      <CouponBox items={cart} appliedCoupon={appliedCoupon} onCouponApplied={onCouponApplied} onCouponRemoved={onCouponRemoved} />
      <div className="cart-total cart-subtotal"><span>Subtotal</span><strong>{money(total)}</strong></div>
      {discount > 0 && <div className="cart-total cart-discount"><span>Coupon discount <small>{appliedCoupon.code}</small></span><strong>−{money(discount)}</strong></div>}
      <div className="cart-total" role="status"><span>Total</span><strong>{money(Math.max(0, total - discount))}</strong></div>
      <button type="button" className="primary-action" disabled={lines.some(item => !item.product)} onClick={() => onNavigate("/checkout")}>Continue to checkout </button>
    </> : <div className="empty-state">Your bag is ready for something excellent.<br /><button type="button" className="primary-action" onClick={() => onNavigate("/best-sellers")}>Browse best sellers </button></div>}
    <section className="cart-saved-section" aria-labelledby="cart-saved-heading">
      <div className="cart-saved-heading"><div><p className="eyebrow">Another day, same favourites</p><h2 id="cart-saved-heading" ref={savedHeading} tabIndex={-1}>Saved for later <span className="cart-saved-count">{saved.items.length}</span></h2></div></div>
      <p className="muted">{user?.email ? "Synced with your Glamia account across the app and website, outside your bag and Wishlist." : "Kept in this browser, outside your bag and Wishlist. Sign in to sync across the app and website."} Prices and availability are checked when you move items back.</p>
      {syncError && user?.email && <p className="inline-error" role="status">{syncError}</p>}
      {lookup?.error && missingIds && <p className="inline-error" role="alert">{lookup.error} <button type="button" className="text-link" onClick={() => setRetry(current => current + 1)}>Try again</button></p>}
      {!sessionReady ? <p className="muted" role="status">Loading saved items…</p> : !saved.items.length ? <p className="cart-saved-empty">Save an item from your bag to keep it here for later.</p> : <div className="cart-saved-list">{saved.items.map(item => {
        const product = byId.get(item.id);
        const needsStock = missingIds.split(",").includes(item.id);
        const unavailable = needsStock && checkingSaved ? "Checking availability…" : needsStock && lookup?.error ? "Availability could not be checked" : savedSelectionAvailability(item, product, cart);
        return <article className="cart-line cart-saved-line" key={savedCartKey(item)}>
          {product?.image_url ? <img src={product.image_url} alt="" loading="lazy" /> : <span aria-hidden="true">—</span>}
          <div><SelectionDetails item={item} product={product} onNavigate={onNavigate} />{unavailable && <p className="cart-saved-availability">{unavailable}</p>}</div>
          <div className="cart-actions"><button type="button" className="cart-move-back" disabled={!saved.ready || Boolean(unavailable)} onClick={() => moveToBag(item)}>Move to bag</button><button type="button" disabled={!saved.ready} onClick={() => { if (saved.removeItem(item)) { setNotice("Item removed from saved for later."); requestAnimationFrame(() => savedHeading.current?.focus()); } }}>Remove saved item</button></div>
        </article>;
      })}</div>}
    </section>
    {removing && <RemovalDialog item={removing} product={byId.get(removing.id)} onClose={() => setRemoving(null)} onRemove={() => removeFromBag(removing)} onSave={() => saveForLater(removing)} canSave={saved.ready} error={saved.error} />}
  </>;
}

// Changing accounts resets the local list and any open removal dialog immediately.
export function CartPage(props) {
  if (props.compactFrame) return <div>{props.bootPending ? <CartLoadingContent /> : <CartContent key={props.sessionReady ? props.user?.email || "guest" : "pending"} {...props} />}</div>;
  return <CartFrame>{props.bootPending ? <CartLoadingContent /> : <CartContent key={props.sessionReady ? props.user?.email || "guest" : "pending"} {...props} />}</CartFrame>;
}
