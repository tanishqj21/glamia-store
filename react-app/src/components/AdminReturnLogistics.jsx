import { useRef, useState } from 'react';
import { apiFetch } from '../lib/api';
import { useOrderActions } from '../lib/useOrderActions';
import { ReturnStatusCard } from './ReturnStatusCard';

export function AdminReturnLogistics({request,onChanged,expanded=false}) {
  let initial={};try{const parsed=JSON.parse(request.logistics_json||'{}');if(parsed && typeof parsed==='object' && !Array.isArray(parsed))initial=parsed;}catch{ /* Legacy request. */ }
  const [draft,setDraft]=useState({base:request.logistics_json,values:initial}),[label,setLabel]=useState(''),[labelName,setLabelName]=useState(''),[reading,setReading]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[failed,setFailed]=useState(false);
  const form=draft.base===request.logistics_json?draft.values:initial;
  const readVersion=useRef(0);
  const actions=useOrderActions(onChanged);
  function field(key,value){setDraft({base:request.logistics_json,values:{...form,[key]:value}});}
  function pick(event){
    const version=++readVersion.current;
    setLabel('');setLabelName('');setMessage('');setFailed(false);setReading(false);
    const file=event.target.files[0];if(!file)return;
    if(file.size>2097152||file.type!=='application/pdf'){setMessage('Choose a PDF label up to 2 MB');setFailed(true);event.target.value='';return;}
    setReading(true);
    const reader=new FileReader();
    reader.onload=()=>{if(version!==readVersion.current)return;setLabel(String(reader.result).split(',')[1]);setLabelName(file.name);setReading(false);};
    reader.onerror=()=>{if(version!==readVersion.current)return;setMessage('Could not read the PDF. Select the file again.');setFailed(true);setReading(false);};
    reader.readAsDataURL(file);
  }
  async function save(){if(busy||reading)return;setBusy(true);setMessage('');setFailed(false);try{const response=await apiFetch(`/api/admin/returns/${encodeURIComponent(request.id)}/logistics`,{method:'PATCH',body:JSON.stringify({...form,label_base64:label||undefined})});const data=await response.json();if(!response.ok)throw Error(data.error||'Could not save instructions');onChanged(data.request);setLabel('');setLabelName('');setMessage('Return instructions saved');}catch(error){setMessage(error.message);setFailed(true);}finally{setBusy(false);}}
  const pickupTime=form.pickup_at ? new Date(form.pickup_at).getTime() : NaN;
  const Container=expanded?'section':'details',Heading=expanded?'h3':'summary';
  return <Container className={`refund-details return-logistics${expanded?' return-logistics-expanded':''}`}><Heading>Pickup, label and customer instructions</Heading><div className="care-controls return-logistics-grid">
    <div className="logistics-wide"><ReturnStatusCard request={request} audience="admin"/></div>
    <p className="form-hint logistics-wide">Save courier and tracking to generate the printable PDF, or upload your courier’s label. Arrange pickup separately; saving does not approve a refund. Instructions are customer-visible; PDF labels are private.</p>
    <h4 className="logistics-wide logistics-section-title">Courier and pickup</h4>
    <label>Courier<input disabled={Boolean(request.pickup_confirmed_at)} value={form.carrier||''} onChange={e=>field('carrier',e.target.value)} maxLength={120}/></label>
    <label>Return tracking number<input disabled={Boolean(request.pickup_confirmed_at)} value={form.tracking_number||''} onChange={e=>field('tracking_number',e.target.value)} maxLength={120}/></label>
    <label>Official courier tracking URL<input type="url" value={form.tracking_url||''} onChange={e=>field('tracking_url',e.target.value)} maxLength={500} placeholder="https://courier.example/tracking"/><small>Delhivery, Blue Dart, DTDC, India Post, Ekart, Ecom Express or Xpressbees.</small></label>
    <label>Pickup time window<input value={form.pickup_window||''} onChange={e=>field('pickup_window',e.target.value)} maxLength={120} placeholder="For example, 10 am–2 pm IST"/></label>
    <label>Next customer update (IST)<input type="datetime-local" value={form.next_update_at&&Number.isFinite(Date.parse(form.next_update_at))?new Date(Date.parse(form.next_update_at)+330*60000).toISOString().slice(0,16):''} onChange={e=>field('next_update_at',e.target.value?new Date(e.target.value+':00+05:30').toISOString():'')}/></label>
    <label>Pickup status<select value={form.pickup_status||'not_booked'} onChange={e=>field('pickup_status',e.target.value)}>{['not_booked','scheduled','collected','in_transit','delivered','cancelled'].map(value=><option key={value} value={value}>{value.replaceAll('_',' ')}</option>)}</select></label>
    <label>Pickup date and time (IST)<input type="datetime-local" value={Number.isFinite(pickupTime) ? new Date(pickupTime+330*60000).toISOString().slice(0,16):''} onChange={e=>field('pickup_at',e.target.value?new Date(e.target.value+':00+05:30').toISOString():'')}/></label>
    <h4 className="logistics-wide logistics-section-title">Customer instructions</h4>
    <label className="logistics-wide">Return instructions<textarea value={form.instructions||''} onChange={e=>field('instructions',e.target.value)} maxLength={1000} placeholder="How should the customer pack and hand over the item?"/></label>
    <label className="logistics-wide">Customer-facing inspection result<textarea value={form.inspection_note||''} onChange={e=>field('inspection_note',e.target.value)} maxLength={1000}/></label>
    <label className="logistics-wide">Courier PDF label (up to 2 MB)<input type="file" accept="application/pdf" disabled={busy} onChange={pick}/><span className="form-hint">{request.label_available ? 'A label is already available. Select another PDF to replace it.' : 'Select the shipping label supplied by your courier.'}</span></label>
    {reading && <p className="logistics-wide" role="status">Reading PDF…</p>}
    {label && <p className="logistics-wide" role="status">{labelName} selected; upload when you save.</p>}
    <div className="logistics-wide return-logistics-actions">
    <button type="button" className="primary-action" onClick={save} disabled={busy||reading||actions.busy}>{busy?'Saving…':reading?'Reading PDF…':'Save return instructions'}</button>
    {['requested','approved'].includes(request.status) && <button type="button" className="secondary-action" disabled={busy||reading||actions.busy||Boolean(label)||!form.carrier?.trim()||!form.tracking_number?.trim()} onClick={()=>{if(request.label_available&&!window.confirm('Replace the current PDF with a manually generated label?'))return;actions.saveLogistics(request.id,{...form,generate_label:true});}}>Generate printable return label</button>}
    {request.status==='approved'&&!request.pickup_confirmed_at&&<button type="button" className="secondary-action" disabled={busy||actions.busy||!initial.carrier||!initial.tracking_number} onClick={()=>{if(window.confirm('Confirm that the courier has physically collected the parcel? This enables authorised refund processing but does not send money.'))actions.confirmPickup(request.id);}}>Mark picked up by courier</button>}
    {['approved','refunded','completed'].includes(request.status)&&!request.returned_at&&<button type="button" className="secondary-action" disabled={busy||actions.busy} onClick={()=>{if(window.confirm('Confirm physical warehouse receipt? Existing receipt-based automatic refund rules still apply if no refund has been started.'))actions.confirmReceipt(request.id);}}>Record warehouse receipt</button>}
    </div>
    {actions.error&&<p className="inline-error logistics-wide" role="alert">{actions.error}</p>}
    {message && <p className={`logistics-wide ${failed?'inline-error':'inline-note'}`} role={failed?'alert':'status'}>{message}</p>}
  </div></Container>;
}
