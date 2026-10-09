import React, { Suspense } from 'react';
import { renderToString } from 'react-dom/server.edge';
import { Header } from '../react-app/src/components/Header';
import { CatalogPage } from '../react-app/src/components/CataloguePresentation';
import { pendingShoppingControls } from './storefront-shell-controls';
import { StorefrontFooter } from '../react-app/src/components/StorefrontFooter';

export function renderCatalogueShell({ path, title, settings, catalogue, categories }) {
  const noop = () => {};
  return pendingShoppingControls(renderToString(<div className="app-shell">
    <a className="skip-link" href="#main-content">Skip to content</a>
    <Header onNavigate={noop} query="" setQuery={noop} dark={false} setDark={noop}
      menuOpen={false} setMenuOpen={noop} categories={categories} products={catalogue.products}
      wishlistCount={0} cartCount={0} user={null} storefront={settings} />
    <div id="main-content" tabIndex={-1}>
      <Suspense><CatalogPage title={title} pathname={path} initialCatalogue={catalogue} products={catalogue.products}
        loading={false} error="" categories={categories} activeCategory="All" setActiveCategory={noop}
        query="" onNavigate={noop} wishlist={new Set()} toggleWishlist={noop} onQuickView={noop}
        eventLive={Boolean(settings?.active_event?.active && (!settings.active_event.ends_at || Date.parse(settings.active_event.ends_at) > Date.now()))} /></Suspense>
    </div>
    <StorefrontFooter storefront={settings} onNavigate={noop} />
  </div>));
}
