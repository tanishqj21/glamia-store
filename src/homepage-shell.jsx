import React, { Suspense } from 'react';
import { renderToString } from 'react-dom/server.edge';
import { Header } from '../react-app/src/components/Header';
import { CinematicHero, StorePromises, CampaignFeature, HomepageEditorial } from '../react-app/src/components/HomepagePresentation';
import { StorefrontFooter } from '../react-app/src/components/StorefrontFooter';
import { pendingShoppingControls } from './storefront-shell-controls';

// The first screen uses the same components and public data as the browser.
// Account state stays client-side; no session/user records are serialized.
export function renderHomepageShell({ hero, settings }) {
  const noop = () => {};
  return pendingShoppingControls(renderToString(<div className="app-shell">
    <a className="skip-link" href="#main-content">Skip to content</a>
    <Header onNavigate={noop} query="" setQuery={noop} dark={false} setDark={noop}
      menuOpen={false} setMenuOpen={noop} categories={['All']} products={[]}
      wishlistCount={0} cartCount={0} user={null} storefront={settings} />
    <div id="main-content" tabIndex={-1}><Suspense><div>
      <CinematicHero slides={hero?.slides || []} onNavigate={noop} />
      <StorePromises settings={settings?.trust_strip} />
      <CampaignFeature campaign={settings?.sales_campaign} onNavigate={noop} />
      <HomepageEditorial onNavigate={noop} />
    </div></Suspense></div>
    <StorefrontFooter storefront={settings} onNavigate={noop} />
  </div>));
}
