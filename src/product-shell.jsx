import React, { Suspense } from 'react';
import { renderToString } from 'react-dom/server.edge';
import { Header } from '../react-app/src/components/Header';
import ProductDetailPage from '../react-app/src/components/ProductDetailPage';
import { pendingShoppingControls } from './storefront-shell-controls';
import { StorefrontFooter } from '../react-app/src/components/StorefrontFooter';

export function renderProductShell(product, settings, pathContext = null, storefront = 'glamia') {
  const noop = () => {};
  const wibrawlMode = storefront === 'wibrawl';
  return pendingShoppingControls(renderToString(<div className={`app-shell${wibrawlMode ? ' wibrawl-shell' : ''}`}>
    <a className="skip-link" href="#main-content">Skip to content</a>
    <Header onNavigate={noop} query="" setQuery={noop} dark={false} setDark={noop}
      menuOpen={false} setMenuOpen={noop} categories={['All']} products={[]}
      wishlistCount={0} cartCount={0} user={null} storefront={settings} wibrawlMode={wibrawlMode} themeMode="sports" setThemeMode={noop} />
    <div id="main-content" tabIndex={-1}>
      <Suspense>
        <ProductDetailPage productRef={product.id} productPathContext={pathContext} initialProduct={product} products={[]} wibrawlMode={wibrawlMode}
          onNavigate={noop} addToCart={noop} wishlist={new Set()} toggleWishlist={noop} user={null}
          eventLive={Boolean(settings?.active_event?.active && (!settings.active_event.ends_at || Date.parse(settings.active_event.ends_at) > Date.now()))} />
      </Suspense>
    </div>
    <StorefrontFooter storefront={settings} onNavigate={noop} wibrawlMode={wibrawlMode} />
  </div>));
}
