/** @jsxRuntime automatic */
import { useWibrawlPersona } from '../lib/wibrawlPersona';
import { WibrawlBrand } from './WibrawlBrand';
import { FooterFrame } from './FooterParts';
import { GLAMIA_ORIGIN } from '../../../src/storefront-identity';

export function WibrawlFooter({ storefront, onNavigate, mode }) {
  const persona = useWibrawlPersona(mode);
  const shopLinks = [...persona.collections.map(hub => [hub.href, hub.title.toLowerCase().replace(/\b\w/g, letter => letter.toUpperCase()), hub.tooltip]), ['/about', 'Our story']];
  return <FooterFrame brand="Wibrawl" className="wb-stadium-footer wb-footer-surface"
    logo={<WibrawlBrand mode={persona.mode} loading="lazy"/>}
    tagline="Your vibe. Your rules." description="Graphic tees. Everyday rotation."
    shopLinks={shopLinks} socials={storefront?.socials} onNavigate={onNavigate}
    sibling={<div className="footer-parent"><span>A brand from</span><a href={GLAMIA_ORIGIN} aria-label="Visit Glamia"><img className="glamia-logo" src={persona.dark ? "/glamia/logo-light.svg" : "/glamia/logo.svg"} alt="Glamia" width="112" height="22" loading="lazy" decoding="async"/></a></div>}/>;
}
