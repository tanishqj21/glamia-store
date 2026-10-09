import React, { Suspense } from 'react';
import { renderToString } from 'react-dom/server.edge';
import { Header } from '../react-app/src/components/Header';
import { StorefrontFooter } from '../react-app/src/components/StorefrontFooter';
import { CartPendingPage } from '../react-app/src/components/CartFrame';
import { pendingShoppingControls } from './storefront-shell-controls';

// No customer/session/cart data is read or embedded. The honest loading state
// never describes a populated private cart as empty or exposes cached totals.
export function renderCartShell(settings, storefront = 'glamia') {
  const noop = () => {};
  const wibrawlMode = storefront === 'wibrawl';
  return pendingShoppingControls(renderToString(<div className={`app-shell${wibrawlMode ? ' wibrawl-shell' : ''}`}>
    <a className="skip-link" href="#main-content">Skip to content</a>
    <Header onNavigate={noop} query="" setQuery={noop} dark={false} setDark={noop}
      menuOpen={false} setMenuOpen={noop} categories={['All']} products={[]}
      wishlistCount={0} cartCount={0} user={null} storefront={settings} wibrawlMode={wibrawlMode} themeMode="sports" setThemeMode={noop} />
    <div id="main-content" tabIndex={-1}><Suspense><CartPendingPage /></Suspense></div>
    <StorefrontFooter storefront={settings} onNavigate={noop} wibrawlMode={wibrawlMode} />
  </div>));
}
