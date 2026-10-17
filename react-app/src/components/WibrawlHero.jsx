import { useEffect, useRef, useState } from 'react';
import { Link } from './Header';
import { WIBRAWL_CAMPAIGN_IMAGE, WIBRAWL_CAMPAIGN_SRCSET, WIBRAWL_CAMPAIGN_AVIF_SRCSET } from '../../../src/wibrawl-media';

export function WibrawlHero({ slides = [], onNavigate }) {
  const [index, setIndex] = useState(0), [piece, setPiece] = useState(0), [paused, setPaused] = useState(false);
  const touch = useRef(null), suppress = useRef(false);
  const selected = index % Math.max(1, slides.length), slide = slides[selected];
  const select = next => { setIndex((next + slides.length) % slides.length); setPiece(0); };
  useEffect(() => {
    if (slides.length < 2 || paused) return;
    let timer;
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const schedule = () => { clearTimeout(timer); if (!document.hidden && !media.matches) timer = setTimeout(() => { setIndex(current => (current + 1) % slides.length); setPiece(0); }, 6500); };
    schedule(); document.addEventListener('visibilitychange', schedule); media.addEventListener('change', schedule);
    return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', schedule); media.removeEventListener('change', schedule); };
  }, [slides, selected, paused]);
  if (!slide) return null;
  const frames = slide.frames || [], active = frames[piece % Math.max(1, frames.length)];
  const layout = ['poster', 'collage', 'split'].includes(slide.layout) ? slide.layout : 'poster';
  const campaign = slide.imagery === 'campaign';
  const campaignPicture = <picture><source type="image/avif" srcSet={slide.campaign_image || WIBRAWL_CAMPAIGN_AVIF_SRCSET} sizes="(max-width: 767px) 100vw, 75vw" /><img src={WIBRAWL_CAMPAIGN_IMAGE} srcSet={WIBRAWL_CAMPAIGN_SRCSET} sizes="(max-width: 767px) 100vw, 75vw" width="1440" height="960" alt="Wibrawl oversized graphic tee campaign" fetchPriority="high" /></picture>;
  return <section className={`wb-hero wb-hero--${layout}`} aria-label="Wibrawl featured collections" aria-roledescription="carousel" onPointerEnter={event => { if (event.pointerType === 'mouse') setPaused(true); }} onPointerLeave={() => setPaused(false)} onFocusCapture={() => setPaused(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false); }} onTouchStart={event => { suppress.current = false; touch.current = { x: event.touches[0].clientX, y: event.touches[0].clientY }; }} onTouchEnd={event => {
    if (!touch.current || slides.length < 2) return;
    const x = event.changedTouches[0].clientX - touch.current.x, y = event.changedTouches[0].clientY - touch.current.y;
    if (Math.abs(x) > 55 && Math.abs(x) > Math.abs(y) * 1.3) { select(selected + (x < 0 ? 1 : -1)); suppress.current = true; }
    touch.current = null;
  }} onClickCapture={event => { if (suppress.current) { event.preventDefault(); event.stopPropagation(); suppress.current = false; } }}>
    <div className="wb-hero-body" key={slide.id} role="group" aria-roledescription="slide" aria-label={`${selected + 1} of ${slides.length}`}>
      <div className="wb-hero-media">
        {campaign ? campaignPicture : active ? <Link href={`/product/${encodeURIComponent(active.id)}`} onNavigate={onNavigate}><img src={active.image} alt={active.name} width="960" height="1200" fetchPriority="high" /></Link> : <span className="wb-hero-empty">WIBRAWL / THE EDIT</span>}
        {layout === 'collage' && frames.length > 1 && <div className="wb-hero-collage-pieces">{frames.slice(0, 3).map((frame, i) => <Link key={frame.id} data-active={piece === i ? "true" : undefined} href={`/product/${encodeURIComponent(frame.id)}`} onNavigate={onNavigate}><img src={frame.image} alt={frame.name} width="240" height="300" /><span>{String(i + 1).padStart(2, '0')} / {frame.name}</span></Link>)}</div>}
        {['poster', 'split'].includes(layout) && active && <Link href={`/product/${encodeURIComponent(active.id)}`} onNavigate={onNavigate} className="wb-hero-spec"><small>In this edit / {String(piece + 1).padStart(2, '0')}</small><strong>{active.name}</strong>{active.color && <span>{active.color}</span>}</Link>}
      </div>
      <div className="wb-hero-copy"><p className="wibrawl-kicker">{slide.eyebrow}</p><h1>{slide.title}</h1><p className="wb-hero-description">{slide.tagline}</p>{slide.words?.length > 0 && <div className="wb-hero-tags">{slide.words.map(word => <span key={word}>{word}</span>)}</div>}<Link className="wibrawl-primary-action" href={slide.cta_category ? `/category/${encodeURIComponent(slide.cta_category)}` : '/just-arrived'} onNavigate={onNavigate}>{slide.cta_label || 'Shop the edit'}</Link></div>
    </div>
    <div className="wb-hero-rail"><div className="wb-piece-selectors" role="group" aria-label="Choose a piece">{frames.map((frame, i) => <button key={frame.id} type="button" aria-pressed={piece === i} onClick={() => setPiece(i)} aria-label={`Preview ${frame.name}`}><img src={frame.image} alt="" width="32" height="40" /><span>{String(i + 1).padStart(2, '0')}<small>{frame.name}</small></span></button>)}</div><div className="wb-slide-controls"><button type="button" onClick={() => select(selected - 1)} disabled={slides.length < 2} aria-label="Previous hero slide">Previous</button><span className="wb-slide-index" aria-live="polite">{String(selected + 1).padStart(2, '0')} / {String(slides.length).padStart(2, '0')}</span><button type="button" onClick={() => select(selected + 1)} disabled={slides.length < 2} aria-label="Next hero slide">Next</button></div></div>
  </section>;
}
