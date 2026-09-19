import React, { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/api";
import { money, availableQuantity, formatIST, isPreorder, sellingPrice } from "../lib/commerce";
import { PhoneField, composePhone, splitPhone } from "./PhoneField";
import { CouponBox } from "./CouponBox";

function emptyAddress() {
  return { name: "", phone: "", line1: "", line2: "", city: "", state: "", pin: "", country: "India" };
}

function newCheckoutToken() {
  try { return crypto.randomUUID().replace(/-/g, ""); } catch { return `${Date.now()}${Math.random().toString(36).slice(2)}`; }
}

function addressLabel(address) {
  return [address.line1, address.line2, address.city, address.state, address.pin, address.country || "India"].filter(Boolean).join(", ");
}

function savedAddressOptionLabel(address) {
  const location = [address.city, address.state, address.pin].filter(Boolean).join(", ");
  return `${address.name || "Saved address"}${address.isDefault ? " · Default" : ""}${location ? ` — ${location}` : ""}`;
}

function loadRazorpayScript(src) {
  if (window.Razorpay) return Promise.resolve();
  const existing = document.querySelector("script[data-glamia-razorpay]");
  if (existing) return new Promise((resolve, reject) => { existing.addEventListener("load", resolve, { once: true }); existing.addEventListener("error", () => reject(new Error("Razorpay checkout could not be loaded")), { once: true }); });
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.dataset.glamiaRazorpay = "true";
    script.onload = resolve;
    script.onerror = () => reject(new Error("Razorpay checkout could not be loaded"));
    document.head.appendChild(script);
  });
}

function paymentMethodCopy(method) {
  if (method.id === "razorpay") return { title: "Razorpay", detail: method.description || "Cards, UPI, netbanking and wallets" };
  if (method.id === "phonepe") return { title: "PhonePe", detail: method.description || "UPI, cards and netbanking" };
  return { title: method.label || "Payment provider", detail: method.description || "Secure online payment" };
}

function PaymentMethodLogo({ id }) {
  if (id === "razorpay") {
    return <span className="payment-method-logo payment-method-logo--razorpay" aria-hidden="true"><svg viewBox="0 0 64 64" focusable="false"><path fill="currentColor" d="M14 8h21.5C45.2 8 52 14 52 22.6c0 6.4-3.6 11.4-9.5 13.7L53 56H39.7L31.3 38H27v18H14V8Zm13 10v10h8.3c3 0 5.1-2 5.1-5s-2.1-5-5.1-5H27Z" /></svg></span>;
  }
  if (id === "phonepe") {
    return <span className="payment-method-logo payment-method-logo--phonepe" aria-hidden="true"><svg viewBox="0 0 64 64" focusable="false"><circle cx="32" cy="32" r="30" fill="currentColor" /><text x="32" y="40" fill="#fff" fontFamily="Arial, sans-serif" fontSize="23" fontWeight="700" textAnchor="middle">पे</text></svg></span>;
  }
  return null;
}

