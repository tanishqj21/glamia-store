import { useEffect, useId, useRef, useState } from 'react';
import { Link } from './Header';
import { availableQuantity, productUrl } from '../lib/commerce';
import { apiFetch } from '../lib/api';
import { normalizeProduct } from '../lib/productPresentation';
import { useWibrawlCommerce } from '../lib/wibrawlStorefront';
import { WibrawlPrice } from './WibrawlProductCard';

function ReelVideo({ product, number, onNavigate }) {
  const video = useRef(null), card = useRef(null), [muted, setMuted] = useState(true);
  const [detail, setDetail] = useState(null);
  const current = detail || product;
  const commerce = useWibrawlCommerce();
  useEffect(() => {
    let active = true;
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect();
      apiFetch(`/api/products/${encodeURIComponent(product.id)}?cache=1`, { cacheTtl: 30000 }).then(response => response.ok ? response.json() : null).then(data => { if (active && data?.product) setDetail(normalizeProduct(data.product)); }).catch(() => {});
    }, { rootMargin: '160px' });
    observer.observe(card.current);
    return () => { active = false; observer.disconnect(); };
  }, [product.id]);
  useEffect(() => {
    if (!video.current) return;
    const element = video.current, media = matchMedia('(prefers-reduced-motion: reduce)');
    let inView = false;
    const sync = () => { if (inView && !document.hidden && !media.matches) element.play().catch(() => {}); else element.pause(); };
    const observer = new IntersectionObserver(entries => { inView = entries[0].isIntersecting; sync(); }, { threshold: .65 });
    observer.observe(card.current); document.addEventListener('visibilitychange', sync); media.addEventListener('change', sync);
    return () => { observer.disconnect(); element.pause(); document.removeEventListener('visibilitychange', sync); media.removeEventListener('change', sync); };
  }, [current.video_url]);
  const canAddWithoutSize = detail && !current.sizes?.length && availableQuantity(current, '') > 0;
  return <article className="wb-shoppable-card" ref={card} onPointerEnter={event => { if (event.pointerType === 'mouse' && video.current && !matchMedia('(prefers-reduced-motion: reduce)').matches) video.current.play().catch(() => {}); }}>
    <Link className="wb-shoppable-media" href={productUrl(current)} onNavigate={onNavigate} aria-label={`Explore ${current.name}`}>{current.video_url ? <video ref={video} src={current.video_url} poster={current.image_url || current.thumbnail_url} muted={muted} playsInline loop preload="none" aria-label={`${current.name} product film`} /> : <img src={current.image_url || current.thumbnail_url} alt={current.name} width="540" height="960" loading="lazy" decoding="async" />}</Link>
    <span className="wb-reel-count">{String(number).padStart(2, '0')} / THE EDIT</span>
    {current.video_url && <button type="button" className="wb-reel-mute" onClick={() => setMuted(!muted)} aria-label={`${muted ? 'Unmute' : 'Mute'} ${current.name}`} aria-pressed={!muted}>{muted ? 'Sound off' : 'Sound on'}</button>}
    <div className="wb-shoppable-chip"><Link href={productUrl(current)} onNavigate={onNavigate}><strong>{current.name}</strong><WibrawlPrice product={current} /></Link><button type="button" aria-label={`${canAddWithoutSize ? 'Add to bag' : 'Choose size for'} ${current.name}`} onClick={() => { if (canAddWithoutSize && commerce?.addToCart) { commerce.onProductLoaded?.(current); commerce.addToCart(current, ''); } else if (commerce?.onQuickView) commerce.onQuickView(current); else onNavigate(productUrl(current)); }}>+</button></div>
  </article>;
}

export function WibrawlShoppableReel({ settings, pieces, onNavigate }) {
  const id = useId(), track = useRef(null);
  return <section className={`wb-shoppable-section wb-shoppable--${settings.layout}`} data-reel={settings.id} aria-labelledby={id}><div className="wb-reel-heading"><div><p className="wibrawl-kicker">{settings.eyebrow}</p><h2 id={id}>{settings.title}<br /><em>{settings.emphasis}</em></h2>{settings.description && <p className="wb-reel-description">{settings.description}</p>}</div><div className="wb-reel-arrows"><button type="button" onClick={() => track.current.scrollBy({ left: -track.current.clientWidth * .8, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })} aria-label="Previous reel pieces">Previous</button><button type="button" onClick={() => track.current.scrollBy({ left: track.current.clientWidth * .8, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })} aria-label="Next reel pieces">Next</button></div></div><div className="wb-shoppable-track" ref={track} tabIndex={0} role="region" aria-label={`${settings.title} shoppable pieces`}>{pieces.map((product, index) => <ReelVideo key={product.id} product={product} number={index + 1} onNavigate={onNavigate} />)}</div></section>;
}
