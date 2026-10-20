/** @jsxRuntime automatic */
import { Link } from './Header';
import { Icon } from './Icon';

const socialNames = [
  ['instagram', 'Instagram'], ['facebook', 'Facebook'], ['youtube', 'YouTube'],
  ['tiktok', 'TikTok'], ['pinterest', 'Pinterest'], ['x', 'X'], ['linkedin', 'LinkedIn'],
];
const policies = [
  ['/terms-and-conditions', 'Terms & conditions'], ['/privacy-policy', 'Privacy'],
  ['/shipping-policy', 'Shipping'], ['/return-policy', 'Returns'],
  ['/refund-cancellation-policy', 'Refunds & cancellation'],
];
const careLinks = [
  ['/orders', 'Your orders'], ['/track-order', 'Track an order'],
  ['/support', 'Customer care'], ['/contact', 'Contact us'], ['/profile', 'Your account'],
];

function FooterLink({ href, onNavigate, children, title }) {
  return <Link href={href} onNavigate={onNavigate} className="footer-link" title={title}><span className="footer-link-label">{children}</span></Link>;
}

function FooterGroup({ title, links, onNavigate }) {
  return <nav className="footer-group" aria-label={`Footer ${title.toLowerCase()}`}>
    <h2>{title}</h2><ul role="list">{links.map(([href, label, hint]) => <li key={href}><FooterLink href={href} onNavigate={onNavigate} title={hint}>{label}</FooterLink></li>)}</ul>
  </nav>;
}

function FooterSocials({ socials, brand }) {
  const links = socialNames.flatMap(([id, label]) => {
    const value = typeof socials?.[id] === 'string' ? socials[id].trim() : '';
    try {
      const url = new URL(value);
      return ['https:', 'http:'].includes(url.protocol) ? [{ id, label, href: url.href }] : [];
    } catch { return []; }
  });
  if (!links.length) return null;
  return <nav className="footer-socials" aria-label={`${brand} social links`}>{links.map(link =>
    <a className="footer-link footer-social-link" href={link.href} key={link.id} target="_blank" rel="noopener noreferrer" aria-label={`${brand} on ${link.label}`}>
      <Icon name={link.id} size={16}/><span className="footer-link-label">{link.label}</span>
    </a>)}</nav>;
}

// Shared structure, with each store supplying its own artwork, language and socials.
export function FooterFrame({ brand, className, logo, tagline, description, shopLinks, socials, sibling, onNavigate }) {
  const year = new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: 'Asia/Kolkata' }).format(new Date());
  return <footer className={`footer-shell ${className}`} aria-label={`${brand} footer`}>
    <div className="footer-inner">
      <div className="footer-main">
        <div className="footer-brand-block">
          <Link className="footer-brand" href="/" onNavigate={onNavigate} aria-label={`${brand} home`}>{logo}</Link>
          {tagline && <p className="footer-tagline">{tagline}</p>}
          <p className="footer-description">{description}</p>
          <FooterSocials socials={socials} brand={brand}/>
        </div>
        <div className="footer-navigation"><FooterGroup title="Shop" links={shopLinks} onNavigate={onNavigate}/><FooterGroup title="Need a hand?" links={careLinks} onNavigate={onNavigate}/></div>
      </div>
      <nav className="footer-policies" aria-label="Policies"><ul role="list">{policies.map(([href, label]) => <li key={href}><FooterLink href={href} onNavigate={onNavigate}>{label}</FooterLink></li>)}</ul></nav>
      <div className="footer-baseline"><small>© {year} {brand}</small>{sibling}</div>
    </div>
  </footer>;
}
