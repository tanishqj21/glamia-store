/** @jsxRuntime automatic */
import { useState } from 'react';
import { money } from '../lib/commerce';
import { wibrawlTaxEstimate } from '../lib/wibrawlCommerceUI';

export function WibrawlPerksMeter() {
  return <section className="wb-perks" aria-label="Your delivery perk"><div><span className="wb-tech">MATCHDAY PERK / UNLOCKED</span><strong>Free delivery is yours.</strong><p>Included with your bag. No minimum spend required.</p></div><progress max="1" value="1" aria-label="Free delivery unlocked" /></section>;
}

export function WibrawlCreditToggle({ balance, enabled, onChange, allowed = true, disabled = false, loading = false, error = '' }) {
  if (!balance && !loading && !error) return null;
  return <section className={`wb-credit-toggle ${enabled && allowed ? 'is-active' : ''}`}><label><input type="checkbox" checked={enabled && allowed} onChange={event => onChange(event.target.checked)} disabled={disabled || !allowed || loading || !!error} /><span><strong>{loading ? 'Checking your locker…' : `Apply ${money(balance)} Wibrawl Store Credits to this drop`}</strong><small>{error || (!allowed ? 'This coupon cannot be combined with store credits.' : '1 credit = ₹1. Only the amount your bag needs is used.')}</small></span></label></section>;
}

export function WibrawlReceipt({ lines = [], total, discount = 0, creditsUsed = 0, payable, coupon, tax = false }) {
  const estimate = wibrawlTaxEstimate(lines, discount);
  return <section className="wb-receipt" aria-label="Order receipt"><div><span>Subtotal</span><strong>{money(total)}</strong></div><div><span>Coupon{coupon?.code ? ` / ${coupon.code}` : ''}</span><strong>−{money(discount)}</strong></div><div><span>Store credits</span><strong>−{money(creditsUsed)}</strong></div><div><span>Delivery</span><strong>FREE</strong></div>{tax && <><div><span>Estimated GST{estimate.complete && estimate.inclusive ? ' (included)' : ''}</span><strong>{estimate.complete ? money(estimate.total) : 'On final invoice'}</strong></div><details className="wb-tax-details"><summary>HSN / GST details</summary>{estimate.entries.map((line, index) => <p key={index}><strong>{line.name}</strong><span>{line.ready ? `${line.code} / ${line.rate}% / ${money(line.tax)}` : 'Tax classification not supplied'}</span></p>)}<p>Estimate uses the saved product classification and proportional coupon discount. Store credits are a payment method. State tax split and final amounts appear on the issued GST invoice.</p></details></>}<div className="wb-receipt-total" role="status"><span>To pay</span><strong>{money(payable)}</strong></div></section>;
}

export function WibrawlCopy({ text, label = 'Copy' }) {
  const [message, setMessage] = useState('');
  return <span className="wb-copy"><button type="button" className="secondary-action" onClick={async () => { try { await navigator.clipboard.writeText(text); setMessage('Copied'); } catch { setMessage('Select the text to copy it.'); } }}>{label}</button><small role="status">{message}</small></span>;
}

export function WibrawlEmpty({ title, body, action, onAction }) {
  return <section className="wb-commerce-empty"><span className="wb-tech">W. / YOUR NEXT CHAPTER</span><h2>{title}</h2><p>{body}</p>{action && <button type="button" className="primary-action" onClick={onAction}>{action}</button>}</section>;
}
