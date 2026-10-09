import { useEffect, useRef } from 'react';

const ACCOUNT_SECTIONS = [
  ['/profile', 'Profile'],
  ['/address', 'Address book'],
  ['/orders', 'Your orders'],
  ['/credits', 'Store credits'],
  ['/wishlist', 'Wishlist'],
  ['/reviews', 'Reviews'],
];

function AccountNav({ route, onNavigate }) {
  const navigation = useRef(null);
  useEffect(() => {
    const nav = navigation.current;
    const selected = nav.querySelector('[aria-current="page"]');
    if (!selected || nav.scrollWidth <= nav.clientWidth) return;
    // Reveal the active section on small screens without scrolling the page.
    nav.scrollLeft += selected.getBoundingClientRect().left - nav.getBoundingClientRect().left - (nav.clientWidth - selected.offsetWidth) / 2;
  }, [route]);
  return <nav ref={navigation} className="account-nav" aria-label="Account sections">
    {ACCOUNT_SECTIONS.map(([href, label]) => <button key={href} type="button" className={route === href ? 'active' : ''} aria-current={route === href ? 'page' : undefined} onClick={() => onNavigate(href)}>{label}</button>)}
  </nav>;
}

export function AccountLayout({ route, onNavigate, title, eyebrow = 'Account', className = '', children }) {
  return <main className="page-main"><section className={`account-page${className ? ` ${className}` : ''}`}>
    <p className="eyebrow">{eyebrow}</p>
    <h1 className="page-title">{title}</h1>
    <AccountNav route={route} onNavigate={onNavigate} />
    {children}
  </section></main>;
}
