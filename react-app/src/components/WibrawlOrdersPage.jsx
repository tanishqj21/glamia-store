/** @jsxRuntime automatic */
import { useState } from 'react';
import { OrdersPanel } from './AccountPages';
import { AccountLayout } from './AccountLayout';
import { WibrawlDialog } from './WibrawlDialog';
import WibrawlAfterSalesDialog from './WibrawlAfterSalesDialog';
import { WibrawlCopy, WibrawlEmpty, WibrawlReceipt } from './WibrawlCommerceParts';
import { OrderDetails } from './OrderDetails';
import { CancellationRefundCard } from './CancellationRefundCard';
import { CustomerRefundTracker } from './CustomerRefundTracker';
import { CustomerExchangeTracker } from './CustomerReturnDetails';
import { orderBucket, safeTrackingUrl } from '../lib/wibrawlCommerceUI';
import { money, formatIST } from '../lib/commerce';

export function WibrawlFulfilment({ order }) {
  const delivered = order.status === 'delivered', shipped = delivered || ['shipped','in_transit','out_for_delivery'].includes(order.status);
  const packed = shipped || order.packing_status === 'packed' || !!order.packed_at;
  const confirmed = packed || ['confirmed','processing','packed'].includes(order.status) || order.payment_status === 'paid';
  return <ol className="wb-fulfilment" aria-label="Fulfilment progress">{[['Confirmed',confirmed],['Packed',packed],['In transit',shipped],['Delivered',delivered]].map(([label,done],i) => <li className={done ? 'is-done' : ''} key={label}><span className="wb-tech">{String(i+1).padStart(2,'0')}</span><span>{label}</span></li>)}</ol>;
}
function OrderBody({ order, m, detailed = false }) {
  const cases = m.returns.filter(r => r.order_id === order.id), active = cases.some(r => !['rejected','cancelled','refunded','completed'].includes(r.status));
  const tracking = order.tracking_number || order.trackingNumber, url = safeTrackingUrl(order.tracking_url || order.courier_tracking_url);
  return <><div className="wb-order-pieces">{(order.items || []).map((item,i) => <div className="wb-checkout-piece" key={item.line_id || i}>{(item.image_url || item.image) && <img src={item.image_url || item.image} alt="" />}<span><strong>{item.name || item.product_name || 'Ordered piece'}</strong><small>{[item.color || item.colour,item.size,`Qty ${item.quantity}`].filter(Boolean).join(' / ')}</small></span></div>)}</div><p className="wb-tech">ORDER / {order.status?.replaceAll('_',' ')} · PAYMENT / {order.payment_status?.replaceAll('_',' ')}</p><WibrawlFulfilment order={order} />
    {tracking && <section className="wb-tracking"><span className="wb-tech">{order.courier_name || order.courier || 'COURIER TRACKING'}</span><code>{tracking}</code><WibrawlCopy text={tracking} label="Copy tracking ID" />{url ? <a className="secondary-action" href={url} target="_blank" rel="noopener noreferrer">Track with courier</a> : <button type="button" className="secondary-action" onClick={() => m.onNavigate('/track-order')}>Track your order</button>}</section>}
    <OrderDetails order={order} onNavigate={m.onNavigate} /><div className="wb-commerce-actions">{order.bill_available ? <a className="secondary-action" href={`/api/orders/${encodeURIComponent(order.id)}/bill`} download>Download GST invoice (PDF)</a> : <a className="secondary-action" href={`/api/orders/${encodeURIComponent(order.id)}/invoice`} target="_blank" rel="noreferrer">Invoice preview</a>}{order.status === 'delivered' && !active && <button type="button" className="primary-action" disabled={!m.updates.updatedAt || m.updates.loading || !!m.updates.error || m.updates.offline} onClick={() => m.setAfterSalesOrder(order)}>Request refund / exchange</button>}{['pending','confirmed'].includes(order.status) && m.cancellationWindowOpen(order) && <button type="button" className="secondary-action" onClick={() => m.cancel(order)}>Cancel order</button>}</div>
    {detailed && <><WibrawlReceipt total={order.subtotal ?? order.total} discount={Number(order.discount || 0)} creditsUsed={Number(order.credits_used || 0)} payable={Number(order.payable_total ?? Math.max(0, Number(order.total || 0) - Number(order.credits_used || 0)))} coupon={{code:order.coupon_code}} /><p>Delivery: {[order.shipping?.line1,order.shipping?.city,order.shipping?.state,order.shipping?.pin].filter(Boolean).join(', ') || 'See order confirmation'}</p>{cases.map(r => <div key={r.id}>{r.type === 'exchange' ? <CustomerExchangeTracker request={r} onNavigate={m.onNavigate} /> : <CustomerRefundTracker request={r} order={order} onNavigate={m.onNavigate} />}</div>)}</>}
  </>;
}
function OrdersView({ m }) {
  const [filter,setFilter] = useState('all'), [selected,setSelected] = useState(() => new URLSearchParams(window.location.search).get('order') || '');
  const navigate = href => { const target = new URL(href, window.location.origin); setSelected(target.pathname === '/orders' ? target.searchParams.get('order') || '' : ''); if (target.pathname === '/orders') setFilter('all'); m.onNavigate(href); };
  const viewModel = {...m,onNavigate:navigate};
  const choices = [['all','All drops'],['processing','Processing'],['attention','Needs attention'],['transit','In transit'],['delivered','Delivered'],['returns','Returns & exchanges']];
  const orders = m.orders.filter(o => filter === 'all' || (filter === 'returns' ? m.returns.some(r => r.order_id === o.id) : orderBucket(o) === filter));
  const order = m.orders.find(o => o.id === selected || o.order_number === selected);
  return <div className="wb-commerce"><div className="wb-filter-tabs" role="group" aria-label="Order status filters">{choices.map(([value,label]) => <button type="button" key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}</div>{m.status && <p role="status">{m.status}</p>}{m.updates.error && <p role="alert">{m.updates.error}</p>}<button type="button" className="secondary-action" disabled={m.updates.loading || m.updates.refreshing || m.updates.offline} onClick={m.updates.refresh}>Refresh aftercare updates</button>
    {orders.map(o => <article className="wb-commerce-panel wb-order-card" id={`order-${o.id}`} key={o.id}><div className="wb-commerce-heading"><div><p className="wb-tech">{formatIST(o.created_at)} IST</p><h2>{o.order_number || o.id}</h2></div><strong>{money(o.total)}</strong></div><OrderBody order={o} m={viewModel} /><button className="secondary-action" type="button" onClick={() => setSelected(o.id)}>Order details</button>{o.status === 'cancelled' && <CancellationRefundCard order={o} onNavigate={m.onNavigate} />}</article>)}{!orders.length && <WibrawlEmpty title="No drops in this view." body="Your orders will appear here after checkout." action="Explore the edit" onAction={() => m.onNavigate('/just-arrived')} />}
    {order && <WibrawlDialog title={order.order_number || order.id} className="wb-order-dialog" onClose={() => setSelected('')}><OrderBody detailed order={order} m={viewModel} /></WibrawlDialog>}
    {m.afterSalesOrder && <WibrawlAfterSalesDialog order={m.afterSalesOrder} onClose={() => m.setAfterSalesOrder(null)} onComplete={() => {m.setAfterSalesOrder(null);m.updates.refresh();m.setStatus('Request submitted. Follow its progress in Returns & exchanges.');}} />}
  </div>;
}
export default function WibrawlOrdersPage({ user, orders, products, onNavigate }) {return <AccountLayout route="/orders" title="Your drops." eyebrow="Wibrawl / Orders" onNavigate={onNavigate}>{user ? <OrdersPanel key={user.email} initialOrders={orders} products={products} onNavigate={onNavigate} render={m => <OrdersView m={m} />} /> : <WibrawlEmpty title="Your orders live here." body="Sign in to track drops, download bills and manage returns." action="Sign in" onAction={() => onNavigate('/login')} />}</AccountLayout>;}
