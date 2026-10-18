import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "../lib/api";
import { deliveryPromise } from '../lib/deliveryPromise';
import { money, availableQuantity, formatIST, isPreorder, sellingPrice } from "../lib/commerce";
import { PhoneField, composePhone, splitPhone } from "./PhoneField";
import { CouponBox } from "./CouponBox";
import { refreshCredits } from "./StoreCredits";
import { startPaymentConfirmation } from "../lib/paymentConfirmation";

const NO_ADDRESSES = [];
const PENDING_PAYMENT_KEY = "glamia-checkout-pending";

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
  if (!src) return Promise.reject(new Error("Razorpay checkout could not be loaded"));
  return new Promise((resolve, reject) => {
    const existing = document.querySelector("script[data-glamia-razorpay]");
    const script = existing || document.createElement("script");
    const finish = (error) => {
      clearTimeout(timeout);
      script.removeEventListener("load", loaded);
      script.removeEventListener("error", failed);
      if (error) { script.remove(); reject(error); }
      else resolve();
    };
    const loaded = () => finish(window.Razorpay ? null : new Error("Razorpay checkout is unavailable. Please try again."));
    const failed = () => finish(new Error("Razorpay checkout could not be loaded"));
    const timeout = setTimeout(failed, 15000);
    script.addEventListener("load", loaded, { once: true });
    script.addEventListener("error", failed, { once: true });
    if (!existing) {
      script.src = src;
      script.async = true;
      script.dataset.glamiaRazorpay = "true";
      document.head.appendChild(script);
    }
  });
}

function readPendingPayment() {
  let stored = null;
  try {
    stored = JSON.parse(sessionStorage.getItem(PENDING_PAYMENT_KEY) || "null");
    if (!stored) {
      const legacy = JSON.parse(sessionStorage.getItem("glamia-phonepe-pending") || "null");
      if (legacy) stored = { ...legacy, provider: "phonepe" };
    }
  } catch { /* optional browser storage */ }
  const params = new URLSearchParams(window.location.search);
  const orderId = params.get("phonepe_return");
  if (orderId) return { provider: "phonepe", orderId, checkoutToken: params.get("checkout_token") || (stored?.orderId === orderId ? stored.checkoutToken : "") || "" };
  return stored?.orderId && ["phonepe", "razorpay"].includes(stored.provider) ? stored : null;
}

