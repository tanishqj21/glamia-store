import { useEffect, useRef, useState } from 'react';
import { Link } from './Header';
import { Icon } from './Icon';
import { availableQuantity, isPreorder, money, productUrl, sellingPrice } from '../lib/commerce';
import { useWibrawlCommerce, orderedWibrawlImages, wibrawlDeal, wibrawlCountdown } from '../lib/wibrawlStorefront';
import { colourSwatchStyle } from '../lib/colours';
import { catalogueMedia, recoverCatalogueMedia } from '../lib/catalogueMedia';
import { apiFetch } from '../lib/api';
import { normalizeProduct } from '../lib/productPresentation';

export function WibrawlPrice({ product, className = '' }) {
  const commerce = useWibrawlCommerce(), now = commerce?.now ?? null;
  const price = now === null ? Number(product.price || 0) : sellingPrice(product, now), original = Math.max(Number(product.mrp || 0), Number(product.price || 0));
  const saved = original > price ? Math.round((1 - price / original) * 100) : 0;
  return <div className={`wb-price ${className}`}><span>{money(price)}</span>{saved > 0 && <><del>{money(original)}</del><small>{saved}% OFF</small></>}{wibrawlDeal(product, now) && <span className="wb-deal-timer">ENDS IN {wibrawlCountdown(product.deal_ends_at, now)}</span>}</div>;
}

