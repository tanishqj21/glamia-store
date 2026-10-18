import React, { useEffect, useRef, useState } from 'react';
import { WIBRAWL_HERO_LAYOUTS } from '../../../src/storefront-identity.js';
import { Link } from './Header';
import { Icon } from './Icon';
import { WibrawlHero } from './WibrawlHero';
import { useWibrawlPersona } from '../lib/wibrawlPersona';
import { WibrawlHint } from './WibrawlHint';
import { WibrawlCollectionSection } from './WibrawlCollectionSection';
import { WibrawlReels } from './WibrawlReels';
import { WibrawlCampaign } from './WibrawlCampaign';
import { useCatalogue } from '../lib/useCatalogue';
import { StorePromises } from './HomepagePresentation';
import { WIBRAWL_CAMPAIGN_IMAGE, WIBRAWL_CAMPAIGN_SRCSET, WIBRAWL_CAMPAIGN_SIZES, WIBRAWL_CAMPAIGN_AVIF_SRCSET, wibrawlProductLinkImage } from '../../../src/wibrawl-media';

export function WibrawlCarousel({ slides, onNavigate, preview = false }) {
  return preview ? <WibrawlPreviewCarousel slides={slides} onNavigate={onNavigate} preview /> : <WibrawlHero slides={slides} onNavigate={onNavigate} />;
}

function WibrawlPreviewCarousel({ slides, onNavigate, preview }) {
  const [index, setIndex] = useState(0);
  const swipe = useRef(null);
  const suppressClickUntil = useRef(0);
  const [reducedMotion, setReducedMotion] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || !document.hidden);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const motion = event => setReducedMotion(event.matches);
    const visibility = () => setVisible(!document.hidden);
    media.addEventListener('change', motion);
    document.addEventListener('visibilitychange', visibility);
    return () => { media.removeEventListener('change', motion); document.removeEventListener('visibilitychange', visibility); };
  }, []);
  useEffect(() => { setIndex(0); }, [slides]);
  useEffect(() => {
    if (preview || slides.length < 2 || reducedMotion || hovered || focused || !visible) return;
    const timer = window.setTimeout(() => setIndex(current => (current + 1) % slides.length), 6000);
    return () => window.clearTimeout(timer);
  }, [preview, slides.length, index, reducedMotion, hovered, focused, visible]);
  const slide = slides[index] || slides[0];
  if (!slide) return null;
  const layout = WIBRAWL_HERO_LAYOUTS.includes(slide.layout) ? slide.layout : 'poster';
  const campaign = slide.imagery === 'campaign';
  const select = next => setIndex((next + slides.length) % slides.length);
  return <section className="wibrawl-carousel" aria-label="Wibrawl featured collections" aria-roledescription="carousel"
    onPointerEnter={event => { if (event.pointerType === 'mouse') setHovered(true); }} onPointerLeave={event => { if (event.pointerType === 'mouse') setHovered(false); }}
    onFocusCapture={event => setFocused(event.target.matches(':focus-visible'))} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}
    onPointerDownCapture={event => {
      suppressClickUntil.current = 0;
      if (slides.length < 2 || !['touch', 'pen'].includes(event.pointerType) || event.isPrimary === false || event.target.closest('button')) return;
      swipe.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
    }}
    onPointerCancelCapture={() => { swipe.current = null; }}
    onPointerUpCapture={event => {
      const gesture = swipe.current; swipe.current = null;
      if (!gesture || gesture.id !== event.pointerId) return;
      const x = event.clientX - gesture.x, y = event.clientY - gesture.y;
      if (Math.abs(x) < 50 || Math.abs(x) <= Math.abs(y) * 1.3) return;
      suppressClickUntil.current = Date.now() + 400;
      select(index + (x < 0 ? 1 : -1));
    }}
    onClickCapture={event => { if (Date.now() < suppressClickUntil.current) { event.preventDefault(); event.stopPropagation(); suppressClickUntil.current = 0; } }}>
    <div className={`wibrawl-hero wibrawl-edited-hero wibrawl-layout-${layout} ${slide.title.length > 46 ? 'is-long-title' : ''}`} data-layout={layout} role="group" aria-roledescription="slide" aria-live={focused ? 'polite' : 'off'} aria-label={`${index + 1} of ${slides.length}`}>
      <div className="wibrawl-hero-copy" key={slide.id}>
        <p className="wibrawl-kicker">{slide.eyebrow}</p>
        {preview ? <h3 className="wibrawl-hero-title">{slide.title}</h3> : <h1 id="wibrawl-title" className="wibrawl-hero-title">{slide.title}</h1>}
        <p className="wibrawl-hero-intro">{slide.tagline}</p>
        {slide.words?.length > 0 && <div className="wibrawl-hero-words">{slide.words.map(word => <span key={word}>{word}</span>)}</div>}
        <div className="wibrawl-hero-actions"><Link className="wibrawl-primary-action" href={slide.cta_category ? `/category/${encodeURIComponent(slide.cta_category)}` : '/just-arrived'} onNavigate={onNavigate}>{slide.cta_label || 'Shop the edit'}</Link></div>
      </div>
      <div className="wibrawl-hero-stage">
        {campaign ? <figure className="wibrawl-campaign-figure" key={slide.id}><picture><source type="image/avif" srcSet={slide.campaign_image || WIBRAWL_CAMPAIGN_AVIF_SRCSET} sizes={WIBRAWL_CAMPAIGN_SIZES} /><img src={WIBRAWL_CAMPAIGN_IMAGE} srcSet={WIBRAWL_CAMPAIGN_SRCSET} sizes={WIBRAWL_CAMPAIGN_SIZES} width="1440" height="960" alt="Wibrawl campaign concept: two models in oversized graphic tees on a rooftop." fetchPriority="high" decoding="async" /></picture><figcaption>Campaign concept · styling inspiration</figcaption></figure> : <div key={slide.id} className={`wibrawl-hero-visual wibrawl-hero-frames wibrawl-hero-frames-${slide.frames.length}`}>
          {slide.frames.map((frame, position) => <Link key={frame.id} href={`/product/${encodeURIComponent(frame.id)}`} onNavigate={onNavigate} aria-label={`Shop ${frame.name}`}><img src={frame.image} alt={frame.name} width="960" height="1200" fetchPriority={position === 0 ? 'high' : 'auto'} decoding="async" /></Link>)}
        </div>}
        <span className="wibrawl-hero-stamp" aria-hidden="true">W.</span>
        {slides.length > 1 && <div className="wibrawl-hero-navigation" role="group" aria-label="Navigate hero slides">
          <button type="button" onClick={() => select(index - 1)} aria-label="Previous hero slide"><Icon name="chevronLeft" /></button>
          <button type="button" onClick={() => select(index + 1)} aria-label="Next hero slide"><Icon name="chevronRight" /></button>
        </div>}
      </div>
    </div>
    {campaign && <div className="wibrawl-hero-product-links"><span>Explore this edit</span>{slide.frames.map(frame => <Link key={frame.id} href={`/product/${encodeURIComponent(frame.id)}`} onNavigate={onNavigate}><img src={wibrawlProductLinkImage(frame.image)} alt="" width="40" height="48" loading="lazy" decoding="async" />{frame.name}</Link>)}</div>}
  </section>;
}

