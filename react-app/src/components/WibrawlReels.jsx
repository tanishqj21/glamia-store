import React, { useId, useState } from 'react';
import { Link } from './Header';
import { productUrl } from '../lib/commerce';

export function reelProducts(products, settings) {
  const eligible = products.filter(product => ['wibrawl', 'both'].includes(product.storefront_visibility || 'glamia') && (!product.status || product.status === 'live') && (product.image_url || product.thumbnail_url));
  const chosen = settings.product_ids?.length ? settings.product_ids.map(id => eligible.find(product => product.id === id)).filter(Boolean) : eligible;
  const seen = new Set();
  return chosen.filter(product => { const key = product.variant_group || product.id; if (seen.has(key)) return false; seen.add(key); return true; }).slice(0, 8);
}

function Piece({ product, number, onNavigate, className = '' }) {
  return <Link className={`wb-reel-piece ${className}`} href={productUrl(product)} onNavigate={onNavigate}>
    <div className="wb-reel-image"><img src={product.image_url || product.thumbnail_url} alt={product.name} loading="lazy" decoding="async" width="800" height="1000" /><span aria-hidden="true">{String(number).padStart(2, '0')}</span></div>
    <div className="wb-reel-caption"><strong>{product.name}</strong><span>View piece</span></div>
  </Link>;
}

function Reel({ settings, products, onNavigate, preview }) {
  const headingId = useId();
  const [index, setIndex] = useState(0);
  const pieces = reelProducts(products, settings);
  if ((!preview && !settings.visible) || !pieces.length) return null;
  const current = index % pieces.length;
  const active = pieces[current];
  return <section className={`wb-reel wb-reel-${settings.layout}`} data-reel={settings.id} aria-labelledby={headingId}>
    <div className="wb-reel-heading"><div><p className="wibrawl-kicker">{settings.eyebrow}</p><h2 id={headingId}>{settings.title}<br /><em>{settings.emphasis}</em></h2>{settings.description && <p className="wb-reel-description">{settings.description}</p>}</div><span className="wb-reel-label">W. / {settings.layout}</span></div>
    {settings.layout === 'filmstrip' && <div className="wb-filmstrip" tabIndex={0} role="region" aria-label="Swipe through the Wibrawl edit">{pieces.map((product, position) => <Piece key={product.id} product={product} number={position + 1} onNavigate={onNavigate} />)}</div>}
    {settings.layout === 'spotlight' && <><div className="wb-spotlight-stage"><Piece product={active} number={current + 1} onNavigate={onNavigate} /><div className="wb-spotlight-copy"><span className="wb-spotlight-number" aria-hidden="true">{String(current + 1).padStart(2, '0')}</span><p className="wibrawl-kicker">A closer look</p><h3>{active.name}</h3><Link className="wibrawl-secondary-action" href={productUrl(active)} onNavigate={onNavigate}>Explore this piece</Link><div className="wb-spotlight-thumbnails" role="group" aria-label="Choose spotlight piece">{pieces.map((product, position) => <button key={product.id} type="button" aria-label={`Spotlight ${product.name}`} aria-pressed={current === position} onClick={() => setIndex(position)}><img src={product.thumbnail_url || product.image_url} alt="" loading="lazy" width="64" height="80" /></button>)}</div></div></div>{pieces.length > 1 && <div className="wb-reel-controls"><button type="button" onClick={() => setIndex((current - 1 + pieces.length) % pieces.length)}>Prev piece</button><span aria-live="polite">{current + 1} / {pieces.length}</span><button type="button" onClick={() => setIndex((current + 1) % pieces.length)}>Next piece</button></div>}</>}
    {settings.layout === 'lookbook' && <div className="wb-lookbook">{pieces.map((product, position) => <Piece key={product.id} product={product} number={position + 1} onNavigate={onNavigate} />)}</div>}
  </section>;
}

export function WibrawlReels({ reels = [], products = [], onNavigate = href => window.location.assign(href), preview = false }) {
  return <>{reels.map(settings => <Reel key={settings.id} settings={settings} products={products} onNavigate={onNavigate} preview={preview} />)}</>;
}
