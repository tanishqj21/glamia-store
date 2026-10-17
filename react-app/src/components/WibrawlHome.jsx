import React, { useEffect, useRef, useState } from 'react';
import { WIBRAWL_HERO_LAYOUTS } from '../../../src/storefront-identity.js';
import { Link } from './Header';
import { Icon } from './Icon';
import { WibrawlHero } from './WibrawlHero';
import { WIBRAWL_COLLECTIONS } from '../lib/wibrawlStorefront';
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

export function WibrawlHome({ theme, slides = [], ready = true, onNavigate, children }) {
  return <div className={`wibrawl-home wibrawl-home-${theme}`}>
    {!ready ? <div className="wibrawl-hero-loading" role="status" aria-label="Loading featured edit" /> : slides.length > 0 && <WibrawlCarousel slides={slides} onNavigate={onNavigate} />}
    <nav className="wibrawl-collection-nav" aria-label="Discover collections">
      {WIBRAWL_COLLECTIONS.map(([href, title, subtitle], i) => <Link key={href} href={href} onNavigate={onNavigate}><span className="wibrawl-collection-symbol" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span><div><h2>{title}</h2><p>// {subtitle}</p></div></Link>)}
    </nav>
    {children}
    <section className="wibrawl-manifesto" aria-labelledby="wibrawl-manifesto-title">
      <p>Whatever you're into,<br />you're in.</p>
      <div><h2 id="wibrawl-manifesto-title">YOUR VIBE.<br />NO FILTER.</h2><p>Graphic tees for showing up as yourself. Mix it up, make it yours, and find your people along the way.</p><Link className="wibrawl-secondary-action" href="/about" onNavigate={onNavigate}>Meet Wibrawl</Link></div>
    </section>
  </div>;
}
