import { lazy, Suspense, useState, useSyncExternalStore } from 'react';
import { House } from '@phosphor-icons/react/dist/csr/House';
import { User } from '@phosphor-icons/react/dist/csr/User';
import { SquaresFour } from '@phosphor-icons/react/dist/csr/SquaresFour';
import { Link, DrawerCategory } from './Header';
import { Icon } from './Icon';
import { AnnouncementBar } from './AnnouncementBar';
import { CreditsBalance } from './CreditsBalance';
import { WibrawlThemeToggle } from './WibrawlThemeToggle';
import { WibrawlDialog } from './WibrawlDialog';
import { GlamiaLogo } from './GlamiaLogo';
import { money, productUrl, sellingPrice } from '../lib/commerce';
import { WIBRAWL_COLLECTIONS, useWibrawlCommerce } from '../lib/wibrawlStorefront';
import { adminLandingPath } from '../lib/workspaceAccess';

const WibrawlCartPage = lazy(() => import('./WibrawlCartPage'));
const subscribeLocation = listener => { window.addEventListener('popstate', listener); return () => window.removeEventListener('popstate', listener); };
const currentLocation = () => window.location.pathname;
const serverLocation = () => '/';

export function WibrawlHeader({ onNavigate, query, setQuery, themeMode, setThemeMode, menuOpen, setMenuOpen, categoryTree, wishlistCount = 0, cartCount = 0, user, storefront, logout, loggingOut, logoutError, suggestions, moveGlow }) {
  const [panel, setPanel] = useState('');
  const commerce = useWibrawlCommerce();
  const navigate = href => { setPanel(''); setMenuOpen(false); onNavigate(href); };
  const current = useSyncExternalStore(subscribeLocation, currentLocation, serverLocation);
  const search = event => { event.preventDefault(); navigate(`/search?query=${encodeURIComponent(query.trim())}`); };
  const openSearch = () => { setMenuOpen(false); setPanel('search'); };
  return <>
    <AnnouncementBar announcement={storefront?.announcement} />
    <header className="site-header wb-header">
      <button type="button" className="menu-button" aria-label="Open menu" aria-expanded={menuOpen} aria-controls="shop-menu" onClick={() => setMenuOpen(!menuOpen)}><span /><span /><span /></button>
      <Link className="wordmark wibrawl-wordmark" href="/" onNavigate={navigate} onPointerMove={moveGlow}><span className="wibrawl-logo-glow"><img className="wibrawl-logo" src="/wibrawl/logo.svg" alt="Wibrawl" width="212" height="44" fetchPriority="high" /></span></Link>
      <button type="button" className="wb-search-trigger" aria-label="Find your next favourite" onClick={openSearch}><Icon name="search" size={18} /><span>Find your next favourite</span><span aria-hidden="true" className="wb-search-hint">Search</span></button>
      <div className="wb-header-actions">
        {user && <CreditsBalance user={user} onNavigate={navigate} />}
        <Link className="wb-icon-action wb-header-wishlist" href="/wishlist" onNavigate={navigate} aria-label={`Wishlist, ${wishlistCount} items`}><Icon name="heart" size={21} />{wishlistCount > 0 && <span className="wb-count">{wishlistCount}</span>}</Link>
        <button type="button" className="wb-icon-action wb-account-trigger" aria-label="Open account menu" aria-haspopup="dialog" aria-expanded={panel === 'account'} onClick={() => setPanel('account')}><User size={22} /></button>
        <WibrawlThemeToggle theme={themeMode} onChange={setThemeMode} streetwear />
        <button type="button" className="wb-icon-action cart-link" onClick={() => {setMenuOpen(false);setPanel('cart');}} aria-label={`Open cart, ${cartCount} item${cartCount === 1 ? '' : 's'}`}><Icon name="bag" size={22} />{cartCount > 0 && <span className="wb-count">{cartCount}</span>}</button>
      </div>
    </header>
    <div className="wibrawl-navigation wb-collection-navigation"><nav aria-label="Collections">{WIBRAWL_COLLECTIONS.map(([href, title, subtitle]) => <Link key={href} href={href} onNavigate={navigate} aria-current={current === href ? 'page' : undefined}><strong>{title}</strong><small>// {subtitle}</small></Link>)}</nav></div>
    {menuOpen && <WibrawlDialog title="Pick your side." className="wb-menu-dialog" onClose={() => setMenuOpen(false)}><div id="shop-menu"><p className="wibrawl-kicker">Wibrawl / The collection</p><nav className="wb-menu-collections" aria-label="Shop collections">{WIBRAWL_COLLECTIONS.map(([href, title, subtitle]) => <Link key={href} href={href} onNavigate={navigate}>{title}<small>// {subtitle}</small></Link>)}</nav><div className="drawer-categories">{categoryTree.map(node => <DrawerCategory key={node.name} node={node} category={node.name} onNavigate={navigate} closeMenu={() => setMenuOpen(false)} arrowFree />)}</div><Link className="drawer-account-link" href="/profile" onNavigate={navigate}>Your account</Link><a className="drawer-glamia-link" href="https://glamiastore.com" aria-label="Back to Glamia"><span>Back to</span><GlamiaLogo width="164" height="32" /></a></div></WibrawlDialog>}
    {panel === 'account' && <WibrawlDialog title={user ? `Hey, ${String(user.name || 'you').split(' ')[0]}.` : 'Your Wibrawl'} onClose={() => setPanel('')} className="wb-account-dialog"><p className="muted">Your pieces. Your people. Your account.</p><nav aria-label="Your account" className="wb-account-links">{(!user ? [['/login', 'Log in / Sign up']] : [['/profile', 'Profile'], ['/address', 'Saved addresses'], ...(user.role === 'admin' ? [[adminLandingPath(user), 'Admin console']] : [])]).concat([['/orders', 'Your orders'], ['/wishlist', `Wishlist (${wishlistCount})`], ['/credits', 'Store credits'], ['/returns', 'Returns & exchanges'], ['/support', 'Support']]).map(([href, label]) => <Link key={href} href={href} onNavigate={navigate}>{label}</Link>)}</nav>{user && <button type="button" className="secondary-action" onClick={async () => { if (await logout()) setPanel(''); }} disabled={loggingOut}>{loggingOut ? 'Logging out…' : 'Log out'}</button>}{logoutError && <p role="alert">{logoutError}</p>}</WibrawlDialog>}
    {panel === 'cart' && <WibrawlDialog title="Your bag." className="wb-cart-drawer" onClose={() => setPanel('')}><Suspense fallback={<p role="status">Opening your bag…</p>}>{commerce?.cartProps ? <WibrawlCartPage {...commerce.cartProps} compact onNavigate={navigate} /> : <button type="button" className="primary-action" onClick={() => navigate('/cart')}>Open your bag</button>}</Suspense></WibrawlDialog>}
    {panel === 'search' && <WibrawlDialog title="Find your edit" className="wb-search-dialog" onClose={() => setPanel('')}><form role="search" onSubmit={search}><label htmlFor="wb-instant-search" className="sr-only">Search Wibrawl products</label><input id="wb-instant-search" type="search" autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="Search pieces, categories, colours…" autoComplete="off" /><button type="submit" className="primary-action">Search</button></form><p className="wibrawl-kicker">{query ? 'Matching pieces' : 'Explore the collection'}</p><div className="wb-search-results">{suggestions.map(product => <Link key={product.id} href={productUrl(product)} onNavigate={navigate}>{product.image_url && <img src={product.image_url} width="64" height="80" alt="" />}<span><strong>{product.name}</strong><small>{product.category} {product.color && ` / ${product.color}`}</small></span><span>{money(sellingPrice(product))}</span></Link>)}</div>{query && !suggestions.length && <p className="muted">No matching pieces. Try a different word or browse a collection.</p>}<nav className="wb-search-tags" aria-label="Popular collections">{WIBRAWL_COLLECTIONS.map(([href, label]) => <Link key={href} href={href} onNavigate={navigate}>{label}</Link>)}</nav></WibrawlDialog>}
    <nav className="wb-bottom-nav" aria-label="Mobile navigation"><Link href="/" onNavigate={navigate} aria-current={current === '/' ? 'page' : undefined}><House size={21} /><span>Home</span></Link><Link href="/just-arrived" onNavigate={navigate} aria-current={current === '/just-arrived' ? 'page' : undefined}><SquaresFour size={21} /><span>Drops</span></Link><button type="button" onClick={openSearch}><Icon name="search" size={21} /><span>Search</span></button><Link href="/wishlist" onNavigate={navigate} aria-current={current === '/wishlist' ? 'page' : undefined}><Icon name="heart" size={21} /><span>Wishlist{wishlistCount > 0 ? ` (${wishlistCount})` : ''}</span></Link><button type="button" onClick={() => setPanel('account')}><User size={21} /><span>Account</span></button></nav>
  </>;
}
