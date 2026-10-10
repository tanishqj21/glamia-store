import React, { useEffect, useState } from 'react';
import { productUrl, formatIST } from '../lib/commerce';
import { Icon } from './Icon';

function StorePromises({ settings }) {
  const items = (settings?.items || [
    { id: "shipping", title: "Free & fast shipping" },
    { id: "returns", title: "7-day easy returns" },
    { id: "secure", title: "Secure checkout" }
  ]).filter(item => item.visible !== false);
  if (settings?.visible === false || !items.length) return null;
  return <section className={`trust-strip trust-strip-count-${items.length}`} aria-label="Store promises">
    {items.map(item => <div className="trust-promise" key={item.id || item.title}><strong>{item.title}</strong>{item.body && <p>{item.body}</p>}</div>)}
  </section>;
}



function CampaignFeature({ campaign, onNavigate }) {
  if (!campaign?.active || campaign.show_on_home === false) return null;
  return <section className={`campaign-feature event-theme-${campaign.theme || "graphite"}`} aria-label="Current Glamia event"><div className="campaign-feature-copy"><span className="campaign-feature-kicker">GLAMIA / {campaign.type || "the edit"}</span><span className="campaign-feature-symbol" aria-hidden="true">✳</span><p className="campaign-feature-overline">The moment is here</p><h2>{campaign.headline}</h2><p className="campaign-feature-message">{campaign.message}</p><div className="campaign-feature-actions"><button type="button" onClick={() => onNavigate(campaign.cta_href || "/offers")}>{campaign.cta_label || "Explore the edit"} </button>{campaign.coupon_code && <span className="campaign-feature-code">USE CODE <strong>{campaign.coupon_code}</strong></span>}</div></div><div className="campaign-feature-aside"><span>THE GLAMIA EDIT</span><strong>{campaign.name || "Made for the moment"}</strong><small>{campaign.ends_at ? `Until ${formatIST(campaign.ends_at)}` : "Discover it while it's here"}</small></div></section>;
}

function CinematicHero({ slides = [], ready = false, onNavigate }) {
  const availableSlides = slides.length || ready ? slides : [{ eyebrow: "The Glamia Edit", title: "Everyday pieces, beautifully composed.", tagline: "Curated apparel and accessories for every wardrobe, sourced from independent ateliers.", cta_label: "Explore the collection", cta_category: "", frames: [] }];
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => { if (index >= availableSlides.length) setIndex(0); }, [availableSlides.length, index]);
  useEffect(() => { if (paused || availableSlides.length < 2) return undefined; const timer = window.setInterval(() => setIndex((current) => (current + 1) % availableSlides.length), 6000); return () => window.clearInterval(timer); }, [availableSlides.length, paused]);
  const slide = availableSlides[index] || availableSlides[0];
  const frames = (slide?.frames || []).slice(0, 3);
  function changeSlide(direction) { setPaused(true); setIndex((current) => (current + direction + availableSlides.length) % availableSlides.length); }
  if (!slide) return null;
return <section className="cinematic-home cinematic-home-editorial" aria-label="Featured collection"><div className="cinematic-copy"><p className="eyebrow">{slide?.eyebrow || "The Glamia Edit"}</p><h1>{slide?.title || "Everyday pieces, beautifully composed."}</h1><p>{slide?.tagline || "Curated apparel and accessories for every wardrobe, sourced from independent ateliers."}</p>{(slide?.words || []).length > 0 && <div className="cinematic-words">{slide.words.map((word) => <span key={word}>{word}</span>)}</div>}<button className="primary-action" onClick={() => onNavigate(slide?.cta_category ? `/category/${encodeURIComponent(slide.cta_category)}` : "/best-sellers")}>{slide?.cta_label || "Explore the collection"}</button></div><div className={`cinematic-stage cinematic-frame-count-${frames.length}`}>{frames.length ? frames.map((frame, frameIndex) => <button type="button" className={`cinematic-frame cinematic-frame-${frameIndex}`} key={frame.id || frame.image || frameIndex} onClick={() => onNavigate(productUrl(frame))} aria-label={`View ${frame.name || slide?.title || "featured product"}`}><img src={frame.image} alt={frame.name || slide?.title || "Featured collection"} width="480" height="600" decoding={frameIndex === 0 && frame.image?.startsWith("data:image/") ? "sync" : "async"} fetchPriority={frameIndex === 0 ? "high" : undefined} /></button>) : <div className="hero-gradient hero-gradient-empty"><span className="hero-gradient-kicker">GLAMIA / EDITORIAL</span><strong>New pieces<br /><em>coming soon.</em></strong><span>Check back shortly for the next edit.</span></div>}</div><button type="button" className="cinematic-arrow cinematic-prev" onClick={() => changeSlide(-1)} aria-label="Previous featured edit"><Icon name="chevronLeft" /></button><button type="button" className="cinematic-arrow cinematic-next" onClick={() => changeSlide(1)} aria-label="Next featured edit"><Icon name="chevronRight" /></button><div className="cinematic-progress" role="group" aria-label={`Featured edit ${index + 1} of ${availableSlides.length}`}>{availableSlides.map((item, itemIndex) => <span key={item.id || itemIndex} className={itemIndex === index ? "active" : ""} />)}</div></section>;
}

function HomepageEditorial({ onNavigate }) {
  return <section className="homepage-editorial" aria-labelledby="homepage-editorial-title">
    <div className="homepage-editorial-aside">
      <p className="eyebrow">A point of view</p>
      <span className="homepage-editorial-number">02</span>
    </div>
    <div className="homepage-editorial-copy">
      <h2 id="homepage-editorial-title">Good design<br />should feel<br /><em>like yours.</em></h2>
      <p>Glamia brings considered pieces together without asking you to dress for a category. The result is a wardrobe that feels personal, useful, and quietly distinctive.</p>
      <button type="button" className="text-link" onClick={() => onNavigate("/best-sellers")}>Explore best sellers </button>
    </div>
    <div className="homepage-editorial-rule" aria-hidden="true" />
  </section>;
}

export { StorePromises, CampaignFeature, CinematicHero, HomepageEditorial };