export function WibrawlHome({ theme = 'gaming', slides = [], ready = true, onNavigate, products = [], wishlist, toggleWishlist, onQuickView, storefront, catalogReady = false }) {
  const persona = useWibrawlPersona(theme);
  const best = useCatalogue({enabled:catalogReady,category:'All',query:'',sort:'featured',mode:'/best-sellers'});
  const offers = useCatalogue({enabled:catalogReady,category:'All',query:'',sort:'featured',mode:'/offers'});
  const cardProps = {onNavigate,wishlist,toggleWishlist,onQuickView};
  return <div className="wb-arena-home">
    {!ready ? <div className="wb-arena-loading" role="status" aria-label="Loading featured edit"/> : <WibrawlHero slides={slides} onNavigate={onNavigate} mode={theme}/>}
    <div className="wb-home-telemetry"><p className="wb-tech">W. / INDEPENDENT EXPRESSION</p><span className="wb-tech">YOUR EVERYDAY. REMIXED.</span><span className="wb-tech">{persona.name.toUpperCase()}</span></div>
    <StorePromises settings={storefront?.trust_strip} />
    <nav className="wb-home-hubs" aria-label="Discover collections">{persona.collections.map((hub,i)=><WibrawlHint key={hub.href} label={hub.tooltip}><Link href={hub.href} onNavigate={onNavigate}><span className="wb-tech">0{i+1} / {hub.detail}</span><h2>{hub.title}</h2><span className="wb-home-hub-sign" aria-hidden="true">{i===0?'+':i===1?'#':'%'}</span></Link></WibrawlHint>)}</nav>
    {catalogReady&&<div className="wb-home-editorial"><WibrawlCampaign campaign={storefront?.active_event || storefront?.sales_campaign} onNavigate={onNavigate}/><WibrawlCollectionSection kind="arrived" products={[...products].sort((a,b)=>(Date.parse(b.created_at)||0)-(Date.parse(a.created_at)||0)).slice(0,8)} {...cardProps}/><div className="wb-home-interlock"><div className="wb-home-manifesto"><p className="wb-tech">NO FILTER / ALL YOU</p><h2>GOOD TEES.<br/>BETTER COMPANY.</h2><p>For the last-minute plans. The extra-time wins. The days you show up as yourself.</p><Link href="/about" className="secondary-action" onNavigate={onNavigate}>Our story</Link></div><WibrawlCollectionSection kind="best" products={best.products.slice(0,4)} loading={best.loading} error={best.error} onRetry={best.retry} {...cardProps}/></div><WibrawlReels reels={storefront?.cinematic_reels} products={products} onNavigate={onNavigate}/><WibrawlCollectionSection kind="offers" products={offers.products.slice(0,6)} loading={offers.loading} error={offers.error} onRetry={offers.retry} {...cardProps}/></div>}
    <section className="wb-home-signoff"><span className="wb-tech">FIND YOUR PEOPLE. WEAR YOUR PERSONALITY.</span><p>Different worlds.<br/><em>Same energy.</em></p><Link href="/just-arrived" onNavigate={onNavigate} className="primary-action">Find your next fit</Link></section>
  </div>;
}
