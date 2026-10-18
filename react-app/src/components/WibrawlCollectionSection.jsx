/** @jsxRuntime automatic */
import { useId } from 'react';
import { Link } from './Header';
import { WibrawlProductCard } from './WibrawlProductCard';
import { WibrawlHint } from './WibrawlHint';
import { useWibrawlPersona } from '../lib/wibrawlPersona';
import { useWibrawlLiveDealIds } from '../lib/wibrawlStorefront';

export function WibrawlCollectionSection({ kind = 'arrived', products = [], onNavigate, wishlist, toggleWishlist, onQuickView, page = false, loading = false, error, onRetry }) {
  const persona = useWibrawlPersona(), id = useId(), liveIds = useWibrawlLiveDealIds(products, kind === 'offers');
  const hub = persona.collections[{arrived:0,best:1,offers:2}[kind] ?? 0], Heading = page ? 'h1' : 'h2';
  const selected = kind === 'offers' ? products.filter(p => liveIds.split(',').includes(p.id)) : products;
  return <section className={`wb-collection-module wb-module-${kind}`} aria-labelledby={id}><header className="wb-module-heading"><div><span className="wb-tech">{kind === 'arrived' ? '01 / THE FIRST LOOK' : kind === 'best' ? '02 / IN GOOD COMPANY' : '03 / THE PRICE DROP'}</span><WibrawlHint label={hub.tooltip}><Heading id={id} tabIndex={0}>{hub.title}</Heading></WibrawlHint><p>{hub.detail}</p></div>{!page && <WibrawlHint label={hub.tooltip}><Link className="secondary-action" href={hub.href} onNavigate={onNavigate}>Explore the edit</Link></WibrawlHint>}</header>{error ? <div className="inline-error" role="alert">{error}{onRetry && <button type="button" className="secondary-action" onClick={onRetry}>Retry collection</button>}</div> : loading && !selected.length ? <div className={"wb-module-skeleton wb-skeleton-"+kind} role="status" aria-label="Loading collection">{(kind === "best" ? [0,1,2,3] : [0,1,2]).map(i => <div key={i} />)}</div> : selected.length ? <div className={`wb-collection-display ${kind === 'arrived' ? 'wb-lookbook-rail' : kind === 'best' ? 'wb-ranked-bento' : 'wb-drop-vault'}`} role={kind === 'arrived' ? 'region' : undefined} aria-label={kind === 'arrived' ? 'Just arrived lookbook' : undefined} tabIndex={kind === 'arrived' ? 0 : undefined}>{selected.map((product,i) => <WibrawlProductCard key={product.id} product={product} rank={kind === 'best' ? i+1 : undefined} badge={kind === 'offers' ? persona.dealBadge : undefined} index={i} headingLevel={page ? 2 : 3} aboveFold={page && i < 2} onNavigate={onNavigate} wishlist={wishlist} toggleWishlist={toggleWishlist} onQuickView={onQuickView} />)}</div> : <div className="wb-collection-empty"><h3>{kind === 'offers' ? 'The vault is between drops.' : 'The next edit is warming up.'}</h3><p>{kind === 'offers' ? 'Live scheduled deals appear here when their window opens.' : 'Published pieces will appear here. Check back for your next favourite.'}</p></div>}</section>;
}
