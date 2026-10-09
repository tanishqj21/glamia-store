import { useEffect, useState } from "react";
import { shippingPolicyPromise } from "../lib/deliveryPromise";

const policySections = [
  {
    id: "terms",
    label: "Terms & Conditions",
    intro: "These terms govern your use of the Glamia website, mobile site, and app. Please read them before browsing or placing an order.",
    blocks: [
      {
        heading: "About these terms",
        paragraphs: [
          "This electronic record is published in accordance with the Information Technology Act, 2000 and the rules made under it. It applies to https://glamiastore.com/, the Glamia mobile site, and the Glamia app (together, the “Platform”).",
          "Glamia is a brand name owned and operated by SHREE SHAYAM HOSIERY. In these terms, references to Glamia mean SHREE SHAYAM HOSIERY, the business responsible for the Platform. The registered office listed in the supplied policy document is L-26 A Shastri Nagar. By accessing or using the Platform, you agree to these terms, our policies, and applicable law."
        ]
      },
      {
        heading: "Using Glamia",
        paragraphs: [
          "You must provide information that is true, accurate, current, and complete when you create an account or place an order. You are responsible for keeping your account information and login credentials secure.",
          "Platform content, including text, images, designs, branding, and other material, belongs to Glamia or its licensors. You may not copy, reproduce, modify, distribute, sell, or use it without permission."
        ],
        bullets: [
          "Do not use the Platform for an unlawful, fraudulent, abusive, or unauthorised purpose.",
          "Prices, availability, product information, and applicable charges may change without notice.",
          "Links to third-party websites or services are subject to those third parties’ own terms and policies.",
          "An order placed through the Platform creates a legally binding transaction once accepted by Glamia or the relevant seller."
        ]
      },
      {
        heading: "Responsibility and applicable law",
        paragraphs: [
          "You agree to indemnify Glamia, its affiliates, sellers, and service providers against losses or claims arising from your breach of these terms, misuse of the Platform, or violation of another person’s rights.",
          "Glamia is not responsible for a delay or failure caused by events outside its reasonable control, including delivery, network, technical, natural, or other force-majeure events.",
          "These terms are governed by the laws of India. The jurisdiction field in the supplied policy document is blank and must be confirmed before production. For questions about these terms, please contact Glamia support."
        ]
      }
    ]
  },
  {
    id: "privacy",
    label: "Privacy Policy",
    intro: "This policy explains how Glamia and its affiliates collect, use, share, protect, and retain personal data when you use the Platform.",
    blocks: [
      {
        heading: "Scope and consent",
        paragraphs: [
          "You may browse some parts of the Platform without registering. Glamia currently provides its services within India, and personal data is primarily stored and processed in India. By visiting the Platform or providing information, you consent to this policy, the Terms & Conditions, and applicable law."
        ]
      },
      {
        heading: "Information we collect",
        paragraphs: [
          "Depending on how you use Glamia, we may collect your name, date of birth, address, telephone or mobile number, email address, proof of identity or address, account details, and order or transaction information.",
          "Where relevant, we may collect sensitive information such as bank, card, payment, or biometric information. We may also receive information about your preferences, behaviour, transactions, or interactions with third-party business partners. Those third parties may process data under their own privacy policies.",
          "If you use the Glamia Employees app, we process the employee ID, name, staff email when supplied, permissions, sign-in session, and work activity needed to provide the workspace assigned to you. Employee accounts are created and managed by Glamia administrators; the employee app does not collect location, contacts, camera, microphone, or advertising identifiers."
        ]
      },
      {
        heading: "How we use information",
        paragraphs: [
          "We use personal data to provide and improve Glamia’s services, process and support orders, customise your experience, communicate updates and offers, assist sellers and business partners, resolve disputes, troubleshoot problems, conduct research or surveys, and detect or prevent errors, fraud, abuse, and crime.",
          "We may use your contact details for service, marketing, or transactional communication. You can opt out of promotional communications using the available unsubscribe or preference controls."
        ]
      },
      {
        heading: "When information is shared",
        paragraphs: [
          "Information may be shared within Glamia’s group, corporates, and affiliates, and with sellers, business partners, service providers, logistics providers, payment or prepaid-payment issuers, reward programmes, and other providers you choose to use.",
          "We may also disclose information where reasonably necessary to comply with law, respond to legal process, enforce our terms, protect rights or safety, investigate fraud, or protect Glamia, our customers, or the public."
        ]
      },
      {
        heading: "Security, deletion, and retention",
        paragraphs: [
          "Glamia uses reasonable security practices, but no internet transmission or storage system is completely secure. You are responsible for protecting your login and password and should report suspected phishing or account misuse promptly. Glamia will not ask for your debit or credit card PIN, net-banking password, or mobile-banking password.",
          "You can request account deletion from your profile or settings. Employees can request access changes, deactivation, or deletion of their staff account by contacting their Glamia administrator or the support team through the Contact page. We may retain information while grievances, claims, shipments, staff audit records, or other services are pending, or where retention is required for fraud prevention, abuse detection, legal compliance, or anonymised analytics."
        ]
      },
      {
        heading: "Your rights and policy changes",
        paragraphs: [
          "You may access, rectify, or update your information through the Platform. You may withdraw consent by writing to the Grievance Officer with the subject “Withdrawal of consent for processing personal data”. Withdrawal does not affect processing already completed and may limit or prevent access to some services. Glamia may verify requests before acting on them.",
          "Please check this page periodically for changes. We will provide an alert or notification for significant updates where appropriate."
        ]
      },
      {
        heading: "Grievance Officer",
        paragraphs: [
          "Developer and privacy contact: SHREE SHAYAM HOSIERY (Glamia). For privacy questions, employee account requests, or data-rights requests, email support@glamiastore.com or use Glamia’s Contact page. Glamia may verify the identity of the requester before acting on a request."
        ]
      }
    ]
  },
  {
    id: "refund-cancellation",
    label: "Refund & Cancellation",
    intro: "The supplied policy document sets the following cancellation, refund, and damaged-item rules.",
    blocks: [
      {
        heading: "Cancellations",
        bullets: [
          "A cancellation request must be made within 2 days of placing the order.",
          "A cancellation may not be accepted once it has been communicated to the seller or merchant and shipping has started, or once the order is out for delivery.",
          "If an eligible cancellation is rejected, you may refuse the package at the doorstep where that option is available.",
          "Perishable items, including flowers and eatables, are not ordinarily cancellable. A refund or replacement may be considered if the item’s quality is not good."
        ]
      },
      {
        heading: "Damaged, defective, or incorrect items",
        paragraphs: [
          "Report a damaged or defective item to customer service within 7 days of receipt. If an item is not as shown or expected, report it within 7 days as well. Customer service will review the issue and decide the available remedy.",
          "For products covered by a manufacturer warranty, warranty complaints should be directed to the manufacturer."
        ]
      },
      {
        heading: "Refund timing",
        paragraphs: [
          "Eligible paid, undispatched cancellations queue an original-payment refund. Used store credits are restored separately. Return refunds begin after approval and confirmed collection or warehouse receipt; store-credit returns need owner approval. Track queued, processing, confirmed or needs-review progress in Your orders. Bank posting time depends on the payment provider and bank."
        ]
      }
    ]
  },
  {
    id: "returns",
    label: "Return Policy",
    intro: "Returns, exchanges, and refunds are subject to the product eligibility and inspection rules below.",
    blocks: [
      {
        heading: "Seven-day window",
        paragraphs: [
          "A refund or exchange may be requested within 7 days of delivery or receipt. After 7 days, the supplied policy document does not allow a return, exchange, or refund."
        ]
      },
      {
        heading: "Eligibility",
        bullets: [
          "The item must be unused, in the same condition, and in its original packaging.",
          "The return eligibility recorded for the item at purchase applies, including sale items.",
          "Eligible size exchanges are available for purchased items marked returnable, subject to stock. Damaged or incorrect non-returnable items require care-team review and an authorised exception.",
          "Some categories may be exempt; any applicable exemption will be identified at the time of purchase."
        ]
      },
      {
        heading: "How returns are processed",
        paragraphs: [
          "Eligible size exchanges immediately create a linked ₹0 replacement for normal packing and shipping; admin approval and receipt of the original are not required before dispatch. You must still return the original item. Care arranges its collection separately. Refund returns require approval and confirmed courier pickup or warehouse receipt before authorised payout processing.",
          "Care manually books return collection. After courier tracking is saved, the label becomes available in Your orders for downloading and printing. Do not ship before receiving instructions. If you cannot print or a pickup is missed, contact care using the request number. There is no restocking fee. Refund progress is shown in Your orders; provider confirmation and bank posting are separate steps."
        ]
      }
    ]
  },
  {
    id: "shipping",
    label: "Shipping Policy",
    intro: "Shipping details, delivery timing, and shipping-cost rules from the supplied policy document are set out below.",
    blocks: [
      {
        heading: "Dispatch and delivery",
        bullets: [
          "Orders are shipped through registered domestic courier and/or speed post services.",
          "Typical dispatch takes 1–2 business days. Delivery after dispatch typically takes 2–3 business days in Delhi and 7–8 business days elsewhere in India. Shipping is free for every order.",
          "Orders are shipped within 14 days from the date of order or payment, or by the delivery date agreed with you.",
          "All shipments remain subject to the norms and service conditions of the relevant courier or postal provider.",
          "Delivery is attempted at the buyer’s address provided at the time of purchase."
        ]
      },
      {
        heading: "Delays, service confirmation, and charges",
        paragraphs: [
          "Glamia is not liable for delays caused by the courier or postal provider. Delivery of services is confirmed by email where applicable.",
          "Shipping costs charged by the seller or Platform are not refundable."
        ]
      }
    ]
  }
];