export function CheckoutPage({ cart, products, user, addresses, appliedCoupon, onCouponApplied, onCouponRemoved, onNavigate, onOrderPlaced }) {
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
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [paymentMethod, setPaymentMethod] = useState("");
  const [confirmation, setConfirmation] = useState(null);
  const [paymentReturnHandled, setPaymentReturnHandled] = useState(false);
  const cartIds = JSON.stringify([...new Set(cart.map((item) => item.id))].sort());
  const cartFingerprint = JSON.stringify(cart.map((item) => ({ id: item.id, size: item.size || "", quantity: item.quantity })).sort((a, b) => `${a.id}-${a.size}`.localeCompare(`${b.id}-${b.size}`)));
  const [checkoutToken, setCheckoutToken] = useState(newCheckoutToken);

  useEffect(() => { setCheckoutToken(newCheckoutToken()); }, [cartFingerprint]);

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
        if (active) {
          const methods = Array.isArray(settings.payments?.methods) ? settings.payments.methods : [];
          setLiveProducts(catalog.filter(Boolean));
          setPaymentMethods(methods);
          setPaymentMethod((current) => methods.some((method) => method.id === current) ? current : (methods[0]?.id || ""));
        }
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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const returnedOrderId = params.get("phonepe_return");
    if (checking || paymentReturnHandled || !returnedOrderId || confirmation) return;
    setPaymentReturnHandled(true);
    const stored = (() => {
      try { return JSON.parse(sessionStorage.getItem("glamia-phonepe-pending") || "{}"); } catch { return {}; }
    })();
    const token = params.get("checkout_token") || stored.checkoutToken || "";
    setBusy(true);
    setMessage("Checking your PhonePe payment…");
    apiFetch(`/api/payments/phonepe/status?order_id=${encodeURIComponent(returnedOrderId)}&checkout_token=${encodeURIComponent(token)}`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok && response.status !== 202) throw new Error(data.error || "PhonePe payment status could not be checked");
        if (data.payment_status === "paid") {
          setConfirmation(data.order);
          onOrderPlaced();
        } else if (data.payment_status === "failed") {
          setMessage("The PhonePe payment did not complete. You can try again.");
          setCheckoutToken(newCheckoutToken());
        } else {
          setMessage("PhonePe is still processing this payment. Refresh in a moment if the order does not appear.");
        }
      })
      .catch((error) => setMessage(error.message))
      .finally(() => {
        setBusy(false);
        try { sessionStorage.removeItem("glamia-phonepe-pending"); } catch { /* optional browser storage */ }
        window.history.replaceState({}, "", "/checkout");
      });
  }, [checking, confirmation, onOrderPlaced, paymentReturnHandled]);

  const lines = useMemo(() => cart.map((item) => ({ item, product: liveProducts.find((product) => (product.id || product.slug) === item.id) })), [cart, liveProducts]);
  const unavailableLines = useMemo(() => lines.filter(({ item, product }) => !Number.isSafeInteger(item.quantity) || item.quantity < 1 || availableQuantity(product, item.size) < item.quantity), [lines]);
  const preorderLines = useMemo(() => lines.filter(({ product }) => isPreorder(product)), [lines]);
  const preorderReleaseDates = useMemo(() => [...new Set(preorderLines.map(({ product }) => product?.preorder_release_at).filter(Boolean))].map((value) => formatIST(value, { dateStyle: "medium", timeStyle: "short" })), [preorderLines]);
  const total = lines.reduce((sum, line) => sum + sellingPrice(line.product) * line.item.quantity, 0);
  const discount = Math.min(total, Math.max(0, Number(appliedCoupon?.discount || 0)));
  const payableTotal = Math.max(0, total - discount);
  const usingSavedAddress = selectedAddressId !== "new" && savedAddresses.some((address) => address.id === selectedAddressId);

  function changeField(event) {
    setDraft((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  async function placeOrder(event) {
    event.preventDefault();
    if (busy || checking || checkError || !paymentMethod || !cart.length) return;
    setBusy(true);
    setMessage("");
    let providerOpened = false;
    try {
      if (unavailableLines.length) {
        setMessage("One or more items changed or sold out. Return to your bag and review them before ordering.");
        return;
      }
      const payload = {
        items: cart.map((item) => ({ id: item.id, quantity: item.quantity, size: item.size || "" })),
        checkout_token: checkoutToken,
        payment_method: paymentMethod,
        coupon: appliedCoupon?.code || undefined,
        email: user ? undefined : email,
        address: draft,
      };
      const response = await apiFetch("/api/payments/create", { method: "POST", body: JSON.stringify(payload) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Payment could not be started");
      if (paymentMethod === "razorpay") {
        await loadRazorpayScript(data.payment.checkout_script);
        if (!window.Razorpay) throw new Error("Razorpay checkout is unavailable. Please try again.");
        providerOpened = true;
        const razorpay = new window.Razorpay({
          key: data.payment.key_id,
          amount: data.payment.amount,
          currency: data.payment.currency || "INR",
          name: "Glamia",
          description: `Glamia order ${data.order.order_number}`,
          order_id: data.payment.order_id,
          prefill: { name: draft.name || user?.name || "", email: user?.email || email, contact: String(draft.phone || "").replace(/\s+/g, "") },
          notes: { glamia_order_id: data.order.id },
          theme: { color: "#b08b57" },
          handler: async (paymentResponse) => {
            try {
              const verifyResponse = await apiFetch("/api/payments/razorpay/verify", { method: "POST", body: JSON.stringify({ order_id: data.order.id, checkout_token: checkoutToken, ...paymentResponse }) });
              const verifyData = await verifyResponse.json().catch(() => ({}));
              if (!verifyResponse.ok && verifyResponse.status !== 202) throw new Error(verifyData.error || "Razorpay payment verification failed");
              if (verifyData.payment_status === "paid") {
                setConfirmation(verifyData.order);
                onOrderPlaced();
              } else {
                setMessage("Your Razorpay payment is being confirmed. Refresh in a moment if the order does not appear.");
              }
            } catch (error) { setMessage(error.message); }
            finally { setBusy(false); }
          },
          modal: { ondismiss: () => { setBusy(false); setMessage("Payment window closed. Your order is still reserved for a short while; you can try again."); } }
        });
        razorpay.on?.("payment.failed", () => { setBusy(false); setMessage("The Razorpay payment did not complete. You can try again."); });
        razorpay.open();
        return;
      }
      if (paymentMethod === "phonepe") {
        try { sessionStorage.setItem("glamia-phonepe-pending", JSON.stringify({ orderId: data.order.id, checkoutToken })); } catch { /* optional browser storage */ }
        providerOpened = true;
        window.location.assign(data.payment.checkout_url);
      }
    } catch (error) {
      setMessage(error.message);
    } finally {
      if (!providerOpened) setBusy(false);
    }
  }

  if (confirmation) return <main className="page-main"><section className="account-page" role="status"><p className="eyebrow">Thank you</p><h1 className="page-title">Order placed</h1><p>Order {confirmation.order_number || confirmation.id || "confirmed"}</p><p>Your payment was received and your order is now confirmed. Keep your order number for support.</p><button className="primary-action" onClick={() => onNavigate(user ? "/orders" : "/best-sellers")}>{user ? "View your orders" : "Continue shopping"}</button></section></main>;

  return (
    <main className="page-main">
      <section className="checkout-page">
        <div>
          <p className="eyebrow">Secure checkout</p>
          <h1 className="page-title">Delivery details</h1>
          {user && savedAddresses.length > 0 && <section className="checkout-address-picker" aria-labelledby="saved-checkout-addresses"><div className="checkout-section-heading"><h2 id="saved-checkout-addresses">Delivery address</h2><button type="button" onClick={() => setSelectedAddressId("new")}>Use new</button></div><label className="saved-checkout-select-label" htmlFor="saved-checkout-address">Saved address<select id="saved-checkout-address" value={selectedAddressId} onChange={(event) => setSelectedAddressId(event.target.value)}>{savedAddresses.map((address) => <option value={address.id} key={address.id}>{savedAddressOptionLabel(address)}</option>)}<option value="new">Add a new address</option></select></label></section>}
          <form className="checkout-form" onSubmit={placeOrder}>
            {!user && <label>Email for order updates<input required type="email" name="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>}
            {usingSavedAddress ? <div className="selected-address-note"><strong>Delivering to {draft.name}</strong><span>{addressLabel(draft)}</span><button type="button" onClick={() => setSelectedAddressId("new")}>Use a different address</button></div> : <><div className="form-row"><label>Full name<input name="name" autoComplete="name" required value={draft.name} onChange={changeField} /></label><PhoneField label="Phone" countryCode={splitPhone(draft.phone).countryCode} number={splitPhone(draft.phone).number} onCountryCodeChange={(value) => setDraft((current) => ({ ...current, phone: composePhone(value, splitPhone(current.phone).number) }))} onNumberChange={(value) => setDraft((current) => ({ ...current, phone: composePhone(splitPhone(current.phone).countryCode, value) }))} required /></div><label>Address line<input name="line1" autoComplete="address-line1" required value={draft.line1} onChange={changeField} /></label><label>Apartment, landmark <span className="form-hint">optional</span><input name="line2" autoComplete="address-line2" value={draft.line2} onChange={changeField} /></label><div className="form-row"><label>City / town<input name="city" autoComplete="address-level2" required value={draft.city} onChange={changeField} /></label><label>State / region<input name="state" autoComplete="address-level1" value={draft.state} onChange={changeField} /></label></div><div className="form-row"><label>Postal / ZIP code<input name="pin" autoComplete="postal-code" value={draft.pin} onChange={changeField} /></label><label>Country<input name="country" autoComplete="country-name" required value={draft.country} onChange={changeField} /></label></div></>}
            <CouponBox items={cart} appliedCoupon={appliedCoupon} onCouponApplied={onCouponApplied} onCouponRemoved={onCouponRemoved} compact />
            <fieldset className="payment-methods"><legend>Payment method</legend>{paymentMethods.map((method) => { const copy = paymentMethodCopy(method); return <label className={`payment-method-card ${paymentMethod === method.id ? "selected" : ""}`} key={method.id}><input type="radio" name="payment_method" value={method.id} checked={paymentMethod === method.id} onChange={() => setPaymentMethod(method.id)} /><div className="payment-method-content"><PaymentMethodLogo id={method.id} /><span className="payment-method-copy"><strong>{copy.title}</strong><small>{copy.detail}</small></span></div></label>; })}</fieldset>
            <p className="payment-note">{checking ? "Checking stock and payment availability…" : paymentMethods.length ? "You’ll complete payment securely with the selected provider." : "Live payment is not configured yet. Please contact support for help."}</p>
            {checkError && <p className="inline-error" role="alert">{checkError}</p>}
            {message && <p className="inline-note" role="alert">{message}</p>}
            {unavailableLines.length > 0 && <p className="inline-error" role="alert">Some items are no longer available in the requested quantity. Please return to your bag and adjust them.</p>}
            {preorderLines.length > 0 && <p className="preorder-checkout-note" role="status"><strong>This order includes pre-order item{preorderLines.length === 1 ? "" : "s"}.</strong> {preorderReleaseDates.length ? `Expected release: ${preorderReleaseDates.join(", ")}. ` : "Your reservation will be recorded now. "}Payment is collected now and the release date is shown above.</p>}
            <button className="primary-action" disabled={busy || checking || !!checkError || !paymentMethod || !lines.length || unavailableLines.length}>{busy ? paymentMethod === "phonepe" ? "Opening PhonePe…" : "Starting secure payment…" : `Pay securely · ${money(payableTotal)}`} <span aria-hidden="true">↗</span></button>
            {paymentMethods.length === 0 && <p className="form-hint">Payment providers are being connected. Please try again later.</p>}
            <a href="/cart" onClick={(event) => { if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return; event.preventDefault(); onNavigate("/cart"); }}>Return to your bag</a>
          </form>
        </div>
        <aside className="checkout-summary"><p className="eyebrow">Your order</p>{lines.map(({ item, product }) => product ? <div className="summary-line" key={`${item.id}-${item.size}`}><span>{product.name}{item.size ? ` · ${item.size}` : ""} × {item.quantity}{isPreorder(product) && <small className="preorder-line-label">Pre-order</small>}</span><strong>{money(sellingPrice(product) * item.quantity)}</strong></div> : <div className="summary-line checkout-unavailable" key={`${item.id}-${item.size}`}><span>Unavailable item × {item.quantity}</span><strong>Review bag</strong></div>)}<hr /><div className="summary-line"><span>Subtotal</span><strong>{money(total)}</strong></div>{discount > 0 && <div className="summary-line discount-line"><span>Coupon discount <small>{appliedCoupon.code}</small></span><strong>−{money(discount)}</strong></div>}<div className="summary-line total"><span>Total</span><strong>{money(payableTotal)}</strong></div></aside>
      </section>
    </main>
  );
}
