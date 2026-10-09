import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AdminReturnLogistics } from './AdminReturnLogistics';
import { useOrderActions } from '../lib/useOrderActions';
import { money } from '../lib/commerce';
import { Icon } from './Icon';
import { AdminComplaintCompletion } from './AdminComplaintCompletion';
import '../return-lifecycle.css';

function readObject(value) {
  try { const parsed = JSON.parse(value || '{}'); return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}; }
  catch { return {}; }
}

function RequestProgress({ request }) {
  const logistics = readObject(request.logistics_json);
  const steps = [
    ['Request recorded', true],
    ['Label ready', Boolean(request.label_available && logistics.carrier && logistics.tracking_number)],
    ['Courier collected', Boolean(request.pickup_confirmed_at)],
    ['Warehouse received', Boolean(request.returned_at)],
  ];
  const closed = ['rejected', 'cancelled', 'completed', 'refunded'].includes(request.status);
  const current = closed ? -1 : steps.findIndex(([, done]) => !done);
  return <ol className="return-manage-progress" aria-label="Return shipping progress">
    {steps.map(([label, done], index) => <li key={label} className={done ? 'is-done' : index === current ? 'is-current' : ''}>
      <span className="return-progress-dot" aria-hidden="true">{done ? <Icon name="check" size={14} /> : index + 1}</span>
      <span>{label}<small>{done ? 'Recorded' : index === current ? 'Next step' : 'Not recorded'}</small></span>
    </li>)}
  </ol>;
}

export function AdminReturnModal({request,onChanged,onClose,completionInitiallyOpen=false}) {
  const dialog=useRef(null),actions=useOrderActions(onChanged);
  useEffect(()=>{const previous=document.activeElement;const previousOverflow=document.body.style.overflow;document.body.style.overflow='hidden';dialog.current.showModal();return()=>{document.body.style.overflow=previousOverflow;previous?.focus();};},[]);
  const exchange = request.type === 'exchange';
  const status = request.case_completed_at ? 'Complaint completed' : String(request.status || 'requested').replaceAll('_', ' ');
  let items = []; try { const parsed = JSON.parse(request.selected_items_json || '[]'); if (Array.isArray(parsed)) items = parsed; } catch { /* Legacy record. */ }
  return createPortal(<dialog className="admin-return-modal" ref={dialog} onCancel={onClose} aria-labelledby="admin-return-title">
    <header className="return-manage-header"><div><p className="eyebrow">{request.order?.order_number||request.order_id}</p><h2 id="admin-return-title">Manage {exchange?'exchange':'return'}</h2><span className={`return-manage-status is-${request.case_completed_at ? 'completed' : request.status || 'requested'}`}>{status}</span></div><button type="button" className="secondary-action return-manage-close" onClick={onClose}><Icon name="close" />Close</button></header>
    <div className="return-manage-body">
      <AdminComplaintCompletion key={request.id} request={request} onChanged={onChanged} initiallyOpen={completionInitiallyOpen} />
      <section className="return-manage-summary" aria-label="Request summary">
        <dl><div><dt>Customer</dt><dd>{request.customer_name||request.customer_email}{request.customer_name&&<small>{request.customer_email}</small>}</dd></div><div><dt>{exchange?'Replacement':'Requested refund'}</dt><dd><span>{exchange ? '₹0 replacement' : money(request.refund_amount ?? request.order?.total ?? 0)}</span><small>{exchange ? request.replacement_order_number || 'Exchange request' : request.refund_destination === 'store_credit' ? 'Store credits' : 'Original payment method'}</small></dd></div></dl>
        <div className="return-manage-reason"><span>Customer’s reason</span><p>{request.reason || 'No reason provided.'}</p></div>
        {items.length > 0 && <ul className="return-manage-items" aria-label="Selected return items">{items.map((item, index) => <li key={item.line_id || index}><strong>{item.product_name || 'Purchased item'}</strong><span>{item.size || 'One size'} · Qty {item.quantity}</span></li>)}</ul>}
      </section>
      <RequestProgress request={request} />
      {exchange&&request.replacement_fulfilment_mode==='immediate'&&<p className="return-manage-notice">The ₹0 replacement is already placed and follows normal packing. Arrange the original item’s return pickup below; no exchange approval is needed.</p>}
      {request.status==='requested'&&<section className="return-manage-approval" aria-label="Request approval"><div><h3>Approval needed</h3><p>{exchange?'This earlier exchange requires approval; its replacement waits for warehouse receipt.':'Preparing a label does not approve the return or send money. Review the request before approving.'}</p></div><button type="button" className="primary-action" disabled={actions.busy} onClick={()=>actions.approve(request.id)}>{actions.busy?'Approving…':'Approve request'}</button></section>}
      {actions.error&&<p className="inline-error" role="alert">{actions.error}</p>}
      <AdminReturnLogistics request={request} onChanged={onChanged} expanded />
    </div>
  </dialog>,document.body);
}
