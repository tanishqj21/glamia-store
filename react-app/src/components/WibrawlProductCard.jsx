/** @jsxRuntime automatic */
import { useEffect, useRef, useState } from 'react';
import { Link } from './Header';
import { Icon } from './Icon';
import { availableQuantity, isPreorder, money, productUrl } from '../lib/commerce';
import { useWibrawlCommerce, orderedWibrawlImages, useWibrawlClock, useWibrawlDealActive, wibrawlCountdown } from '../lib/wibrawlStorefront';
import { useWibrawlPersona } from '../lib/wibrawlPersona';
import { WibrawlColourSwatch } from './WibrawlColourSwatch';
import { catalogueMedia, recoverCatalogueMedia } from '../lib/catalogueMedia';
import { apiFetch } from '../lib/api';
import { normalizeProduct } from '../lib/productPresentation';

function DealCountdown({ endsAt }) {
  const now = useWibrawlClock();
  return <span className="wb-deal-timer">ENDS IN {wibrawlCountdown(endsAt,now)}</span>;
}
export function WibrawlPrice({ product, className = '' }) {
  const active = useWibrawlDealActive(product);
  const price = Number(active ? product.deal_price : product.price || 0), original = Math.max(Number(product.mrp || 0),Number(product.price || 0));
  return <div className={`wb-price ${className}`}><span>{money(price)}</span>{original > price && <><del>{money(original)}</del><small>{Math.round((1-price/original)*100)}% OFF</small></>}{active && <DealCountdown endsAt={product.deal_ends_at}/>}</div>;
}
export function WibrawlProductCard({ product, onNavigate, wishlist = new Set(), toggleWishlist = () => {}, onQuickView, index = 0, headingLevel = 3, aboveFold = false, rank, badge }) {
  const commerce = useWibrawlCommerce(), persona = useWibrawlPersona();
  const [details,setDetails] = useState([]),[chosen,setChosen] = useState(null),[secondary,setSecondary] = useState(false),[message,setMessage] = useState('');
  const card = useRef(null),video = useRef(null),touch = useRef(null);
  useEffect(() => {let active=true;const observer=new IntersectionObserver(entries => {if(!entries.some(e=>e.isIntersecting))return;observer.disconnect();apiFetch(`/api/products/${encodeURIComponent(product.id)}?cache=1`,{cacheTtl:30000}).then(r=>r.ok?r.json():null).then(data=>{if(active&&data?.product)setDetails([data.product,...data.colourways||[]].filter(p=>(!p.status||p.status==='live')&&['wibrawl','both'].includes(p.storefront_visibility||'wibrawl')).map(normalizeProduct));}).catch(()=>{});},{rootMargin:'160px'});observer.observe(card.current);return()=>{active=false;observer.disconnect();};},[product.id]);
  const current=details.find(p=>p.id===(chosen?.id||product.id))||chosen||product, images=orderedWibrawlImages(current), sizes=current.sizes||[], Heading=headingLevel===2?'h2':'h3';
  const variants=[...new Map([product,...commerce?.products?.filter(p=>p.id===product.id||(product.variant_group&&p.variant_group===product.variant_group))||[],...details].map(p=>[p.id,p])).values()];
  const stockKnown=!sizes.length||isPreorder(current)||!!current.size_stock&&Object.keys(current.size_stock).length>0;
  const quantity=sizes.length&&stockKnown?sizes.reduce((sum,size)=>sum+availableQuantity(current,size),0):availableQuantity(current,'');
  const deal=useWibrawlDealActive(current),quickView=onQuickView||commerce?.onQuickView;
  useEffect(()=>{if(!video.current)return;if(secondary&&!matchMedia('(prefers-reduced-motion: reduce)').matches)video.current.play().catch(()=>{});else video.current.pause();},[secondary,current.video_url]);
  function add(size,event){if(!stockKnown||!availableQuantity(current,size))return;if(!commerce?.addToCart)return quickView?.(current);commerce.onProductLoaded?.(current);commerce.addToCart(current,size,{source:card.current?.querySelector('.wb-spec-image'),trigger:event?.currentTarget});setMessage(`${size?`${size} / `:''}Added to bag`);}
  return <article className="wb-spec-card wb-product-card" ref={card} onMouseEnter={()=>setSecondary(true)} onMouseLeave={()=>setSecondary(false)}>
    <header className="wb-spec-strip"><span>{current.category||'WIBRAWL'} / {current.product_code||String(current.id).slice(0,8)}</span><b className={deal?'is-deal':''}>{isPreorder(current)?'PRE-ORDER':deal?persona.dealBadge:badge||persona.badge}</b></header>
    <div className="wb-spec-media" onTouchStart={e=>{touch.current={x:e.touches[0].clientX,y:e.touches[0].clientY};}} onTouchEnd={e=>{if(!touch.current)return;const x=e.changedTouches[0].clientX-touch.current.x,y=e.changedTouches[0].clientY-touch.current.y;if(Math.abs(x)>40&&Math.abs(x)>Math.abs(y)*1.3)setSecondary(!secondary);touch.current=null;}}>
      <Link className="wb-spec-image" href={productUrl(current)} onNavigate={onNavigate} aria-label={`View ${current.name}`}>{images[0]?<><img src={catalogueMedia(images[0])} onError={e=>recoverCatalogueMedia(e,images[0])} alt={current.name} loading={aboveFold?'eager':'lazy'} fetchPriority={aboveFold&&index===0?'high':undefined} width="480" height="640" />{images[1]&&<img className={`wb-spec-second ${secondary?'is-visible':''}`} src={catalogueMedia(images[1])} onError={e=>recoverCatalogueMedia(e,images[1])} alt={`${current.name}, alternate view`} loading="lazy" width="480" height="640" />}</>:<span>Product image unavailable</span>}{current.video_url&&<video ref={video} className={secondary?'is-visible':''} src={current.video_url} muted playsInline loop preload="none" aria-label={`${current.name} preview`} />}</Link>
      {rank&&<span className="wb-spec-rank" aria-label={`Rank ${rank}`}>#{String(rank).padStart(2,'0')}</span>}<button type="button" className="wb-spec-save" onClick={()=>toggleWishlist(current.id)} aria-pressed={wishlist.has(current.id)} aria-label={`${wishlist.has(current.id)?'Remove':'Add'} ${current.name} ${wishlist.has(current.id)?'from':'to'} wishlist`}><Icon name="heart" size={19}/></button>
      <div className="wb-spec-colours" role="group" aria-label={`Colourways for ${product.name}`}>{variants.map(p=><button key={p.id} type="button" title={p.color||p.name} aria-label={`Preview ${p.color||p.name}`} aria-pressed={p.id===current.id} onClick={()=>{setChosen(p);setSecondary(false);setMessage('');}}><WibrawlColourSwatch colour={p.color} hex={p.color_hex}/></button>)}</div>
      <div className="wb-spec-quickadd"><div><span className="wb-tech">QUICK ADD / {stockKnown?'LIVE STOCK':'CHECKING SIZES'}</span><button type="button" onClick={()=>quickView?quickView(current):onNavigate(productUrl(current))} aria-label={`Quick view ${current.name}`}>View</button></div><div className="wb-quick-sizes" role="group" aria-label={`Quick add ${current.name}`}>{sizes.length?sizes.map(size=><button key={size} type="button" disabled={!stockKnown||!availableQuantity(current,size)} onClick={event=>add(size,event)} aria-label={`Add ${current.name}, size ${size} to bag`}>{size}</button>):<button type="button" disabled={!quantity} onClick={event=>add('',event)}>Add to bag</button>}</div></div>
    </div><footer className="wb-spec-caption"><div><Heading><Link href={productUrl(current)} onNavigate={onNavigate}>{current.name}</Link></Heading><span>{current.color||'ORIGINAL EDIT'}{quantity>0&&quantity<=5?` / ${quantity} LEFT`:quantity===0?' / SOLD OUT':''}</span></div><WibrawlPrice product={current}/><p role="status" className="wb-card-notice">{message}</p></footer>
  </article>;
}
