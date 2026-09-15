import React, { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/api";
import { money, availableQuantity, formatIST, isPreorder, sellingPrice } from "../lib/commerce";
import { PhoneField, composePhone, splitPhone } from "./PhoneField";


function emptyAddress() {
  return { name: "", phone: "", line1: "", line2: "", city: "", state: "", pin: "", country: "India" };
}

function addressLabel(address) {
  return [address.line1, address.line2, address.city, address.state, address.pin, address.country || "India"].filter(Boolean).join(", ");
}

export function CheckoutPage({ cart, products, user, addresses, onNavigate, onOrderPlaced }) {
  const savedAddresses = addresses || [];
  const defaultAddress = savedAddresses.find((address) => address.isDefault) || savedAddresses[0];
  const [selectedAddressId, setSelectedAddressId] = useState(defaultAddress?.id || "new");
  const [draft, setDraft] = useState(defaultAddress ? { ...defaultAddress } : emptyAddress());
  const [email, setEmail] = useState(user?.email || "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [liveProducts, setLiveProducts] = useState(products || []);
  const [checking, setChecking] = useState(true);
  const [checkError, setCheckError] = useState("");
  const [demoEnabled, setDemoEnabled] = useState(false);
  const [confirmation, setConfirmation] = useState(null);
  const cartIds = JSON.stringify([...new Set(cart.map((item) => item.id))].sort());

  useEffect(() => {
    let active = true;
    setChecking(true);
    setCheckError("");
    async function verify() {
      try {
        const [catalog, settings] = await Promise.all([
          Promise.all(JSON.parse(cartIds).map(async (id) => {
            const response = await apiFetch(`/api/products/${encodeURIComponent(id)}`, { cache: "no-store" });
            if (response.status === 404) return null;
            if (!response.ok) throw new Error("Could not verify your bag. Refresh this page to retry.");
            return (await response.json()).product;
          })),
          apiFetch("/api/storefront-settings", { cache: "no-store" }).then(async (response) => {
            if (!response.ok) throw new Error("Payment availability could not be checked. Please refresh to retry.");
            return response.json();
          }),
        ]);
        if (active) { setLiveProducts(catalog.filter(Boolean)); setDemoEnabled(settings.payments?.cod_enabled !== false); }
      } catch (error) { if (active) setCheckError(error.message); }
      finally { if (active) setChecking(false); }
    }
    verify();
    return () => { active = false; };
  }, [cartIds]);

  useEffect(() => {
    const nextDefault = savedAddresses.find((address) => address.isDefault) || savedAddresses[0];
    setSelectedAddressId((current) => current !== "new" && savedAddresses.some((address) => address.id === current) ? current : (nextDefault?.id || "new"));
  }, [savedAddresses]);

  useEffect(() => {
    const selected = savedAddresses.find((address) => address.id === selectedAddressId);
    if (selected) setDraft({ ...selected });
    else if (selectedAddressId === "new") setDraft(emptyAddress());
  }, [selectedAddressId, savedAddresses]);

  const lines = useMemo(() => cart.map((item) => ({ item, product: liveProducts.find((product) => (product.id || product.slug) === item.id) })), [cart, liveProducts]);
  const unavailableLines = useMemo(() => lines.filter(({ item, product }) => {
    return !Number.isSafeInteger(item.quantity) || item.quantity < 1 || availableQuantity(product, item.size) < item.quantity;
  }), [lines]);
  const preorderLines = useMemo(() => lines.filter(({ product }) => isPreorder(product)), [lines]);
  const preorderReleaseDates = useMemo(() => [...new Set(preorderLines.map(({ product }) => product?.preorder_release_at).filter(Boolean))].map((value) => formatIST(value, { dateStyle: "medium", timeStyle: "short" })), [preorderLines]);
  const total = lines.reduce((sum, line) => sum + sellingPrice(line.product) * line.item.quantity, 0);
  const usingSavedAddress = selectedAddressId !== "new" && savedAddresses.some((address) => address.id === selectedAddressId);

  function changeField(event) {
    setDraft((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  async function placeOrder(event) {
    event.preventDefault();
    if (busy || checking || checkError || !demoEnabled || !cart.length) return;
    setBusy(true);
    setMessage("");
    try {
      if (unavailableLines.length) {
        setMessage("One or more items changed or sold out. Return to your bag and review them before ordering.");
        return;
      }
      const response = await apiFetch("/api/orders", {
        method: "POST",
        body: JSON.stringify({
          items: cart.map((item) => ({ id: item.id, quantity: item.quantity, size: item.size || "" })),
          payment_method: "demo",
          email: user ? undefined : email,
          address: draft,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Order could not be placed");
      setConfirmation(data.order || data);
      onOrderPlaced();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  if (confirmation) return <main className="page-main"><section className="account-page" role="status"><p className="eyebrow">Thank you</p><h1 className="page-title">Order placed</h1><p>Order {confirmation.order_number || confirmation.id || "confirmed"}</p><p>Your order has been received. Keep your order number for support.</p><button className="primary-action" onClick={() => onNavigate(user ? "/orders" : "/best-sellers")}>{user ? "View your orders" : "Continue shopping"}</button></section></main>;

  return (
    <main className="page-main">
      <section className="checkout-page">
        <div>
          <p className="eyebrow">Secure checkout</p>
          <h1 className="page-title">Delivery details</h1>
          {user && savedAddresses.length > 0 && <section className="checkout-address-picker" aria-labelledby="saved-checkout-addresses"><div className="checkout-section-heading"><h2 id="saved-checkout-addresses">Choose a saved address</h2><button type="button" onClick={() => setSelectedAddressId("new")}>Add new</button></div><div className="saved-checkout-list">{savedAddresses.map((address) => <label className={`checkout-address-card ${selectedAddressId === address.id ? "selected" : ""}`} key={address.id}><input type="radio" name="checkout-address" checked={selectedAddressId === address.id} onChange={() => setSelectedAddressId(address.id)} /><span><strong>{address.name}</strong>{address.isDefault && <small>Default</small>}<span>{address.phone}</span><span>{addressLabel(address)}</span></span></label>)}</div></section>}
          <form className="checkout-form" onSubmit={placeOrder}>
            {!user && <label>Email for order updates<input required type="email" name="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>}
             {usingSavedAddress ? <div className="selected-address-note"><strong>Delivering to {draft.name}</strong><span>{addressLabel(draft)}</span><button type="button" onClick={() => setSelectedAddressId("new")}>Use a different address</button></div> : <><div className="form-row"><label>Full name<input name="name" autoComplete="name" required value={draft.name} onChange={changeField} /></label><PhoneField label="Phone" countryCode={splitPhone(draft.phone).countryCode} number={splitPhone(draft.phone).number} onCountryCodeChange={(value) => setDraft((current) => ({ ...current, phone: composePhone(value, splitPhone(current.phone).number) }))} onNumberChange={(value) => setDraft((current) => ({ ...current, phone: composePhone(splitPhone(current.phone).countryCode, value) }))} required /></div><label>Address line<input name="line1" autoComplete="address-line1" required value={draft.line1} onChange={changeField} /></label><label>Apartment, landmark <span className="form-hint">optional</span><input name="line2" autoComplete="address-line2" value={draft.line2} onChange={changeField} /></label><div className="form-row"><label>City / town<input name="city" autoComplete="address-level2" required value={draft.city} onChange={changeField} /></label><label>State / region<input name="state" autoComplete="address-level1" value={draft.state} onChange={changeField} /></label></div><div className="form-row"><label>Postal / ZIP code<input name="pin" autoComplete="postal-code" value={draft.pin} onChange={changeField} /></label><label>Country<input name="country" autoComplete="country-name" required value={draft.country} onChange={changeField} /></label></div></>}
            <p className="payment-note">{checking ? "Checking stock and demo payment availability…" : demoEnabled ? "Demo payment · no money will be charged" : "Demo checkout is currently unavailable. Please contact support for help."}</p>
            {checkError && <p className="inline-error" role="alert">{checkError}</p>}
            {message && <p className="inline-note" role="alert">{message}</p>}
            {unavailableLines.length > 0 && <p className="inline-error" role="alert">Some items are no longer available in the requested quantity. Please return to your bag and adjust them.</p>}
            {preorderLines.length > 0 && <p className="preorder-checkout-note" role="status"><strong>This order includes pre-order item{preorderLines.length === 1 ? "" : "s"}.</strong> {preorderReleaseDates.length ? `Expected release: ${preorderReleaseDates.join(", ")}. ` : "Your reservation will be recorded now. "}No money will be charged — this is demo checkout.</p>}
            <button className="primary-action" disabled={busy || checking || !!checkError || !demoEnabled || !lines.length || unavailableLines.length}>{busy ? "Placing order…" : `Place demo order · ${money(total)}`} <span aria-hidden="true">↗</span></button>
            <a href="/cart" onClick={(event) => { if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return; event.preventDefault(); onNavigate("/cart"); }}>Return to your bag</a>
          </form>
        </div>
        <aside className="checkout-summary"><p className="eyebrow">Your order</p>{lines.map(({ item, product }) => product ? <div className="summary-line" key={`${item.id}-${item.size}`}><span>{product.name}{item.size ? ` · ${item.size}` : ""} × {item.quantity}{isPreorder(product) && <small className="preorder-line-label">Pre-order</small>}</span><strong>{money(sellingPrice(product) * item.quantity)}</strong></div> : <div className="summary-line checkout-unavailable" key={`${item.id}-${item.size}`}><span>Unavailable item × {item.quantity}</span><strong>Review bag</strong></div>)}<hr /><div className="summary-line total"><span>Total</span><strong>{money(total)}</strong></div></aside>
      </section>
    </main>
  );
}
