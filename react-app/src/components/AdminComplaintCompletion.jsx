import { useEffect, useId, useRef, useState } from 'react';
import { useOrderActions } from '../lib/useOrderActions';
import { refundDate } from '../lib/commerce';

export function AdminComplaintCompletion({ request, onChanged, initiallyOpen = false, inline = false, onCancel }) {
  const id=useId();
  const reasonInput=useRef(null);
  const [reason,setReason]=useState(''),[acknowledged,setAcknowledged]=useState(false);
  const actions=useOrderActions(onChanged);
  useEffect(()=>{if(inline&&!request.case_completed_at)reasonInput.current?.focus();},[inline,request.case_completed_at]);
  if(request.case_completed_at) return <section className="complaint-completion" role="status">
    <h3>Complaint completed</h3>
    <p>{refundDate(request.case_completed_at)} · {request.case_completed_by}</p>
    <p><strong>Internal completion reason:</strong> {request.case_completion_reason}</p>
    <p className="form-hint">Closure is recorded in the audit log. Payment, refund and fulfilment statuses remain separate.</p>
  </section>;
  const form=<form onSubmit={event=>{event.preventDefault();if(acknowledged&&reason.trim().length>=10)actions.completeComplaint(request.id,reason);}}>
      <p id={`${id}-help`}>Admin override closes this complaint only. It does not issue or confirm a refund, record collection or receipt, or change a replacement order. Pending refunds still need reconciliation.</p>
      <label htmlFor={`${id}-reason`}>Internal completion reason</label>
      <textarea ref={reasonInput} id={`${id}-reason`} value={reason} onChange={event=>setReason(event.target.value)} required minLength={10} maxLength={1000} aria-describedby={`${id}-help ${id}-requirements`} placeholder="Explain why this complaint can be closed (at least 10 characters)." disabled={actions.busy} />
      <label className="complaint-confirmation"><input type="checkbox" checked={acknowledged} onChange={event=>setAcknowledged(event.target.checked)} required disabled={actions.busy} /><span>I understand this closes the complaint, not the refund or replacement workflow.</span></label>
      {actions.error&&<p className="inline-error" role="alert">{actions.error}</p>}
      <p id={`${id}-requirements`} className="form-hint">Enter at least 10 characters and tick the confirmation box to enable completion.</p>
      <div className="complaint-completion-actions"><button type="submit" className="primary-action" disabled={actions.busy||!acknowledged||reason.trim().length<10}>{actions.busy?'Completing complaint…':'Confirm complaint completed'}</button>{onCancel&&<button type="button" className="secondary-action" disabled={actions.busy} onClick={onCancel}>Cancel completion</button>}</div>
    </form>;
  if(inline)return <section className="complaint-completion complaint-completion-inline" aria-labelledby={`${id}-title`}><h3 id={`${id}-title`}>Complete this complaint</h3>{form}</section>;
  return <details className="complaint-completion" open={initiallyOpen || undefined}>
    <summary>Mark complaint completed</summary>
    {form}
  </details>;
}