export function WibrawlProductCard({ product, onNavigate, wishlist = new Set(), toggleWishlist = () => {}, onQuickView, index = 0, headingLevel = 3, aboveFold = false }) {
  const commerce = useWibrawlCommerce(), [chosen, setChosen] = useState(null), [secondary, setSecondary] = useState(false), [message, setMessage] = useState('');
  const [details, setDetails] = useState([]);
  const touch = useRef(null), video = useRef(null), card = useRef(null);
  // Card responses deliberately omit the full gallery and optional video. Read
  // the established detail endpoint only as each card approaches the viewport.
  useEffect(() => {
    let active = true;
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect();
      apiFetch(`/api/products/${encodeURIComponent(product.id)}?cache=1`, { cacheTtl: 30000 }).then(response => response.ok ? response.json() : null).then(data => {
        if (active && data?.product) setDetails([data.product, ...(data.colourways || [])].filter(item => item.id && (!item.status || item.status === 'live') && ['wibrawl', 'both'].includes(item.storefront_visibility || 'wibrawl')).map(normalizeProduct));
      }).catch(() => { /* The catalogue card and full details link remain available. */ });
    }, { rootMargin: '160px' });
    observer.observe(card.current);
    return () => { active = false; observer.disconnect(); };
  }, [product.id]);
  const current = details.find(item => item.id === (chosen?.id || product.id)) || chosen || product, Heading = headingLevel === 2 ? 'h2' : 'h3';
  const images = orderedWibrawlImages(current), selectedImage = images[secondary && images.length > 1 ? 1 : 0];
  const choices = commerce?.products?.filter(item => item.id === product.id || (product.variant_group && item.variant_group === product.variant_group)) || [];
  const variants = [...new Map([product, ...choices, ...(Array.isArray(product.colourways) ? product.colourways : []), ...details].map(item => [item.id, item])).values()];
  const sizes = current.sizes || [], quantity = sizes.length && current.size_stock && Object.keys(current.size_stock).length ? sizes.reduce((sum, size) => sum + availableQuantity(current, size), 0) : availableQuantity(current, '');
  const stockKnown = !sizes.length || isPreorder(current) || !!current.size_stock && Object.keys(current.size_stock).length > 0;
  const deal = wibrawlDeal(current, commerce?.now ?? null);
  const quickView = onQuickView || commerce?.onQuickView;
  useEffect(() => {
    if (!video.current) return;
    if (secondary && !matchMedia('(prefers-reduced-motion: reduce)').matches) video.current.play().catch(() => {});
    else video.current.pause();
  }, [secondary, current.video_url]);
  function preview(active) { setSecondary(active); if (!video.current) return; if (active && !matchMedia('(prefers-reduced-motion: reduce)').matches) video.current.play().catch(() => {}); else video.current.pause(); }
  function add(size) {
    if (!stockKnown || !availableQuantity(current, size)) return;
    if (!commerce?.addToCart) return quickView?.(current);
    commerce.onProductLoaded?.(current); commerce.addToCart(current, size); setMessage(`${size ? `${size} / ` : ''}Added to bag`);
  }
  return <article className="product-card wb-product-card" ref={card} onMouseEnter={() => preview(true)} onMouseLeave={() => preview(false)}>
    <div className="wb-card-media" onTouchStart={event => { touch.current = { x: event.touches[0].clientX, y: event.touches[0].clientY }; }} onTouchEnd={event => { if (!touch.current) return; const x = event.changedTouches[0].clientX - touch.current.x, y = event.changedTouches[0].clientY - touch.current.y; if (Math.abs(x) > 40 && Math.abs(x) > Math.abs(y) * 1.3) preview(!secondary); touch.current = null; }}>
      <Link className="product-image" href={productUrl(current)} onNavigate={onNavigate} aria-label={`View ${current.name}`}>{selectedImage ? <img src={catalogueMedia(selectedImage)} onError={event => recoverCatalogueMedia(event, selectedImage)} alt={current.name} loading={aboveFold ? 'eager' : 'lazy'} fetchPriority={aboveFold && index === 0 ? 'high' : undefined} decoding="async" width="480" height="600" /> : <span>Image coming soon</span>}{current.video_url && <video ref={video} className={secondary ? 'is-visible' : ''} src={current.video_url} muted playsInline loop preload="none" aria-label={`${current.name} preview`} />}</Link>
      <div className="wb-card-badges">{isPreorder(current) ? <span>PRE-ORDER</span> : deal ? <span className="wb-badge-danger">MATCHDAY DEAL</span> : current.featured ? <span>FEATURED</span> : null}{!isPreorder(current) && quantity > 0 && quantity <= 5 && <span className="wb-badge-danger">ONLY {quantity} LEFT</span>}{quantity === 0 && <span>SOLD OUT</span>}</div>
      <button type="button" className={`wishlist-button ${wishlist.has(current.id) ? 'is-saved' : ''}`} onClick={() => toggleWishlist(current.id)} aria-label={`${wishlist.has(current.id) ? 'Remove' : 'Add'} ${current.name} ${wishlist.has(current.id) ? 'from' : 'to'} wishlist`}><Icon name="heart" size={19} /></button>
      <button type="button" className="wb-card-preview" onClick={() => quickView ? quickView(current) : onNavigate(productUrl(current))} aria-label={`Quick view ${current.name}`}>Quick view</button>
    </div>
    <div className="product-info"><p>{current.category || 'Wibrawl'}{current.color ? ` / ${current.color}` : ''}</p><Heading><Link href={productUrl(current)} onNavigate={onNavigate}>{current.name}</Link></Heading><WibrawlPrice product={current} />{variants.length > 1 && <div className="wb-card-colours" role="group" aria-label={`Colourways for ${product.name}`}>{variants.map(item => <button key={item.id} type="button" title={item.color || item.name} aria-label={`Preview ${item.color || item.name}`} aria-pressed={item.id === current.id} onClick={() => { setChosen(item); setSecondary(false); setMessage(''); }}><span style={colourSwatchStyle(item.color, item.color_hex)} /></button>)}</div>}
    <div className="wb-quick-sizes" role="group" aria-label={`Quick add ${current.name}`}>{sizes.length ? sizes.map(size => <button key={size} type="button" onClick={() => add(size)} disabled={!stockKnown || !availableQuantity(current, size)} aria-label={`Add ${current.name}, size ${size} to bag`}>{size}</button>) : <button type="button" disabled={!quantity} onClick={() => add('')}>Add to bag</button>}</div><p className="wb-card-notice" role="status">{message || (!stockKnown ? 'Open quick view to check sizes' : '')}</p></div>
  </article>;
}