function normalizedDeliveryAddress(draft) {
  const address = Object.fromEntries(Object.keys(emptyAddress()).map((key) => [key, String(draft[key] || "").trim()]));
  if (["name", "phone", "line1", "city", "country"].some((key) => !address[key])) throw new Error("Fill every required address field.");
  const digits = address.phone.replace(/\D/g, "");
  if (!/^[+()\-\s./#xX\d]{6,30}$/.test(address.phone) || digits.length < 6 || digits.length > 20) throw new Error("Enter a valid mobile number.");
  if (address.pin.length > 20 || [...address.pin].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) throw new Error("Enter a valid postal or ZIP code.");
  return address;
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

export function CheckoutPage({ cart, products, user, addresses, appliedCoupon, onCouponApplied, onCouponRemoved, onNavigate, onOrderPlaced,storefront, render, initialUseCredits = false }) {
  const savedAddresses = addresses || NO_ADDRESSES;
  const defaultAddress = savedAddresses.find((address) => address.isDefault) || savedAddresses[0];
  const [selectedAddressId, setSelectedAddressId] = useState(defaultAddress?.id || "new");
  const [draft, setDraft] = useState(defaultAddress ? { ...emptyAddress(), ...defaultAddress } : emptyAddress());
  const [email, setEmail] = useState(user?.email || "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [liveProducts, setLiveProducts] = useState(products || []);
  const [checking, setChecking] = useState(true);
  const [checkError, setCheckError] = useState("");
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [paymentMethod, setPaymentMethod] = useState("");
  const [creditBalance, setCreditBalance] = useState(0);
  const [useCredits, setUseCredits] = useState(false);
  const [confirmation, setConfirmation] = useState(null);
  const [pendingPayment, setPendingPayment] = useState(readPendingPayment);
  const mounted = useRef(false);
  const orderPlaced = useRef(onOrderPlaced);
  useEffect(() => { orderPlaced.current = onOrderPlaced; }, [onOrderPlaced]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const submitting = useRef(false);
  const cartIds = JSON.stringify([...new Set(cart.map((item) => item.id))].sort());
  const cartFingerprint = JSON.stringify(cart.map((item) => ({ id: item.id, size: item.size || "", quantity: item.quantity })).sort((a, b) => `${a.id}-${a.size}`.localeCompare(`${b.id}-${b.size}`)));
  const [checkoutToken, setCheckoutToken] = useState(newCheckoutToken);

  const requestFingerprint = JSON.stringify([cartFingerprint, paymentMethod, appliedCoupon?.code || "", user?.email || email, draft, useCredits, creditBalance]);
  const previousFingerprint = useRef(requestFingerprint);
  useEffect(() => {
    if (!busy && !pendingPayment && previousFingerprint.current !== requestFingerprint) {
      previousFingerprint.current = requestFingerprint;
      setCheckoutToken(newCheckoutToken());
    }
  }, [requestFingerprint, busy, pendingPayment]);

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
          const methods = Array.isArray(settings.payments?.methods) ? settings.payments.methods.filter((method) => method && ["razorpay", "phonepe"].includes(method.id)) : [];
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
    let active = true;
    setCreditBalance(0);
    setUseCredits(Boolean(initialUseCredits));
    if (!user?.email) return () => { active = false; };
    const load = () => apiFetch("/api/loyalty?summary=1", { cache: "no-store" }).then(async response => {
      if (response.ok && active) setCreditBalance(Math.max(0, Number((await response.json()).balance || 0)));
    }).catch(() => {});
    load();
    window.addEventListener("glamia-credits-changed", load);
    return () => { active = false; window.removeEventListener("glamia-credits-changed", load); };
  }, [user?.email]);

  useEffect(() => {
    const nextDefault = savedAddresses.find((address) => address.isDefault) || savedAddresses[0];
    setSelectedAddressId((current) => current === "new" || savedAddresses.some((address) => String(address.id) === String(current)) ? current : (nextDefault?.id || "new"));
  }, [savedAddresses]);

  useEffect(() => {
    const selected = savedAddresses.find((address) => String(address.id) === String(selectedAddressId));
    if (selected) setDraft({ ...emptyAddress(), ...selected });
  }, [selectedAddressId, savedAddresses]);

  function rememberPayment(payment) {
    setPendingPayment(payment);
    try { sessionStorage.setItem(PENDING_PAYMENT_KEY, JSON.stringify(payment)); } catch { /* optional browser storage */ }
  }

  const checkPayment = useCallback(async (payment, signal) => {
    if (submitting.current) return "skipped";
    submitting.current = true;
    setBusy(true);
    setMessage(`Checking your ${payment.provider === "phonepe" ? "PhonePe" : "Razorpay"} payment…`);
    try {
      const requestSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000);
      const response = payment.provider === "phonepe"
        ? await apiFetch(`/api/payments/phonepe/status?order_id=${encodeURIComponent(payment.orderId)}&checkout_token=${encodeURIComponent(payment.checkoutToken)}`, { cache: "no-store", signal: requestSignal })
        : await apiFetch("/api/payments/razorpay/verify", { method: "POST", signal: requestSignal, body: JSON.stringify({ ...payment.response, order_id: payment.orderId, checkout_token: payment.checkoutToken }) });
      const data = await response.json().catch(() => ({}));
      if (!mounted.current || signal?.aborted) return "stop";
      if (!response.ok) {
        setMessage(data.error || "Payment status could not be checked. Please try again.");
        return response.status === 429 || response.status >= 500 ? "retry" : "stop";
      }
      if (data.payment_status === "paid") {
        if (!data.order?.id || data.order.payment_status !== "paid" || data.order.status === "cancelled") {
          setMessage("Your payment has not been confirmed yet. Please check its status again.");
          return "stop";
        }
        setConfirmation(data.order);
        orderPlaced.current?.();
      } else if (data.payment_status === "failed") {
        setMessage("The payment did not complete. You can try again.");
        setCheckoutToken(newCheckoutToken());
      } else {
        setMessage("Your payment is still being confirmed. We’ll check automatically; please don’t start another payment.");
        return "retry";
      }
      setPendingPayment(null);
      try { sessionStorage.removeItem(PENDING_PAYMENT_KEY); sessionStorage.removeItem("glamia-phonepe-pending"); } catch { /* optional browser storage */ }
      window.history.replaceState({}, "", "/checkout");
      return "terminal";
    } catch (error) {
      if (!mounted.current || signal?.aborted) return "stop";
      setMessage(error.name === "TimeoutError" ? "The status check took too long. We’ll check again automatically. Please don’t pay again." : error.message);
      return "retry";
    }
    finally { submitting.current = false; if (mounted.current) setBusy(false); }
  }, [setCheckoutToken]);

  useEffect(() => {
    if (!pendingPayment) return;
    return startPaymentConfirmation({
      check: signal => checkPayment(pendingPayment, signal), document, window,
      onExhausted: () => { if (mounted.current) setMessage("Confirmation is taking longer than usual. Your payment attempt is saved. Check its status below or contact support with your order reference. Please don’t pay again."); }
    });
  }, [pendingPayment, checkPayment]);

  const lines = useMemo(() => cart.map((item) => ({ item, product: liveProducts.find((product) => (product.id || product.slug) === item.id) })), [cart, liveProducts]);
  const unavailableLines = useMemo(() => {
    const productTotals = new Map();
    const sizeTotals = new Map();
    for (const { item } of lines) {
      productTotals.set(item.id, (productTotals.get(item.id) || 0) + item.quantity);
      const key = JSON.stringify([item.id, item.size || ""]);
      sizeTotals.set(key, (sizeTotals.get(key) || 0) + item.quantity);
    }
    return lines.filter(({ item, product }) => {
      const available = availableQuantity(product, item.size);
      const requested = isPreorder(product) ? productTotals.get(item.id) : sizeTotals.get(JSON.stringify([item.id, item.size || ""]));
      return !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 1000 || !(available >= requested)
        || (!isPreorder(product) && !(Number(product?.stock) >= productTotals.get(item.id)))
        || !Number.isFinite(sellingPrice(product)) || sellingPrice(product) < 0;
    });
  }, [lines]);
  const preorderLines = useMemo(() => lines.filter(({ product }) => isPreorder(product)), [lines]);
  const preorderReleaseDates = useMemo(() => [...new Set(preorderLines.map(({ product }) => product?.preorder_release_at).filter(Boolean))].map((value) => formatIST(value, { dateStyle: "medium", timeStyle: "short" })), [preorderLines]);
  const total = lines.reduce((sum, line) => sum + sellingPrice(line.product) * line.item.quantity, 0);
  const discount = Math.min(total, Math.max(0, Number(appliedCoupon?.discount || 0)));
  const afterCoupon = Math.max(0, total - discount);
  const creditsAllowed = !appliedCoupon || Boolean(appliedCoupon.allow_store_credits);
  const creditsUsed = user && useCredits && creditsAllowed ? Math.min(creditBalance, afterCoupon) : 0;
  const payableTotal = afterCoupon - creditsUsed;
  const usingSavedAddress = selectedAddressId !== "new" && savedAddresses.some((address) => String(address.id) === String(selectedAddressId));

  function selectAddress(value) {
    setSelectedAddressId(value);
    if (value === "new") setDraft(emptyAddress());
  }

  function changeField(event) {
    setDraft((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  async function placeOrder(event) {
    event.preventDefault();
    if (submitting.current || busy || pendingPayment || checking || checkError || (payableTotal > 0 && !paymentMethod) || !cart.length) return;
    submitting.current = true;
    setBusy(true);
    setMessage("");
    let providerOpened = false;
    try {
      if (unavailableLines.length) {
        setMessage("One or more items changed or sold out. Return to your bag and review them before ordering.");
        return;
      }
      const address = normalizedDeliveryAddress(draft);
      const customerEmail = String(user?.email || email).trim().toLowerCase();
      if (!user && (customerEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail) || customerEmail.endsWith("@glamia.local"))) throw new Error("Enter a valid email for order confirmation and delivery updates.");
      const payload = {
        items: cart.map((item) => ({ id: item.id, quantity: item.quantity, size: item.size || "" })),
        checkout_token: checkoutToken,
        payment_method: payableTotal === 0 ? "store_credit" : paymentMethod,
        credits_used: creditsUsed,
        coupon: appliedCoupon?.code || undefined,
        email: user ? undefined : customerEmail,
        address,
      };
      const response = await apiFetch("/api/payments/create", { method: "POST", body: JSON.stringify(payload) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Payment could not be started");
      if (data.order?.payment_status === "paid" && data.order?.id && data.order?.status !== "cancelled") {
        setConfirmation(data.order);
        onOrderPlaced?.();
        refreshCredits();
        return;
      }
      if (!data.order?.id || !data.payment || data.payment.provider !== paymentMethod) throw new Error("Payment could not be started. Please try again.");
      const paymentToken = data.checkout_token || data.order.checkout_token || checkoutToken;
      if (paymentMethod === "razorpay") {
        await loadRazorpayScript(data.payment.checkout_script);
        if (!window.Razorpay) throw new Error("Razorpay checkout is unavailable. Please try again.");
        let verificationStarted = false;
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
            if (verificationStarted) return;
            verificationStarted = true;
            const payment = { provider: "razorpay", orderId: data.order.id, checkoutToken: paymentToken, response: paymentResponse };
            rememberPayment(payment);
          },
          modal: { ondismiss: () => { if (!verificationStarted) { setBusy(false); setMessage("Payment window closed. Your order is still reserved for a short while; you can try again."); } } }
        });
        razorpay.on?.("payment.failed", () => { if (!verificationStarted) { setBusy(false); setMessage("The Razorpay payment did not complete. Retry this checkout after its provider status is confirmed; refresh only once the previous attempt is closed."); } });
        razorpay.open();
        providerOpened = true;
        return;
      }
      if (paymentMethod === "phonepe") {
        const checkoutUrl = new URL(data.payment.checkout_url);
        if (checkoutUrl.protocol !== "https:") throw new Error("PhonePe returned an invalid checkout URL. Please try again.");
        rememberPayment({ provider: "phonepe", orderId: data.order.id, checkoutToken: paymentToken });
        window.location.assign(checkoutUrl.href);
        providerOpened = true;
      }
    } catch (error) {
      setMessage(error.message);
    } finally {
      submitting.current = false;
      if (!providerOpened) setBusy(false);
    }
  }

  if (render) return render({ cart, user, storefront, savedAddresses, selectedAddressId, selectAddress, draft, setDraft, email, setEmail, busy, message, checking, checkError, paymentMethods, paymentMethod, setPaymentMethod, creditBalance, useCredits, setUseCredits, confirmation, pendingPayment, checkPayment, lines, unavailableLines, preorderLines, preorderReleaseDates, total, discount, creditsAllowed, creditsUsed, payableTotal, usingSavedAddress, changeField, placeOrder, appliedCoupon, onCouponApplied, onCouponRemoved, onNavigate });
  if (confirmation) return <main className="page-main"><section className="account-page order-confirmation" aria-labelledby="order-confirmed-title"><p className="eyebrow">Thank you</p><h1 id="order-confirmed-title" className="page-title">Order placed</h1><p>Order {confirmation.order_number || confirmation.id || "confirmed"}</p><p role="status">Your payment was received and your order is now confirmed. Keep your order number for support.</p><p className="muted">{confirmation.delivery_estimate||deliveryPromise(confirmation.shipping?.state,storefront?.customer_experience)}</p><div className="order-confirmation-actions">{confirmation.bill_available && confirmation.id ? <a className="primary-action" download href={`/api/orders/${encodeURIComponent(confirmation.id)}/bill?token=${encodeURIComponent(confirmation.tracking_token || "")}`}>Download bill</a> : <p className="muted">Your bill is being prepared. It will be available in your orders and confirmation email.</p>}<button type="button" className="secondary-action" onClick={() => onNavigate(user ? "/orders" : "/best-sellers")}>{user ? "View your orders" : "Continue shopping"}</button></div></section></main>;

  return (
    <main className="page-main">
      <section className="checkout-page">
        <div>
          <p className="eyebrow">Secure checkout</p>
          <h1 className="page-title">Delivery details</h1>
          {pendingPayment && <section className="inline-note" aria-label="Payment confirmation"><strong>Confirming your payment</strong><p>We’re checking securely with {pendingPayment.provider === "phonepe" ? "PhonePe" : "Razorpay"}. This page will show your order as soon as payment is verified.</p><p className="form-hint">Order reference: {pendingPayment.orderId} · Please don’t pay again.</p></section>}
          {user && savedAddresses.length > 0 && <section className="checkout-address-picker" aria-labelledby="saved-checkout-addresses"><div className="checkout-section-heading"><h2 id="saved-checkout-addresses">Delivery address</h2><button type="button" disabled={busy || !!pendingPayment} onClick={() => selectAddress("new")}>Use new</button></div><label className="saved-checkout-select-label" htmlFor="saved-checkout-address">Saved address<select id="saved-checkout-address" disabled={busy || !!pendingPayment} value={selectedAddressId} onChange={(event) => selectAddress(event.target.value)}>{savedAddresses.map((address) => <option value={address.id} key={address.id}>{savedAddressOptionLabel(address)}</option>)}<option value="new">Add a new address</option></select></label></section>}
          <form id="checkout-delivery-form" className="checkout-form" onSubmit={placeOrder}>
            <fieldset disabled={busy || !!pendingPayment} style={{ display: "contents" }}>
            {!user && <label>Email for order updates<input required type="email" name="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>}
            {usingSavedAddress ? <div className="selected-address-note"><strong>Delivering to {draft.name}</strong><span>{addressLabel(draft)}</span><button type="button" onClick={() => selectAddress("new")}>Use a different address</button></div> : <><div className="form-row"><label>Full name<input name="name" autoComplete="name" required maxLength={100} value={draft.name} onChange={changeField} /></label><PhoneField label="Phone" countryCode={splitPhone(draft.phone).countryCode} number={splitPhone(draft.phone).number} onCountryCodeChange={(value) => setDraft((current) => ({ ...current, phone: composePhone(value, splitPhone(current.phone).number) }))} onNumberChange={(value) => setDraft((current) => ({ ...current, phone: composePhone(splitPhone(current.phone).countryCode, value) }))} required /></div><label>Address line<input name="line1" autoComplete="address-line1" required maxLength={240} value={draft.line1} onChange={changeField} /></label><label>Apartment, landmark <span className="form-hint">optional</span><input name="line2" autoComplete="address-line2" maxLength={240} value={draft.line2} onChange={changeField} /></label><div className="form-row"><label>City / town<input name="city" autoComplete="address-level2" required maxLength={100} value={draft.city} onChange={changeField} /></label><label>State / region<input name="state" autoComplete="address-level1" maxLength={100} value={draft.state} onChange={changeField} /></label></div><div className="form-row"><label>Postal / ZIP code<input name="pin" autoComplete="postal-code" maxLength={20} value={draft.pin} onChange={changeField} /></label><label>Country<input name="country" autoComplete="country-name" required maxLength={100} value={draft.country} onChange={changeField} /></label></div></>}
            </fieldset>
          </form>
          <fieldset disabled={busy || !!pendingPayment} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
            <CouponBox items={cart} appliedCoupon={appliedCoupon} onCouponApplied={onCouponApplied} onCouponRemoved={onCouponRemoved} compact />
          </fieldset>
          <div className="checkout-form">
            <section className="checkout-summary"><p className="eyebrow">Your order</p>{lines.map(({ item, product }, lineIndex) => product ? <div className="summary-line" key={`${item.id}-${item.size}-${lineIndex}`}><span>{product.image_url&&<img className="checkout-item-thumb" src={product.image_url} alt={product.name}/>} {product.name}{product.color?` · ${product.color}`:""}{item.size ? ` · ${item.size}` : ""} × {item.quantity}{isPreorder(product) && <small className="preorder-line-label">Pre-order</small>}</span><strong>{money(sellingPrice(product) * item.quantity)}</strong></div> : <div className="summary-line checkout-unavailable" key={`${item.id}-${item.size}-${lineIndex}`}><span>Unavailable item × {item.quantity}</span><strong>Review bag</strong></div>)}<hr /><div className="summary-line"><span>Subtotal</span><strong>{money(total)}</strong></div>{discount > 0 && <div className="summary-line discount-line"><span>Coupon discount <small>{appliedCoupon.code}</small></span><strong>−{money(discount)}</strong></div>}{creditsUsed > 0 && <div className="summary-line discount-line"><span>Store credits</span><strong>−{money(creditsUsed)}</strong></div>}<div className="summary-line"><span>Delivery</span><strong>Free</strong></div><p className="checkout-delivery-promise">{deliveryPromise(draft.state,storefront?.customer_experience)}</p><button type="button" className="secondary-action" disabled={busy||!!pendingPayment} onClick={()=>onNavigate("/cart")}>Edit bag</button><div className="summary-line total"><span>{creditsUsed ? "Remaining to pay" : "Total"}</span><strong>{money(payableTotal)}</strong></div></section>
            {user && creditBalance > 0 && <label className="checkout-credits-choice"><input type="checkbox" checked={useCredits && creditsAllowed} disabled={busy || !!pendingPayment || !creditsAllowed} onChange={event => setUseCredits(event.target.checked)} /><span><strong>Use store credits</strong><small>{money(creditBalance)} available · 1 credit = ₹1{!creditsAllowed ? " · this coupon cannot be combined with credits" : ""}</small></span></label>}
            <fieldset className="payment-methods" disabled={busy || !!pendingPayment || payableTotal === 0}><legend>{payableTotal === 0 ? "Covered by store credits" : "Payment method"}</legend>{payableTotal > 0 && paymentMethods.map((method) => { const copy = paymentMethodCopy(method); return <label className={`payment-method-card ${paymentMethod === method.id ? "selected" : ""}`} key={method.id}><input type="radio" name="payment_method" value={method.id} checked={paymentMethod === method.id} onChange={() => setPaymentMethod(method.id)} /><div className="payment-method-content"><PaymentMethodLogo id={method.id} /><span className="payment-method-copy"><strong>{copy.title}</strong><small>{copy.detail}</small></span></div></label>; })}</fieldset>
            <p className="payment-note">{checking ? "Checking stock and payment availability…" : payableTotal === 0 ? "Your credits cover this order. No payment gateway is needed." : paymentMethods.length ? "You’ll complete payment securely with the selected provider." : "Live payment is not configured yet. Please contact support for help."}</p>
            {checkError && <p className="inline-error" role="alert">{checkError}</p>}
            {message && <p className="inline-note" role="alert">{message}</p>}
            {pendingPayment && <button type="button" className="secondary-action" disabled={busy} onClick={() => checkPayment(pendingPayment)}>Check payment status</button>}
            {unavailableLines.length > 0 && <p className="inline-error" role="alert">Some items are no longer available in the requested quantity. Please return to your bag and adjust them.</p>}
            {preorderLines.length > 0 && <p className="preorder-checkout-note" role="status"><strong>This order includes pre-order item{preorderLines.length === 1 ? "" : "s"}.</strong> {preorderReleaseDates.length ? `Expected release: ${preorderReleaseDates.join(", ")}. ` : "Your reservation will be recorded now. "}Payment is collected now and the release date is shown above.</p>}
            <button type="submit" form="checkout-delivery-form" className="primary-action" disabled={busy || !!pendingPayment || checking || !!checkError || (payableTotal > 0 && !paymentMethod) || !lines.length || unavailableLines.length > 0}>{busy ? pendingPayment ? "Checking payment…" : paymentMethod === "phonepe" ? "Opening PhonePe…" : "Placing order…" : payableTotal === 0 ? "Place order with credits" : `Pay securely · ${money(payableTotal)}`} </button>
            {paymentMethods.length > 0 && <div className="checkout-trust-badges" aria-label="Secured payment. Verified merchant.">
              <span className="checkout-trust-badge"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.25 4.5 5.4v5.46c0 4.49 3.2 8.7 7.5 9.89 4.3-1.19 7.5-5.4 7.5-9.89V5.4L12 2.25Z" fill="currentColor"/><path d="m8.6 11.9 2.2 2.2 4.7-4.8" fill="none" stroke="var(--surface)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"/></svg><span>Secured <strong>Payment</strong></span></span>
              <span className="checkout-trust-badge"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2.2 2.25 1.55 2.75-.12.6 2.7 2.1 1.8-.83 2.65.83 2.65-2.1 1.8-.6 2.7-2.75-.12L12 19.36l-2.25-1.55L7 17.93l-.6-2.7-2.1-1.8.83-2.65-.83-2.65 2.1-1.8.6-2.7 2.75.12L12 2.2Z" fill="currentColor"/><path d="m8.6 10.9 2.15 2.15 4.7-4.6" fill="none" stroke="var(--surface)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"/></svg><span><strong>Verified</strong> Merchant</span></span>
            </div>}
            {paymentMethods.length === 0 && <p className="form-hint">Payment providers are being connected. Please try again later.</p>}
            <a href="/cart" onClick={(event) => { if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return; event.preventDefault(); onNavigate("/cart"); }}>Return to your bag</a>
          </div>
        </div>
      </section>
    </main>
  );
}
