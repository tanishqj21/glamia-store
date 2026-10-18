import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";
import { formatIST, money } from "../lib/commerce";

export function CouponBox({ items, appliedCoupon, onCouponApplied, onCouponRemoved, compact = false, idPrefix }) {
  const headingId = idPrefix ? `${idPrefix}-coupon-heading` : compact ? "checkout-coupon-heading" : "cart-coupon-heading";
  const inputId = idPrefix ? `${idPrefix}-coupon-code` : compact ? "checkout-coupon-code" : "cart-coupon-code";
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [suggestionsBusy, setSuggestionsBusy] = useState(true);
  const itemFingerprint = JSON.stringify(items.map((item) => ({ id: item.id, quantity: item.quantity, size: item.size || "" })));

  useEffect(() => {
    let active = true;
    setSuggestionsBusy(true);
    apiFetch("/api/coupons/available", {
      method: "POST",
      body: JSON.stringify({ items: items.map((item) => ({ id: item.id, quantity: item.quantity, size: item.size || "" })) })
    }).then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (active && response.ok) setSuggestions(Array.isArray(data.coupons) ? data.coupons : []);
    }).catch(() => {
      if (active) setSuggestions([]);
    }).finally(() => {
      if (active) setSuggestionsBusy(false);
    });
    return () => { active = false; };
  }, [itemFingerprint]);

  async function applyCode(value) {
    const nextCode = String(value || "").trim().toUpperCase();
    if (!nextCode || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await apiFetch("/api/coupons/validate", {
        method: "POST",
        body: JSON.stringify({ code: nextCode, items: items.map((item) => ({ id: item.id, quantity: item.quantity, size: item.size || "" })) })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "That coupon could not be applied");
      onCouponApplied({ code: data.code || nextCode, discount: Number(data.discount || 0), allow_store_credits: Boolean(data.allow_store_credits), admin_exempt: Boolean(data.admin_exempt) });
      setCode("");
      setMessage(`${data.code || nextCode} applied — you save ${money(data.discount || 0)}.${data.admin_exempt ? ' Whitelisted admin: coupon restrictions waived.' : ''}`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  function apply(event) {
    event.preventDefault();
    applyCode(code);
  }

  function offerLabel(coupon) {
    return coupon.type === "percent" ? `${coupon.value}% off` : `${money(coupon.value)} off`;
  }

  function detailLabel(coupon) {
    const expiry = coupon.ends_at ? formatIST(coupon.ends_at, { dateStyle: "medium" }) : "";
    return expiry ? `Save ${money(coupon.discount)} · ends ${expiry}` : `Save ${money(coupon.discount)} · available now`;
  }

  function remove() {
    onCouponRemoved();
    setMessage("");
  }

  return <section className={`coupon-box ${compact ? "coupon-box--compact" : ""}`} aria-labelledby={headingId}>
    <div className="coupon-box-heading">
      <div><p className="eyebrow">Save on your order</p><h2 id={headingId}>Have a coupon?</h2></div>
      <span aria-hidden="true">%</span>
    </div>
    {appliedCoupon ? <div className="coupon-applied"><div><strong>{appliedCoupon.code}</strong><span>You save {money(appliedCoupon.discount)}</span></div><button type="button" onClick={remove}>Remove</button></div> : <>
      <form className="coupon-form" onSubmit={apply}><label htmlFor={inputId}>Coupon code<input id={inputId} value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="Enter code" autoComplete="off" maxLength="40" /></label><button type="submit" className="secondary-action" disabled={busy || !code.trim()}>{busy ? "Checking…" : "Apply"}</button></form>
      {suggestionsBusy && <p className="coupon-suggestions-loading">Looking for available coupons…</p>}
      {!suggestionsBusy && suggestions.length > 0 && <div className="coupon-suggestions" aria-label="Available coupons">
        <div className="coupon-suggestions-heading"><strong>Available for you</strong><span>Tap to apply</span></div>
        {suggestions.map((coupon) => <button type="button" className="coupon-suggestion" key={coupon.code} onClick={() => applyCode(coupon.code)} disabled={busy}>
          <span className="coupon-suggestion-mark" aria-hidden="true">%</span>
          <span className="coupon-suggestion-copy"><strong>{coupon.code}</strong><small>{offerLabel(coupon)} · {detailLabel(coupon)}</small></span>
          <span className="coupon-suggestion-action">{busy ? "Checking…" : "Use"}</span>
        </button>)}
      </div>}
    </>}
    {message && <p className={message.includes("applied") ? "inline-note" : "inline-error"} role="status">{message}</p>}
  </section>;
}
