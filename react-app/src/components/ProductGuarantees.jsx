import React from 'react';
function isReturnable(value) {
  return value === undefined || value === null ? true : Boolean(value);
}

export function ProductGuarantees({ returnable, compact = false }) {
  const canReturn = isReturnable(returnable);
  const items = [
    {
      icon: canReturn ? "↺" : "×",
      title: canReturn ? "Returnable" : "No returns",
      detail: canReturn ? "Subject to our return policy" : "Final sale item",
      tone: canReturn ? "returnable" : "negative",
    },
    { icon: "✓", title: "Secure checkout", detail: "Razorpay & PhonePe", tone: "secure" },
    { icon: "⌁", title: "India shipping", detail: "Delivered across India", tone: "shipping" },
  ];

  return <div className={`product-guarantees ${compact ? "is-compact" : ""}`} aria-label="Product guarantees">
    {items.map((item) => <div className={`product-guarantee is-${item.tone}`} key={item.title}>
      <span className="product-guarantee-icon" aria-hidden="true">{item.icon}</span>
      <strong>{item.title}</strong>
      <small>{item.detail}</small>
    </div>)}
  </div>;
}
