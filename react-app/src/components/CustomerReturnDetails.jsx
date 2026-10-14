import { refundDate } from '../lib/commerce';
import { ReturnStatusCard } from './ReturnStatusCard';

export function CustomerReturnDetails({request}) {
  let logistics={},items=[];
  try {logistics=JSON.parse(request.logistics_json||'{}');items=JSON.parse(request.selected_items_json||'[]');}catch{ /* Older records have no extra details. */ }
  const confirmed=request.gateway_refund?.state==='processed'||request.credit_approval_status==='credited';
  return <div className="return-instructions">
    {request.case_completed_at&&<p role="status"><strong>Complaint completed by Glamia care</strong> · {refundDate(request.case_completed_at)}. {request.type==='refund' ? 'This does not confirm a refund; your payment progress is tracked separately above.' : 'Your replacement and return shipping progress remain tracked separately.'}</p>}
    <ReturnStatusCard request={request}/>
    {items.length>0 && <p><strong>Selected items: </strong>{items.map(item=>`${item.product_name} · ${item.size || 'One size'} × ${item.quantity}`).join('; ')}</p>}
    {request.notes && <p><strong>Glamia care: </strong>{request.notes}</p>}
    {logistics.inspection_note && <p><strong>Inspection: </strong>{logistics.inspection_note}</p>}
    {logistics.instructions && <p><strong>Return instructions: </strong>{logistics.instructions}</p>}
    <p><strong>Pickup: </strong>{String(logistics.pickup_status||'not_booked').replaceAll('_',' ')}{logistics.pickup_at ? ` · ${refundDate(logistics.pickup_at)}` : ''}{logistics.carrier ? ` · ${logistics.carrier}` : ''}</p>
    {logistics.tracking_number && <p><strong>Return tracking: </strong>{logistics.tracking_number}</p>}
    {logistics.pickup_window&&<p><strong>Pickup window: </strong>{logistics.pickup_window}</p>}
    {logistics.next_update_at&&<p><strong>Next update target: </strong>{refundDate(logistics.next_update_at)}. If this has passed, contact care for an update.</p>}
    {logistics.tracking_url&&/^https:\/\//.test(logistics.tracking_url)&&<a className="secondary-action" href={logistics.tracking_url} target="_blank" rel="noopener noreferrer">Track return with courier</a>}
    {['requested','approved'].includes(request.status)&&!request.pickup_confirmed_at&&<div><p>Keep the item, accessories and tags together in a securely sealed parcel. Remove old shipping labels. Do not send it before care confirms collection instructions.</p><p>No printer or missed pickup? Contact care to arrange an alternative; a manual label does not book a courier.</p><a className="secondary-action" href={`/support?order=${encodeURIComponent(request.order?.order_number||request.order_id)}`}>Get pickup help</a></div>}
    {!request.label_available && ['requested','approved'].includes(request.status) && <p className="form-hint">Wait for care to provide a label or return instructions before sending your item.</p>}
    <div className="refund-actions">{confirmed && <a className="secondary-action" href={`/api/returns/${encodeURIComponent(request.id)}/receipt`} download>Download refund receipt</a>}</div>
  </div>;
}

export function CustomerExchangeTracker({request,onNavigate}) {
  const closed=['rejected','cancelled'].includes(request.status);
  const received=Boolean(request.returned_at);
  const immediate=request.replacement_fulfilment_mode==='immediate';
  const stage=closed ? `Exchange ${request.status}` : request.replacement_status==='delivered' ? 'Replacement delivered' : request.replacement_status==='shipped' ? 'Replacement shipped' : request.replacement_packing_status==='packed' ? 'Replacement packed' : immediate ? 'Replacement placed · awaiting packing' : received ? 'Return received · preparing replacement' : request.status==='requested' ? 'Exchange awaiting approval' : 'Replacement reserved · awaiting your return';
  return <section className={`refund-tracker refund-tone-${closed?'attention':request.replacement_status==='delivered'?'success':'progress'}`} aria-label="Exchange progress">
    <p className="eyebrow">Your exchange</p><h3 aria-live="polite">{stage}</h3>
    <p>{closed?'This request is closed; any undispatched replacement reservation is cancelled.':immediate?'Your ₹0 replacement follows normal packing and delivery without waiting for return pickup. Care arranges collection of the original item separately.':received?'Your return has been received. The replacement can now move into packing and dispatch.':'This earlier replacement waits for Glamia to receive your returned item.'}</p>
    {immediate&&request.replacement_status==='delivered'&&!received&&<p className="form-hint">Your replacement has arrived; the original item’s return pickup is still open.</p>}
    {request.replacement_order_number && <p>Replacement order: <strong>{request.replacement_order_number}</strong></p>}
    {request.replacement_tracking_number && <p>Replacement tracking: <strong>{request.replacement_tracking_number}</strong></p>}
    <CustomerReturnDetails request={request}/>
    <button className="secondary-action" type="button" onClick={()=>onNavigate(`/support?order=${encodeURIComponent(request.order?.order_number||request.order_id)}`)}>Get exchange help</button>
  </section>;
}
