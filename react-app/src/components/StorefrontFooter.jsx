import { GlamiaLogo } from './GlamiaLogo';
import React from 'react';
import { Link } from './Header';
import { Icon } from './Icon';

const SOCIAL_LINKS = [
  ["instagram", "Instagram"],
  ["facebook", "Facebook"],
  ["youtube", "YouTube"],
  ["tiktok", "TikTok"],
  ["pinterest", "Pinterest"],
  ["x", "X"],
  ["linkedin", "LinkedIn"]
];

function FooterSocials({ socials, brandName = "Glamia" }) {
  const links = SOCIAL_LINKS.map(([id, label]) => ({ id, label, href: String(socials?.[id] || "").trim() })).filter((link) => link.href);
  if (!links.length) return null;
  return <section className="footer-socials" aria-label={`${brandName} social links`}><div className="footer-socials-copy"><span>Follow {brandName}</span><small>Stay close to the edit.</small></div><nav className="footer-social-links" aria-label="Social media">{links.map((link) => <a key={link.id} href={link.href} target="_blank" rel="noreferrer noopener" aria-label={`${brandName} on ${link.label}`}><span className="footer-social-icon"><Icon name={link.id} size={16} /></span><span className="footer-social-label">{link.label}</span></a>)}</nav></section>;
}


export function StorefrontFooter({ storefront, onNavigate, wibrawlMode = false }) {
  const brandName = wibrawlMode ? "Wibrawl" : "Glamia";
  return <footer className={`site-footer ${wibrawlMode ? "wibrawl-footer" : ""}`}><Link className="footer-mark" href="/" onNavigate={onNavigate}>{wibrawlMode ? <img className="wibrawl-logo" src="/wibrawl/logo.svg" alt="Wibrawl" width="260" height="54" loading="lazy" /> : <GlamiaLogo width="221" height="43" />}<span className="sr-only"> home</span></Link><p>{wibrawlMode ? "Everyday graphic tees. A little more you." : <>Curated apparel from independent ateliers — delivered fast,<br />styled to last.</>}</p><FooterSocials socials={storefront?.socials} brandName={brandName} /><div className="footer-nav-groups"><nav aria-label="Footer"><Link href="/best-sellers" onNavigate={onNavigate}>The collection</Link><Link href="/track-order" onNavigate={onNavigate}>Track an order</Link><Link href="/contact" onNavigate={onNavigate}>Contact us</Link><Link href="/support" onNavigate={onNavigate}>Support</Link><Link href="/about" onNavigate={onNavigate}>About us</Link><Link href="/profile" onNavigate={onNavigate}>Your account</Link></nav><nav className="footer-policy-nav" aria-label="Policies"><span>Policies</span><Link href="/terms-and-conditions" onNavigate={onNavigate}>Terms &amp; Conditions</Link><Link href="/privacy-policy" onNavigate={onNavigate}>Privacy Policy</Link><Link href="/refund-cancellation-policy" onNavigate={onNavigate}>Refund &amp; Cancellation</Link><Link href="/return-policy" onNavigate={onNavigate}>Return Policy</Link><Link href="/shipping-policy" onNavigate={onNavigate}>Shipping Policy</Link></nav></div>{wibrawlMode && <small className="wibrawl-footer-origin">A brand from <a href="https://glamiastore.com">Glamia</a>.</small>}</footer>;
}
