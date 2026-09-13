import React from "react";

const policyContent = {
  returns: ["Returns & exchanges", "Eligible items may be returned within 7 days of delivery in unused condition with original tags. Exchange and refund requests are reviewed from Your Orders after delivery."],
  privacy: ["Privacy", "We use your account, address, and order details to provide the store, fulfil orders, and send updates you request. We do not print your email on courier labels."],
  terms: ["Terms of service", "By using Glamia you agree to provide accurate account and delivery information. Prices, availability, and simulated payment methods are subject to change until production payment processing is enabled."],
  shipping: ["Shipping", "Orders are currently a demo storefront experience. Delivery windows, charges, and courier coverage will be configured before live shipping is enabled."],
  contact: ["Contact", "For order support, keep your Glamia order number ready and contact the store team through the support channel configured by the administrator."],
};

export function PoliciesPage() {
  const key = new URLSearchParams(window.location.search).get("doc") || "returns";
  const [title, description] = policyContent[key] || ["Store policies", "Choose a policy below."];
  return <main className="page-main"><section className="policy-react-page"><p className="eyebrow">Glamia care</p><h1 className="page-title">{title}</h1><p className="policy-react-copy">{description}</p><nav className="policy-react-links" aria-label="Policies">{Object.entries({ returns: "Returns", privacy: "Privacy", terms: "Terms", shipping: "Shipping", contact: "Contact" }).map(([name, label]) => <a className={name === key ? "active" : ""} href={`/policies?doc=${name}`} key={name}>{label}</a>)}</nav></section></main>;
}

export function ContactPage({ storefront, onNavigate }) {
  const contact = storefront?.support_contact;
  const phone = contact?.visible && contact.phone_number ? `${contact.country_code || "+91"} ${contact.phone_number}` : "";
  return <main className="page-main"><section className="contact-page"><div className="contact-hero"><p className="eyebrow">Glamia care</p><h1 className="page-title">Contact us</h1><p className="contact-intro">We’re here to help with orders, fit, delivery, returns, and anything else about your Glamia edit.</p></div><div className="contact-method-grid"><a className="contact-method" href="mailto:support@glamiastore.com"><span className="eyebrow">Email support</span><strong>support@glamiastore.com</strong><small>For order and account help</small></a>{phone ? <a className="contact-method" href={`tel:${contact.country_code}${contact.phone_number}`}><span className="eyebrow">Call or WhatsApp</span><strong>{phone}</strong><small>Support mobile</small></a> : <div className="contact-method contact-method-muted"><span className="eyebrow">Phone support</span><strong>Coming soon</strong><small>Email us anytime and we’ll get back to you.</small></div>}</div><div className="contact-actions"><button type="button" className="primary-action" onClick={() => onNavigate("/support")}>Open support centre <span aria-hidden="true">↗</span></button><button type="button" className="secondary-action" onClick={() => onNavigate("/track-order")}>Track an order</button></div></section></main>;
}
