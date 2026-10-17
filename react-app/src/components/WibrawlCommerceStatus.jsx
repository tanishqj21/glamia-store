import { Link } from './Header';

export function WibrawlDeliveryStatus() {
  // The shared cart and checkout currently charge ₹0 delivery for every order.
  // Show that actual policy rather than inventing a minimum-spend target.
  return <aside className="wb-delivery-status" aria-label="Delivery benefit"><div><strong>Free delivery included</strong><span>Your bag qualifies for the store's free delivery.</span></div><progress value="1" max="1" aria-label="Free delivery included" /></aside>;
}

export function WibrawlOrderQueues({ orders, onNavigate }) {
  const queue = order => order.status === 'delivered' ? 3 : ['failed','requires_action'].includes(order.payment_status) || ['on_hold','delivery_failed'].includes(order.status) ? 1 : ['shipped','in_transit','out_for_delivery'].includes(order.status) ? 2 : 0;
  const totals = orders.filter(order => !['cancelled','refunded'].includes(order.status)).reduce((counts, order) => { counts[queue(order)]++; return counts; }, [0,0,0,0]);
  return <aside className="wb-order-queues" aria-label="Order overview"><div className="wb-order-queue-grid">{['Processing','Needs attention','In transit','Completed'].map((label, index) => <div key={label}><span>{label}</span><strong>{totals[index]}</strong></div>)}</div><Link href="/returns" onNavigate={onNavigate}>Returns & exchanges</Link></aside>;
}
