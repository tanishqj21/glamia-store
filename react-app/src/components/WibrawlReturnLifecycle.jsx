/** @jsxRuntime automatic */
export function WibrawlReturnLifecycle({ request }) {
  let logistics={};try {logistics=JSON.parse(request.logistics_json || '{}') || {};}catch { /* Older requests may lack saved logistics. */ }
  const stopped=['rejected','cancelled'].includes(request.status);
  const received=!!request.returned_at;
  const approved=['approved','received','refunded','completed'].includes(request.status) || !!request.approved_at || received;
  const label=!!(request.label_available && logistics.carrier && logistics.tracking_number);
  const settled=request.type === 'exchange' ? request.replacement_status === 'delivered' : request.refund_destination === 'store_credit' ? request.credit_approval_status === 'credited' : request.gateway_refund?.state === 'processed';
  const steps=[['Awaiting approval',true],['Approved / return instructions',approved],['Printable return label',label],['Picked up by courier',!!request.pickup_confirmed_at],['Received at warehouse',received],[request.type === 'exchange' ? 'Replacement delivered' : 'Refund / credits processed',settled]];
  return <section className="wb-return-lifecycle" aria-label="Return lifecycle">{stopped && <p role="status">Request {request.status}. Further steps are stopped.</p>}<ol>{steps.map(([name,done],i) => <li className={!stopped && done ? 'is-done' : ''} key={name}><span className="wb-tech">{String(i+1).padStart(2,'0')}</span><span>{name}</span><small>{stopped ? 'Stopped' : done ? 'Recorded' : 'Pending'}</small></li>)}</ol></section>;
}
