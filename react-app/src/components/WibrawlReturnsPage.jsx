import { useState } from 'react';
import { AccountLayout } from './AccountLayout';
import { Link } from './Header';
import { useCustomerReturns } from '../lib/useCustomerReturns';
import { CustomerRefundTracker } from './CustomerRefundTracker';
import { CustomerExchangeTracker } from './CustomerReturnDetails';
import { AfterSalesDialog } from './CustomerCare';

function ReturnsContent({ orders, products, onNavigate }) {
  const updates = useCustomerReturns(), [orderId, setOrderId] = useState(''), [requestOrder, setRequestOrder] = useState(null);
  const delivered = orders.filter(order => order.status === 'delivered');
  return <>
    <section className="account-panel"><h2>Start a return or exchange</h2><p className="muted">Choose a delivered order. We’ll check its saved return policy, eligible items and available refund methods before you submit.</p>{delivered.length ? <div className="wb-return-start"><label htmlFor="wb-return-order">Delivered order</label><select id="wb-return-order" value={orderId} onChange={event => setOrderId(event.target.value)}><option value="">Choose an order</option>{delivered.map(order => <option key={order.id} value={order.id}>{order.order_number}</option>)}</select><button type="button" className="primary-action" disabled={!orderId} onClick={() => setRequestOrder(delivered.find(order => order.id === orderId))}>Return / Exchange</button></div> : <p className="muted">Your delivered orders will appear here.</p>}<Link href="/support?topic=return_exchange" onNavigate={onNavigate}>Need help or a return exception? Contact care.</Link></section>
    <section className="account-panel"><div className="account-panel-heading"><div><p className="eyebrow">Live aftercare</p><h2>Your requests</h2></div><button type="button" className="secondary-action" disabled={updates.loading || updates.refreshing || updates.offline} onClick={updates.refresh}>{updates.refreshing ? 'Refreshing…' : 'Refresh updates'}</button></div>{updates.loading && <p role="status">Loading return and refund progress…</p>}{updates.error && <p role="alert" className="inline-error">{updates.error}</p>}{!updates.loading && !updates.error && !updates.requests.length && <p className="muted">No return or exchange requests yet.</p>}{updates.requests.map(request => <article className="wb-return-request" key={request.id}><p className="wibrawl-kicker">{request.order?.order_number || request.order_id}</p>{request.type === 'exchange' ? <CustomerExchangeTracker request={request} onNavigate={onNavigate} /> : <CustomerRefundTracker request={request} order={request.order || orders.find(order => order.id === request.order_id) || {}} onNavigate={onNavigate} />}</article>)}</section>
    {requestOrder && <AfterSalesDialog order={requestOrder} products={products} onClose={() => setRequestOrder(null)} onComplete={() => { setRequestOrder(null); updates.refresh(); }} />}
  </>;
}

export default function WibrawlReturnsPage({ user, orders, products, onNavigate }) {
  return <AccountLayout route="/returns" onNavigate={onNavigate} title="Returns & exchanges" eyebrow="Wibrawl / Aftercare">{user ? <ReturnsContent key={user.email} orders={orders} products={products} onNavigate={onNavigate} /> : <section className="account-panel"><p className="muted">Sign in to view your requests and return eligibility.</p><Link className="primary-action" href="/login" onNavigate={onNavigate}>Sign in</Link></section>}</AccountLayout>;
}
