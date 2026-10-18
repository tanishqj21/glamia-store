import { createContext, useContext, useSyncExternalStore } from 'react';

export const WibrawlCommerce = createContext(null);
export const useWibrawlCommerce = () => useContext(WibrawlCommerce);


// Only time-dependent leaves subscribe. The storefront/cart/auth tree never
// renders on a one-second tick. All leaves share one visibility-aware timer.
const clockListeners = new Set();
let clockNow = null, clockTimer;
const noSubscription = () => () => {};
const serverClock = () => null;
function tickClock() {
  clearTimeout(clockTimer);
  clockNow = Date.now();
  clockListeners.forEach(listener => listener());
  if (clockListeners.size && !document.hidden) clockTimer = setTimeout(tickClock, 1000 - Date.now() % 1000);
}
function subscribeClock(listener) {
  clockListeners.add(listener);
  if (clockListeners.size === 1) { document.addEventListener('visibilitychange', tickClock); tickClock(); }
  return () => {
    clockListeners.delete(listener);
    if (!clockListeners.size) { clearTimeout(clockTimer); clockNow = null; document.removeEventListener('visibilitychange', tickClock); }
  };
}
export function useWibrawlClock(enabled = true) {
  return useSyncExternalStore(enabled ? subscribeClock : noSubscription, enabled ? () => clockNow : serverClock, serverClock);
}
function scheduledDeal(product) {
  return product?.deal_price != null && Date.parse(product.deal_ends_at || '') > Date.now();
}
export function useWibrawlDealActive(product) {
  // A boolean snapshot changes only at a deal boundary, not every second.
  return useSyncExternalStore(scheduledDeal(product) ? subscribeClock : noSubscription, () => wibrawlDeal(product, clockNow), () => false);
}
export function useWibrawlLiveDealIds(products, enabled) {
  return useSyncExternalStore(enabled && products.some(scheduledDeal) ? subscribeClock : noSubscription,
    () => products.filter(product => wibrawlDeal(product, clockNow)).map(product => product.id).join(','), () => '');
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
