import { createContext, useContext, useEffect, useState } from 'react';

export const WibrawlCommerce = createContext(null);
export const useWibrawlCommerce = () => useContext(WibrawlCommerce);
export const WIBRAWL_COLLECTIONS = [
  ['/just-arrived', 'New Signings', 'Fresh Drops'],
  ['/best-sellers', 'League Leaders', 'Best Sellers'],
  ['/offers', 'Matchday Deals', 'Timed Offers'],
];

// One clock per mounted storefront; cards do not each create a second timer.
export function useWibrawlClock(enabled = true) {
  const [now, setNow] = useState(null);
  useEffect(() => {
    if (!enabled) return;
    let timer;
    const tick = () => { clearTimeout(timer); setNow(Date.now()); if (!document.hidden) timer = setTimeout(tick, 1000 - Date.now() % 1000); };
    tick(); document.addEventListener('visibilitychange', tick);
    return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', tick); };
  }, [enabled]);
  return now;
}

export function orderedWibrawlImages(product) {
  return [...new Set([product.thumbnail_url, product.image_url, ...(Array.isArray(product.images) ? product.images : []), product.image].filter(Boolean))];
}

export function wibrawlDeal(product, now) {
  const starts = product?.deal_starts_at ? Date.parse(product.deal_starts_at) : 0;
  const ends = Date.parse(product?.deal_ends_at || '');
  return now !== null && starts <= now && ends > now && product.deal_price != null;
}

export function wibrawlCountdown(endsAt, now) {
  const seconds = Math.max(0, Math.ceil((Date.parse(endsAt) - now) / 1000));
  if (!Number.isFinite(seconds) || !seconds) return '';
  const pad = number => String(number).padStart(2, '0');
  return `${pad(Math.floor(seconds / 3600))}H : ${pad(Math.floor(seconds / 60) % 60)}M : ${pad(seconds % 60)}S`;
}