const policyById = new Map(policySections.map((section) => [section.id, section]));
const legacyPolicyIds = { returns: "returns", privacy: "privacy", terms: "terms", shipping: "shipping", contact: "terms" };
const policyPaths = {
  terms: "/terms-and-conditions",
  privacy: "/privacy-policy",
  "refund-cancellation": "/refund-cancellation-policy",
  returns: "/return-policy",
  shipping: "/shipping-policy"
};

function policyIdFromLocation() {
  const hash = window.location.hash.replace(/^#/, "");
  if (policyById.has(hash)) return hash;
  const legacy = new URLSearchParams(window.location.search).get("doc");
  return legacyPolicyIds[legacy] || "terms";
}

export function PoliciesPage({ onNavigate, policyId = "", storefront }) {
  const selectedSection = policyId ? policyById.get(policyId) : null;
  const visibleSections = selectedSection ? [selectedSection] : policySections;
  const [activeId, setActiveId] = useState(policyId || policyIdFromLocation);

  useEffect(() => {
    const updateActivePolicy = () => setActiveId(policyId || policyIdFromLocation());
    window.addEventListener("hashchange", updateActivePolicy);
    window.addEventListener("popstate", updateActivePolicy);
    const initialId = policyId || policyIdFromLocation();
    const initialSection = document.getElementById(initialId);
    if (initialSection && (window.location.hash || window.location.search)) {
      window.setTimeout(() => initialSection.scrollIntoView({ block: "start" }), 0);
    }
    return () => {
      window.removeEventListener("hashchange", updateActivePolicy);
      window.removeEventListener("popstate", updateActivePolicy);
    };
  }, [policyId]);

  const jumpToPolicy = (event, id) => {
    event.preventDefault();
    const href = policyPaths[id];
    setActiveId(id);
    if (window.location.pathname !== href) {
      onNavigate?.(href);
      return;
    }
    window.history.pushState({}, "", href);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return <main className="page-main"><section className="policy-react-page" aria-labelledby="policies-title">
    <header className="policy-page-hero">
      <p className="eyebrow">Glamia care</p>
      <h1 id="policies-title" className="page-title">{selectedSection?.label || "Policies, plainly put."}</h1>
      <p className="policy-react-copy">{selectedSection?.intro || "Everything you need to know about using Glamia, your data, orders, returns, refunds, and delivery — in one place."}</p>
      <p className="policy-effective-note">Last reviewed from the supplied policy document · Review the applicable policy and purchased-item eligibility before ordering.</p>
    </header>
    <div className="policy-page-layout">
      <nav className="policy-react-links policy-page-nav" aria-label="Policy sections">
        {policySections.map((section) => <a className={section.id === activeId ? "active" : ""} href={policyPaths[section.id]} key={section.id} onClick={(event) => jumpToPolicy(event, section.id)}>{section.label}</a>)}
      </nav>
      <div className="policy-sections">
        {visibleSections.map((section) => <section className="policy-section" id={section.id} aria-labelledby={`${section.id}-title`} key={section.id}>
          <p className="eyebrow">{section.label}</p>
          <h2 id={`${section.id}-title`}>{section.label}</h2>
          <p className="policy-section-intro">{section.intro}</p>
          {section.blocks.map((block) => <div className="policy-block" key={block.heading}>
            <h3>{block.heading}</h3>
            {(block.paragraphs || []).map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            {block.bullets && <ul>{block.bullets.map((bullet) => <li key={bullet}>{section.id==="shipping"&&bullet.startsWith("Typical dispatch")?`${shippingPolicyPromise(storefront?.customer_experience)} Shipping is free.`:bullet}</li>)}</ul>}
          </div>)}
        </section>)}
      </div>
    </div>
    <aside className="policy-page-note"><strong>Need help with an order?</strong><span>Keep your Glamia order number ready and contact the care team.</span><a href="/support" onClick={(event) => { event.preventDefault(); onNavigate?.("/support"); }}>Open support centre </a></aside>
  </section></main>;
}

export function ContactPage({ storefront, onNavigate }) {
  const contact = storefront?.support_contact;
  const phone = contact?.visible && contact.phone_number ? `${contact.country_code || "+91"} ${contact.phone_number}` : "";
  return <main className="page-main"><section className="contact-page"><div className="contact-hero"><p className="eyebrow">Glamia care</p><h1 className="page-title">Contact us</h1><p className="contact-intro">We’re here to help with orders, fit, delivery, returns, and anything else about your Glamia edit.</p></div><div className="contact-method-grid"><a className="contact-method" href="mailto:support@glamiastore.com"><span className="eyebrow">Email support</span><strong>support@glamiastore.com</strong><small>For order and account help</small></a>{phone ? <a className="contact-method" href={`tel:${contact.country_code}${contact.phone_number}`}><span className="eyebrow">Call or WhatsApp</span><strong>{phone}</strong><small>Support mobile</small></a> : <div className="contact-method contact-method-muted"><span className="eyebrow">Phone support</span><strong>Coming soon</strong><small>Email us anytime and we’ll get back to you.</small></div>}</div><div className="contact-actions"><button type="button" className="primary-action" onClick={() => onNavigate("/support")}>Open support centre </button><button type="button" className="secondary-action" onClick={() => onNavigate("/track-order")}>Track an order</button></div></section></main>;
}
