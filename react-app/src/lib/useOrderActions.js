import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from './api';

/** Mutations are server-authoritative; never optimistically confirm a refund. */
export function useOrderActions(onChanged) {
  const callback=useRef(onChanged);
  useEffect(()=>{callback.current=onChanged;},[onChanged]);
  const active=useRef(true),pending=useRef(false);
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
  const act=useCallback(async (path,body={},method='POST')=>{
    if(pending.current)return null;
    pending.current=true;setBusy(true);setError('');
    try {
      const response=await apiFetch(path,{method,body:JSON.stringify(body)});
      const data=await response.json();
      if(!response.ok)throw Error(data.error||'The order action could not be completed');
      if(active.current) callback.current?.(data.request,data);
      return data;
    } catch(cause){if(active.current)setError(cause.message);return null;}
    finally {pending.current=false;if(active.current)setBusy(false);}
  },[]);
  const approve=useCallback(id=>act(`/api/admin/returns/${encodeURIComponent(id)}`,{status:'approved'},'PATCH'),[act]);
  const saveLogistics=useCallback((id,body)=>act(`/api/admin/returns/${encodeURIComponent(id)}/logistics`,body,'PATCH'),[act]);
  const confirmPickup=useCallback(id=>act(`/api/admin/returns/${encodeURIComponent(id)}/pickup`),[act]);
  const confirmReceipt=useCallback(id=>act(`/api/admin/returns/${encodeURIComponent(id)}/receipt`),[act]);
  const completeComplaint=useCallback((id,reason)=>act(`/api/admin/returns/${encodeURIComponent(id)}/complete`,{reason,acknowledge:true}),[act]);
  const processRefund=useCallback(id=>act(`/api/admin/returns/${encodeURIComponent(id)}/refund/process`),[act]);
  const processCreditRefund=useCallback(id=>act(`/api/admin/credits/refunds/${encodeURIComponent(id)}`,{decision:'approved'}),[act]);
  return {busy,error,approve,saveLogistics,confirmPickup,confirmReceipt,completeComplaint,processRefund,processCreditRefund};
}
