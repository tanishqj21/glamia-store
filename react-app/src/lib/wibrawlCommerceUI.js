import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from './api';
import { availableQuantity, sellingPrice } from './commerce';

export function swapWibrawlSize(cart, item, size, product) {
  if (size === item.size) return cart;
  const other = cart.find(line => line.id === item.id && (line.size || '') === size);
  const quantity = item.quantity + (other?.quantity || 0);
  if (!product.sizes?.includes(size) || quantity > availableQuantity(product, size) || quantity > 10) throw Error('That size cannot hold this quantity. Choose another size or reduce the quantity.');
  const source = cart.find(line => line.id === item.id && (line.size || '') === (item.size || ''));
  return cart.filter(line => !(line.id === item.id && [item.size || '', size].includes(line.size || ''))).concat({ ...source, size, quantity });
}

export function useWibrawlCreditChoice(user) {
  const key = `wibrawl-use-credits:${user?.email || 'guest'}`;
  const signedIn = !!user?.email;
  const read = useCallback(() => { try { return signedIn && sessionStorage.getItem(key) === '1'; } catch { return false; } }, [key, signedIn]);
  const [choice, setChoice] = useState(() => ({ key, enabled: read() }));
  useEffect(() => { const sync = () => setChoice({key,enabled:read()}); window.addEventListener('wibrawl-credit-choice', sync); return () => window.removeEventListener('wibrawl-credit-choice', sync); }, [key, read]);
  const choose = value => { setChoice({key,enabled:value}); try { sessionStorage.setItem(key, value ? '1' : '0'); } catch { /* The visit still works without storage. */ } window.dispatchEvent(new Event('wibrawl-credit-choice')); };
  return [choice.key === key ? choice.enabled : read(), choose];
}

export function useWibrawlBalance(user) {
  const [result, setResult] = useState({ balance: 0, loading: !!user, error: '' });
  useEffect(() => {
    let active = true, controller;
    const load = async () => {
      if (!user) { setResult({ balance: 0, loading: false, error: '' }); return; }
      controller?.abort(); controller = new AbortController();
      try { const response = await apiFetch('/api/loyalty?summary=1', { cache: 'no-store', signal: controller.signal }); const data = await response.json(); if (!response.ok) throw Error(data.error || 'Credits could not be checked.'); if (active) setResult({ balance: Math.max(0, Number(data.balance || 0)), loading: false, error: '' }); }
      catch (error) { if (active && error.name !== 'AbortError') setResult({ balance: 0, loading: false, error: error.message }); }
    };
    load(); const resume = () => { if (!document.hidden) load(); };
    window.addEventListener('glamia-credits-changed', resume); document.addEventListener('visibilitychange', resume);
    return () => { active = false; controller?.abort(); window.removeEventListener('glamia-credits-changed', resume); document.removeEventListener('visibilitychange', resume); };
  }, [user]);
  return result;
}

// Mirrors the existing invoiceLineItems proportional discount and tax rules.
// Estimates never alter the provider payload or add a second tax charge.
export function wibrawlTaxEstimate(lines, discount = 0) {
  const subtotal = lines.reduce((sum, line) => sum + sellingPrice(line.product) * line.item.quantity, 0);
  const round = value => Math.round(value * 100) / 100;
  const entries = lines.map(({ item, product }) => {
    const gross = sellingPrice(product) * item.quantity, net = Math.max(0, gross - (subtotal > 0 ? Math.min(gross, discount * gross / subtotal) : 0));
    const raw = product?.gst_rate, rate = raw === null || raw === undefined || raw === '' ? null : Number(raw);
    const ready = !!product?.hsn_sac_code && rate !== null && Number.isFinite(rate) && rate >= 0;
    const inclusive = product?.gst_tax_inclusive == null || !!product.gst_tax_inclusive;
    return { name: product?.name || 'Unavailable piece', code: product?.hsn_sac_code, rate, ready, inclusive, tax: ready ? round(inclusive ? net - net / (1 + rate / 100) : net * rate / 100) : null };
  });
  return { entries, complete: entries.length > 0 && entries.every(item => item.ready), total: round(entries.reduce((sum, line) => sum + (line.tax || 0), 0)), inclusive: entries.every(line => line.inclusive) };
}

export const safeTrackingUrl = value => { try { const url = new URL(value); return url.protocol === 'https:' ? url.href : ''; } catch { return ''; } };
export function orderBucket(order) { return ['cancelled','failed','on_hold','delivery_failed'].includes(order.status) || ['failed','requires_action'].includes(order.payment_status) ? 'attention' : order.status === 'delivered' ? 'delivered' : ['shipped','in_transit','out_for_delivery'].includes(order.status) ? 'transit' : 'processing'; }
export const ledgerGroup = entry => Number(entry.amount) < 0 ? 'spent' : /refund|return|cancel/.test(entry.kind) ? 'refunds' : /referr/.test(entry.kind) ? 'referrals' : 'bonuses';
