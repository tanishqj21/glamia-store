/** @jsxRuntime automatic */
import { formatIST } from '../lib/commerce';
import { parseStoredTimestamp } from '../../../src/time-zone';
import './wibrawl-order-timeline.css';

const check = 'M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z';

export function WibrawlOrderTimeline({ order }) {
  if (order.status === 'cancelled') return <p className="wb-order-timeline-cancelled"><strong>Order cancelled</strong><span>Delivery progress has stopped. See the order details for payment and refund updates.</span></p>;

  const delivered = order.status === 'delivered';
  const shipped = delivered || ['shipped', 'in_transit', 'out_for_delivery'].includes(order.status);
  const packed = shipped || order.status === 'packed' || order.packing_status === 'packed' || Boolean(order.packed_at);
  const confirmed = packed || ['confirmed', 'processing'].includes(order.status) || order.payment_status === 'paid';
  const steps = [
    { label: 'Placed', done: true, timestamp: order.created_at },
    { label: 'Confirmed', done: confirmed, timestamp: order.confirmed_at },
    { label: 'Packed', done: packed, timestamp: order.packed_at },
    { label: 'In transit', done: shipped, timestamp: order.shipped_at },
    { label: 'Delivered', done: delivered, timestamp: order.delivered_at },
  ];
  const current = steps.findLastIndex(step => step.done);
  return <ol className="wb-order-timeline" aria-label="Fulfilment progress">
    {steps.map((step, index) => {
      const isCurrent = index === current, complete = step.done && (!isCurrent || delivered);
      const date = step.done && step.timestamp ? parseStoredTimestamp(step.timestamp) : null;
      const hasDate = date && !Number.isNaN(date.getTime());
      return <li key={step.label} data-state={complete ? 'complete' : isCurrent ? 'current' : 'upcoming'} aria-current={isCurrent ? 'step' : undefined}>
        {index > 0 && <hr className={`wb-order-timeline-before ${step.done ? 'is-filled' : ''}`} aria-hidden="true" />}
        <div className={`wb-order-timeline-box ${index % 2 ? 'wb-order-timeline-end' : 'wb-order-timeline-start'}`}>
          <strong>{step.label}</strong><span>{complete ? 'Complete' : isCurrent ? 'Current stage' : 'Pending'}</span>
          {hasDate && <time dateTime={date.toISOString()}>{formatIST(step.timestamp)} IST</time>}
        </div>
        <span className="wb-order-timeline-middle" aria-hidden="true">{step.done
          ? <svg viewBox="0 0 20 20" width="22" height="22" fill="currentColor"><path fillRule="evenodd" d={check} clipRule="evenodd" /></svg>
          : <span className="wb-order-timeline-dot" />}</span>
        {index < steps.length - 1 && <hr className={`wb-order-timeline-after ${steps[index + 1].done ? 'is-filled' : ''}`} aria-hidden="true" />}
      </li>;
    })}
  </ol>;
}
