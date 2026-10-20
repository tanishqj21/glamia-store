/** @jsxRuntime automatic */
import { GlamiaLogo } from './GlamiaLogo';
import { FooterFrame } from './FooterParts';
import { WibrawlFooter } from './WibrawlFooter';
import { WIBRAWL_ORIGIN } from '../../../src/storefront-identity';

const shopLinks = [
  ['/just-arrived', 'New arrivals'], ['/best-sellers', 'Best sellers'],
  ['/offers', 'Offers'], ['/about', 'About us'],
];
export function StorefrontFooter({ storefront, onNavigate, wibrawlMode = false, mode }) {
  if (wibrawlMode) return <WibrawlFooter storefront={storefront} onNavigate={onNavigate} mode={mode}/>;
  return <FooterFrame brand="Glamia" className="site-footer" logo={<GlamiaLogo width="221" height="43"/>}
    description="Clothing and everyday essentials."
    shopLinks={shopLinks} socials={storefront?.socials} onNavigate={onNavigate}
    sibling={<a className="footer-sibling footer-link" href={WIBRAWL_ORIGIN}><span className="footer-link-label">Discover Wibrawl</span><span className="footer-sibling-note">Our graphic tee label</span></a>}/>;
}
