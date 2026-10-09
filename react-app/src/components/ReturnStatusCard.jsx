import { useState } from 'react';
import { PrintableReturnLabel } from './PrintableReturnLabel';

/** @param {{request: import('../types/orders').ReturnRequest}} props */
export function ReturnStatusCard({request,audience='customer'}) {
  const [printing,setPrinting]=useState(false);
  let logistics={};try {logistics=JSON.parse(request.logistics_json||'{}')||{};}catch{ /* Legacy record. */ }
  const approved=['approved','received','refunded','completed'].includes(request.status);
  const active=approved||request.status==='requested';
  const ready=active&&Boolean(request.label_available&&logistics.carrier&&logistics.tracking_number);
  const status=request.pickup_confirmed_at?'Picked up by courier':ready?'Return label ready':active?'Return pickup — label being prepared':`Request ${request.status}`;
  return <section className="return-status-card" aria-label="Return shipping status">
    <span className={`status-pill ${ready?'live':''}`} role="status">{status}</span>
    {logistics.carrier && <p>Courier: <strong>{logistics.carrier}</strong></p>}
    {logistics.tracking_number && <p>Tracking number: <strong>{logistics.tracking_number}</strong></p>}
    {active&&!ready&&<p className="form-hint">{audience==='admin'?'No printable label yet. Add the courier and return tracking number below to publish it.':'Care is arranging collection from your address to the warehouse. The label becomes printable once courier tracking is saved. Wait for instructions before shipping.'}</p>}
    {active&&!ready&&logistics.label_status_message&&<p className="form-hint" role="status">{logistics.label_status_message}</p>}
    {ready&&<div className="refund-actions"><a className="secondary-action" href={`/api/returns/${encodeURIComponent(request.id)}/label`} download>Download return label (PDF)</a>{logistics.label_details?<button type="button" className="secondary-action" onClick={()=>setPrinting(true)}>Print return label</button>:<a className="secondary-action" href={`/api/returns/${encodeURIComponent(request.id)}/label`} target="_blank" rel="noreferrer">Open PDF to print</a>}</div>}
    {printing&&logistics.label_details&&<PrintableReturnLabel details={logistics.label_details} onClose={()=>setPrinting(false)}/>}
  </section>;
}
